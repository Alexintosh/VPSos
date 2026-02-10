import { randomUUID } from 'node:crypto';
import { spawn, type Subprocess, type Terminal } from 'bun';
import type {
  AgentProfile,
  AgentStreamEvent,
  AgentStreamMessage,
  ChatMessage,
  ChatPart,
  ChatSession,
  ChatSessionSummary
} from '@vpsos/shared';
import { config } from '../config';

type SocketLike = { send: (data: any) => void; close: () => void };

type AgentProfileInternal = AgentProfile & {
  command: string;
  promptMode: 'arg' | 'stdin';
  interactive: boolean;
  transport: 'pipe' | 'pty';
  buildArgs: (input: { prompt?: string; systemPrompt?: string }) => string[];
};

const AGENT_HISTORY_LIMIT = 2000;

const resolveSettingsPath = () => {
  const home = process.env.HOME;
  return home ? `${home}/.claude/kimi.json` : '~/.claude/kimi.json';
};

const agentProfiles: AgentProfileInternal[] = [
  {
    id: 'opencode',
    title: 'OpenCode',
    description: 'OpenCode CLI (raw text)',
    supportsSystemPrompt: false,
    output: 'text',
    command: 'opencode',
    promptMode: 'arg',
    interactive: false,
    transport: 'pty',
    buildArgs: ({ prompt }) => {
      const args = ['run'];
      if (prompt && prompt.trim()) {
        args.push('--', prompt);
      }
      return args;
    }
  },
  {
    id: 'claude',
    title: 'Claude',
    description: 'Anthropic Claude CLI (stream-json)',
    supportsSystemPrompt: true,
    output: 'stream-json',
    command: 'claude',
    promptMode: 'stdin',
    interactive: true,
    transport: 'pipe',
    buildArgs: ({ systemPrompt }) => {
      const args = ['--settings', resolveSettingsPath(), '--verbose', '--output-format=stream-json', '--include-partial-messages'];
      if (systemPrompt && systemPrompt.trim()) {
        args.push('--system-prompt', systemPrompt.trim());
      }
      return args;
    }
  }
];

export const listAgentProfiles = (): AgentProfile[] => agentProfiles.map((p) => ({
  id: p.id,
  title: p.title,
  description: p.description,
  supportsSystemPrompt: p.supportsSystemPrompt,
  output: p.output
}));

const findProfile = (id: string) => agentProfiles.find((p) => p.id === id);

interface SessionEntry extends ChatSession {
  connections: Set<SocketLike>;
  activeRunId?: string;
}

interface RunEntry {
  id: string;
  sessionId: string;
  proc: Subprocess;
  terminal?: Terminal;
  buffer: string;
  textBuffer: string;
  logMode: boolean;
  inCodeBlock: boolean;
  stopped: boolean;
  history: AgentStreamMessage[];
  debugHistory: string[];
  profile: AgentProfileInternal;
  seenStreamEvents: boolean;
  blocks: Map<number, { type: string; tool?: string; inputBuffer?: string }>;
}

const sessions = new Map<string, SessionEntry>();
const runs = new Map<string, RunEntry>();

const pushHistory = (entry: RunEntry, msg: AgentStreamMessage) => {
  entry.history.push(msg);
  if (entry.history.length > AGENT_HISTORY_LIMIT) {
    entry.history.splice(0, entry.history.length - AGENT_HISTORY_LIMIT);
  }
};

const pushDebug = (entry: RunEntry, line: string) => {
  entry.debugHistory.push(line);
  if (entry.debugHistory.length > AGENT_HISTORY_LIMIT) {
    entry.debugHistory.splice(0, entry.debugHistory.length - AGENT_HISTORY_LIMIT);
  }
};

const broadcast = (session: SessionEntry, msg: AgentStreamMessage) => {
  const payload = JSON.stringify(msg);
  for (const ws of session.connections) {
    ws.send(payload);
  }
};

const broadcastDebug = (session: SessionEntry, run: RunEntry, line: string) => {
  pushDebug(run, line);
  const msg: AgentStreamMessage = { t: 'debug', line };
  broadcast(session, msg);
};

