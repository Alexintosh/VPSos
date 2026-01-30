import { Elysia, t } from 'elysia';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { enforceSandbox } from '../utils/path';
import { spawnProcessTask } from '../services/proc';
import { detectPackageManagerFromFiles, readScripts } from '../services/scripts';

export const nodeRoutes = new Elysia({ name: 'node' })
  .post('/api/node/scripts', async ({ body, set }) => {
    const projectPath = await enforceSandbox(body.projectPath);
    const pkgPath = join(projectPath, 'package.json');
    let pkg: any;
    try {
      const content = await readFile(pkgPath, 'utf8');
      pkg = JSON.parse(content);
    } catch (err) {
      set.status = 400;
      return { error: 'package.json missing or invalid' };
    }
    const scripts = readScripts(pkg);
    const pm = await detectPackageManagerFromFiles(projectPath, pkg);
    return { packageManager: pm, scripts };
  }, { body: t.Object({ projectPath: t.String() }) })

  .post('/api/node/install', async ({ body, set }) => {
    const projectPath = await enforceSandbox(body.projectPath);
    const pm = await detectPackageManagerFromFiles(projectPath);
    const cmd = pm === 'bun' ? 'bun' : pm;
    const args = pm === 'bun' ? ['install'] : ['install'];
    const procId = await spawnProcessTask({ cwd: projectPath, cmd, args });
    set.status = 202;
    return { procId };
  }, { body: t.Object({ projectPath: t.String() }) })

  .post('/api/node/run', async ({ body, set }) => {
    const projectPath = await enforceSandbox(body.projectPath);
    const pm = await detectPackageManagerFromFiles(projectPath);
    const cmd = pm === 'bun' ? 'bun' : pm;
    const args = pm === 'bun' ? ['run', body.script] : ['run', body.script];
    const procId = await spawnProcessTask({ cwd: projectPath, cmd, args });
    set.status = 202;
    return { procId };
  }, { body: t.Object({ projectPath: t.String(), script: t.String() }) });
