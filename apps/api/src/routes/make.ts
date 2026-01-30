import { Elysia, t } from 'elysia';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { enforceSandbox } from '../utils/path';
import { spawnProcessTask } from '../services/proc';

const parseMakeTargets = (text: string) => {
  const targets = new Set<string>();
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_.-]+):/);
    if (m) targets.add(m[1]);
  }
  return Array.from(targets);
};

export const makeRoutes = new Elysia({ name: 'make' })
  .post('/api/make/targets', async ({ body, set }) => {
    const projectPath = await enforceSandbox(body.projectPath);
    try {
      const text = await readFile(join(projectPath, 'Makefile'), 'utf8');
      return { targets: parseMakeTargets(text) };
    } catch {
      set.status = 404;
      return { error: 'Makefile not found' };
    }
  }, { body: t.Object({ projectPath: t.String() }) })

  .post('/api/make/run', async ({ body, set }) => {
    const projectPath = await enforceSandbox(body.projectPath);
    const args = body.target ? [body.target] : [];
    const procId = await spawnProcessTask({ cwd: projectPath, cmd: 'make', args });
    set.status = 202;
    return { procId };
  }, { body: t.Object({ projectPath: t.String(), target: t.Optional(t.String()) }) });