const broadcastDone = (session: SessionEntry, run: RunEntry) => {
  const msg: AgentStreamMessage = { t: 'done' };
  pushHistory(run, msg);
  broadcast(session, msg);
};

const toText = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const stripAnsi = (input: string) => {
  if (!input) return input;
  return input
    // CSI sequences
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    // OSC sequences
    .replace(/\u001b\][^\u0007]*(\u0007|\u001b\\)/g, '')
    // 2-char sequences
    .replace(/\u001b[@-Z\\-_]/g, '')
    .replace(/\r/g, '\n');
};

const handlePtyChunk = (session: SessionEntry, run: RunEntry, chunk: Uint8Array) => {
  const raw = new TextDecoder().decode(chunk);
  if (!raw) return;
  broadcastDebug(session, run, raw);
  const text = stripAnsi(raw);
  if (!text) return;
  if (run.profile.output === 'text') {
    handleTextChunk(session, run, text);
    return;
  }
  emitEvent(session, run, { type: 'raw', content: text });
};

const emitEvent = (session: SessionEntry, run: RunEntry, event: AgentStreamEvent) => {
  const msg: AgentStreamMessage = { t: 'event', event };
  pushHistory(run, msg);
  broadcast(session, msg);
  if (event.type === 'text') {
    appendAssistantPart(session, { type: 'text', content: event.content }, true);
  } else if (event.type === 'log') {
    appendAssistantLog(session, event.content);
  } else if (event.type === 'meta') {
    // Meta events are UI-only; don't add to chat history.
  } else if (event.type === 'tool_use') {
    appendAssistantPart(session, { type: 'tool_use', tool: event.tool, input: event.input });
  } else if (event.type === 'tool_result') {
    appendAssistantPart(session, { type: 'tool_result', output: event.output, is_error: event.is_error });
  } else if (event.type === 'raw') {
    appendAssistantPart(session, { type: 'raw', content: event.content });
  }
};

