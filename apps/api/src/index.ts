import { Elysia } from 'elysia';
import { config } from './config';
import { authPlugin } from './auth';
import { fsRoutes } from './routes/fs';
import { gitRoutes } from './routes/git';
import { nodeRoutes } from './routes/node';
import { makeRoutes } from './routes/make';
import { procRoutes } from './routes/proc';
import { ptyRoutes } from './routes/pty';
import { projectRoutes } from './routes/project';

const app = new Elysia({ prefix: '' })
  .state('config', config)
  .use(authPlugin)
  .get('/api/health', () => ({ ok: true }))
  .get('/api/config', () => ({
    fsSandbox: config.FS_SANDBOX,
    fsRoot: config.FS_SANDBOX === 'on' ? config.FS_ROOT : undefined,
    defaultCwd: config.DEFAULT_CWD,
    limits: {
      maxProcs: config.MAX_PROCS,
      maxPty: config.MAX_PTY,
      maxOutputBytes: config.MAX_OUTPUT_BYTES
    }
  }))
  .use(fsRoutes)
  .use(projectRoutes)
  .use(gitRoutes)
  .use(nodeRoutes)
  .use(makeRoutes)
  .use(procRoutes)
  .use(ptyRoutes)
  .listen(config.PORT);

console.log(`api listening on http://localhost:${config.PORT}`);
