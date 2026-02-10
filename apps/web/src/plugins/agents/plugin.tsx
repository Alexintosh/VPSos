import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import type { PluginDefinition } from '@vpsos/types';
import {
  createAgentSession,
  getAgentSession,
  listAgentProfiles,
  listAgentSessions,
  openAgentSessionSocket,
  sendAgentMessage,
  stopAgentSession
} from '@vpsos/client';
import { useUI } from '@vpsos/useUI';
import type { AgentProfile, AgentStreamEvent, AgentStreamMessage, ChatMessage, ChatPart, ChatSession, ChatSessionSummary } from '@vpsos/shared';

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&#39;');

const renderer = new marked.Renderer();
renderer.html = (html) => escapeHtml(html);
marked.setOptions({ gfm: true, breaks: true, headerIds: false, mangle: false, renderer });

const renderMarkdown = (text: string) => marked.parse(text) as string;

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

const sampleLogLines = [
  '> build · big-pickle',
  "I'll help you create a TEST folder and initialize a Python project with uv.",
  '$ mkdir TEST && cd TEST && uv init',
  'Initialized project `test`',
  '$ ls -la TEST',
  'total 24',
  'drwxr-xr-x@  6 alexintosh  staff  192 Feb  9 17:39 .',
  'drwxr-xr-x@ 24 alexintosh  staff  768 Feb  9 17:39 ..',
  '-rw-r--r--@  1 alexintosh  staff    5 Feb  9 17:39 .python-version',
  '-rw-r--r--@  1 alexintosh  staff   82 Feb  9 17:39 main.py',
  '-rw-r--r--@  1 alexintosh  staff  150 Feb  9 17:39 pyproject.toml',
  '-rw-r--r--@  1 alexintosh  staff    0 Feb  9 17:39 README.md',
  'Created TEST folder and initialized Python project with uv. The project includes `pyproject.toml`, `main.py`, `.python-version`, and `README.md`.',
  '> build · big-pickle',
  "I'll create tests for the Fibonacci sequence first, then implement the code based on those tests.",
  '  🔍 Resolving [1/1]',
  '  🚚 pyright [6/5]',
  '  🔒 Saving lockfile...',
  '← Write TEST/test_fibonacci.py',
  'Wrote file successfully.',
  'LSP errors detected in this file, please fix:',
  '<diagnostics file="/Users/alexintosh/Code/VibeCoding/VPSos/TEST/test_fibonacci.py">',
  'ERROR [1:8] Import "pytest" could not be resolved',
  'ERROR [2:6] Import "fibonacci" could not be resolved',
  '</diagnostics>',
  '← Write TEST/fibonacci.py',
  'Wrote file successfully.',
  'LSP errors detected in other files:',
  '<diagnostics file="/Users/alexintosh/Code/VibeCoding/VPSos/TEST/test_fibonacci.py">',
  'ERROR [1:8] Import "pytest" could not be resolved',
  '</diagnostics>',
  '$ cd /Users/alexintosh/Code/VibeCoding/VPSos/TEST && uv add pytest',
  'Using CPython 3.14.2 interpreter at: /opt/homebrew/opt/python@3.14/bin/python3.14',
  'Creating virtual environment at: .venv',
  'Resolved 7 packages in 154ms',
  'Prepared 1 package in 46ms',
  'Installed 5 packages in 16ms',
  ' + iniconfig==2.3.0',
  ' + packaging==26.0',
  ' + pluggy==1.6.0',
  ' + pygments==2.19.2',
  ' + pytest==9.0.2',
  '$ uv run pytest test_fibonacci.py -v',
  'Traceback (most recent call last):',
  '  File "/opt/homebrew/bin/pytest", line 8, in <module>',
  '    sys.exit(console_main())',
  'OSError: Cannot load native module \'Crypto.Cipher._raw_ecb\'...',
  '$ uv run python -m pytest test_fibonacci.py -v',
  '/opt/homebrew/opt/python@3.14/bin/python3.14: No module named pytest',
  '$ uv run pytest test_fibonacci.py -v',
  'Traceback (most recent call last):',
  'OSError: Cannot load native module \'Crypto.Cipher._raw_ecb\'...',
  '$ source .venv/bin/activate && python -m pytest test_fibonacci.py -v',
  'zsh:source:1: no such file or directory: .venv/bin/activate',
  '$ ls -la',
  'total 192',
  'drwxr-xr-x@ 25 alexintosh  staff    800 Feb  9 17:42 .',
  'drwxr-xr-x@ 30 alexintosh  staff    960 Feb  9 17:29 ..',
  '$ cd TEST && ls -la',
  'total 56',
  'drwxr-xr-x@ 10 alexintosh  staff   320 Feb  9 17:42 .',
  'drwxr-xr-x@ 25 alexintosh  staff   800 Feb  9 17:42 ..',
  '$ cd TEST && .venv/bin/python -m pytest test_fibonacci.py -v',
  '============================= test session starts ==============================',
  'platform darwin -- Python 3.14.2, pytest-9.0.2, pluggy-1.6.0 -- /Users/alexintosh/Code/VibeCoding/VPSos/TEST/.venv/bin/python',
  'cachedir: .pytest_cache',
  'rootdir: /Users/alexintosh/Code/VibeCoding/VPSos/TEST',
  'configfile: pyproject.toml',
  'collecting ... collected 5 items',
  'test_fibonacci.py::test_fibonacci_zero PASSED                            [ 20%]',
  'test_fibonacci.py::test_fibonacci_one PASSED                             [ 40%]',
  'test_fibonacci.py::test_fibonacci_small_numbers PASSED                   [ 60%]',
  'test_fibonacci.py::test_fibonacci_larger_number PASSED                   [ 80%]',
  'test_fibonacci.py::test_fibonacci_negative PASSED                        [100%]',
  '============================== 5 passed in 0.01s ===============================',
  "Perfect! I've successfully created the Fibonacci tests and implementation. All 5 tests pass:",
  '- Test for n=0 and n=1 edge cases',
  '- Test for small numbers (2-6)',
  '- Test for larger number (10)',
  '- Test for negative input error handling',
  'The implementation uses an iterative approach with O(n) time complexity and O(1) space complexity.'
];

