import { Elysia } from 'elysia';
import { config } from '../config';

const allowAll = config.PROXY_ALLOW_ALL;
const allowedPorts = new Set(
  (config.PROXY_ALLOW_PORTS || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => Number(p))
    .filter((p) => Number.isInteger(p) && p > 0 && p <= 65535)
);

const isAllowedPort = (port: number) => allowAll || allowedPorts.has(port);

const parsePort = (value: string) => {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return port;
};

const buildTarget = (requestUrl: string, prefix: string) => {
  const url = new URL(requestUrl, 'http://localhost');
  let rest = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : '';
  if (!rest.startsWith('/')) rest = `/${rest}`;
  if (rest === '/') {
    return `${rest}${url.search}`;
  }
  return `${rest}${url.search}`;
};

const sanitizeRequestHeaders = (headers: Headers) => {
  const out = new Headers(headers);
  out.delete('host');
  out.delete('connection');
  out.delete('content-length');
  out.delete('upgrade');
  out.delete('sec-websocket-key');
  out.delete('sec-websocket-version');
  out.delete('sec-websocket-extensions');
  out.delete('sec-websocket-protocol');
  return out;
};

const sanitizeResponseHeaders = (headers: Headers) => {
  const out = new Headers(headers);
  out.delete('content-length');
  return out;
};

export const proxyRoutes = new Elysia({ name: 'proxy' })
  .all('/api/proxy/:port', async ({ params, request, set }) => {
    const port = parsePort(params.port);
    if (!port) {
      set.status = 400;
      return { error: 'invalid port' };
    }
    if (!isAllowedPort(port)) {
      set.status = 403;
      return { error: 'port not allowed' };
    }

    const targetPath = buildTarget(request.url, `/api/proxy/${port}`);
    const targetUrl = `http://127.0.0.1:${port}${targetPath}`;

    try {
      const res = await fetch(targetUrl, {
        method: request.method,
        headers: sanitizeRequestHeaders(request.headers),
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        redirect: 'manual'
      });
      return new Response(res.body, {
        status: res.status,
        headers: sanitizeResponseHeaders(res.headers)
      });
    } catch (err: any) {
      set.status = 502;
      return { error: err?.message || 'proxy error' };
    }
  })
  .all('/api/proxy/:port/*', async ({ params, request, set }) => {
    const port = parsePort(params.port);
    if (!port) {
      set.status = 400;
      return { error: 'invalid port' };
    }
    if (!isAllowedPort(port)) {
      set.status = 403;
      return { error: 'port not allowed' };
    }

    const targetPath = buildTarget(request.url, `/api/proxy/${port}`);
    const targetUrl = `http://127.0.0.1:${port}${targetPath}`;

    try {
      const res = await fetch(targetUrl, {
        method: request.method,
        headers: sanitizeRequestHeaders(request.headers),
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        redirect: 'manual'
      });
      return new Response(res.body, {
        status: res.status,
        headers: sanitizeResponseHeaders(res.headers)
      });
    } catch (err: any) {
      set.status = 502;
      return { error: err?.message || 'proxy error' };
    }
  })
  .ws('/ws/proxy/:port', {
    open(ws) {
      const port = parsePort(ws.data.params.port);
      if (!port || !isAllowedPort(port)) {
        ws.close(1008, 'forbidden');
        return;
      }
      const requestUrl = ws.data.request?.url || '';
      const url = new URL(requestUrl || `/ws/proxy/${port}`, 'http://localhost');
      const path = buildTarget(url.toString(), `/ws/proxy/${port}`);
      const upstreamUrl = `ws://127.0.0.1:${port}${path}`;

      const upstream = new WebSocket(upstreamUrl);
      upstream.binaryType = 'arraybuffer';
      const queue: Array<string | ArrayBuffer | Uint8Array> = [];
      let open = false;

      upstream.onopen = () => {
        open = true;
        for (const msg of queue) upstream.send(msg);
        queue.length = 0;
      };
      upstream.onmessage = (ev) => {
        if (typeof ev.data === 'string') ws.send(ev.data);
        else if (ev.data instanceof ArrayBuffer) ws.send(new Uint8Array(ev.data));
        else ws.send(ev.data as any);
      };
      upstream.onclose = () => {
        try { ws.close(); } catch {}
      };
      upstream.onerror = () => {
        try { ws.close(); } catch {}
      };

      (ws as any).data.upstream = { socket: upstream, queue, open: () => open };
    },
    message(ws, data) {
      const upstream = (ws as any).data.upstream as { socket: WebSocket; queue: Array<string | ArrayBuffer | Uint8Array>; open: () => boolean } | undefined;
      if (!upstream) return;
      if (upstream.open()) upstream.socket.send(data as any);
      else upstream.queue.push(data as any);
    },
    close(ws) {
      const upstream = (ws as any).data.upstream as { socket: WebSocket } | undefined;
      if (upstream) {
        try { upstream.socket.close(); } catch {}
      }
    }
  })
  .ws('/ws/proxy/:port/*', {
    open(ws) {
      const port = parsePort(ws.data.params.port);
      if (!port || !isAllowedPort(port)) {
        ws.close(1008, 'forbidden');
        return;
      }
      const requestUrl = ws.data.request?.url || '';
      const url = new URL(requestUrl || `/ws/proxy/${port}`, 'http://localhost');
      const path = buildTarget(url.toString(), `/ws/proxy/${port}`);
      const upstreamUrl = `ws://127.0.0.1:${port}${path}`;

      const upstream = new WebSocket(upstreamUrl);
      upstream.binaryType = 'arraybuffer';
      const queue: Array<string | ArrayBuffer | Uint8Array> = [];
      let open = false;

      upstream.onopen = () => {
        open = true;
        for (const msg of queue) upstream.send(msg);
        queue.length = 0;
      };
      upstream.onmessage = (ev) => {
        if (typeof ev.data === 'string') ws.send(ev.data);
        else if (ev.data instanceof ArrayBuffer) ws.send(new Uint8Array(ev.data));
        else ws.send(ev.data as any);
      };
      upstream.onclose = () => {
        try { ws.close(); } catch {}
      };
      upstream.onerror = () => {
        try { ws.close(); } catch {}
      };

      (ws as any).data.upstream = { socket: upstream, queue, open: () => open };
    },
    message(ws, data) {
      const upstream = (ws as any).data.upstream as { socket: WebSocket; queue: Array<string | ArrayBuffer | Uint8Array>; open: () => boolean } | undefined;
      if (!upstream) return;
      if (upstream.open()) upstream.socket.send(data as any);
      else upstream.queue.push(data as any);
    },
    close(ws) {
      const upstream = (ws as any).data.upstream as { socket: WebSocket } | undefined;
      if (upstream) {
        try { upstream.socket.close(); } catch {}
      }
    }
  });
