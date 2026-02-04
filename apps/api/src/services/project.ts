import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { ProjectInfo, GitStatusSummary, PackageManager } from '@vpsos/shared';
import { enforceSandbox, normalizePath } from '../utils/path';
import { spawnText } from '../utils/spawn';

const parseGitStatus = (text: string): GitStatusSummary => {
  const lines = text.trim().split('\n');
  const first = lines.shift() || '';
  let branch = 'unknown';
  let ahead = 0;
  let behind = 0;
  if (first.startsWith('##')) {
    const m = first.match(/##\s+([^\.]+)(?:\.\.\.\S+)?(?:\s+\[ahead (\d+)\])?(?:\s+\[behind (\d+)\])?/);
    if (m) {
      branch = m[1];
      ahead = Number(m[2] || 0);
      behind = Number(m[3] || 0);
    }
  }
  const counts = { added: 0, modified: 0, deleted: 0, untracked: 0 };
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith('??')) counts.untracked += 1;
    else if (/^A /.test(line)) counts.added += 1;
    else if (/^D /.test(line)) counts.deleted += 1;
    else counts.modified += 1;
  }
  return { branch, ahead, behind, counts };
};

const detectGit = async (path: string) => {
  const gitStatus = await spawnText('git', ['status', '--porcelain=v1', '-b'], path);
  if (!gitStatus.ok) return undefined;
  const status = parseGitStatus(gitStatus.stdout);
  const gitRoot = await spawnText('git', ['rev-parse', '--show-toplevel'], path);
  if (!gitRoot.ok) return undefined;
  return { root: gitRoot.stdout.trim(), status };
};

const detectPackageManager = (pkg: any, path: string): PackageManager => {
  const declared = typeof pkg.packageManager === 'string' ? pkg.packageManager : undefined;
  if (declared?.startsWith('bun')) return 'bun';
  if (declared?.startsWith('pnpm')) return 'pnpm';
  if (declared?.startsWith('yarn')) return 'yarn';
  if (declared?.startsWith('npm')) return 'npm';
  return 'npm';
};

const detectNode = async (path: string) => {
  try {
    const content = await readFile(join(path, 'package.json'), 'utf8');
    const pkg = JSON.parse(content);
    const scripts = Object.keys(pkg.scripts || {});
    const pm = detectPackageManager(pkg, path);
    return { root: path, packageManager: pm, scripts };
  } catch {
    return undefined;
  }
};

const parseMakeTargets = (text: string): string[] => {
  const targets = new Set<string>();
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_.-]+):/);
    if (m) targets.add(m[1]);
  }
  return Array.from(targets);
};

const detectMake = async (path: string) => {
  const makefile = join(path, 'Makefile');
  try {
    const content = await readFile(makefile, 'utf8');
    return { root: path, targets: parseMakeTargets(content) };
  } catch {
    return undefined;
  }
};

export const inspectProject = async (inputPath: string): Promise<ProjectInfo> => {
  const root = await enforceSandbox(inputPath);
  const info: ProjectInfo = { path: root };
  const git = await detectGit(root).catch(() => undefined);
  if (git) info.git = git;
  const node = await detectNode(root);
  if (node) info.node = node;
  const make = await detectMake(root);
  if (make) info.make = make;
  return info;
};
