import { useUI } from './state';
import { Window } from './Window';
import { TerminalApp } from '../apps/Terminal';
import { FileExplorer } from '../apps/FileExplorer';
import { TasksApp } from '../apps/Tasks';
import { getAuthToken, setAuthToken } from '../api/client';
import { useState } from 'react';

export const App = () => {
  const { windows, open } = useUI();
  const [token, setToken] = useState<string>(getAuthToken() || '');

  const saveToken = () => setAuthToken(token.trim());

  return (
    <div className="desktop">
      <div className="topbar">
        <div>Dev OS</div>
        <div className="row gap">
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="auth token" />
          <button onClick={saveToken}>Save token</button>
        </div>
      </div>

      {windows.map((win) => (
        <Window key={win.id} win={win}>
          {win.app === 'terminal' && <TerminalApp />}
          {win.app === 'files' && <FileExplorer />}
          {win.app === 'tasks' && <TasksApp />}
        </Window>
      ))}

      <div className="dock">
        <button onClick={() => open('files')}>Files</button>
        <button onClick={() => open('terminal')}>Terminal</button>
        <button onClick={() => open('tasks')}>Tasks</button>
      </div>
    </div>
  );
};
