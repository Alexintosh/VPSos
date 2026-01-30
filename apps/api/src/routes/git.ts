import { Elysia, t } from 'elysia';
import { spawnText } from '../utils/spawn';
import { enforceSandbox } from '../utils/path';
import { config } from '../config';

const branches = async (repoPath: string) => {
  const res = await spawnText('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], repoPath);
  if (!res.ok) throw new Error(res.stderr || 'git failed');
  return res.stdout.split('\n').filter(Boolean);
};

const currentBranch = async (repoPath: string) => {
  const res = await spawnText('git', ['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);
  if (!res.ok) throw new Error(res.stderr || 'git failed');
  return res.stdout.trim();
};

export const gitRoutes = new Elysia({ name: 'git' })
  .post('/api/git/branches', async ({ body }) => {
    const repoPath = await enforceSandbox(body.repoPath);
    const list = await branches(repoPath);
    const current = await currentBranch(repoPath);
    return { branches: list, current };
  }, { body: t.Object({ repoPath: t.String() }) })

  .post('/api/git/checkout', async ({ body, set }) => {
    const repoPath = await enforceSandbox(body.repoPath);
    const res = await spawnText('git', ['checkout', body.branch], repoPath);
    set.status = res.ok ? 200 : 400;
    return res.ok ? { ok: true } : { error: res.stderr || 'checkout failed' };
  }, { body: t.Object({ repoPath: t.String(), branch: t.String() }) })

  .post('/api/git/create-branch', async ({ body, set }) => {
    const repoPath = await enforceSandbox(body.repoPath);
    const base = body.from || 'HEAD';
    const res = await spawnText('git', ['checkout', '-b', body.name, base], repoPath);
    set.status = res.ok ? 200 : 400;
    return res.ok ? { ok: true } : { error: res.stderr || 'create branch failed' };
  }, { body: t.Object({ repoPath: t.String(), name: t.String(), from: t.Optional(t.String()) }) })

  .post('/api/git/pull', async ({ body, set }) => {
    const repoPath = await enforceSandbox(body.repoPath);
    const args = ['pull'];
    if (config.GIT_PULL_REBASE) args.push('--rebase');
    const res = await spawnText('git', args, repoPath);
    set.status = res.ok ? 200 : 400;
    return res.ok ? { ok: true } : { error: res.stderr || 'pull failed' };
  }, { body: t.Object({ repoPath: t.String() }) })

  .post('/api/git/push', async ({ body, set }) => {
    const repoPath = await enforceSandbox(body.repoPath);
    const remote = body.remote || config.GIT_DEFAULT_REMOTE;
    const res = await spawnText('git', ['push', remote], repoPath);
    set.status = res.ok ? 200 : 400;
    return res.ok ? { ok: true } : { error: res.stderr || 'push failed' };
  }, { body: t.Object({ repoPath: t.String(), remote: t.Optional(t.String()) }) });
