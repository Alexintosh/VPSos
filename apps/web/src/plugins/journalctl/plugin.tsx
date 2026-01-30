import { useEffect, useMemo, useRef, useState } from 'react';
import type { PluginDefinition } from '@vpsos/types';
import { getConfig, openProcSocket, spawnProc, stopProc } from '@vpsos/client';
import { useUI } from '@vpsos/useUI';

const JournalctlApp = ({ windowId }: { windowId: string }) => {
  const setMenus = useUI((s) => s.setMenus);
  const [unit, setUnit] = useState('ssh');
  const [since, setSince] = useState('1 hour ago');
  const [follow, setFollow] = useState(true);
  const [tail, setTail] = useState(500);
  const [contains, setContains] = useState('Failed');
  const [procId, setProcId] = useState<string | null>(null);
  const [raw, setRaw] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const cwdRef = useRef<string>('.');

  useEffect(() => {
    getConfig().then((cfg) => {
      cwdRef.current = cfg.defaultCwd || cfg.fsRoot || '.';
    }).catch(() => {});
  }, []);

  const lines = useMemo(() => raw.split('\n'), [raw]);
  const filtered = useMemo(() => {
    if (!contains.trim()) return lines;
    const q = contains.trim();
    return lines.filter((l) => l.includes(q));
  }, [contains, lines]);

  const stop = async () => {
    wsRef.current?.close();
    wsRef.current = null;
    if (procId) {
      await stopProc(procId).catch(() => {});
      setProcId(null);
    }
  };

  const start = async () => {
    await stop();
    setRaw('');
    const args: string[] = ['--no-pager', '-o', 'short-iso'];
    if (unit.trim()) args.push('-u', unit.trim());
    if (since.trim()) args.push('--since', since.trim());
    if (tail > 0) args.push('-n', String(tail));
    if (follow) args.push('-f');
    try {
      const { procId: id } = await spawnProc(cwdRef.current, 'journalctl', args);
      setProcId(id);
      const ws = openProcSocket(id);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.t === 'stdout' || msg.t === 'stderr') {
            setRaw((prev) => (prev + msg.data));
          }
          if (msg.t === 'exit') {
            setRaw((prev) => prev + `\n[exit ${msg.code}]\n`);
          }
        } catch {}
      };
      ws.onclose = () => {
        wsRef.current = null;
      };
    } catch (e: any) {
      setRaw((prev) => prev + `\n[error] ${e?.message || e}\n`);
    }
  };

  useEffect(() => {
    setMenus(windowId, [{
      title: 'Logs',
      items: [
        { label: 'Start', action: () => start() },
        { label: 'Stop', action: () => stop(), disabled: !procId },
        { label: 'Clear', action: () => setRaw('') }
      ]
    }]);
    return () => setMenus(windowId, []);
  }, [procId, setMenus, windowId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div className="panel">
        <div className="panel-title">journalctl</div>
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <label className="muted">Unit</label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: 120 }} />
          <label className="muted">Since</label>
          <input value={since} onChange={(e) => setSince(e.target.value)} style={{ width: 160 }} />
          <label className="muted">Contains</label>
          <input value={contains} onChange={(e) => setContains(e.target.value)} style={{ width: 140 }} />
          <label className="muted">Tail</label>
          <input type="number" value={tail} onChange={(e) => setTail(Number(e.target.value || 0))} style={{ width: 90 }} />
          <label className="muted">Follow</label>
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          <button onClick={start}>Start</button>
          <button onClick={stop} disabled={!procId}>Stop</button>
        </div>
      </div>

      <div className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="panel-title">Output {procId ? `(proc ${procId})` : ''}</div>
        <pre className="logarea" style={{ flex: 1 }}>
          {(contains.trim() ? filtered.join('\n') : raw) || ''}
        </pre>
      </div>
    </div>
  );
};

const plugin: PluginDefinition = {
  id: 'journalctl',
  name: 'Logs',
  version: '0.0.1',
  apps: [
    {
      id: 'journalctl.logs',
      title: 'Logs',
      dock: true,
      render: ({ windowId }) => <JournalctlApp windowId={windowId} />
    }
  ]
};

export default plugin;