const parseSampleConversation = (lines: string[]) => {
  let model: string | undefined;
  let logMode = false;
  let inCodeBlock = false;
  const parts: ChatPart[] = [];
  const pushText = (content: string) => {
    const last = parts[parts.length - 1];
    if (last && last.type === 'text') last.content += content;
    else parts.push({ type: 'text', content });
  };
  const pushLog = (content: string) => {
    const last = parts[parts.length - 1];
    if (last && last.type === 'log') last.content += content;
    else parts.push({ type: 'log', content });
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      if (logMode) pushLog('\n');
      else pushText('\n');
      continue;
    }
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      logMode = false;
      pushText(line + '\n');
      continue;
    }
    if (inCodeBlock) {
      pushText(line + '\n');
      continue;
    }
    const modelMatch = trimmed.match(/^>\s*build\s*·\s*(.+)$/i);
    if (modelMatch) {
      model = modelMatch[1];
      logMode = false;
      continue;
    }
    const percentMatch = trimmed.match(/^%\s*([\w-]+)\s*(.*)$/);
    if (percentMatch) {
      logMode = false;
      parts.push({ type: 'tool_use', tool: percentMatch[1], input: percentMatch[2] || undefined });
      continue;
    }
    const diamondMatch = trimmed.match(/^◈\s*(.+)$/);
    if (diamondMatch) {
      logMode = false;
      parts.push({ type: 'tool_use', tool: diamondMatch[1] });
      continue;
    }
    const commandMatch = trimmed.match(/^\$\s+(.+)$/);
    if (commandMatch) {
      logMode = true;
      parts.push({ type: 'tool_use', tool: 'bash', input: commandMatch[1] });
      continue;
    }
    const writeMatch = trimmed.match(/^←\s*Write\s+(.+)$/);
    if (writeMatch) {
      logMode = true;
      parts.push({ type: 'tool_use', tool: 'Write', input: writeMatch[1] });
      continue;
    }
    const logLine = looksLikeLogLine(trimmed);
    const assistantLine = looksLikeAssistantText(trimmed);
    if (logMode) {
      if (!logLine && assistantLine) {
        logMode = false;
        pushText(line + '\n');
        continue;
      }
      pushLog(line + '\n');
      continue;
    }
    if (logLine) {
      logMode = true;
      pushLog(line + '\n');
      continue;
    }
    pushText(line + '\n');
  }

  return { model, parts };
};

