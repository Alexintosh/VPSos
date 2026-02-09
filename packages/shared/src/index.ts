export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface GitStatusSummary {
  branch: string;
  ahead: number;
  behind: number;
  counts: {
    added: number;
    modified: number;
    deleted: number;
    untracked: number;
  };
}

export interface ProjectInfo {
  path: string;
  git?: {
    root: string;
    status: GitStatusSummary;
  };
  node?: {
    root: string;
    packageManager: PackageManager;
    scripts: string[];
  };
  make?: {
    root: string;
    targets: string[];
  };
}

export interface ProcMessageStdout {
  t: 'stdout';
  data: string;
}

export interface ProcMessageStderr {
  t: 'stderr';
  data: string;
}

export interface ProcMessageExit {
  t: 'exit';
  code: number;
}

export type ProcMessage = ProcMessageStdout | ProcMessageStderr | ProcMessageExit;

export interface PtyMessageData {
  t: 'data';
  data: Uint8Array;
}

export interface PtyMessageExit {
  t: 'exit';
  code: number;
}

export type PtyMessage = PtyMessageData | PtyMessageExit;

export interface AgentProfile {
  id: string;
  title: string;
  description?: string;
  supportsSystemPrompt?: boolean;
  output: 'stream-json' | 'text';
}

export interface AgentStreamEventText {
  type: 'text';
  content: string;
}

export interface AgentStreamEventMeta {
  type: 'meta';
  label: string;
  value?: string;
}

export interface AgentStreamEventLog {
  type: 'log';
  content: string;
}

export interface AgentStreamEventToolUse {
  type: 'tool_use';
  tool: string;
  input?: string;
}

export interface AgentStreamEventToolResult {
  type: 'tool_result';
  output?: string;
  is_error?: boolean;
}

export interface AgentStreamEventRaw {
  type: 'raw';
  content: string;
}

export type AgentStreamEvent =
  | AgentStreamEventText
  | AgentStreamEventMeta
  | AgentStreamEventLog
  | AgentStreamEventToolUse
  | AgentStreamEventToolResult
  | AgentStreamEventRaw;

export interface AgentStreamMessageEvent {
  t: 'event';
  event: AgentStreamEvent;
}

export interface AgentStreamMessageStderr {
  t: 'stderr';
  data: string;
}

export interface AgentStreamMessageExit {
  t: 'exit';
  code: number;
}

export interface AgentStreamMessageError {
  t: 'error';
  message: string;
}

export interface AgentStreamMessageDebug {
  t: 'debug';
  line: string;
}

export interface AgentStreamMessageDone {
  t: 'done';
}

export type AgentStreamMessage =
  | AgentStreamMessageEvent
  | AgentStreamMessageStderr
  | AgentStreamMessageExit
  | AgentStreamMessageError
  | AgentStreamMessageDebug
  | AgentStreamMessageDone;

export type ChatPart =
  | { type: 'text'; content: string }
  | { type: 'log'; content: string }
  | { type: 'tool_use'; tool: string; input?: string }
  | { type: 'tool_result'; output?: string; is_error?: boolean }
  | { type: 'stderr'; content: string }
  | { type: 'error'; content: string }
  | { type: 'raw'; content: string };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: ChatPart[];
  status?: 'streaming' | 'complete' | 'error';
  createdAt: number;
}

export interface ChatSession {
  id: string;
  title: string;
  profileId: string;
  systemPrompt?: string;
  messages: ChatMessage[];
  running: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  profileId: string;
  running: boolean;
  updatedAt: number;
}
