import { Elysia } from 'elysia';
import { staticPlugin } from '@elysiajs/static';
import { join, dirname } from 'path';
import { config } from './config';
import { authPlugin } from './auth';
import { fsRoutes } from './routes/fs';
import { gitRoutes } from './routes/git';
import { nodeRoutes } from './routes/node';
import { makeRoutes } from './routes/make';
import { procRoutes } from './routes/proc';
import { ptyRoutes } from './routes/pty';
import { projectRoutes } from './routes/project';
import { existsSync } from 'fs';

// Determine web assets path based on runtime environment
function getWebRoot(): string | null {
  const candidates = [
    join(process.cwd(), 'web'),
    join(process.cwd(), 'dist', 'web'),
    join(dirname(process.argv[0]), 'web'),
    join(dirname(process.argv[0]), '..', 'web'),
  ];
  
  for (const p of candidates) {
    if (existsSync(p)) {
      return p;
    }
  }
  
  return null;
}

const webRoot = getWebRoot();

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
  .use(ptyRoutes);

// Serve static web files
if (webRoot) {
  console.log(`📁 Serving web assets from: ${webRoot}`);
  
  // Serve index.html at root
  app.get('/', async ({ set }) => {
    const indexPath = join(webRoot, 'index.html');
    if (!existsSync(indexPath)) {
      set.status = 404;
      return 'index.html not found';
    }
    const file = Bun.file(indexPath);
    set.headers['content-type'] = 'text/html';
    return file;
  });
  
  // Serve assets
  app.get('/assets/*', async ({ params, set }) => {
    const filePath = join(webRoot, 'assets', params['*']);
    if (!existsSync(filePath)) {
      set.status = 404;
      return 'Not found';
    }
    const file = Bun.file(filePath);
    return file;
  });
  
  // Fallback: serve any other static files
  app.use(staticPlugin({
    assets: webRoot,
    prefix: '/',
    indexHTML: false,
  }));
} else {
  console.log('⚠️  Web assets not found. API-only mode.');
}

app.listen({ port: config.PORT, hostname: config.HOST });

const hostForLog = config.HOST === '0.0.0.0' ? 'localhost' : config.HOST;
console.log(`🚀 VPSos running at http://${hostForLog}:${config.PORT}`);