const MessagePart = ({ part }: { part: ChatPart }) => {
  if (part.type === 'text') {
    return (
      <div
        className="agent-markdown"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(part.content) }}
      />
    );
  }
  if (part.type === 'tool_use') {
    return (
      <div className="agent-tool-inline">
        <span className="agent-tool-pill">Tool</span>
        <span className="agent-tool-name">{part.tool}</span>
        {part.input && <span className="agent-tool-input">{part.input}</span>}
      </div>
    );
  }
  if (part.type === 'tool_result') {
    return (
      <div className={`agent-tool-card result${part.is_error ? ' error' : ''}`}>
        <div className="agent-tool-title">Tool Result</div>
        {part.output && <pre className="agent-tool-body">{part.output}</pre>}
      </div>
    );
  }
  if (part.type === 'log') {
    return <pre className="agent-activity-log">{part.content}</pre>;
  }
  if (part.type === 'stderr') {
    return <pre className="agent-stderr">{part.content}</pre>;
  }
  if (part.type === 'error') {
    return <div className="agent-error">{part.content}</div>;
  }
  return <div className="agent-raw">{part.content}</div>;
};

const ActivityPanel = ({ parts }: { parts: ChatPart[] }) => {
  if (parts.length === 0) return null;
  const lineCount = parts.reduce((count, part) => {
    if ('content' in part && typeof part.content === 'string') {
      return count + part.content.split('\n').filter(Boolean).length;
    }
    if (part.type === 'tool_result' && part.output) {
      return count + part.output.split('\n').filter(Boolean).length;
    }
    return count + 1;
  }, 0);
  return (
    <details className="agent-activity">
      <summary>Thinking ({lineCount})</summary>
      <div className="agent-activity-body">
        {parts.map((part, idx) => {
          if (part.type === 'log') {
            return (
              <pre key={idx} className="agent-activity-log">{part.content}</pre>
            );
          }
          if (part.type === 'tool_result') {
            return (
              <div key={idx} className={`agent-activity-card${part.is_error ? ' error' : ''}`}>
                <div className="agent-activity-title">Tool Result</div>
                {part.output && <pre className="agent-activity-log">{part.output}</pre>}
              </div>
            );
          }
          if (part.type === 'stderr') {
            return (
              <pre key={idx} className="agent-activity-log error">{part.content}</pre>
            );
          }
          if (part.type === 'raw') {
            return (
              <pre key={idx} className="agent-activity-log">{part.content}</pre>
            );
          }
          return null;
        })}
      </div>
    </details>
  );
};

const buildTranscript = (session: ChatSession | null) => {
  if (!session) return '';
  const lines: string[] = [];
  for (const message of session.messages) {
    const label = message.role === 'user' ? 'User' : 'Assistant';
    for (const part of message.parts) {
      if (part.type === 'text') lines.push(`${label}: ${part.content}`);
      else if (part.type === 'tool_use') lines.push(`[tool_use:${part.tool}] ${part.input || ''}`);
      else if (part.type === 'tool_result') lines.push(`[tool_result] ${part.output || ''}`);
      else if (part.type === 'stderr') lines.push(`[stderr] ${part.content}`);
      else if (part.type === 'error') lines.push(`[error] ${part.content}`);
      else if (part.type === 'log') lines.push(`[log] ${part.content}`);
      else if (part.type === 'raw') lines.push(`[raw] ${part.content}`);
    }
  }
  return lines.join('\n');
};

