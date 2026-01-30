import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { getAuthToken, openPty, openPtySocket, resizePtyApi, closePtyApi } from '../api/client';

export const TerminalApp = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const term = new XTerm({ fontSize: 13, convertEol: true });
    const fit = new FitAddon();
    term.loadAddon(fit);
    termRef.current = term;
    fitRef.current = fit;
    if (containerRef.current) {
      term.open(containerRef.current);
      fit.fit();
    }
    const resizeAndSend = () => {
      if (!fitRef.current || !ptyIdRef.current) return;
      fitRef.current.fit();
      const cols = termRef.current?.cols || 80;
      const rows = termRef.current?.rows || 24;
      resizePtyApi(ptyIdRef.current, cols, rows).catch(() => {});
    };

    const start = async () => {
      try {
        const cols = term.cols;
        const rows = term.rows;
        const { ptyId } = await openPty('.', cols, rows);
        ptyIdRef.current = ptyId;
        const ws = openPtySocket(ptyId);
        wsRef.current = ws;
        ws.binaryType = 'arraybuffer';
        ws.onmessage = (ev) => {
          if (typeof ev.data === 'string') {
            try {
              const msg = JSON.parse(ev.data);
              if (msg.t === 'exit') term.writeln(`\r\n[pty exited ${msg.code}]`);
            } catch {}
          } else {
            const data = new Uint8Array(ev.data as ArrayBuffer);
            term.write(data);
          }
        };
        term.onData((data) => ws.send(new TextEncoder().encode(data)));
        resizeAndSend();
      } catch (e: any) {
        term.writeln(`PTY error: ${e?.message || e}`);
      }
    };
    start();

    const onResize = () => resizeAndSend();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      wsRef.current?.close();
      if (ptyIdRef.current) closePtyApi(ptyIdRef.current).catch(() => {});
      term.dispose();
    };
  }, []);

  return <div style={{ height: '100%', width: '100%' }} ref={containerRef} />;
};
