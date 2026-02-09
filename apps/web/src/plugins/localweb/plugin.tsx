import { useEffect, useMemo, useState } from 'react';
import type { PluginDefinition } from '@vpsos/types';
import { useUI } from '@vpsos/useUI';

const STORAGE_KEY = 'vpsos.localweb.url';
const DEFAULT_URL = 'http://localhost:5173';

type LocalWebProps = {
  showToolbar?: boolean;
  default_url?: string;
  defaultUrl?: string;
};

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('//')) return `http:${trimmed}`;
  return `http://${trimmed}`;
};

const LocalWebApp = ({ windowId }: { windowId: string }) => {
  const setMenus = useUI((s) => s.setMenus);
  const win = useUI((s) => s.windows.find((w) => w.id === windowId));
  const props = (win?.data?.pluginProps || {}) as LocalWebProps;
  const showToolbar = props.showToolbar !== false;
  const hasDefaultProp = Boolean(props.default_url || props.defaultUrl);
  const defaultUrl = props.default_url || props.defaultUrl || DEFAULT_URL;
  const storedUrl = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  const initialUrl = hasDefaultProp ? defaultUrl : (storedUrl || DEFAULT_URL);

  const [url, setUrl] = useState(initialUrl);
  const [draft, setDraft] = useState(url);
  const [reloadKey, setReloadKey] = useState(0);

  const normalizedUrl = useMemo(() => normalizeUrl(url), [url]);

  useEffect(() => {
    if (!hasDefaultProp && typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, url);
    }
  }, [hasDefaultProp, url]);

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
    const target = normalizeUrl(draft) || normalizedUrl;
    if (!target) return;
    window.open(target, '_blank', 'noopener');
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
          { label: 'Use localhost:5173', action: () => setPreset('http://localhost:5173') },
          { label: 'Use localhost:3000', action: () => setPreset('http://localhost:3000') }
        ]
      }
    ]);
    return () => setMenus(windowId, []);
  }, [normalizedUrl, setMenus, windowId, draft]);

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
            <span className="muted">{normalizedUrl}</span>
          </div>
        </div>
      )}

      <div className="panel" style={{ flex: 1, minHeight: 0, padding: 0, overflow: 'hidden' }}>
        {normalizedUrl ? (
          <iframe
            key={reloadKey}
            title="Local Web App"
            src={normalizedUrl}
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
