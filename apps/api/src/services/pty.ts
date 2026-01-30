import { randomUUID } from 'node:crypto';
import { spawn, type Subprocess, type Terminal } from 'bun';
import { config } from '../config';
import { enforceSandbox } from '../utils/path';

type SocketLike = { send: (data: any) => void; close: () => void };

interface PtyEntry {
  id: string;
  proc: Subprocess;
  terminal: Terminal;
  connections: Set<SocketLike>;
}

const ptys = new Map<string, PtyEntry>();

const broadcast = (entry: PtyEntry, data: Uint8Array) => {
  for (const ws of entry.connections) ws.send(data);
};

const onExit = (entry: PtyEntry, code: number) => {
  const msg = JSON.stringify({ t: 'exit', code });
  for (const ws of entry.connections) ws.send(msg);
  ptys.delete(entry.id);
};

const versionOk = () => {
  const v = Bun.version.split('.').map((n) => parseInt(n, 10));
  const [maj, min, patch] = [v[0] || 0, v[1] || 0, v[2] || 0];
  return maj > 1 || (maj === 1 && (min > 3 || (min === 3 && patch >= 5)));
};

export interface OpenPtyInput {
  cwd?: string;
  cols: number;
  rows: number;
}

export const openPty = async (input: OpenPtyInput) => {
  if (!versionOk()) throw new Error('Bun 1.3.5+ required for PTY support');
  if (ptys.size >= config.MAX_PTY) throw new Error('pty limit reached');
  const id = randomUUID();
  const cwd = input.cwd ? await enforceSandbox(input.cwd) : config.DEFAULT_CWD;
  const proc = spawn([config.DEFAULT_SHELL], {
    cwd,
    terminal: {
      cols: input.cols,
      rows: input.rows,
      data(term, chunk) {
        const entry = ptys.get(id);
        if (!entry) return;
        broadcast(entry, chunk);
      }
    }
  });

  if (!proc.terminal) throw new Error('terminal not created');
  const entry: PtyEntry = { id, proc, terminal: proc.terminal, connections: new Set() };
  ptys.set(id, entry);

  proc.exited.then((code) => onExit(entry, code));
  return id;
};

export const writePty = (id: string, data: Uint8Array) => {
  const entry = ptys.get(id);
  if (!entry) throw new Error('pty not found');
  entry.terminal.write(data);
};

export const resizePty = (id: string, cols: number, rows: number) => {
  const entry = ptys.get(id);
  if (!entry) throw new Error('pty not found');
  entry.terminal.resize(cols, rows);
};

export const closePty = (id: string) => {
  const entry = ptys.get(id);
  if (!entry) return false;
  entry.terminal.close();
  entry.proc.kill();
  ptys.delete(id);
  return true;
};

export const attachPtySocket = (id: string, ws: SocketLike) => {
  const entry = ptys.get(id);
  if (!entry) {
    ws.send(JSON.stringify({ t: 'exit', code: -1 }));
    ws.close();
    return;
  }
  entry.connections.add(ws);
  return () => entry.connections.delete(ws);
};
