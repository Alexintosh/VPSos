import { ProjectInfo, PackageManager, ProcMessage } from '@devos/shared';

const API_BASE = '/api';

let authToken: string | null = (typeof localStorage !== 'undefined' && localStorage.getItem('devos_token')) || null;

export const setAuthToken = (token: string) => {
  authToken = token;
  if (typeof localStorage !== 'undefined') localStorage.setItem('devos_token', token);
};

export const getAuthToken = () => authToken;

const withAuth = (init?: RequestInit): RequestInit => {
  const headers = new Headers(init?.headers || {});
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
  return { ...init, headers };
};

const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${API_BASE}${path}`, withAuth(init));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
};

export const getConfig = () => api<{ fsSandbox: string; fsRoot?: string; defaultCwd: string }>(`/config`);

export const login = async (token: string) => {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  if (!res.ok) throw new Error(await res.text() || 'auth failed');
  setAuthToken(token);
  return res.json();
};

export interface FsEntry { name: string; path: string; type: 'file' | 'dir' | 'link'; size?: number; mtime?: number; }

export const listDir = (path: string) => api<{ path: string; entries: FsEntry[] }>(`/fs/list?path=${encodeURIComponent(path)}`);
export const readFileApi = (path: string) => api<{ path: string; content: string; encoding: string }>(`/fs/read?path=${encodeURIComponent(path)}`);

export const inspectProject = (path: string) => api<ProjectInfo>(`/project/inspect?path=${encodeURIComponent(path)}`);

export const gitBranches = (repoPath: string) => api<{ branches: string[]; current: string }>(`/git/branches`, { method: 'POST', body: JSON.stringify({ repoPath }), headers: { 'Content-Type': 'application/json' } });
export const gitCheckout = (repoPath: string, branch: string) => api(`/git/checkout`, { method: 'POST', body: JSON.stringify({ repoPath, branch }), headers: { 'Content-Type': 'application/json' } });
export const gitCreateBranch = (repoPath: string, name: string, from?: string) => api(`/git/create-branch`, { method: 'POST', body: JSON.stringify({ repoPath, name, from }), headers: { 'Content-Type': 'application/json' } });
export const gitPull = (repoPath: string) => api(`/git/pull`, { method: 'POST', body: JSON.stringify({ repoPath }), headers: { 'Content-Type': 'application/json' } });
export const gitPush = (repoPath: string) => api(`/git/push`, { method: 'POST', body: JSON.stringify({ repoPath }), headers: { 'Content-Type': 'application/json' } });
export const gitClone = (cwd: string, url: string, dir?: string) => api(`/git/clone`, { method: 'POST', body: JSON.stringify({ cwd, url, dir }), headers: { 'Content-Type': 'application/json' } });

export const nodeScripts = (projectPath: string) => api<{ packageManager: PackageManager; scripts: string[] }>(`/node/scripts`, { method: 'POST', body: JSON.stringify({ projectPath }), headers: { 'Content-Type': 'application/json' } });
export const nodeInstall = (projectPath: string) => api<{ procId: string }>(`/node/install`, { method: 'POST', body: JSON.stringify({ projectPath }), headers: { 'Content-Type': 'application/json' } });
export const nodeRun = (projectPath: string, script: string) => api<{ procId: string }>(`/node/run`, { method: 'POST', body: JSON.stringify({ projectPath, script }), headers: { 'Content-Type': 'application/json' } });

export const makeTargets = (projectPath: string) => api<{ targets: string[] }>(`/make/targets`, { method: 'POST', body: JSON.stringify({ projectPath }), headers: { 'Content-Type': 'application/json' } });
export const makeRun = (projectPath: string, target?: string) => api<{ procId: string }>(`/make/run`, { method: 'POST', body: JSON.stringify({ projectPath, target }), headers: { 'Content-Type': 'application/json' } });

export const openPty = (cwd: string, cols: number, rows: number) => api<{ ptyId: string }>(`/pty/open`, { method: 'POST', body: JSON.stringify({ cwd, cols, rows }), headers: { 'Content-Type': 'application/json' } });
export const resizePtyApi = (ptyId: string, cols: number, rows: number) => api(`/pty/resize`, { method: 'POST', body: JSON.stringify({ ptyId, cols, rows }), headers: { 'Content-Type': 'application/json' } });
export const closePtyApi = (ptyId: string) => api(`/pty/close`, { method: 'POST', body: JSON.stringify({ ptyId }), headers: { 'Content-Type': 'application/json' } });
export const listPtys = () => api<{ count: number; ptys: string[] }>(`/pty/list`);
export const killAllPtys = () => api<{ ok: boolean }>(`/pty/kill-all`, { method: 'POST' });

export const spawnProc = (cwd: string, cmd: string, args: string[]) => api<{ procId: string }>(`/proc/spawn`, { method: 'POST', body: JSON.stringify({ cwd, cmd, args }), headers: { 'Content-Type': 'application/json' } });
export const stopProc = (procId: string) => api(`/proc/stop`, { method: 'POST', body: JSON.stringify({ procId }), headers: { 'Content-Type': 'application/json' } });

export const openProcSocket = (procId: string): WebSocket => {
  const token = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
  return new WebSocket(`${location.origin.replace('http', 'ws')}/ws/proc/${procId}${token}`);
};

export const openPtySocket = (ptyId: string): WebSocket => {
  const token = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
  return new WebSocket(`${location.origin.replace('http', 'ws')}/ws/pty/${ptyId}${token}`);
};

export type ProcStream = ProcMessage;