const splitParts = (parts: ChatPart[]) => {
  const visible: ChatPart[] = [];
  const activity: ChatPart[] = [];
  for (const part of parts) {
    if (part.type === 'log' || part.type === 'tool_result' || part.type === 'stderr' || part.type === 'raw') {
      activity.push(part);
    } else {
      visible.push(part);
    }
  }
  return { visible, activity };
};

const appendAssistantPart = (session: ChatSession, part: ChatPart, mergeText = false) => {
  const messages = [...session.messages];
  const last = messages[messages.length - 1];
  let assistant: ChatMessage;
  if (last && last.role === 'assistant' && last.status === 'streaming') {
    assistant = { ...last, parts: [...last.parts] };
    messages[messages.length - 1] = assistant;
  } else {
    assistant = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      parts: [],
      status: 'streaming',
      createdAt: Date.now()
    };
    messages.push(assistant);
  }

  if (mergeText && part.type === 'text') {
    const lastPart = assistant.parts[assistant.parts.length - 1];
    if (lastPart && lastPart.type === 'text') {
      assistant.parts[assistant.parts.length - 1] = { type: 'text', content: lastPart.content + part.content };
    } else {
      assistant.parts.push(part);
    }
  } else if (mergeText && part.type === 'log') {
    const lastPart = assistant.parts[assistant.parts.length - 1];
    if (lastPart && lastPart.type === 'log') {
      assistant.parts[assistant.parts.length - 1] = { type: 'log', content: lastPart.content + part.content };
    } else {
      assistant.parts.push(part);
    }
  } else {
    assistant.parts.push(part);
  }

  return { ...session, messages, updatedAt: Date.now() };
};

const finalizeAssistant = (session: ChatSession) => {
  const messages = [...session.messages];
  const last = messages[messages.length - 1];
  if (last && last.role === 'assistant' && last.status === 'streaming') {
    messages[messages.length - 1] = { ...last, status: 'complete' };
  }
  return { ...session, messages, running: false, updatedAt: Date.now() };
};