const looksLikeAssistantText = (line: string) => {
  if (!line) return false;
  if (/^#{1,6}\\s+/.test(line)) return true;
  if (/^[-*]\\s+/.test(line)) return true;
  if (/^```/.test(line)) return true;
  if (/[.!?]$/.test(line)) return true;
  return /^(I'll|I will|I can|Here|Perfect|Great|Created|The |This |These |We |Let's |To )/i.test(line);
};

const looksLikeLogLine = (line: string) => {
  if (!line) return false;
  if (/[🔍🚚🔒]/.test(line)) return true;
  if (/^\\$\\s+/.test(line)) return true;
  if (/^←\\s*Write\\b/.test(line)) return true;
  if (/^Wrote file successfully\\b/i.test(line)) return true;
  if (/^Initialized project\\b/i.test(line)) return true;
  if (/^LSP errors\\b/i.test(line)) return true;
  if (/^<diagnostics\\b/i.test(line)) return true;
  if (/^Traceback\\b/.test(line)) return true;
  if (/^\\s*File \".+\", line \\d+/.test(line)) return true;
  if (/^(ERROR|WARNING|OSError|Exception)\\b/.test(line)) return true;
  if (/^=+/.test(line)) return true;
  if (/^platform\\b/.test(line)) return true;
  if (/^cachedir:/.test(line)) return true;
  if (/^rootdir:/.test(line)) return true;
  if (/^configfile:/.test(line)) return true;
  if (/^collecting\\b/.test(line)) return true;
  if (/^collected\\b/.test(line)) return true;
  if (/^test_\\w+/.test(line)) return true;
  if (/^total\\s+\\d+/.test(line)) return true;
  if (/^[d-][rwx-]{9}/.test(line)) return true;
  if (/^\\+\\s+/.test(line)) return true;
  if (/^(Using|Creating|Resolved|Prepared|Installed)\\b/.test(line)) return true;
  if (/^zsh:/.test(line)) return true;
  if (line.includes('<diagnostics') || line.includes('</diagnostics')) return true;
  return false;
};

const handleTextLine = (session: SessionEntry, run: RunEntry, line: string) => {
  const trimmed = line.trim();
  if (trimmed.startsWith('```')) {
    run.inCodeBlock = !run.inCodeBlock;
    run.logMode = false;
    emitEvent(session, run, { type: 'text', content: line + '\n' });
    return;
  }
  if (run.inCodeBlock) {
    emitEvent(session, run, { type: 'text', content: line + '\n' });
    return;
  }
  if (!trimmed) {
    emitEvent(session, run, { type: run.logMode ? 'log' : 'text', content: '\n' });
    return;
  }
  const modelMatch = trimmed.match(/^>\\s*build\\s*·\\s*(.+)$/i);
  if (modelMatch) {
    run.logMode = false;
    emitEvent(session, run, { type: 'meta', label: 'model', value: modelMatch[1] });
    return;
  }
  const percentMatch = trimmed.match(/^%\\s*([\\w-]+)\\s*(.*)$/);
  if (percentMatch) {
    run.logMode = false;
    emitEvent(session, run, { type: 'tool_use', tool: percentMatch[1], input: percentMatch[2] || undefined });
    return;
  }
  const diamondMatch = trimmed.match(/^◈\\s*(.+)$/);
  if (diamondMatch) {
    run.logMode = false;
    emitEvent(session, run, { type: 'tool_use', tool: diamondMatch[1] });
    return;
  }
  const commandMatch = trimmed.match(/^\\$\\s+(.+)$/);
  if (commandMatch) {
    run.logMode = true;
    emitEvent(session, run, { type: 'tool_use', tool: 'bash', input: commandMatch[1] });
    return;
  }
  const writeMatch = trimmed.match(/^←\\s*Write\\s+(.+)$/);
  if (writeMatch) {
    run.logMode = true;
    emitEvent(session, run, { type: 'tool_use', tool: 'Write', input: writeMatch[1] });
    return;
  }
  const logLine = looksLikeLogLine(trimmed);
  const assistantLine = looksLikeAssistantText(trimmed);
  if (run.logMode) {
    if (!logLine && assistantLine) {
      run.logMode = false;
      emitEvent(session, run, { type: 'text', content: line + '\n' });
      return;
    }
    emitEvent(session, run, { type: 'log', content: line + '\n' });
    return;
  }
  if (logLine) {
    run.logMode = true;
    emitEvent(session, run, { type: 'log', content: line + '\n' });
    return;
  }
  emitEvent(session, run, { type: 'text', content: line + '\n' });
};

const handleTextChunk = (session: SessionEntry, run: RunEntry, text: string) => {
  run.textBuffer += text;
  while (true) {
    const idx = run.textBuffer.indexOf('\\n');
    if (idx === -1) break;
    const line = run.textBuffer.slice(0, idx);
    run.textBuffer = run.textBuffer.slice(idx + 1);
    handleTextLine(session, run, line);
  }
  if (!run.textBuffer) return;
  const pending = run.textBuffer;
  const trimmed = pending.trimStart();
  const looksLikeControl = trimmed.startsWith('>') || trimmed.startsWith('%') || trimmed.startsWith('◈') || trimmed.startsWith('$') || trimmed.startsWith('←') || trimmed.startsWith('```');
  if (!looksLikeControl || pending.length > 200) {
    run.textBuffer = '';
    emitEvent(session, run, { type: 'text', content: pending });
  }
};

const emitContentBlock = (session: SessionEntry, run: RunEntry, block: any) => {
  if (!block || typeof block !== 'object') return;
  if (block.type === 'text') {
    const text = block.text ?? block.content;
    if (typeof text === 'string' && text.length) emitEvent(session, run, { type: 'text', content: text });
    return;
  }
  if (block.type === 'tool_use') {
    const tool = block.name || block.tool || block.tool_name;
    const input = toText(block.input ?? block.args ?? block.parameters);
    if (typeof tool === 'string') emitEvent(session, run, { type: 'tool_use', tool, input });
    return;
  }
  if (block.type === 'tool_result') {
    emitEvent(session, run, {
      type: 'tool_result',
      output: toText(block.output ?? block.content ?? block.result),
      is_error: block.is_error === true
    });
    return;
  }
  emitEvent(session, run, { type: 'raw', content: toText(block) || '' });
};

const emitInlineEvent = (session: SessionEntry, run: RunEntry, raw: any) => {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.type === 'system') return true;
  if (raw.type === 'text') {
    const text = raw.text ?? raw.content;
    if (typeof text === 'string') emitEvent(session, run, { type: 'text', content: text });
    return true;
  }
  if (raw.type === 'tool_use') {
    const tool = raw.tool || raw.name || raw.tool_name;
    if (typeof tool === 'string') emitEvent(session, run, { type: 'tool_use', tool, input: toText(raw.input ?? raw.args ?? raw.parameters) });
    return true;
  }
  if (raw.type === 'tool_result') {
    emitEvent(session, run, {
      type: 'tool_result',
      output: toText(raw.output ?? raw.content ?? raw.result),
      is_error: raw.is_error === true
    });
    return true;
  }
  return false;
};

