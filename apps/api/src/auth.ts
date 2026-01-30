import { Elysia, t } from 'elysia';
import { config } from './config';

const HEADER = 'authorization';
const COOKIE = 'devos_session';

const tokenMatches = (token?: string) => token === config.AUTH_TOKEN;

export const authPlugin = new Elysia({ name: 'auth' })
  .post('/api/auth/login', ({ body, set }) => {
    if (!tokenMatches(body.token)) {
      set.status = 401;
      return { error: 'invalid token' };
    }
    // Minimal cookie-based session for WS support
    set.headers['Set-Cookie'] = `${COOKIE}=ok; HttpOnly; Path=/; SameSite=Lax`;
    return { ok: true };
  }, {
    body: t.Object({ token: t.String() })
  })
  .derive(({ request }) => {
    const url = new URL(request.url);
    const bearer = request.headers.get(HEADER)?.replace(/Bearer\s+/i, '')?.trim();
    const queryToken = url.searchParams.get('token') || undefined;
    const cookieToken = request.headers.get('cookie')?.includes(`${COOKIE}=ok`) ? config.AUTH_TOKEN : undefined;
    const provided = bearer || queryToken || cookieToken;
    return { authed: tokenMatches(provided) };
  })
  .onBeforeHandle(({ authed, set, request }) => {
    if (request.url.endsWith('/api/auth/login')) return;
    if (!authed) {
      set.status = 401;
      return { error: 'unauthorized' };
    }
  });