const AgentsApp = ({ windowId }: { windowId: string }) => {
  const setMenus = useUI((s) => s.setMenus);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [profileId, setProfileId] = useState('');
  const [systemPromptDraft, setSystemPromptDraft] = useState('You are a WordPress admin agent.');
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const [runInfo, setRunInfo] = useState<{ model?: string }>({});
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugLines, setDebugLines] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const copyTimeoutRef = useRef<number | null>(null);
  const debugMapRef = useRef<Record<string, string[]>>({});
  const lastTextEventRef = useRef<string>('');
  const lastEventAtRef = useRef<number>(0);
  const debugParseStateRef = useRef<Record<string, { logMode: boolean; inCodeBlock: boolean }>>({});

  useEffect(() => () => {
    if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
  }, []);

  useEffect(() => {
    listAgentProfiles().then((res) => {
      setProfiles(res.profiles);
      setProfileId((current) => current || res.profiles[0]?.id || '');
    }).catch(() => {});
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await listAgentSessions();
      setSessions(res.sessions);
      if (!activeSessionId && res.sessions.length) {
        setActiveSessionId(res.sessions[0].id);
      }
    } catch {}
  }, [activeSessionId]);

  useEffect(() => {
    refreshSessions().catch(() => {});
  }, [refreshSessions]);

  const loadSession = useCallback(async (id: string) => {
    try {
      const res = await getAgentSession(id);
      setActiveSession(res.session);
      setActiveSessionId(id);
    } catch (e: any) {
      setStatus(e?.message || 'Failed to load session');
    }
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      loadSession(activeSessionId).catch(() => {});
    }
    setDebugLines(activeSessionId ? (debugMapRef.current[activeSessionId] || []) : []);
    setRunInfo({});
  }, [activeSessionId, loadSession]);

  const ensureActiveSession = useCallback(async () => {
    if (activeSessionId && activeSession) return activeSession;
    if (!profileId) return null;
    const res = await createAgentSession(profileId, systemPromptDraft.trim());
    const session = res.session;
    setSessions((prev) => [
      { id: session.id, title: session.title, profileId: session.profileId, running: session.running, updatedAt: session.updatedAt },
      ...prev
    ]);
    setActiveSession(session);
    setActiveSessionId(session.id);
    return session;
  }, [activeSessionId, activeSession, profileId, systemPromptDraft]);

  const updateSessionSummary = useCallback((session: ChatSession) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== session.id);
      next.unshift({ id: session.id, title: session.title, profileId: session.profileId, running: session.running, updatedAt: session.updatedAt });
      return next;
    });
  }, []);

  const handleNewChat = useCallback(async () => {
    if (!profileId) return;
    const res = await createAgentSession(profileId, systemPromptDraft.trim());
    setSessions((prev) => [
      { id: res.session.id, title: res.session.title, profileId: res.session.profileId, running: res.session.running, updatedAt: res.session.updatedAt },
      ...prev
    ]);
    setActiveSession(res.session);
    setActiveSessionId(res.session.id);
  }, [profileId, systemPromptDraft]);

  const handleScroll = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    stickToBottomRef.current = (el.scrollHeight - el.scrollTop - el.clientHeight) < 40;
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [activeSession]);

  const handleSend = useCallback(async () => {
    const message = draft.trim();
    if (!message) return;
    const session = await ensureActiveSession();
    if (!session) return;
    const sessionId = session.id;
    setDraft('');
    setStatus('');

    setActiveSession((prev) => {
      const base = prev || session;
      if (!base) return prev;
      const next: ChatSession = {
        ...base,
        messages: [...base.messages, {
          id: `user-${Date.now()}`,
          role: 'user',
          parts: [{ type: 'text', content: message }],
          createdAt: Date.now()
        }],
        running: true,
        updatedAt: Date.now()
      };
      updateSessionSummary(next);
      return next;
    });

    try {
      await sendAgentMessage(sessionId, message);
    } catch (e: any) {
      setStatus(e?.message || 'Failed to send');
      setActiveSession((prev) => prev ? { ...prev, running: false } : prev);
    }
  }, [draft, ensureActiveSession, updateSessionSummary]);

  const handleStop = useCallback(async () => {
    if (!activeSessionId) return;
    await stopAgentSession(activeSessionId).catch(() => {});
  }, [activeSessionId]);

  const handleCopy = useCallback(async () => {
    const text = buildTranscript(activeSession);
    if (!text) return;
    try {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      await navigator.clipboard.writeText(text);
      setStatus('Copied transcript');
      copyTimeoutRef.current = window.setTimeout(() => setStatus(''), 1200);
    } catch {
      setStatus('Copy failed');
    }
  }, [activeSession]);

  const handleClearDebug = useCallback(() => {
    if (!activeSessionId) return;
    debugMapRef.current[activeSessionId] = [];
    setDebugLines([]);
  }, [activeSessionId]);

  useEffect(() => {
    setMenus(windowId, [{
      title: 'Agents',
      items: [
        { label: 'New Chat', action: handleNewChat },
        { label: 'Stop', action: handleStop, disabled: !activeSession?.running },
        { label: 'Copy transcript', action: handleCopy, disabled: !activeSession || activeSession.messages.length === 0 },
        { label: debugOpen ? 'Hide Debug' : 'Show Debug', action: () => setDebugOpen((prev) => !prev) }
      ]
    }]);
    return () => setMenus(windowId, []);
  }, [handleNewChat, handleStop, handleCopy, setMenus, windowId, activeSession, debugOpen]);

  useEffect(() => {
    if (!activeSessionId) return;
    wsRef.current?.close();
    let isActive = true;
    const ws = openAgentSessionSocket(activeSessionId);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      if (!isActive) return;
      try {
        const msg = JSON.parse(ev.data) as AgentStreamMessage;
        setActiveSession((prev) => {
          if (!prev) return prev;
          let next = prev;
          if (msg.t === 'debug') {
            if (!activeSessionId) return prev;
            const current = debugMapRef.current[activeSessionId] || [];
            const nextLines = [...current, msg.line].slice(-500);
            debugMapRef.current[activeSessionId] = nextLines;
            setDebugLines(nextLines);
            const now = Date.now();
            const cleaned = msg.line
              .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
              .replace(/\u001b\][^\u0007]*(\u0007|\u001b\\)/g, '')
              .replace(/\u001b[@-Z\\-_]/g, '')
              .replace(/\r/g, '\n')
              .trim();
            if (cleaned && now - lastEventAtRef.current > 200) {
              const state = debugParseStateRef.current[activeSessionId] || { logMode: false, inCodeBlock: false };
              if (cleaned.startsWith('```')) {
                state.inCodeBlock = !state.inCodeBlock;
                state.logMode = false;
                debugParseStateRef.current[activeSessionId] = state;
                return appendAssistantPart(prev, { type: 'text', content: cleaned + '\n' }, true);
              }
              if (state.inCodeBlock) {
                debugParseStateRef.current[activeSessionId] = state;
                return appendAssistantPart(prev, { type: 'text', content: cleaned + '\n' }, true);
              }
              const modelMatch = cleaned.match(/^>\\s*build\\s*·\\s*(.+)$/i);
              if (modelMatch) {
                setRunInfo((info) => ({ ...info, model: modelMatch[1] }));
                state.logMode = false;
                debugParseStateRef.current[activeSessionId] = state;
                return prev;
              }
              const percentMatch = cleaned.match(/^%\\s*([\\w-]+)\\s*(.*)$/);
              if (percentMatch) {
                state.logMode = false;
                debugParseStateRef.current[activeSessionId] = state;
                return appendAssistantPart(prev, { type: 'tool_use', tool: percentMatch[1], input: percentMatch[2] || undefined });
              }
              const diamondMatch = cleaned.match(/^◈\\s*(.+)$/);
              if (diamondMatch) {
                state.logMode = false;
                debugParseStateRef.current[activeSessionId] = state;
                return appendAssistantPart(prev, { type: 'tool_use', tool: diamondMatch[1] });
              }
              const commandMatch = cleaned.match(/^\\$\\s+(.+)$/);
              if (commandMatch) {
                state.logMode = true;
                debugParseStateRef.current[activeSessionId] = state;
                return appendAssistantPart(prev, { type: 'tool_use', tool: 'bash', input: commandMatch[1] });
              }
              const writeMatch = cleaned.match(/^←\\s*Write\\s+(.+)$/);
              if (writeMatch) {
                state.logMode = true;
                debugParseStateRef.current[activeSessionId] = state;
                return appendAssistantPart(prev, { type: 'tool_use', tool: 'Write', input: writeMatch[1] });
              }
              const logLine = looksLikeLogLine(cleaned);
              const assistantLine = looksLikeAssistantText(cleaned);
              if (state.logMode) {
                if (!logLine && assistantLine) {
                  state.logMode = false;
                  debugParseStateRef.current[activeSessionId] = state;
                  return appendAssistantPart(prev, { type: 'text', content: cleaned + '\n' }, true);
                }
                debugParseStateRef.current[activeSessionId] = state;
                return appendAssistantPart(prev, { type: 'log', content: cleaned + '\n' }, true);
              }
              if (logLine) {
                state.logMode = true;
                debugParseStateRef.current[activeSessionId] = state;
                return appendAssistantPart(prev, { type: 'log', content: cleaned + '\n' }, true);
              }
              if (cleaned !== lastTextEventRef.current) {
                debugParseStateRef.current[activeSessionId] = state;
                return appendAssistantPart(prev, { type: 'text', content: cleaned + '\n' }, true);
              }
            }
            return prev;
          }
          if (msg.t === 'done') {
            next = finalizeAssistant(prev);
          } else if (msg.t === 'event') {
            const event = msg.event as AgentStreamEvent;
            if (event.type === 'meta') {
              if (event.label === 'model') {
                setRunInfo((info) => ({ ...info, model: event.value }));
              }
            } else if (event.type === 'text') {
              lastTextEventRef.current = event.content.trim();
              lastEventAtRef.current = Date.now();
              next = appendAssistantPart(prev, { type: 'text', content: event.content }, true);
            }
            else if (event.type === 'tool_use') next = appendAssistantPart(prev, { type: 'tool_use', tool: event.tool, input: event.input });
            else if (event.type === 'tool_result') next = appendAssistantPart(prev, { type: 'tool_result', output: event.output, is_error: event.is_error });
            else if (event.type === 'log') next = appendAssistantPart(prev, { type: 'log', content: event.content }, true);
            else if (event.type === 'raw') next = appendAssistantPart(prev, { type: 'raw', content: event.content });
          } else if (msg.t === 'stderr') {
            next = appendAssistantPart(prev, { type: 'stderr', content: msg.data });
          } else if (msg.t === 'error') {
            next = appendAssistantPart(prev, { type: 'error', content: msg.message });
          } else if (msg.t === 'exit') {
            next = finalizeAssistant(prev);
            next = { ...next, running: false };
          }
          updateSessionSummary(next);
          return next;
        });
      } catch {
        setActiveSession((prev) => prev ? appendAssistantPart(prev, { type: 'raw', content: String(ev.data) }) : prev);
      }
    };

    ws.onerror = () => {
      if (!isActive) return;
      setStatus('WebSocket error');
    };

    ws.onclose = () => {
      if (!isActive) return;
    };

    return () => {
      isActive = false;
      ws.close();
    };
  }, [activeSessionId, updateSessionSummary]);

  const currentProfile = useMemo(() => profiles.find((p) => p.id === (activeSession?.profileId || profileId)), [profiles, activeSession, profileId]);
  const running = activeSession?.running;
  const lastAssistantId = useMemo(() => {
    if (!activeSession?.messages.length) return null;
    for (let i = activeSession.messages.length - 1; i >= 0; i -= 1) {
      if (activeSession.messages[i].role === 'assistant') return activeSession.messages[i].id;
    }
    return null;
  }, [activeSession]);
  const sampleConversation = useMemo(() => parseSampleConversation(sampleLogLines), []);

  return (
    <div className="agent-shell">
      <div className="agent-sidebar">
        <div className="agent-sidebar-header">
          <div className="agent-sidebar-title">Agents</div>
          <button onClick={handleNewChat} disabled={!profileId}>New Chat</button>
        </div>
        <div className="agent-sidebar-section">
          <div className="agent-sidebar-label">Profiles</div>
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </div>
        <div className="agent-sidebar-section">
          <div className="agent-sidebar-label">System Prompt (new chats)</div>
          <textarea
            value={systemPromptDraft}
            onChange={(e) => setSystemPromptDraft(e.target.value)}
            rows={3}
          />
        </div>
        <div className="agent-session-list">
          {sessions.map((session) => (
            <button
              key={session.id}
              className={`agent-session-item${session.id === activeSessionId ? ' active' : ''}`}
              onClick={() => setActiveSessionId(session.id)}
            >
              <div className="agent-session-title">{session.title}</div>
              <div className="agent-session-meta">
                {session.profileId}{session.running ? ' • running' : ''}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="agent-main">
        <div className="agent-topbar">
          <div>
            <div className="agent-topbar-title">{activeSession?.title || 'New Chat'}</div>
            <div className="agent-topbar-sub">{currentProfile?.title || 'Select a profile'}</div>
            {runInfo.model && <div className="agent-topbar-meta">Model: {runInfo.model}</div>}
          </div>
          <div className="agent-topbar-actions">
            <button onClick={handleCopy} disabled={!activeSession || activeSession.messages.length === 0}>Copy</button>
            <button onClick={handleStop} disabled={!running}>Stop</button>
            <button onClick={() => setDebugOpen((prev) => !prev)}>{debugOpen ? 'Hide Debug' : 'Debug'}</button>
            <span className={`agent-status ${running ? 'running' : ''}`}>{running ? 'Running' : 'Idle'}</span>
          </div>
        </div>

        <div className="agent-thread" ref={threadRef} onScroll={handleScroll}>
          <div className="agent-sample">
            <div className="agent-sample-label">Sample Conversation (static)</div>
            <div className="agent-turn user">
              <div className="agent-avatar">You</div>
              <div className="agent-bubble">
                <div className="agent-markdown">Run a quick Python project setup and test suite.</div>
              </div>
            </div>
            <div className="agent-turn assistant">
              <div className="agent-avatar">AI</div>
              <div className="agent-bubble">
                {sampleConversation.model && (
                  <div className="agent-run-meta">build · {sampleConversation.model}</div>
                )}
                {(() => {
                  const { visible, activity } = splitParts(sampleConversation.parts);
                  return (
                    <>
                      {visible.map((part, idx) => (
                        <MessagePart key={`sample-${idx}`} part={part} />
                      ))}
                      <ActivityPanel parts={activity} />
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
          {!activeSession || activeSession.messages.length === 0 ? (
            <div className="agent-empty">Start a new chat to see messages here.</div>
          ) : (
            activeSession.messages.map((message) => (
              <div key={message.id} className={`agent-turn ${message.role}`}>
                <div className="agent-avatar">{message.role === 'user' ? 'You' : 'AI'}</div>
                <div className="agent-bubble">
                  {message.role === 'assistant' && runInfo.model && message.id === lastAssistantId && (
                    <div className="agent-run-meta">build · {runInfo.model}</div>
                  )}
                  {(() => {
                    const { visible, activity } = splitParts(message.parts);
                    return (
                      <>
                        {visible.map((part, idx) => (
                          <MessagePart key={idx} part={part} />
                        ))}
                        {message.role === 'assistant' && <ActivityPanel parts={activity} />}
                      </>
                    );
                  })()}
                </div>
              </div>
            ))
          )}
          {running && (
            <div className="agent-typing">Agent is working…</div>
          )}
        </div>

        <div className="agent-composer">
          <div className="agent-composer-row">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Send a message..."
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!running) handleSend();
                }
              }}
            />
            <button onClick={handleSend} disabled={!draft.trim() || !!running}>Send</button>
          </div>
          <div className="agent-composer-footer">
            <span className="agent-status-text">{status}</span>
          </div>
        </div>

        {debugOpen && (
          <div className="agent-debug-panel">
            <div className="agent-debug-header">
              <div>Debug Stream (last {debugLines.length})</div>
              <div className="agent-debug-actions">
                <button onClick={handleClearDebug} disabled={debugLines.length === 0}>Clear</button>
              </div>
            </div>
            <pre className="agent-debug-body">
              {debugLines.map((line, idx) => `${String(idx + 1).padStart(3, '0')}  ${line}`).join('\n')}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

const plugin: PluginDefinition = {
  id: 'agents',
  name: 'Agents',
  version: '0.2.0',
  apps: [
    {
      id: 'agents',
      title: 'Agents',
      dock: true,
      render: ({ windowId }) => <AgentsApp windowId={windowId} />
    }
  ]
};

export default plugin;
