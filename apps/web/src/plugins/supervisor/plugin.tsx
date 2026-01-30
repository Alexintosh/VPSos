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
      } catch {
        // ignore
      }
    };
    ws.onerror = () => reject(new Error('proc websocket error'));
  });
};

interface ServiceRow {
  unit: string;
  load: string;
  active: string;
  sub: string;
  description: string;
}

const parseServices = (text: string): ServiceRow[] => {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/);
      if (!m) return null;
      return { unit: m[1], load: m[2], active: m[3], sub: m[4], description: m[5] } satisfies ServiceRow;
    })
    .filter(Boolean) as ServiceRow[];
};

interface ProcRow {
  pid: number;
  comm: string;
  cpu: number;
  mem: number;
  etime: string;
  args: string;
}

const parseProcs = (text: string): ProcRow[] => {
  return text
    .split('\n')
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^\s*(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/);
      if (!m) return null;
      return {
        pid: Number(m[1]),
        comm: m[2],
        cpu: Number(m[3]),
        mem: Number(m[4]),
        etime: m[5],
        args: m[6]
      } satisfies ProcRow;
    })
    .filter(Boolean) as ProcRow[];
};

const SupervisorApp = ({ windowId }: { windowId: string }) => {
  const setMenus = useUI((s) => s.setMenus);
  const [tab, setTab] = useState<'services' | 'processes'>('services');
  const [cwd, setCwd] = useState('.');
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [procs, setProcs] = useState<ProcRow[]>([]);
  const [filter, setFilter] = useState('');
  const [selectedService, setSelectedService] = useState<string>('ssh.service');
  const [since, setSince] = useState('1 hour ago');
  const [follow, setFollow] = useState(true);
  const [logProcId, setLogProcId] = useState<string | null>(null);
  const [logs, setLogs] = useState('');
  const logWsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    getConfig().then((cfg) => setCwd(cfg.defaultCwd || cfg.fsRoot || '.')).catch(() => {});
  }, []);

  const refreshServices = async () => {
    setStatus('Refreshing services…');
    try {
      const { output } = await runOnce(cwd, 'systemctl', ['list-units', '--type=service', '--all', '--no-pager', '--no-legend', '--plain']);
      setServices(parseServices(output));
      setStatus('');
    } catch (e: any) {
      setStatus(e?.message || 'Failed to list services');
    }
  };

  const refreshProcs = async () => {
    setStatus('Refreshing processes…');
    try {
      const { output } = await runOnce(cwd, 'ps', ['-eo', 'pid,comm,pcpu,pmem,etime,args', '--no-headers', '--sort=-pcpu']);
      setProcs(parseProcs(output));
      setStatus('');
    } catch (e: any) {
      setStatus(e?.message || 'Failed to list processes');
    }
  };

  const serviceAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!selectedService) return;
    setStatus(`${action} ${selectedService}…`);
    try {
      const { code, output } = await runOnce(cwd, 'systemctl', [action, selectedService, '--no-pager']);
      if (code !== 0) throw new Error(output || `${action} failed (${code})`);
      await refreshServices();
      setStatus('');
    } catch (e: any) {
      setStatus(e?.message || 'Service action failed');
    }
  };

  const stopLogs = async () => {
    logWsRef.current?.close();
    logWsRef.current = null;
    if (logProcId) await stopProc(logProcId).catch(() => {});
    setLogProcId(null);
  };

  const startLogs = async () => {
    await stopLogs();
    setLogs('');
    if (!selectedService) return;
    const args: string[] = ['-u', selectedService, '--no-pager', '-o', 'short-iso'];
    if (since.trim()) args.push('--since', since.trim());
    args.push('-n', '200');
    if (follow) args.push('-f');

    try {
      const { procId } = await spawnProc(cwd, 'journalctl', args);
      setLogProcId(procId);
      const ws = openProcSocket(procId);
      logWsRef.current = ws;
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as ProcMsg;
          if (msg.t === 'stdout' || msg.t === 'stderr') setLogs((p) => p + msg.data);
          if (msg.t === 'exit') setLogs((p) => p + `\n[exit ${msg.code}]\n`);
        } catch {}
      };
      ws.onclose = () => {
        logWsRef.current = null;
      };
    } catch (e: any) {
      setLogs((p) => p + `\n[error] ${e?.message || e}\n`);
    }
  };

  const killPid = async (pid: number, sig: 'TERM' | 'KILL') => {
    setStatus(`kill -${sig} ${pid}…`);
    try {
      const { code, output } = await runOnce(cwd, 'kill', [`-${sig}`, String(pid)]);
      if (code !== 0) throw new Error(output || `kill failed (${code})`);
      await refreshProcs();
      setStatus('');
    } catch (e: any) {
      setStatus(e?.message || 'kill failed');
    }
  };

  useEffect(() => {
    refreshServices().catch(() => {});
    refreshProcs().catch(() => {});
  }, [cwd]);

  useEffect(() => {
    setMenus(windowId, [{
      title: 'Supervisor',
      items: [
        { label: 'Refresh Services', action: () => refreshServices() },
        { label: 'Refresh Processes', action: () => refreshProcs() },
        { label: 'Start Logs', action: () => startLogs(), disabled: !selectedService },
        { label: 'Stop Logs', action: () => stopLogs(), disabled: !logProcId }
      ]
    }]);
    return () => setMenus(windowId, []);
  }, [logProcId, selectedService, setMenus, windowId]);

  useEffect(() => {
    return () => {
      stopLogs().catch(() => {});
    };
  }, []);

  const serviceFiltered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return services;
    return services.filter((s) => `${s.unit} ${s.description} ${s.active} ${s.sub}`.toLowerCase().includes(q));
  }, [filter, services]);

  const procsFiltered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return procs;
    return procs.filter((p) => `${p.pid} ${p.comm} ${p.args}`.toLowerCase().includes(q));
  }, [filter, procs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div className="toolbar" style={{ padding: 0 }}>
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <button onClick={() => setTab('services')} disabled={tab === 'services'}>Services</button>
          <button onClick={() => setTab('processes')} disabled={tab === 'processes'}>Processes</button>
          <span className="muted">Filter</span>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="ssh, nginx, 1234…" style={{ width: 220 }} />
        </div>
        <div className="actions">
          {tab === 'services' && <button onClick={() => refreshServices()}>Refresh</button>}
          {tab === 'processes' && <button onClick={() => refreshProcs()}>Refresh</button>}
        </div>
      </div>

      {status && <div className="muted">{status}</div>}

      {tab === 'services' && (
        <div className="flex" style={{ gap: 10, minHeight: 0, flex: 1 }}>
          <div className="panel" style={{ flex: 1, minWidth: 360, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="panel-title">systemd services</div>
            <div className="list" style={{ flex: 1, overflow: 'auto' }}>
              {serviceFiltered.map((s) => (
                <div
                  key={s.unit}
                  className={`entry ${selectedService === s.unit ? 'active' : ''}`}
                  onClick={() => setSelectedService(s.unit)}
                >
                  <span style={{ width: 160, fontFamily: 'monospace' }}>{s.unit}</span>
                  <span className="muted" style={{ width: 70 }}>{s.active}</span>
                  <span className="muted" style={{ width: 90 }}>{s.sub}</span>
                  <span className="muted">{s.description}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel" style={{ width: 420, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="panel-title">{selectedService || 'Select a service'}</div>
            <div className="row gap" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
              <button onClick={() => serviceAction('start')} disabled={!selectedService}>Start</button>
              <button onClick={() => serviceAction('stop')} disabled={!selectedService}>Stop</button>
              <button onClick={() => serviceAction('restart')} disabled={!selectedService}>Restart</button>
            </div>
            <div className="row gap" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
              <span className="muted">Since</span>
              <input value={since} onChange={(e) => setSince(e.target.value)} style={{ width: 160 }} />
              <span className="muted">Follow</span>
              <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
              <button onClick={() => startLogs()} disabled={!selectedService}>Logs</button>
              <button onClick={() => stopLogs()} disabled={!logProcId}>Stop</button>
            </div>
            <pre className="logarea" style={{ flex: 1, minHeight: 0 }}>{logs}</pre>
          </div>
        </div>
      )}

      {tab === 'processes' && (
        <div className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="panel-title">processes (sorted by CPU)</div>
          <div className="list" style={{ flex: 1, overflow: 'auto' }}>
            {procsFiltered.slice(0, 200).map((p) => (
              <div key={p.pid} className="entry" style={{ alignItems: 'flex-start' }}>
                <div style={{ width: 70, fontFamily: 'monospace' }}>{p.pid}</div>
                <div style={{ width: 120, fontFamily: 'monospace' }}>{p.comm}</div>
                <div className="muted" style={{ width: 70 }}>{p.cpu.toFixed(1)}%</div>
                <div className="muted" style={{ width: 70 }}>{p.mem.toFixed(1)}%</div>
                <div className="muted" style={{ width: 90 }}>{p.etime}</div>
                <div className="muted" style={{ flex: 1, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{p.args}</div>
                <div className="row gap">
                  <button onClick={() => killPid(p.pid, 'TERM')}>TERM</button>
                  <button onClick={() => killPid(p.pid, 'KILL')}>KILL</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const plugin: PluginDefinition = {
  id: 'devos.supervisor',
  name: 'Supervisor',
  version: '0.0.1',
  apps: [
    {
      id: 'devos.supervisor.app',
      title: 'Supervisor',
      dock: true,
      render: ({ windowId }) => <SupervisorApp windowId={windowId} />
    }
  ]
};

export default plugin;