const extractTextFallback = (raw: any): string | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const candidates = [
    raw.text,
    raw.content,
    raw.delta?.text,
    raw.output?.text,
    raw.output?.content,
    raw.response?.text,
    raw.response?.content,
    raw.message?.text,
    raw.message?.content
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
};

const ingestStreamEvent = (session: SessionEntry, run: RunEntry, event: any) => {
  if (!event || typeof event !== 'object') return;
  run.seenStreamEvents = true;
  switch (event.type) {
    case 'message_start':
    case 'message_delta':
      return;
    case 'message_stop':
      finalizeAssistantMessage(session);
      session.running = false;
      session.updatedAt = Date.now();
      broadcastDone(session, run);
      return;
    case 'content_block_start': {
      const idx = typeof event.index === 'number' ? event.index : undefined;
      if (idx === undefined) return;
      const block = event.content_block || {};
      run.blocks.set(idx, {
        type: block.type || 'unknown',
        tool: block.name || block.tool || block.tool_name,
        inputBuffer: ''
      });
      if (block.type === 'text' && typeof block.text === 'string') {
        emitEvent(session, run, { type: 'text', content: block.text });
      }
      return;
    }
    case 'content_block_delta': {
      const idx = typeof event.index === 'number' ? event.index : undefined;
      if (idx === undefined) return;
      const block = run.blocks.get(idx);
      const delta = event.delta || {};
      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        emitEvent(session, run, { type: 'text', content: delta.text });
        return;
      }
      if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        if (block) block.inputBuffer = (block.inputBuffer || '') + delta.partial_json;
        return;
      }
      if (typeof delta.text === 'string') {
        emitEvent(session, run, { type: 'text', content: delta.text });
      }
      return;
    }
    case 'content_block_stop': {
      const idx = typeof event.index === 'number' ? event.index : undefined;
      if (idx === undefined) return;
      const block = run.blocks.get(idx);
      if (block?.type === 'tool_use') {
        const raw = block.inputBuffer || '';
        let inputText = raw;
        try {
          const parsed = raw.trim() ? JSON.parse(raw) : raw;
          inputText = toText(parsed) || raw;
        } catch {
          inputText = raw;
        }
        if (block.tool) emitEvent(session, run, { type: 'tool_use', tool: block.tool, input: inputText });
      }
      run.blocks.delete(idx);
      return;
    }
    default:
      emitEvent(session, run, { type: 'raw', content: toText(event) || '' });
  }
};

const getOrCreateAssistantMessage = (session: SessionEntry) => {
  const last = session.messages[session.messages.length - 1];
  if (last && last.role === 'assistant' && last.status === 'streaming') return last;
  const message: ChatMessage = {
    id: `assistant-${randomUUID()}`,
    role: 'assistant',
    parts: [],
    status: 'streaming',
    createdAt: Date.now()
  };
  session.messages.push(message);
  return message;
};

const appendAssistantPart = (session: SessionEntry, part: ChatPart, mergeText = false) => {
  const msg = getOrCreateAssistantMessage(session);
  if (mergeText && part.type === 'text') {
    const last = msg.parts[msg.parts.length - 1];
    if (last && last.type === 'text') {
      last.content += part.content;
      return;
    }
  }
  msg.parts.push(part);
  session.updatedAt = Date.now();
};

