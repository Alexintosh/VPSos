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
import { agentRoutes } from './routes/agent';
import { proxyRoutes } from './routes/proxy';

const app = new Elysia({ prefix: '' })
  .state('config', config)
  .use(authPlugin)
  .get('/api/health', () => ({ ok: true }))
  .get('/api/public-config', () => ({ requireAuth: config.REQUIRE_AUTH }))
  .get('/api/config', () => ({
    fsSandbox: config.FS_SANDBOX,
    fsRoot: config.FS_SANDBOX === 'on' ? config.FS_ROOT : undefined,
    defaultCwd: config.DEFAULT_CWD,
    requireAuth: config.REQUIRE_AUTH,
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
  .use(agentRoutes)
  .use(proxyRoutes)
  .listen({ port: config.PORT, hostname: config.HOST });

const hostForLog = config.HOST === '0.0.0.0' ? 'localhost' : config.HOST;
console.log(`api listening on http://${hostForLog}:${config.PORT}`);
