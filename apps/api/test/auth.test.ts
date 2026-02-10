import { beforeEach, describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';

process.env.REQUIRE_AUTH ??= 'true';
process.env.USER_PASSWORD ??= 'test-password';
process.env.AUTH_TOKEN ??= 'test-token';

const { createAuthPlugin, __test } = await import('../src/auth.ts');
const { config } = await import('../src/config');

const makeApp = () => {
  const app = new Elysia()
    .use(createAuthPlugin())
    .get('/api/secure', () => ({ ok: true }))
    .get('/api/public-config', () => ({ ok: true }));
  return app;
};

const withServer = async <T>(app: Elysia, fn: (base: string) => Promise<T>) => {
  app.listen(0);
  const server = app.server;
  if (!server) {
    throw new Error('Server did not start');
  }
  const base = server.url?.origin || `http://${server.hostname}:${server.port}`;
  try {
    return await fn(base);
  } finally {
    server.stop();
  }
};

const jsonPost = (body: unknown, headers?: HeadersInit) => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...headers
  },
  body: JSON.stringify(body)
});

const extractCookie = (setCookie: string | null) => {
  if (!setCookie) return '';
  return setCookie.split(';')[0] || '';
};

const extractMaxAge = (setCookie: string | null) => {
  if (!setCookie) return 0;
  const match = setCookie.match(/Max-Age=(\d+)/i);
  return match ? Number(match[1]) : 0;
};

describe('auth plugin', () => {
  beforeEach(() => {
    __test.reset();
    config.REQUIRE_AUTH = true;
    config.USER_PASSWORD = 'secret';
    config.AUTH_TOKEN = 'secret';
  });

  test('rejects unauthenticated requests', async () => {
    const app = makeApp();

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/secure`);
      expect(res.status).toBe(401);
    });
  });

  test('accepts bearer token', async () => {
    const app = makeApp();

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/secure`, {
        headers: { Authorization: 'Bearer secret' }
      });
      expect(res.status).toBe(200);
    });
  });

  test('login issues strict secure cookie and permits session access', async () => {
    const app = makeApp();

    await withServer(app, async (base) => {
      const loginRes = await fetch(`${base}/api/auth/login`, jsonPost({ password: 'secret' }, {
        'x-forwarded-proto': 'https'
      }));
      expect(loginRes.status).toBe(200);
      const setCookie = loginRes.headers.get('set-cookie');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
      expect(setCookie).toContain('Max-Age=');
      expect(setCookie).toContain('Secure');

      const cookie = extractCookie(setCookie);
      const res = await fetch(`${base}/api/secure`, {
        headers: { cookie }
      });
      expect(res.status).toBe(200);
    });
  });

  test('rate limits excessive login attempts', async () => {
    const app = makeApp();

    await withServer(app, async (base) => {
      const headers = { 'x-forwarded-for': '1.2.3.4' };
      for (let i = 0; i < 5; i += 1) {
        const res = await fetch(`${base}/api/auth/login`, jsonPost({ password: 'wrong' }, headers));
        expect(res.status).toBe(401);
      }
      const limited = await fetch(`${base}/api/auth/login`, jsonPost({ password: 'wrong' }, headers));
      expect(limited.status).toBe(429);
      expect(limited.headers.get('Retry-After')).not.toBeNull();
    });
  });

  test('expires session after max age', async () => {
    const app = makeApp();

    const realNow = Date.now;
    const base = realNow();
    Date.now = () => base;

    try {
      await withServer(app, async (serverBase) => {
        const loginRes = await fetch(`${serverBase}/api/auth/login`, jsonPost({ password: 'secret' }));
        expect(loginRes.status).toBe(200);
        const setCookie = loginRes.headers.get('set-cookie');
        const cookie = extractCookie(setCookie);
        const maxAge = extractMaxAge(setCookie);

        Date.now = () => base + (maxAge * 1000) + 1000;
        const res = await fetch(`${serverBase}/api/secure`, { headers: { cookie } });
        expect(res.status).toBe(401);
      });
    } finally {
      Date.now = realNow;
    }
  });

  test('allows requests when REQUIRE_AUTH is false', async () => {
    const app = makeApp();
    config.REQUIRE_AUTH = false;

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/secure`);
      expect(res.status).toBe(200);
    });
  });
});
