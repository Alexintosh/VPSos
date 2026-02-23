import { useEffect, useRef, useState } from 'react';
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
        if (msg.t === 'exit') { ws.close(); resolve({ code: msg.code, output: out }); }
      } catch {}
    };
    ws.onerror = () => reject(new Error('proc websocket error'));
  });
};

type Tab = 'listeners' | 'ufw' | 'tailscale';
type UfwAction = 'allow' | 'deny' | 'delete';
type Proto = 'tcp' | 'udp' | 'any';

type SocketRow = {
  netid: string;
  port: string;
  addr: string;
  process: string;
  tailscaleAccess: 'yes' | 'ts-only' | 'no';
};

const parseSockets = (output: string, tsIp: string): SocketRow[] => {
  const rows: SocketRow[] = [];
  for (const line of output.split('\n')) {
    if (!line.trim() || line.startsWith('Netid')) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const netid = parts[0];
    const localFull = parts[4] ?? '';
    const lastColon = localFull.lastIndexOf(':');
    if (lastColon === -1) continue;
    const addr = localFull.slice(0, lastColon).replace(/^\[/, '').replace(/\]$/, '');
    const port = localFull.slice(lastColon + 1);
    if (!/^\d+$/.test(port)) continue;
    const procRaw = parts.slice(6).join(' ');
    const procMatch = procRaw.match(/users:\(\("([^"]+)"/);
    const process = procMatch ? procMatch[1] : procRaw || '—';
    const isAny = addr === '0.0.0.0' || addr === '::' || addr === '*' || addr === '[::]';
    const isTs = tsIp !== '' && addr === tsIp;
    const isLoopback = addr === '127.0.0.1' || addr === '::1';
    const tailscaleAccess: SocketRow['tailscaleAccess'] = isLoopback ? 'no' : isTs ? 'ts-only' : isAny ? 'yes' : 'no';
    rows.push({ netid, port, addr, process, tailscaleAccess });
  }
  rows.sort((a, b) => Number(a.port) - Number(b.port));
  return rows;
};

const accessLabel: Record<SocketRow['tailscaleAccess'], string> = {
  yes: 'Yes',
  'ts-only': 'TS only',
  no: 'No',
};
const accessColor: Record<SocketRow['tailscaleAccess'], string> = {
  yes: '#4caf50',
  'ts-only': '#2196f3',
  no: '#9e9e9e',
};

const TsPortsApp = ({ windowId }: { windowId: string }) => {
  const setMenus = useUI((s) => s.setMenus);
  const cwdRef = useRef<string>('.');

  const [tab, setTab] = useState<Tab>('listeners');
  const [status, setStatus] = useState('');

  // Listeners state
  const [tsIp, setTsIp] = useState('');
  const [sockets, setSockets] = useState<SocketRow[]>([]);

  // UFW state
  const [ufwOutput, setUfwOutput] = useState('');
  const [ufwPort, setUfwPort] = useState('');
  const [ufwProto, setUfwProto] = useState<Proto>('tcp');
  const [ufwAction, setUfwAction] = useState<UfwAction>('allow');
  const [ufwCmdOut, setUfwCmdOut] = useState('');

  // Tailscale state
  const [tsStatus, setTsStatus] = useState('');

  useEffect(() => {
    getConfig().then((cfg) => {
      cwdRef.current = cfg.defaultCwd || cfg.fsRoot || '.';
    }).catch(() => {});
  }, []);

  const refreshListeners = async () => {
    setStatus('Refreshing…');
    try {
      const [ssRes, tsRes] = await Promise.all([
        runOnce(cwdRef.current, 'ss', ['-lntp']).catch((e) => ({ code: -1, output: String(e) })),
        runOnce(cwdRef.current, 'tailscale', ['ip', '-4']).catch(() => ({ code: -1, output: '' })),
      ]);
      const ip = tsRes.output.trim().split('\n')[0]?.trim() ?? '';
      setTsIp(ip);
      setSockets(parseSockets(ssRes.output, ip));
      setStatus('');
    } catch (e: any) {
      setStatus(e?.message || 'Refresh failed');
    }
  };

  const refreshUfw = async () => {
    setStatus('Refreshing UFW…');
    try {
      const { output } = await runOnce(cwdRef.current, 'sudo', ['ufw', 'status', 'verbose']);
      setUfwOutput(output.trim() || '(no output)');
      setStatus('');
    } catch (e: any) {
      setStatus(e?.message || 'Refresh failed');
    }
  };

  const refreshTailscale = async () => {
    setStatus('Refreshing Tailscale…');
    try {
      const { output } = await runOnce(cwdRef.current, 'tailscale', ['status']);
      setTsStatus(output.trim() || '(no output)');
      setStatus('');
    } catch (e: any) {
      setStatus(e?.message || 'Refresh failed');
    }
  };

  useEffect(() => {
    refreshListeners().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === 'ufw' && !ufwOutput) refreshUfw().catch(() => {});
    if (tab === 'tailscale' && !tsStatus) refreshTailscale().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    setMenus(windowId, [{
      title: 'TS Ports',
      items: [
        { label: 'Refresh Listeners', action: () => refreshListeners() },
        { label: 'Refresh UFW', action: () => refreshUfw() },
        { label: 'Refresh Tailscale', action: () => refreshTailscale() },
        { label: 'Clear UFW Output', action: () => setUfwCmdOut('') },
      ]
    }]);
    return () => setMenus(windowId, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMenus, windowId]);

  const runUfwCmd = async () => {
    const port = ufwPort.trim();
    if (!port || !/^\d+$/.test(port)) {
      setUfwCmdOut('Error: enter a valid port number.');
      return;
    }
    const protoArgs = ufwProto === 'any' ? [] : ['proto', ufwProto];
    let args: string[];
    if (ufwAction === 'delete') {
      args = ['ufw', 'delete', 'allow', 'in', 'on', 'tailscale0', 'to', 'any', 'port', port, ...protoArgs];
    } else {
      args = ['ufw', ufwAction, 'in', 'on', 'tailscale0', 'to', 'any', 'port', port, ...protoArgs];
    }
    const cmd = `sudo ${args.join(' ')}`;
    setUfwCmdOut(`$ ${cmd}\n`);
    setStatus(`Running…`);
    try {
      const { output, code } = await runOnce(cwdRef.current, 'sudo', args);
      setUfwCmdOut(`$ ${cmd}\n${output.trim()}\n\nExit: ${code}`);
      setStatus('');
      await refreshUfw().catch(() => {});
    } catch (e: any) {
      setUfwCmdOut(`$ ${cmd}\nError: ${e?.message}`);
      setStatus('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div className="toolbar" style={{ padding: 0 }}>
        <div className="row gap" style={{ flexWrap: 'wrap' }}>
          <button onClick={() => setTab('listeners')} disabled={tab === 'listeners'}>Listeners</button>
          <button onClick={() => setTab('ufw')} disabled={tab === 'ufw'}>UFW Rules</button>
          <button onClick={() => setTab('tailscale')} disabled={tab === 'tailscale'}>Tailscale</button>
          {tsIp && <span className="muted" style={{ fontFamily: 'monospace' }}>ts0: {tsIp}</span>}
          {status && <span className="muted">{status}</span>}
        </div>
        <div className="actions">
          {tab === 'listeners' && <button onClick={() => refreshListeners()}>Refresh</button>}
          {tab === 'ufw' && <button onClick={() => refreshUfw()}>Refresh</button>}
          {tab === 'tailscale' && <button onClick={() => refreshTailscale()}>Refresh</button>}
        </div>
      </div>

      {tab === 'listeners' && (
        <div className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="panel-title">
            Listening sockets — Tailscale-accessible?
            {tsIp && <span className="muted" style={{ marginLeft: 10, fontWeight: 400, fontSize: 12 }}>
              <span style={{ color: accessColor.yes }}>●</span> All interfaces &nbsp;
              <span style={{ color: accessColor['ts-only'] }}>●</span> Tailscale only &nbsp;
              <span style={{ color: accessColor.no }}>●</span> Not reachable
            </span>}
          </div>
          {sockets.length === 0 ? (
            <div className="muted" style={{ padding: 8 }}>No sockets found.</div>
          ) : (
            <div className="list" style={{ flex: 1, overflow: 'auto' }}>
              <div className="entry" style={{ fontWeight: 600, fontSize: 12, opacity: 0.7 }}>
                <div style={{ width: 50 }}>Proto</div>
                <div style={{ width: 70 }}>Port</div>
                <div style={{ flex: 1 }}>Bound to</div>
                <div style={{ flex: 1 }}>Process</div>
                <div style={{ width: 90 }}>Via TS</div>
              </div>
              {sockets.map((row, i) => (
                <div key={i} className="entry">
                  <div style={{ width: 50, fontFamily: 'monospace' }}>{row.netid}</div>
                  <div style={{ width: 70, fontFamily: 'monospace', fontWeight: 600 }}>{row.port}</div>
                  <div style={{ flex: 1, fontFamily: 'monospace' }} className="muted">{row.addr}</div>
                  <div style={{ flex: 1, fontFamily: 'monospace' }}>{row.process}</div>
                  <div style={{ width: 90, color: accessColor[row.tailscaleAccess], fontWeight: 600 }}>
                    {accessLabel[row.tailscaleAccess]}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'ufw' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
          <div className="panel">
            <div className="panel-title">Manage port on tailscale0</div>
            <div className="row gap" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="muted">Port</span>
              <input
                value={ufwPort}
                onChange={(e) => setUfwPort(e.target.value)}
                placeholder="e.g. 8080"
                style={{ width: 100 }}
              />
              <span className="muted">Proto</span>
              <select value={ufwProto} onChange={(e) => setUfwProto(e.target.value as Proto)}>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="any">Any</option>
              </select>
              <span className="muted">Action</span>
              <select value={ufwAction} onChange={(e) => setUfwAction(e.target.value as UfwAction)}>
                <option value="allow">Allow</option>
                <option value="deny">Deny</option>
                <option value="delete">Delete allow rule</option>
              </select>
              <button onClick={runUfwCmd} disabled={!ufwPort.trim()}>Run</button>
              <button onClick={() => setUfwCmdOut('')} disabled={!ufwCmdOut}>Clear</button>
            </div>
            {ufwCmdOut && (
              <pre className="logarea" style={{ marginTop: 8, maxHeight: 120 }}>{ufwCmdOut}</pre>
            )}
          </div>

          <div className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="panel-title">Current UFW rules (sudo ufw status verbose)</div>
            <pre className="logarea" style={{ flex: 1, minHeight: 0 }}>{ufwOutput || '—'}</pre>
          </div>
        </div>
      )}

      {tab === 'tailscale' && (
        <div className="panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="panel-title">Tailscale status</div>
          <pre className="logarea" style={{ flex: 1, minHeight: 0 }}>{tsStatus || '—'}</pre>
        </div>
      )}
    </div>
  );
};

const plugin: PluginDefinition = {
  id: 'vpsos.tsports',
  name: 'TS Ports',
  version: '0.0.1',
  apps: [
    {
      id: 'vpsos.tsports.app',
      title: 'TS Ports',
      dock: true,
      render: ({ windowId }) => <TsPortsApp windowId={windowId} />,
    }
  ]
};

export default plugin;
