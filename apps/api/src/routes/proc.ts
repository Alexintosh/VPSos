import { Elysia, t } from 'elysia';
import { attachProcSocket, getProcessInfo, spawnProcessTask, stopProcess } from '../services/proc';
import { enforceSandbox } from '../utils/path';

export const procRoutes = new Elysia({ name: 'proc' })
  .post('/api/proc/spawn', async ({ body, set }) => {
    const cwd = body.cwd ? await enforceSandbox(body.cwd) : undefined;
    const procId = await spawnProcessTask({ cwd, cmd: body.cmd, args: body.args || [], env: body.env });
    set.status = 202;
    return { procId };
  }, { body: t.Object({ cwd: t.Optional(t.String()), cmd: t.String(), args: t.Optional(t.Array(t.String())), env: t.Optional(t.Record(t.String(), t.String())) }) })

  .post('/api/proc/stop', ({ body, set }) => {
    const ok = stopProcess(body.procId);
    set.status = ok ? 200 : 404;
    return ok ? { ok: true } : { error: 'not found' };
  }, { body: t.Object({ procId: t.String() }) })

  .get('/api/proc/:id', ({ params, set }) => {
    const info = getProcessInfo(params.id);
    if (!info) {
      set.status = 404;
      return { error: 'not found' };
    }
    return info;
  })

  .ws('/ws/proc/:id', {
    open(ws) {
      const detach = attachProcSocket(ws.data.params.id, ws.raw as any);
      (ws as any).data.detach = detach;
    },
    message() {},
    close(ws) {
      (ws as any).data.detach?.();
    }
  });
