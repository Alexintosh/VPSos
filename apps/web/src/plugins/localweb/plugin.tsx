import { useEffect, useMemo, useRef, useState } from 'react';
import type { PluginDefinition } from '@vpsos/types';
import { useUI } from '@vpsos/useUI';

const STORAGE_KEY = 'vpsos.localweb.url';
const STORAGE_PROXY_KEY = 'vpsos.localweb.proxy';
const DEFAULT_URL = 'http://localhost:5173';

type LocalWebProps = {
  showToolbar?: boolean;
  default_url?: string;
  defaultUrl?: string;
  proxyVps?: boolean;
};

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('//')) return `http:${trimmed}`;
  return `http://${trimmed}`;
};

const parseUrl = (value: string) => {
  try {
    return new URL(normalizeUrl(value));
  } catch {
    return null;
  }
};

const isLocalHost = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '::1';

const LocalWebApp = ({ windowId }: { windowId: string }) => {
  const setMenus = useUI((s) => s.setMenus);
  const win = useUI((s) => s.windows.find((w) => w.id === windowId));
  const props = (win?.data?.pluginProps || {}) as LocalWebProps;
  const showToolbar = props.showToolbar !== false;
  const hasDefaultProp = Boolean(props.default_url || props.defaultUrl);
  const defaultUrl = props.default_url || props.defaultUrl || DEFAULT_URL;
  const storedUrl = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  const initialUrl = hasDefaultProp ? defaultUrl : (storedUrl || DEFAULT_URL);
  const initialParsed = parseUrl(initialUrl);
  const storedProxy = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_PROXY_KEY) : null;
  const autoProxy = typeof location !== 'undefined'
    && initialParsed
    && isLocalHost(initialParsed.hostname)
    && !isLocalHost(location.hostname);
  const initialProxy = props.proxyVps ?? (storedProxy !== null ? storedProxy === 'true' : autoProxy);

  const [url, setUrl] = useState(initialUrl);
  const [draft, setDraft] = useState(url);
  const [reloadKey, setReloadKey] = useState(0);
  const [proxyVps, setProxyVps] = useState(initialProxy);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const normalizedUrl = useMemo(() => normalizeUrl(url), [url]);
  const parsedUrl = useMemo(() => parseUrl(normalizedUrl), [normalizedUrl]);
  const proxyPort = useMemo(() => {
    if (!parsedUrl) return null;
    if (parsedUrl.port) {
      const port = Number(parsedUrl.port);
      return Number.isFinite(port) ? port : null;
    }
    return parsedUrl.protocol === 'https:' ? 443 : parsedUrl.protocol === 'http:' ? 80 : null;
  }, [parsedUrl]);
  const proxyPath = useMemo(() => {
    if (!parsedUrl) return '/';
    return `${parsedUrl.pathname || '/'}${parsedUrl.search}`;
  }, [parsedUrl]);
  const iframeSrc = useMemo(() => {
    if (proxyVps && proxyPort) return `/api/proxy/${proxyPort}${proxyPath}`;
    return normalizedUrl;
  }, [normalizedUrl, proxyPath, proxyPort, proxyVps]);

  useEffect(() => {
    if (!hasDefaultProp && typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, url);
    }
  }, [hasDefaultProp, url]);

  useEffect(() => {
    if (props.proxyVps === undefined && typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_PROXY_KEY, String(proxyVps));
    }
  }, [proxyVps, props.proxyVps]);

  useEffect(() => {
    setDraft(url);
  }, [url]);

  const applyUrl = () => {
    const next = normalizeUrl(draft);
    if (!next) return;
    setUrl(next);
  };

  const reload = () => {
    setReloadKey((k) => k + 1);
  };

  const openExternal = () => {
    const target = proxyVps && proxyPort ? iframeSrc : (normalizeUrl(draft) || normalizedUrl);
    if (!target) return;
    const absolute = target.startsWith('http') ? target : new URL(target, location.href).toString();
    window.open(absolute, '_blank', 'noopener');
  };

  const setPreset = (next: string) => {
    setUrl(next);
  };

  useEffect(() => {
    setMenus(windowId, [
      {
        title: 'Web',
        items: [
          { label: 'Reload', action: () => reload() },
          { label: 'Open in Browser', action: () => openExternal() },
          { label: proxyVps ? 'Disable VPS Proxy' : 'Enable VPS Proxy', action: () => setProxyVps((p) => !p) },
          { label: 'Use localhost:5173', action: () => setPreset('http://localhost:5173') },
          { label: 'Use localhost:3000', action: () => setPreset('http://localhost:3000') }
        ]
      }
    ]);
    return () => setMenus(windowId, []);
  }, [normalizedUrl, setMenus, windowId, draft, proxyVps, proxyPort]);

  useEffect(() => {
    if (!proxyVps || !proxyPort) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const handleLoad = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) return;
        const NativeWebSocket = win.WebSocket;
        if ((NativeWebSocket as any).__vpsosProxy) return;
        const ProxyWebSocket = function (this: WebSocket, url: string, protocols?: string | string[]) {
          try {
            const target = new URL(url, win.location.href);
            const shouldProxy = target.hostname === win.location.hostname || isLocalHost(target.hostname);
            if (shouldProxy) {
              const proxyBase = new URL(win.location.href);
              proxyBase.protocol = proxyBase.protocol === 'https:' ? 'wss:' : 'ws:';
              proxyBase.pathname = `/ws/proxy/${proxyPort}${target.pathname.startsWith('/') ? target.pathname : `/${target.pathname}`}`;
              proxyBase.search = target.search;
              return new (NativeWebSocket as any)(proxyBase.toString(), protocols as any);
            }
          } catch {}
          return new (NativeWebSocket as any)(url, protocols as any);
        } as unknown as typeof WebSocket;
        (ProxyWebSocket as any).prototype = NativeWebSocket.prototype;
        (ProxyWebSocket as any).__vpsosProxy = true;
        (win as any).WebSocket = ProxyWebSocket;
      } catch {}
    };
    iframe.addEventListener('load', handleLoad);
    return () => {
      iframe.removeEventListener('load', handleLoad);
    };
  }, [proxyPort, proxyVps, iframeSrc]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      {showToolbar && (
        <div className="toolbar" style={{ padding: 0 }}>
          <div className="row gap" style={{ flexWrap: 'wrap' }}>
            <label className="muted">URL</label>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyUrl();
              }}
              placeholder="http://localhost:5173"
              style={{ width: 360 }}
            />
            <button onClick={applyUrl}>Go</button>
            <button onClick={reload}>Reload</button>
            <button onClick={openExternal}>Open</button>
            <label className="muted">VPS Proxy</label>
            <input type="checkbox" checked={proxyVps} onChange={(e) => setProxyVps(e.target.checked)} />
            <span className="muted">{normalizedUrl}</span>
          </div>
        </div>
      )}

      <div className="panel" style={{ flex: 1, minHeight: 0, padding: 0, overflow: 'hidden' }}>
        {iframeSrc ? (
          <iframe
            key={reloadKey}
            ref={iframeRef}
            title="Local Web App"
            src={iframeSrc}
            style={{ width: '100%', height: '100%', border: 0 }}
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        ) : (
          <div style={{ padding: 12 }} className="muted">
            Enter a URL to load a local web app.
          </div>
        )}
      </div>
    </div>
  );
};

const plugin: PluginDefinition = {
  id: 'localweb',
  name: 'Local Web',
  version: '0.0.1',
  apps: [
    {
      id: 'vpsos.localweb.app',
      title: 'Local Web',
      dock: true,
      render: ({ windowId }) => <LocalWebApp windowId={windowId} />
    }
  ]
};

export default plugin;
