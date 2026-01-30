import { useEffect, useState } from 'react';
import { useTasks } from '../ui/tasksStore';
import { openProcSocket, stopProc } from '../api/client';

interface LogEntry { type: 'stdout' | 'stderr'; data: string; }

export const TasksApp = () => {
  const { tasks } = useTasks();
  const [selected, setSelected] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);

  useEffect(() => {
    if (!selected) return;
    const ws = openProcSocket(selected);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.t === 'stdout' || msg.t === 'stderr') {
          setLogs((l) => [...l, { type: msg.t, data: msg.data }]);
        }
        if (msg.t === 'exit') setExitCode(msg.code);
      } catch {}
    };
    return () => ws.close();
  }, [selected]);

  return (
    <div className="flex" style={{ height: '100%' }}>
      <div className="task-list">
        {tasks.map((t) => (
          <div key={t.id} className={`task-item ${selected === t.id ? 'active' : ''}`} onClick={() => { setSelected(t.id); setLogs([]); setExitCode(null); }}>
            {t.label}
          </div>
        ))}
      </div>
      <div className="task-log">
        <div className="task-actions">
          {selected && <button onClick={() => stopProc(selected)}>Stop</button>}
          {exitCode !== null && <span>exit {exitCode}</span>}
        </div>
        <pre className="logarea">
          {logs.map((l, i) => <span key={i} className={l.type}>{l.data}</span>)}
        </pre>
      </div>
    </div>
  );
};