const appendAssistantLog = (session: SessionEntry, content: string) => {
  const msg = getOrCreateAssistantMessage(session);
  const last = msg.parts[msg.parts.length - 1];
  if (last && last.type === 'log') {
    last.content += content;
  } else {
    msg.parts.push({ type: 'log', content });
  }
  session.updatedAt = Date.now();
};

const finalizeAssistantMessage = (session: SessionEntry) => {
  const last = session.messages[session.messages.length - 1];
  if (last && last.role === 'assistant' && last.status === 'streaming') {
    last.status = 'complete';
  }
  session.updatedAt = Date.now();
};

const summarizeMessage = (message: ChatMessage) => {
  const lines: string[] = [];
  if (message.role === 'user') {
    const text = message.parts.filter((p) => p.type === 'text').map((p: any) => p.content).join('');
    lines.push(`User: ${text}`);
    return lines;
  }
  const text = message.parts.filter((p) => p.type === 'text').map((p: any) => p.content).join('');
  if (text) lines.push(`Assistant: ${text}`);
  for (const part of message.parts) {
    if (part.type === 'tool_use') {
      lines.push(`[tool_use:${part.tool}] ${part.input || ''}`);
    } else if (part.type === 'tool_result') {
      lines.push(`[tool_result] ${part.output || ''}`);
    }
  }
  return lines;
};

const buildConversationPrompt = (session: SessionEntry) => {
  const lines: string[] = [];
  for (const message of session.messages) {
    lines.push(...summarizeMessage(message));
  }
  lines.push('Assistant:');
  return lines.join('\n');
};

export const createChatSession = (profileId: string, systemPrompt?: string): ChatSession => {
  const profile = findProfile(profileId);
  if (!profile) throw new Error('unknown agent profile');
  const now = Date.now();
  const session: SessionEntry = {
    id: randomUUID(),
    title: 'New Chat',
    profileId: profile.id,
    systemPrompt: systemPrompt?.trim() || undefined,
    messages: [],
    running: false,
    createdAt: now,
    updatedAt: now,
    connections: new Set()
  };
  sessions.set(session.id, session);
  return session;
};

export const listChatSessions = (): ChatSessionSummary[] => Array.from(sessions.values())
  .sort((a, b) => b.updatedAt - a.updatedAt)
  .map((s) => ({
    id: s.id,
    title: s.title,
    profileId: s.profileId,
    running: s.running,
    updatedAt: s.updatedAt
  }));

