import { useUI } from './state';
import { Window } from './Window';
import { TerminalApp } from '../apps/Terminal';
import { FileExplorer } from '../apps/FileExplorer';
import { TasksApp } from '../apps/Tasks';
import { AboutApp } from '../apps/About';
import { clearAuthToken, getAuthToken, getPublicConfig, login } from '../api/client';
import { useEffect, useState, type FormEvent } from 'react';
import { MenuBar } from './MenuBar';
import { pluginRegistry, findPluginApp } from '@vpsos/plugins/registry';
import { pluginShortcuts, terminalShortcuts } from '../config/shortcuts';

const PluginHost = ({ windowId, pluginAppId }: { windowId: string; pluginAppId: string }) => {
  const app = findPluginApp(pluginAppId);
  if (!app) return <div>Plugin app not found: {pluginAppId}</div>;
  return app.render({ windowId, setMenus: (menus) => useUI.getState().setMenus(windowId, menus) });
};

export const App = () => {
  const { windows, open, openPlugin } = useUI();
  const [requireAuth, setRequireAuth] = useState<boolean | null>(null);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState<string>(getAuthToken() || '');
  const [authStatus, setAuthStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try {
        const cfg = await getPublicConfig();
        if (!active) return;
        setRequireAuth(cfg.requireAuth);
        if (!cfg.requireAuth) {
          setAuthed(true);
          return;
        }
        const stored = getAuthToken();
        if (stored) {
          try {
            await login(stored);
            if (!active) return;
            setAuthed(true);
          } catch {
            if (!active) return;
            clearAuthToken();
            setAuthed(false);
          }
        }
      } catch (e: any) {
        if (!active) return;
        setAuthStatus(e?.message || 'Failed to load config');
      } finally {
        if (active) setLoading(false);
      }
    };
    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (e?: FormEvent) => {
    e?.preventDefault();
    const next = password.trim();
    if (!next) return;
    setAuthStatus('');
    try {
      await login(next);
      setAuthed(true);
    } catch (e: any) {
      setAuthed(false);
      setAuthStatus(e?.message || 'Login failed');
    }
  };

  const handleLogout = () => {
    clearAuthToken();
    setAuthed(false);
    setPassword('');
  };

  if (loading && requireAuth === null) {
    return (
      <div className="desktop login-screen">
        <div className="login-card">
          <div className="login-title">VPSos</div>
          <div className="muted">Loading…</div>
        </div>
      </div>
    );
  }

  if (requireAuth === null) {
    return (
      <div className="desktop login-screen">
        <div className="login-card">
          <div className="login-title">VPSos</div>
          <div className="login-error">{authStatus || 'Unable to reach API'}</div>
        </div>
      </div>
    );
  }

  if (requireAuth && !authed) {
    return (
      <div className="desktop login-screen">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="login-title">VPSos Login</div>
          <label className="muted">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            autoFocus
          />
          <div className="login-actions">
            <button type="submit">Sign in</button>
          </div>
          {authStatus && <div className="login-error">{authStatus}</div>}
        </form>
      </div>
    );
  }

  return (
    <div className="desktop">
      <div className="topbar">
        <MenuBar />
        {requireAuth && (
          <div className="row gap">
            <span className="muted">Authenticated</span>
            <button onClick={handleLogout}>Logout</button>
          </div>
        )}
      </div>

      {windows.map((win) => (
        <Window key={win.id} win={win}>
          {win.app === 'terminal' && <TerminalApp windowId={win.id} />}
          {win.app === 'files' && <FileExplorer windowId={win.id} />}
          {win.app === 'tasks' && <TasksApp windowId={win.id} />}
          {win.app === 'about' && <AboutApp />}
          {win.app === 'plugin' && win.pluginAppId && <PluginHost windowId={win.id} pluginAppId={win.pluginAppId} />}
        </Window>
      ))}

      <div className="dock">
        <button onClick={() => open('files')}>Files</button>
        <button onClick={() => open('terminal')}>Terminal</button>
        <button onClick={() => open('tasks')}>Tasks</button>
        {pluginRegistry.apps.filter((a) => a.dock).map((app) => (
          <button key={app.id} onClick={() => openPlugin(app.id, app.title)}>{app.title}</button>
        ))}
        {pluginShortcuts.map((shortcut) => (
          <button
            key={shortcut.id}
            onClick={() => openPlugin(shortcut.pluginAppId, shortcut.title || shortcut.name, shortcut.data)}
            title={shortcut.name}
          >
            {shortcut.name}
          </button>
        ))}
        <div className="dock-divider" />
        {terminalShortcuts.map((shortcut) => (
          <button 
            key={shortcut.id} 
            onClick={() => open('terminal', {
              initialCommand: shortcut.command,
              autoRun: shortcut.autoRun,
              cwd: shortcut.cwd
            })}
            title={shortcut.name}
          >
            {shortcut.name}
          </button>
        ))}
      </div>
    </div>
  );
};
