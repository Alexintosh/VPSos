import { Elysia, t } from 'elysia';
import {
  attachChatSessionSocket,
  appendUserMessageAndRun,
  createChatSession,
  getChatSession,
  listAgentProfiles,
  listChatSessions,
  stopChatSession,
  configCwd
} from '../services/agent';
import { enforceSandbox } from '../utils/path';

export const agentRoutes = new Elysia({ name: 'agent' })
  .get('/api/agent/profiles', () => ({ profiles: listAgentProfiles() }))
  .get('/api/agent/sessions', () => ({ sessions: listChatSessions() }))

  .post('/api/agent/session', ({ body, set }) => {
    const session = createChatSession(body.profileId, body.systemPrompt);
    set.status = 201;
    return { session };
  }, {
    body: t.Object({
      profileId: t.String(),
      systemPrompt: t.Optional(t.String())
    })
  })

  .get('/api/agent/session/:id', ({ params, set }) => {
    const session = getChatSession(params.id);
    if (!session) {
      set.status = 404;
      return { error: 'not found' };
    }
    return { session };
  })

  .post('/api/agent/session/:id/message', async ({ params, body, set }) => {
    const cwd = await enforceSandbox(configCwd(body.cwd));
    const runId = await appendUserMessageAndRun(params.id, body.content, cwd);
    set.status = 202;
    return { runId };
  }, {
    body: t.Object({
      content: t.String(),
      cwd: t.Optional(t.String())
    })
  })

  .post('/api/agent/session/:id/stop', ({ params, set }) => {
    const ok = stopChatSession(params.id);
    set.status = ok ? 200 : 404;
    return ok ? { ok: true } : { error: 'not found' };
  })

  .ws('/ws/agent/session/:id', {
    open(ws) {
      const detach = attachChatSessionSocket(ws.data.params.id, ws.raw as any);
      (ws as any).data.detach = detach;
    },
    message() {},
    close(ws) {
      (ws as any).data.detach?.();
    }
  });
