import { useEffect, useMemo, useRef, useState } from 'react';
import type { PluginDefinition } from '@vpsos/types';
import { getConfig, openProcSocket, spawnProc } from '@vpsos/client';
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

const parseKeyValue = (text: string) => {
  const map = new Map<string, string>();
  for (const line of text.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim();
    map.set(k, v);
  }
  return map;
};

const readProcMem = async (cwd: string) => {
  const { output } = await runOnce(cwd, 'cat', ['/proc/meminfo']);
  const kv = parseKeyValue(output);
  const toKiB = (key: string) => {
    const v = kv.get(key) || '0 kB';
    const m = v.match(/^(\d+)/);
    return m ? Number(m[1]) : 0;
  };
  const memTotal = toKiB('MemTotal');
  const memAvail = toKiB('MemAvailable');
  const swapTotal = toKiB('SwapTotal');
  const swapFree = toKiB('SwapFree');
  return {
    memTotalKiB: memTotal,
    memAvailKiB: memAvail,
    memUsedKiB: Math.max(0, memTotal - memAvail),
    swapTotalKiB: swapTotal,
    swapFreeKiB: swapFree,
    swapUsedKiB: Math.max(0, swapTotal - swapFree)
  };
};

const readLoad = async (cwd: string) => {
  const { output } = await runOnce(cwd, 'cat', ['/proc/loadavg']);
  const parts = output.trim().split(/\s+/);
  return {
    l1: Number(parts[0] || 0),
    l5: Number(parts[1] || 0),
    l15: Number(parts[2] || 0)
  };
};

const readUptime = async (cwd: string) => {
  const { output } = await runOnce(cwd, 'cat', ['/proc/uptime']);
  const seconds = Number(output.trim().split(/\s+/)[0] || 0);
  return { uptimeSec: seconds };
};

const readCpuStat = async (cwd: string) => {
  const { output } = await runOnce(cwd, 'cat', ['/proc/stat']);
  const cpuLine = output.split('\n').find((l) => l.startsWith('cpu '));
  if (!cpuLine) return null;
  const parts = cpuLine.trim().split(/\s+/).slice(1).map((n) => Number(n));
  const [user, nice, system, idle, iowait, irq, softirq, steal] = parts;
  const idleAll = (idle || 0) + (iowait || 0);
  const nonIdle = (user || 0) + (nice || 0) + (system || 0) + (irq || 0) + (softirq || 0) + (steal || 0);
  const total = idleAll + nonIdle;
  return { idleAll, total };
};

const computeCpuUsage = async (cwd: string) => {
  const a = await readCpuStat(cwd);
  if (!a) return null;
  await new Promise((r) => setTimeout(r, 700));
  const b = await readCpuStat(cwd);
  if (!b) return null;
  const total = b.total - a.total;
  const idle = b.idleAll - a.idleAll;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - idle / total) * 100));
};

type ProcRow = { pid: number; comm: string; cpu: number; mem: number; etime: string; args: string };

