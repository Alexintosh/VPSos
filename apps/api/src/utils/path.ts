import { join, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { config } from '../config';

export const normalizePath = (p: string) => resolve(p);

export const enforceSandbox = async (targetPath: string) => {
  if (config.FS_SANDBOX === 'off') return normalizePath(targetPath);
  const abs = normalizePath(targetPath);
  const root = normalizePath(config.FS_ROOT);
  if (!abs.startsWith(root)) {
    throw new Error('path outside sandbox');
  }
  return abs;
};

export const pathExists = async (p: string) => {
  try {
    await stat(p);
    return true;
  } catch (err: any) {
    if (err?.code === 'ENOENT') return false;
    throw err;
  }
};

export const joinSafe = async (...parts: string[]) => enforceSandbox(join(...parts));
