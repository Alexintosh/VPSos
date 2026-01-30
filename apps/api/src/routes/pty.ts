import { Elysia, t } from 'elysia';
import { openPty, resizePty, closePty, attachPtySocket, writePty } from '../services/pty';
import { enforceSandbox } from '../utils/path';

export const ptyRoutes = new Elysia({ name: 'pty' })
  .post('/api/pty/open', async ({ body }) => {
    const cwd = body.cwd ? await enforceSandbox(body.cwd) : undefined;
    const id = await openPty({ cwd, cols: body.cols, rows: body.rows });
    return { ptyId: id };
  }, { body: t.Object({ cwd: t.Optional(t.String()), cols: t.Number(), rows: t.Number() }) })

  .post('/api/pty/resize', ({ body, set }) => {
    try {
      resizePty(body.ptyId, body.cols, body.rows);
      return { ok: true };
    } catch (err: any) {
      set.status = 404;
      return { error: err?.message || 'not found' };
    }
  }, { body: t.Object({ ptyId: t.String(), cols: t.Number(), rows: t.Number() }) })

  .post('/api/pty/close', ({ body }) => {
    const ok = closePty(body.ptyId);
    return ok ? { ok: true } : { error: 'not found' };
  }, { body: t.Object({ ptyId: t.String() }) })

  .ws('/ws/pty/:id', {
    open(ws) {
      const detach = attachPtySocket(ws.data.params.id, ws.raw as any);
      (ws as any).data.detach = detach;
    },
    message(ws, data) {
      if (data instanceof Uint8Array) {
        try { writePty(ws.data.params.id, data); } catch {}
      } else if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          if (parsed?.t === 'resize') resizePty(ws.data.params.id, parsed.cols, parsed.rows);
        } catch {}
      }
    },
    close(ws) {
      (ws as any).data.detach?.();
    }
  });
