import { PropsWithChildren, useEffect, useRef } from 'react';
import { WindowState, useUI } from './state';

export const Window = ({ win, children }: PropsWithChildren<{ win: WindowState }>) => {
  const { close, focus, minimize, toggleMax, move } = useUI();
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      move(win.id, e.clientX - offset.current.x, e.clientY - offset.current.y);
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [move, win.id]);

  const startDrag = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.traffic')) return;
    if (win.maximized) return;
    dragging.current = true;
    offset.current = { x: e.clientX - win.x, y: e.clientY - win.y };
  };

  const style = {
    left: win.x,
    top: win.y,
    width: win.w,
    height: win.maximized ? win.h : win.h,
    zIndex: win.z
  } as const;

  return (
    <div
      className={`window ${win.minimized ? 'minimized' : ''} ${win.maximized ? 'maximized' : ''}`}
      style={style}
      onMouseDown={() => focus(win.id)}
    >
      <div className="titlebar" onMouseDown={startDrag}>
        <div className="traffic">
          <span className="close" onClick={() => close(win.id)} />
          <span className="min" onClick={() => minimize(win.id)} />
          <span className="max" onClick={() => toggleMax(win.id)} />
        </div>
        <div>{win.title}</div>
      </div>
      <div className="content" style={{ display: win.minimized ? 'none' : 'flex' }}>{children}</div>
    </div>
  );
};
