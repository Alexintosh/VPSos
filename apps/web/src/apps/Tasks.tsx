import { useEffect, useState } from 'react';
import { useTasks } from '../ui/tasksStore';
import { openProcSocket, stopProc, listPtys, killAllPtys } from '../api/client';
import { useUI } from '../ui/state';

interface LogEntry { type: 'stdout' | 'stderr'; data: string; }

interface PtyInfo {
  count: number;
  ptys: string[];
}

export const TasksApp = ({ windowId }: { windowId: string }) => {
  const { tasks } = useTasks();
  const [selected, setSelected] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [ptyInfo, setPtyInfo] = useState<PtyInfo>({ count: 0, ptys: [] });
  const [activeTab, setActiveTab] = useState<'tasks' | 'pty'>('tasks');
  const setMenus = useUI((s) => s.setMenus);

  // Fetch PTY list periodically
  useEffect(() => {
    const fetchPtys = async () => {
      try {
        const info = await listPtys();
        setPtyInfo(info);
      } catch {}
    };
    fetchPtys();
    const interval = setInterval(fetchPtys, 2000);
    return () => clearInterval(interval);
  }, []);

  // Task log streaming
  useEffect(() => {
    if (!selected || activeTab !== 'tasks') return;
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
  }, [selected, activeTab]);

  // Menu bar
  useEffect(() => {
    setMenus(windowId, [{
      title: 'Tasks',
      items: [
        { label: 'Stop selected', action: () => selected && stopProc(selected), disabled: !selected },
        { label: 'Kill all PTYs', action: () => killAllPtys().then(() => setPtyInfo({ count: 0, ptys: [] })) }
      ]
    }]);
    return () => setMenus(windowId, []);
  }, [selected, setMenus, windowId]);

  const handleKillAllPtys = async () => {
    try {
      await killAllPtys();
      setPtyInfo({ count: 0, ptys: [] });
    } catch {}
  };

  return (
    <div className="flex" style={{ height: '100%' }}>
      <div className="task-list">
        <div className="task-tabs">
          <button 
            className={activeTab === 'tasks' ? 'active' : ''} 
            onClick={() => setActiveTab('tasks')}
          >
            Tasks ({tasks.length})
          </button>
          <button 
            className={activeTab === 'pty' ? 'active' : ''} 
            onClick={() => setActiveTab('pty')}
          >
            PTYs ({ptyInfo.count})
          </button>
        </div>
        
        {activeTab === 'tasks' && (
          <>
            {tasks.map((t) => (
              <div 
                key={t.id} 
                className={`task-item ${selected === t.id ? 'active' : ''}`} 
                onClick={() => { setSelected(t.id); setLogs([]); setExitCode(null); }}
              >
                {t.label}
              </div>
            ))}
          </>
        )}
        
        {activeTab === 'pty' && (
          <div className="pty-list">
            {ptyInfo.ptys.length === 0 && (
              <div className="task-item muted">No active PTYs</div>
            )}
            {ptyInfo.ptys.map((ptyId) => (
              <div key={ptyId} className="task-item">
                {ptyId.slice(0, 8)}...
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="task-log">
        <div className="task-actions">
          {activeTab === 'tasks' && selected && (
            <button onClick={() => stopProc(selected)}>Stop</button>
          )}
          {activeTab === 'tasks' && exitCode !== null && <span>exit {exitCode}</span>}
          
          {activeTab === 'pty' && (
            <>
              <span>{ptyInfo.count} active PTY{ptyInfo.count !== 1 ? 's' : ''}</span>
              <button onClick={handleKillAllPtys} disabled={ptyInfo.count === 0}>
                Kill All
              </button>
            </>
          )}
        </div>
        
        {activeTab === 'tasks' && (
          <pre className="logarea">
            {logs.map((l, i) => <span key={i} className={l.type}>{l.data}</span>)}
          </pre>
        )}
        
        {activeTab === 'pty' && (
          <div className="logarea pty-info">
            <p>PTY sessions are terminal windows currently open.</p>
            <p>Use "Kill All" to force close all terminal sessions if you hit the limit.</p>
          </div>
        )}
      </div>
    </div>
  );
};
