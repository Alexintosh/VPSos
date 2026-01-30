import { Elysia, t } from 'elysia';
import { readdir, readFile, writeFile, mkdir, rm, rename, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { enforceSandbox, normalizePath } from '../utils/path';

const describeEntry = async (path: string) => {
  const s = await stat(path);
  return {
    name: basename(path),
    path,
    type: s.isDirectory() ? 'dir' : s.isSymbolicLink() ? 'link' : 'file',
    size: s.size,
    mtime: s.mtimeMs
  };
};

export const fsRoutes = new Elysia({ name: 'fs' })
  .get('/api/fs/list', async ({ query, set }) => {
    if (!query.path) {
      set.status = 400;
      return { error: 'path required' };
    }
    const target = await enforceSandbox(query.path);
    const entries = await readdir(target);
    const described = await Promise.all(entries.map((name) => describeEntry(join(target, name))));
    return { path: target, entries: described };
  }, { query: t.Object({ path: t.String() }) })

  .get('/api/fs/read', async ({ query, set }) => {
    if (!query.path) {
      set.status = 400;
      return { error: 'path required' };
    }
    const target = await enforceSandbox(query.path);
    const content = await readFile(target, 'utf8');
    return { path: target, content, encoding: 'utf-8' };
  }, { query: t.Object({ path: t.String() }) })

  .put('/api/fs/write', async ({ body }) => {
    const target = await enforceSandbox(body.path);
    await writeFile(target, body.content, 'utf8');
    return { ok: true, path: target };
  }, { body: t.Object({ path: t.String(), content: t.String() }) })

  .post('/api/fs/mkdir', async ({ body }) => {
    const target = await enforceSandbox(body.path);
    await mkdir(target, { recursive: true });
    return { ok: true, path: target };
  }, { body: t.Object({ path: t.String() }) })

  .post('/api/fs/rm', async ({ body }) => {
    const target = await enforceSandbox(body.path);
    await rm(target, { recursive: !!body.recursive, force: true });
    return { ok: true, path: target };
  }, { body: t.Object({ path: t.String(), recursive: t.Optional(t.Boolean()) }) })

  .post('/api/fs/mv', async ({ body }) => {
    const from = await enforceSandbox(body.from);
    const to = await enforceSandbox(body.to);
    await rename(from, to);
    return { ok: true, from, to };
  }, { body: t.Object({ from: t.String(), to: t.String() }) })

  .get('/api/fs/realpath', async ({ query }) => {
    const target = await enforceSandbox(query.path);
    return { path: target };
  }, { query: t.Object({ path: t.String() }) });

export type FsRoutes = typeof fsRoutes;
