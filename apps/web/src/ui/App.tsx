import { useUI } from './state';
import { Window } from './Window';
import { TerminalApp } from '../apps/Terminal';
import { FileExplorer } from '../apps/FileExplorer';
import { TasksApp } from '../apps/Tasks';
import { AboutApp } from '../apps/About';
import { getAuthToken, login } from '../api/client';
import { useState } from 'react';
import { MenuBar } from './MenuBar';
import { pluginRegistry, findPluginApp } from '@vpsos/plugins/registry';
import { pluginShortcuts, terminalShortcuts, type TerminalShortcut } from '../config/shortcuts';

const PluginHost = ({ windowId, pluginAppId }: { windowId: string; pluginAppId: string }) => {
  const app = findPluginApp(pluginAppId);
  if (!app) return <div>Plugin app not found: {pluginAppId}</div>;
  return app.render({ windowId, setMenus: (menus) => useUI.getState().setMenus(windowId, menus) });
};

export const App = () => {
  const { windows, open, openPlugin } = useUI();
  const [token, setToken] = useState<string>(getAuthToken() || '');
  const [authStatus, setAuthStatus] = useState<string>('');

  const saveToken = async () => {
    const t = token.trim();
    if (!t) return;
    try {
      await login(t);
      setAuthStatus('Authenticated');
    } catch (e: any) {
      setAuthStatus(e?.message || 'Auth failed');
    }
  };

  return (
    <div className="desktop">
      <div className="topbar">
        <MenuBar />
        <div className="row gap">
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="auth token" />
          <button onClick={saveToken}>Save token</button>
          {authStatus && <span className="muted">{authStatus}</span>}
        </div>
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