export const getChatSession = (id: string): ChatSession | undefined => {
  const session = sessions.get(id);
  if (!session) return undefined;
  return {
    id: session.id,
    title: session.title,
    profileId: session.profileId,
    systemPrompt: session.systemPrompt,
    messages: session.messages,
    running: session.running,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
};

export const appendUserMessageAndRun = async (id: string, content: string, cwd?: string) => {
  const session = sessions.get(id);
  if (!session) throw new Error('session not found');
  if (session.running) throw new Error('session already running');
  const trimmed = content.trim();
  if (!trimmed) throw new Error('empty message');

  const userMessage: ChatMessage = {
    id: `user-${randomUUID()}`,
    role: 'user',
    parts: [{ type: 'text', content: trimmed }],
    createdAt: Date.now()
  };
  session.messages.push(userMessage);
  if (session.messages.length === 1) {
    session.title = trimmed.slice(0, 48);
  }
  session.updatedAt = Date.now();

  const profile = findProfile(session.profileId);
  if (!profile) throw new Error('unknown agent profile');

  if (profile.interactive) {
    let run = session.activeRunId ? runs.get(session.activeRunId) : undefined;
    if (!run) {
      const runId = randomUUID();
    if (profile.transport === 'pty') {
      const proc = spawn([profile.command, ...profile.buildArgs({ systemPrompt: session.systemPrompt })], {
        cwd,
        terminal: {
          cols: 100,
          rows: 30,
          data(_term, chunk) {
            const entry = runs.get(runId);
            if (entry) handlePtyChunk(session, entry, chunk);
          }
        }
      });
      run = {
        id: runId,
        sessionId: session.id,
        proc,
        terminal: proc.terminal,
        buffer: '',
        textBuffer: '',
        logMode: false,
        inCodeBlock: false,
        stopped: false,
        history: [],
        debugHistory: [],
        profile,
        seenStreamEvents: false,
          blocks: new Map()
        };
        runs.set(runId, run);
        session.activeRunId = runId;
        proc.exited.then((code) => {
          finalizeAssistantMessage(session);
          const msg: AgentStreamMessage = { t: 'exit', code };
          pushHistory(run as RunEntry, msg);
          broadcast(session, msg);
          session.running = false;
          session.activeRunId = undefined;
          session.updatedAt = Date.now();
          runs.delete(runId);
        });
      } else {
      const proc = spawn([profile.command, ...profile.buildArgs({ systemPrompt: session.systemPrompt })], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'pipe'
      });
      run = {
        id: runId,
        sessionId: session.id,
        proc,
        buffer: '',
        textBuffer: '',
        logMode: false,
        inCodeBlock: false,
        stopped: false,
        history: [],
        debugHistory: [],
        profile,
        seenStreamEvents: false,
          blocks: new Map()
        };
        runs.set(runId, run);
        session.activeRunId = runId;
        startPump(session, run);
      }
    }
    session.running = true;
    session.updatedAt = Date.now();
    if (profile.promptMode === 'stdin' && run) {
      try {
        if (run.terminal) {
          run.terminal.write(new TextEncoder().encode(trimmed + '\n'));
        } else if (run.proc.stdin) {
          run.proc.stdin.write(trimmed + '\n');
        }
      } catch {}
    }
    return run.id;
  }

  const runId = randomUUID();
  const prompt = buildConversationPrompt(session);
  if (profile.transport === 'pty') {
    const proc = spawn([profile.command, ...profile.buildArgs({ prompt, systemPrompt: session.systemPrompt })], {
      cwd,
      terminal: {
        cols: 100,
        rows: 30,
        data(_term, chunk) {
          const entry = runs.get(runId);
          if (entry) handlePtyChunk(session, entry, chunk);
        }
      }
    });
    const run: RunEntry = {
      id: runId,
      sessionId: session.id,
      proc,
      terminal: proc.terminal,
      buffer: '',
      textBuffer: '',
      logMode: false,
      inCodeBlock: false,
      stopped: false,
      history: [],
      debugHistory: [],
      profile,
      seenStreamEvents: false,
      blocks: new Map()
    };
    runs.set(runId, run);
    session.running = true;
    session.activeRunId = runId;
    proc.exited.then((code) => {
      finalizeAssistantMessage(session);
      const msg: AgentStreamMessage = { t: 'exit', code };
      pushHistory(run, msg);
      broadcast(session, msg);
      session.running = false;
      session.activeRunId = undefined;
      session.updatedAt = Date.now();
      runs.delete(runId);
    });
    return runId;
  }

  const proc = spawn([profile.command, ...profile.buildArgs({ prompt, systemPrompt: session.systemPrompt })], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'pipe'
  });
  const run: RunEntry = {
    id: runId,
    sessionId: session.id,
    proc,
    buffer: '',
    textBuffer: '',
    logMode: false,
    inCodeBlock: false,
    stopped: false,
    history: [],
    debugHistory: [],
    profile,
    seenStreamEvents: false,
    blocks: new Map()
  };
  runs.set(runId, run);
  session.running = true;
  session.activeRunId = runId;

  startPump(session, run);
  if (profile.promptMode === 'stdin' && proc.stdin) {
    try {
      proc.stdin.write(prompt + '\n');
      proc.stdin.end();
    } catch {}
  }
  return runId;
};

export const stopChatSession = (id: string) => {
  const session = sessions.get(id);
  if (!session?.activeRunId) return false;
  const run = runs.get(session.activeRunId);
  if (!run) return false;
  run.proc.kill();
  run.stopped = true;
  return true;
};

export const attachChatSessionSocket = (id: string, ws: SocketLike) => {
  const session = sessions.get(id);
  if (!session) {
    ws.send(JSON.stringify({ t: 'exit', code: -1 } satisfies AgentStreamMessage));
    ws.close();
    return;
  }
  session.connections.add(ws);
  const run = session.activeRunId ? runs.get(session.activeRunId) : undefined;
  if (run?.history.length) {
    for (const msg of run.history) {
      ws.send(JSON.stringify(msg));
    }
  }
  if (run?.debugHistory.length) {
    for (const line of run.debugHistory) {
      ws.send(JSON.stringify({ t: 'debug', line } satisfies AgentStreamMessage));
    }
  }
  return () => session.connections.delete(ws);
};