const readTopProcs = async (cwd: string, sort: '-pcpu' | '-pmem') => {
  const { output } = await runOnce(cwd, 'ps', ['-eo', 'pid,comm,pcpu,pmem,etime,args', '--no-headers', `--sort=${sort}`]);
  const rows: ProcRow[] = [];
  for (const line of output.split('\n')) {
    const m = line.trimEnd().match(/^\s*(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    rows.push({
      pid: Number(m[1]),
      comm: m[2],
      cpu: Number(m[3]),
      mem: Number(m[4]),
      etime: m[5],
      args: m[6]
    });
  }
  return rows;
};

const fmtGiB = (kib: number) => `${(kib / 1024 / 1024).toFixed(1)} GiB`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtUptime = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const ResourceMonitorApp = ({ windowId }: { windowId: string }) => {
  const setMenus = useUI((s) => s.setMenus);
  const cwdRef = useRef<string>('.');

  const [auto, setAuto] = useState(true);
  const [intervalMs, setIntervalMs] = useState(2000);
  const [status, setStatus] = useState('');

  const [cpu, setCpu] = useState<number | null>(null);
  const [load, setLoad] = useState<{ l1: number; l5: number; l15: number } | null>(null);
  const [mem, setMem] = useState<{ memTotalKiB: number; memAvailKiB: number; memUsedKiB: number; swapTotalKiB: number; swapFreeKiB: number; swapUsedKiB: number } | null>(null);
  const [uptime, setUptime] = useState<number>(0);
  const [topCpu, setTopCpu] = useState<ProcRow[]>([]);
  const [topMem, setTopMem] = useState<ProcRow[]>([]);

  const refresh = async () => {
    try {
      setStatus('Refreshing…');
      const [cpuPct, memInfo, loadInfo, up, cpuProcs, memProcs] = await Promise.all([
        computeCpuUsage(cwdRef.current),
        readProcMem(cwdRef.current),
        readLoad(cwdRef.current),
        readUptime(cwdRef.current),
        readTopProcs(cwdRef.current, '-pcpu'),
        readTopProcs(cwdRef.current, '-pmem')
      ]);
      setCpu(cpuPct);
      setMem(memInfo);
      setLoad(loadInfo);
      setUptime(up.uptimeSec);
      setTopCpu(cpuProcs.slice(0, 10));
      setTopMem(memProcs.slice(0, 10));
      setStatus('');
    } catch (e: any) {
      setStatus(e?.message || 'Refresh failed');
    }
  };

  useEffect(() => {
    getConfig().then((cfg) => {
      cwdRef.current = cfg.defaultCwd || cfg.fsRoot || '.';
      refresh().catch(() => {});
    }).catch(() => refresh().catch(() => {}));
  }, []);

  useEffect(() => {
    setMenus(windowId, [{
      title: 'Monitor',
      items: [
        { label: 'Refresh', action: () => refresh() },
        { label: auto ? 'Pause Auto Refresh' : 'Resume Auto Refresh', action: () => setAuto((p) => !p) }
      ]
    }]);
    return () => setMenus(windowId, []);
  }, [auto, setMenus, windowId]);

  useEffect(() => {
    if (!auto) return;
    const t = window.setInterval(() => refresh().catch(() => {}), Math.max(800, intervalMs));
    return () => window.clearInterval(t);
  }, [auto, intervalMs]);

  const memPct = useMemo(() => {
    if (!mem || mem.memTotalKiB <= 0) return null;
    return (mem.memUsedKiB / mem.memTotalKiB) * 100;
  }, [mem]);

  const swapPct = useMemo(() => {
    if (!mem || mem.swapTotalKiB <= 0) return null;
    return (mem.swapUsedKiB / mem.swapTotalKiB) * 100;
  }, [mem]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div className="toolbar" style={{ padding: 0 }}>
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <button onClick={() => refresh()} disabled={!!status}>Refresh</button>
          <label className="muted">Auto</label>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <label className="muted">Interval</label>
          <input type="number" value={intervalMs} onChange={(e) => setIntervalMs(Number(e.target.value || 0))} style={{ width: 90 }} />
          <span className="muted">ms</span>
          {status && <span className="muted">{status}</span>}
        </div>
      </div>

      <div className="flex" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div className="panel" style={{ minWidth: 200 }}>
          <div className="panel-title">CPU</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{cpu == null ? '—' : fmtPct(cpu)}</div>
        </div>
        <div className="panel" style={{ minWidth: 260 }}>
          <div className="panel-title">Memory</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {mem ? `${fmtGiB(mem.memUsedKiB)} / ${fmtGiB(mem.memTotalKiB)}${memPct != null ? ` (${fmtPct(memPct)})` : ''}` : '—'}
          </div>
          {mem && (
            <div className="muted">Available: {fmtGiB(mem.memAvailKiB)}</div>
          )}
        </div>
        <div className="panel" style={{ minWidth: 240 }}>
          <div className="panel-title">Swap</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {mem ? `${fmtGiB(mem.swapUsedKiB)} / ${fmtGiB(mem.swapTotalKiB)}${swapPct != null ? ` (${fmtPct(swapPct)})` : ''}` : '—'}
          </div>
        </div>
        <div className="panel" style={{ minWidth: 240 }}>
          <div className="panel-title">Load</div>
          <div style={{ fontFamily: 'monospace', fontSize: 16 }}>
            {load ? `${load.l1.toFixed(2)}  ${load.l5.toFixed(2)}  ${load.l15.toFixed(2)}` : '—'}
          </div>
          <div className="muted">(1m / 5m / 15m)</div>
        </div>
        <div className="panel" style={{ minWidth: 200 }}>
          <div className="panel-title">Uptime</div>
          <div style={{ fontFamily: 'monospace', fontSize: 16 }}>{fmtUptime(uptime)}</div>
        </div>
      </div>

      <div className="flex" style={{ gap: 10, flex: 1, minHeight: 0 }}>
        <div className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="panel-title">Top CPU processes</div>
          <div className="list" style={{ flex: 1, overflow: 'auto' }}>
            {topCpu.map((p) => (
              <div key={p.pid} className="entry" style={{ alignItems: 'flex-start' }}>
                <div style={{ width: 70, fontFamily: 'monospace' }}>{p.pid}</div>
                <div style={{ width: 120, fontFamily: 'monospace' }}>{p.comm}</div>
                <div className="muted" style={{ width: 70 }}>{p.cpu.toFixed(1)}%</div>
                <div className="muted" style={{ width: 70 }}>{p.mem.toFixed(1)}%</div>
                <div className="muted" style={{ width: 90 }}>{p.etime}</div>
                <div className="muted" style={{ flex: 1, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{p.args}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="panel-title">Top memory processes</div>
          <div className="list" style={{ flex: 1, overflow: 'auto' }}>
            {topMem.map((p) => (
              <div key={p.pid} className="entry" style={{ alignItems: 'flex-start' }}>
                <div style={{ width: 70, fontFamily: 'monospace' }}>{p.pid}</div>
                <div style={{ width: 120, fontFamily: 'monospace' }}>{p.comm}</div>
                <div className="muted" style={{ width: 70 }}>{p.cpu.toFixed(1)}%</div>
                <div className="muted" style={{ width: 70 }}>{p.mem.toFixed(1)}%</div>
                <div className="muted" style={{ width: 90 }}>{p.etime}</div>
                <div className="muted" style={{ flex: 1, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{p.args}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const plugin: PluginDefinition = {
  id: 'devos.monitor',
  name: 'Resource Monitor',
  version: '0.0.1',
  apps: [
    {
      id: 'devos.monitor.app',
      title: 'Monitor',
      dock: true,
      render: ({ windowId }) => <ResourceMonitorApp windowId={windowId} />
    }
  ]
};

export default plugin;
