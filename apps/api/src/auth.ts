import { Elysia, t } from 'elysia';
import { config } from './config';

const HEADER = 'authorization';
const COOKIE = 'vpsos_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const sessions = new Map<string, number>();
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

const authSecret = () => config.USER_PASSWORD || config.AUTH_TOKEN || '';
const tokenMatches = (token?: string) => {
  if (!config.REQUIRE_AUTH) return true;
  return Boolean(token) && token === authSecret();
};

const getClientKey = (request: Request) => {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  const realIp = request.headers.get('x-real-ip');
  return realIp || 'unknown';
};

const allowLoginAttempt = (key: string) => {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
};

const parseCookie = (cookieHeader: string | null, name: string) => {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return undefined;
};

const isSecureRequest = (request: Request) => {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) return forwardedProto.split(',')[0]?.trim() === 'https';
  return new URL(request.url).protocol === 'https:';
};

const issueSession = (request: Request) => {
  const id = crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(id, expiresAt);
  return id;
};

const isSessionValid = (id?: string) => {
  if (!id) return false;
  const expiresAt = sessions.get(id);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessions.delete(id);
    return false;
  }
  return true;
};

const buildSessionCookie = (request: Request, sessionId: string) => {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${COOKIE}=${sessionId}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${maxAge}`
  ];
  if (isSecureRequest(request)) parts.push('Secure');
  return parts.join('; ');
};

export const createAuthPlugin = () => new Elysia({ name: 'auth' })
  .post('/api/auth/login', ({ body, request, set }) => {
    const clientKey = getClientKey(request);
    if (!allowLoginAttempt(clientKey)) {
      const retryAfter = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
      set.status = 429;
      set.headers['Retry-After'] = String(retryAfter);
      return { error: 'rate limit exceeded' };
    }
    if (!config.REQUIRE_AUTH) {
      const sessionId = issueSession(request);
      set.headers['Set-Cookie'] = buildSessionCookie(request, sessionId);
      return { ok: true };
    }
    const provided = body.password || body.token;
    if (!tokenMatches(provided)) {
      set.status = 401;
      return { error: 'invalid password' };
    }
    const sessionId = issueSession(request);
    set.headers['Set-Cookie'] = buildSessionCookie(request, sessionId);
    return { ok: true };
  }, {
    body: t.Object({ password: t.Optional(t.String()), token: t.Optional(t.String()) })
  })
  .derive({ as: 'global' }, ({ request }) => {
    if (!config.REQUIRE_AUTH) return { authed: true };
    const bearer = request.headers.get(HEADER)?.replace(/Bearer\s+/i, '')?.trim();
    const sessionId = parseCookie(request.headers.get('cookie'), COOKIE);
    const sessionAuthed = isSessionValid(sessionId);
    const bearerAuthed = tokenMatches(bearer);
    return { authed: bearerAuthed || sessionAuthed };
  })
  .onBeforeHandle({ as: 'global' }, ({ authed, set, request }) => {
    if (request.url.endsWith('/api/auth/login')) return;
    if (request.url.endsWith('/api/public-config')) return;
    if (!authed) {
      set.status = 401;
      return { error: 'unauthorized' };
    }
  });

export const authPlugin = createAuthPlugin();

export const __test = {
  reset: () => {
    sessions.clear();
    loginAttempts.clear();
  },
  getSessionTtlMs: () => SESSION_TTL_MS
};
