import { randomUUID } from 'node:crypto';
import { spawn, type Subprocess } from 'bun';
import { config } from '../config';
import { ProcMessage } from '@vpsos/shared';

type SocketLike = { send: (data: any) => void; close: () => void };

interface ProcEntry {
  id: string;
  proc: Subprocess;
  buffer: string;
  connections: Set<SocketLike>;
  stopped: boolean;
}

const procs = new Map<string, ProcEntry>();

const appendBuffer = (entry: ProcEntry, chunk: string) => {
  const combined = entry.buffer + chunk;
  const max = config.MAX_OUTPUT_BYTES;
  entry.buffer = combined.length > max ? combined.slice(combined.length - max) : combined;
};

const broadcast = (entry: ProcEntry, msg: ProcMessage) => {
  const payload = JSON.stringify(msg);
  for (const ws of entry.connections) {
    ws.send(payload);
  }
};

const startPump = (entry: ProcEntry) => {
  const decode = new TextDecoder();
  const readerOut = typeof entry.proc.stdout === 'object' && entry.proc.stdout ? entry.proc.stdout.getReader() : undefined;
  const readerErr = typeof entry.proc.stderr === 'object' && entry.proc.stderr ? entry.proc.stderr.getReader() : undefined;
  const pump = async (reader: ReadableStreamDefaultReader<Uint8Array> | undefined, type: 'stdout' | 'stderr') => {
    if (!reader) return;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decode.decode(value, { stream: true });
      appendBuffer(entry, text);
      broadcast(entry, { t: type, data: text } as ProcMessage);
    }
  };
  pump(readerOut, 'stdout');
  pump(readerErr, 'stderr');
  entry.proc.exited.then((code) => {
    broadcast(entry, { t: 'exit', code });
    procs.delete(entry.id);
  });
};

export interface SpawnTaskInput {
  cwd?: string;
  cmd: string;
  args?: string[];
  env?: Record<string, string>;
}

export const spawnProcessTask = async (input: SpawnTaskInput): Promise<string> => {
  if (procs.size >= config.MAX_PROCS) throw new Error('process limit reached');
  const id = randomUUID();
  const proc = spawn([input.cmd, ...(input.args || [])], {
    cwd: input.cwd,
    env: input.env,
    stdout: 'pipe',
    stderr: 'pipe'
  });
  const entry: ProcEntry = { id, proc, buffer: '', connections: new Set(), stopped: false };
  procs.set(id, entry);
  startPump(entry);
  return id;
};

export const stopProcess = (id: string) => {
  const entry = procs.get(id);
  if (!entry) return false;
  entry.proc.kill();
  entry.stopped = true;
  return true;
};

export const getProcessInfo = (id: string) => {
  const entry = procs.get(id);
  if (!entry) return undefined;
  return { id: entry.id, buffer: entry.buffer };
};

export const attachProcSocket = (id: string, ws: SocketLike) => {
  const entry = procs.get(id);
  if (!entry) {
    ws.send(JSON.stringify({ t: 'exit', code: -1 } satisfies ProcMessage));
    ws.close();
    return;
  }
  entry.connections.add(ws);
  if (entry.buffer) ws.send(JSON.stringify({ t: 'stdout', data: entry.buffer } satisfies ProcMessage));
  return () => entry.connections.delete(ws);
};