const startPump = (session: SessionEntry, run: RunEntry) => {
  const decode = new TextDecoder();
  const readerOut = typeof run.proc.stdout === 'object' && run.proc.stdout ? run.proc.stdout.getReader() : undefined;
  const readerErr = typeof run.proc.stderr === 'object' && run.proc.stderr ? run.proc.stderr.getReader() : undefined;

  const handleStdoutLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    broadcastDebug(session, run, trimmed);
    if (run.profile.output === 'stream-json') {
      try {
        const raw = JSON.parse(trimmed);
        if (raw?.type === 'system') {
          return;
        }
        if (raw?.type === 'error') {
          const msg: AgentStreamMessage = { t: 'error', message: raw.message || raw.error || 'agent error' };
          pushHistory(run, msg);
          broadcast(session, msg);
          appendAssistantPart(session, { type: 'error', content: msg.message });
          return;
        }
        if (raw?.type === 'stream_event' && raw.event) {
          ingestStreamEvent(session, run, raw.event);
          return;
        }
        if (raw?.type && ['message_start', 'message_delta', 'message_stop', 'content_block_start', 'content_block_delta', 'content_block_stop'].includes(raw.type)) {
          ingestStreamEvent(session, run, raw);
          return;
        }
        if (emitInlineEvent(session, run, raw)) return;
        const fallbackText = extractTextFallback(raw);
        if (fallbackText) {
          emitEvent(session, run, { type: 'text', content: fallbackText });
          return;
        }
        const message = raw?.message || raw;
        const content = message?.content;
        if (Array.isArray(content)) {
          if (!run.seenStreamEvents) {
            for (const block of content) emitContentBlock(session, run, block);
          }
          return;
        }
        if (typeof message?.text === 'string') {
          emitEvent(session, run, { type: 'text', content: message.text });
          return;
        }
        emitEvent(session, run, { type: 'raw', content: toText(raw) || '' });
        return;
      } catch {
        emitEvent(session, run, { type: 'raw', content: trimmed });
        return;
      }
    }
    emitEvent(session, run, { type: 'raw', content: trimmed });
  };

  const pump = async (reader: ReadableStreamDefaultReader<Uint8Array> | undefined, type: 'stdout' | 'stderr') => {
    if (!reader) return;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decode.decode(value, { stream: true });
      if (type === 'stdout') {
        if (run.profile.output === 'text') {
          broadcastDebug(session, run, text);
          const cleaned = stripAnsi(text);
          if (cleaned) handleTextChunk(session, run, cleaned);
          continue;
        }
        run.buffer += text;
        while (true) {
          const idx = run.buffer.indexOf('\n');
          if (idx === -1) break;
          const line = run.buffer.slice(0, idx);
          run.buffer = run.buffer.slice(idx + 1);
          handleStdoutLine(line);
        }
      } else {
        const msg: AgentStreamMessage = { t: 'stderr', data: text };
        pushHistory(run, msg);
        broadcast(session, msg);
        appendAssistantPart(session, { type: 'stderr', content: text });
      }
    }
  };

  pump(readerOut, 'stdout');
  pump(readerErr, 'stderr');

  run.proc.exited.then((code) => {
    if (run.profile.output === 'text' && run.textBuffer.trim()) {
      handleTextLine(session, run, run.textBuffer);
      run.textBuffer = '';
    }
    if (run.buffer.trim()) handleStdoutLine(run.buffer);
    finalizeAssistantMessage(session);
    const msg: AgentStreamMessage = { t: 'exit', code };
    pushHistory(run, msg);
    broadcast(session, msg);
    session.running = false;
    session.activeRunId = undefined;
    session.updatedAt = Date.now();
    runs.delete(run.id);
  });
};

export const configCwd = (cwd?: string) => cwd || config.DEFAULT_CWD;
