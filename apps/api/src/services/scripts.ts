import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PackageManager } from '@devos/shared';

export const readScripts = (pkg: any): string[] => Object.keys(pkg?.scripts || {});

export const detectPackageManagerFromFiles = async (projectPath: string, pkg?: any): Promise<PackageManager> => {
  const loadedPkg = pkg ?? await (async () => {
    try {
      const text = await readFile(join(projectPath, 'package.json'), 'utf8');
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  })();

  const declared = loadedPkg?.packageManager as string | undefined;
  if (declared?.startsWith('bun')) return 'bun';
  if (declared?.startsWith('pnpm')) return 'pnpm';
  if (declared?.startsWith('yarn')) return 'yarn';
  if (declared?.startsWith('npm')) return 'npm';

  const tests: Array<[PackageManager, string]> = [
    ['bun', 'bun.lockb'],
    ['pnpm', 'pnpm-lock.yaml'],
    ['yarn', 'yarn.lock'],
    ['npm', 'package-lock.json']
  ];
  for (const [pm, file] of tests) {
    try {
      await readFile(join(projectPath, file));
      return pm;
    } catch {}
  }
  return 'npm';
};
