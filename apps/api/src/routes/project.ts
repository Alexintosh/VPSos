import { Elysia, t } from 'elysia';
import { inspectProject } from '../services/project';

export const projectRoutes = new Elysia({ name: 'project' })
  .get('/api/project/inspect', async ({ query, set }) => {
    if (!query.path) {
      set.status = 400;
      return { error: 'path required' };
    }
    const info = await inspectProject(query.path);
    return info;
  }, { query: t.Object({ path: t.String() }) });
