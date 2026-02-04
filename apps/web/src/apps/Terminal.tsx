import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { openPty, openPtySocket, resizePtyApi, closePtyApi } from '../api/client';
import { useUI } from '../ui/state';

export const TerminalApp = ({ windowId }: { windowId: string }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const ptyIdRef = useRef<string | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const setMenus = useUI((s) => s.setMenus);
  const win = useUI((s) => s.windows.find((w) => w.id === windowId));
  const initialCommand = win?.data?.initialCommand;
  const autoRun = win?.data?.autoRun;

  useEffect(() => {
    setMenus(windowId, [{
      title: 'Shell',
      items: [
        { label: 'Clear', action: () => termRef.current?.clear() },
        { label: 'Reset', action: () => termRef.current?.reset() }
      ]
    }]);
    return () => setMenus(windowId, []);
  }, [setMenus, windowId]);

  useEffect(() => {
    let isActive = true;
    
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
        if (!isActive) {
          // Component unmounted during async, clean up PTY
          closePtyApi(ptyId).catch(() => {});
          return;
        }
        ptyIdRef.current = ptyId;
        const ws = openPtySocket(ptyId);
        wsRef.current = ws;
        ws.binaryType = 'arraybuffer';
        ws.onopen = () => {
          setTimeout(() => {
            if (!isActive) return;
            resizeAndSend();
            term.focus();
            if (initialCommand && ws.readyState === WebSocket.OPEN) {
              ws.send(new TextEncoder().encode(initialCommand));
              if (autoRun) {
                ws.send(new TextEncoder().encode('\r'));
              }
            }
          }, 50);
        };
        ws.onmessage = (ev) => {
          if (!isActive) return;
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
        term.onData((data) => {
          if (isActive && ws.readyState === WebSocket.OPEN) {
            ws.send(new TextEncoder().encode(data));
          }
        });
      } catch (e: any) {
        if (isActive) term.writeln(`PTY error: ${e?.message || e}`);
      }
    };
    start();

    const onResize = () => resizeAndSend();
    window.addEventListener('resize', onResize);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      observer = new ResizeObserver(() => resizeAndSend());
      observer.observe(containerRef.current);
    }
    
    return () => {
      isActive = false;
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
      wsRef.current?.close();
      if (ptyIdRef.current) closePtyApi(ptyIdRef.current).catch(() => {});
      term.dispose();
    };
  }, [initialCommand, autoRun]);

  return <div style={{ height: '100%', width: '100%' }} ref={containerRef} />;
};
