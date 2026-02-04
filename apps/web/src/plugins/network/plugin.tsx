import { useEffect, useMemo, useRef, useState } from 'react';
import type { PluginDefinition } from '@vpsos/types';
import { getConfig, openProcSocket, spawnProc, stopProc } from '@vpsos/client';
import { useUI } from '@vpsos/useUI';

type ProcMsg = { t: 'stdout' | 'stderr'; data: string } | { t: 'exit'; code: number };

const runOnce = async (cwd: string, cmd: string, args: string[]) => {
  const { procId } = await spawnProc(cwd, cmd, args);
  const ws = openProcSocket(procId);
  return await new Promise<{ code: number; output: string }>((resolve, reject) => {
    let out = '';
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as ProcMsg;
        if (msg.t === 'stdout' || msg.t === 'stderr') out += msg.data;
        if (msg.t === 'exit') {
          ws.close();
          resolve({ code: msg.code, output: out });
        }
      } catch {}
    };
    ws.onerror = () => reject(new Error('proc websocket error'));
  });
};

type Tab = 'overview' | 'ports' | 'diagnostics';
type DiagMode = 'ping' | 'curl' | 'dns';

const NetworkApp = ({ windowId }: { windowId: string }) => {
  const setMenus = useUI((s) => s.setMenus);
  const cwdRef = useRef<string>('.');

  const [tab, setTab] = useState<Tab>('overview');
  const [status, setStatus] = useState('');

  const [ifaces, setIfaces] = useState('');
  const [routes, setRoutes] = useState('');
  const [dns, setDns] = useState('');

  const [listen, setListen] = useState('');
  const [conns, setConns] = useState('');

  const [diagMode, setDiagMode] = useState<DiagMode>('ping');
  const [target, setTarget] = useState('1.1.1.1');
  const [count, setCount] = useState(4);
  const [url, setUrl] = useState('https://example.com');
  const [hostname, setHostname] = useState('example.com');
  const [follow, setFollow] = useState(false);

  const [diagProcId, setDiagProcId] = useState<string | null>(null);
  const [diagOut, setDiagOut] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    getConfig().then((cfg) => {
      cwdRef.current = cfg.defaultCwd || cfg.fsRoot || '.';
    }).catch(() => {});
  }, []);

  const refreshOverview = async () => {
    setStatus('Refreshing overview…');
    try {
      const [a, b, c] = await Promise.all([
        runOnce(cwdRef.current, 'ip', ['-br', 'addr']).catch((e) => ({ code: -1, output: String(e) })),
        runOnce(cwdRef.current, 'ip', ['route']).catch((e) => ({ code: -1, output: String(e) })),
        runOnce(cwdRef.current, 'cat', ['/etc/resolv.conf']).catch((e) => ({ code: -1, output: String(e) }))
      ]);
      setIfaces(a.output.trim());
      setRoutes(b.output.trim());
      setDns(c.output.trim());
      setStatus('');
    } catch (e: any) {
      setStatus(e?.message || 'Refresh failed');
    }
  };

  const refreshPorts = async () => {
    setStatus('Refreshing sockets…');
    try {
      const [a, b] = await Promise.all([
        runOnce(cwdRef.current, 'ss', ['-lntu']).catch((e) => ({ code: -1, output: String(e) })),
        runOnce(cwdRef.current, 'ss', ['-tuna']).catch((e) => ({ code: -1, output: String(e) }))
      ]);
      setListen(a.output.trim());
      setConns(b.output.trim());
      setStatus('');
    } catch (e: any) {
      setStatus(e?.message || 'Refresh failed');
    }
  };

  const stopDiag = async () => {
    wsRef.current?.close();
    wsRef.current = null;
    if (diagProcId) await stopProc(diagProcId).catch(() => {});
    setDiagProcId(null);
  };

  const startDiag = async () => {
    await stopDiag();
    setDiagOut('');

    const cwd = cwdRef.current;
    let cmd = '';
    let args: string[] = [];
    if (diagMode === 'ping') {
      cmd = 'ping';
      args = follow ? [target] : ['-c', String(Math.max(1, count)), target];
    } else if (diagMode === 'curl') {
      cmd = 'curl';
      args = ['-i', '-L', '--max-time', '10', url];
    } else {
      cmd = 'getent';
      args = ['hosts', hostname];
    }

    setStatus(`Running ${cmd}…`);
    try {
      const { procId } = await spawnProc(cwd, cmd, args);
      setDiagProcId(procId);
      const ws = openProcSocket(procId);
      wsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as ProcMsg;
          if (msg.t === 'stdout' || msg.t === 'stderr') setDiagOut((p) => p + msg.data);
          if (msg.t === 'exit') setStatus(`Done (exit ${msg.code})`);
        } catch {}
      };
      ws.onclose = () => {
        wsRef.current = null;
      };
    } catch (e: any) {
      setStatus(e?.message || 'Command failed');
    }
  };

  useEffect(() => {
    refreshOverview().catch(() => {});
    refreshPorts().catch(() => {});
    return () => {
      stopDiag().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setMenus(windowId, [{
      title: 'Network',
      items: [
        { label: 'Refresh Overview', action: () => refreshOverview() },
        { label: 'Refresh Ports', action: () => refreshPorts() },
        { label: 'Run Diagnostic', action: () => startDiag() },
        { label: 'Stop Diagnostic', action: () => stopDiag(), disabled: !diagProcId },
        { label: 'Clear Output', action: () => setDiagOut('') }
      ]
    }]);
    return () => setMenus(windowId, []);
  }, [diagProcId, setMenus, windowId]);

  const diagHint = useMemo(() => {
    if (diagMode === 'ping') return `ping ${follow ? target : `-c ${count} ${target}`}`;
    if (diagMode === 'curl') return `curl -i -L --max-time 10 ${url}`;
    return `getent hosts ${hostname}`;
  }, [count, diagMode, follow, hostname, target, url]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div className="toolbar" style={{ padding: 0 }}>
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <button onClick={() => setTab('overview')} disabled={tab === 'overview'}>Overview</button>
          <button onClick={() => setTab('ports')} disabled={tab === 'ports'}>Ports</button>
          <button onClick={() => setTab('diagnostics')} disabled={tab === 'diagnostics'}>Diagnostics</button>
          {status && <span className="muted">{status}</span>}
        </div>
        <div className="actions">
          {tab === 'overview' && <button onClick={() => refreshOverview()}>Refresh</button>}
          {tab === 'ports' && <button onClick={() => refreshPorts()}>Refresh</button>}
          {tab === 'diagnostics' && <button onClick={() => startDiag()}>Run</button>}
        </div>
      </div>

      {tab === 'overview' && (
        <div className="flex" style={{ gap: 10, flex: 1, minHeight: 0 }}>
          <div className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="panel-title">Interfaces (ip -br addr)</div>
            <pre className="logarea" style={{ flex: 1, minHeight: 0 }}>{ifaces || '—'}</pre>
          </div>
          <div className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="panel-title">Routes (ip route)</div>
            <pre className="logarea" style={{ flex: 1, minHeight: 0 }}>{routes || '—'}</pre>
          </div>
          <div className="panel" style={{ width: 360, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="panel-title">DNS (/etc/resolv.conf)</div>
            <pre className="logarea" style={{ flex: 1, minHeight: 0 }}>{dns || '—'}</pre>
          </div>
        </div>
      )}

      {tab === 'ports' && (
        <div className="flex" style={{ gap: 10, flex: 1, minHeight: 0 }}>
          <div className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="panel-title">Listening (ss -lntu)</div>
            <pre className="logarea" style={{ flex: 1, minHeight: 0 }}>{listen || '—'}</pre>
          </div>
          <div className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="panel-title">Connections (ss -tuna)</div>
            <pre className="logarea" style={{ flex: 1, minHeight: 0 }}>{conns || '—'}</pre>
          </div>
        </div>
      )}

      {tab === 'diagnostics' && (
        <div className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="panel-title">Diagnostics</div>
          <div className="row gap" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
            <span className="muted">Mode</span>
            <select value={diagMode} onChange={(e) => setDiagMode(e.target.value as DiagMode)}>
              <option value="ping">Ping</option>
              <option value="curl">HTTP (curl)</option>
              <option value="dns">DNS (getent)</option>
            </select>

            {diagMode === 'ping' && (
              <>
                <span className="muted">Target</span>
                <input value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 180 }} />
                <span className="muted">Count</span>
                <input type="number" value={count} onChange={(e) => setCount(Number(e.target.value || 1))} style={{ width: 90 }} disabled={follow} />
                <span className="muted">Follow</span>
                <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
              </>
            )}

            {diagMode === 'curl' && (
              <>
                <span className="muted">URL</span>
                <input value={url} onChange={(e) => setUrl(e.target.value)} style={{ width: 320 }} />
              </>
            )}

            {diagMode === 'dns' && (
              <>
                <span className="muted">Hostname</span>
                <input value={hostname} onChange={(e) => setHostname(e.target.value)} style={{ width: 220 }} />
              </>
            )}

            <button onClick={() => startDiag()} disabled={!!diagProcId && follow}>Run</button>
            <button onClick={() => stopDiag()} disabled={!diagProcId}>Stop</button>
            <button onClick={() => setDiagOut('')}>Clear</button>
            <span className="muted" style={{ fontFamily: 'monospace' }}>{diagHint}</span>
          </div>
          <pre className="logarea" style={{ flex: 1, minHeight: 0 }}>{diagOut || '—'}</pre>
        </div>
      )}
    </div>
  );
};

const plugin: PluginDefinition = {
  id: 'vpsos.network',
  name: 'Network',
  version: '0.0.1',
  apps: [
    {
      id: 'vpsos.network.app',
      title: 'Network',
      dock: true,
      render: ({ windowId }) => <NetworkApp windowId={windowId} />
    }
  ]
};

export default plugin;
