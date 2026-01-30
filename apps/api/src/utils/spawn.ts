import { spawn } from 'bun';

export interface SpawnResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

export const spawnText = async (cmd: string, args: string[], cwd?: string): Promise<SpawnResult> => {
  const proc = spawn([cmd, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  return { ok: code === 0, stdout, stderr, code };
};
