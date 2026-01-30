import { useUI } from './state';
import { Window } from './Window';

const Placeholder = ({ label }: { label: string }) => (
  <div>{label} coming soon.</div>
);

export const App = () => {
  const { windows, open } = useUI();

  return (
    <div className="desktop">
      {windows.map((win) => (
        <Window key={win.id} win={win}>
          {win.app === 'terminal' && <Placeholder label="Terminal" />}
          {win.app === 'files' && <Placeholder label="File Explorer" />}
          {win.app === 'tasks' && <Placeholder label="Task Viewer" />}
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
