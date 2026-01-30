import { PropsWithChildren, useEffect, useRef } from 'react';
import { WindowState, useUI } from './state';

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const Window = ({ win, children }: PropsWithChildren<{ win: WindowState }>) => {
  const { close, focus, minimize, toggleMax, move, resize, tile } = useUI();
  const dragState = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const resizeState = useRef<{ dir: ResizeDir; startX: number; startY: number; startW: number; startH: number; startPx: number; startPy: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (resizeState.current) {
        const { dir, startX, startY, startW, startH, startPx, startPy } = resizeState.current;
        let deltaX = e.clientX - startX;
        let deltaY = e.clientY - startY;
        const updates: any = {};
        if (dir.includes('e')) updates.w = Math.max(320, startW + deltaX);
        if (dir.includes('s')) updates.h = Math.max(200, startH + deltaY);
        if (dir.includes('w')) {
          const newWidth = Math.max(320, startW - deltaX);
          updates.w = newWidth;
          updates.x = startPx + (startW - newWidth);
        }
        if (dir.includes('n')) {
          const newHeight = Math.max(200, startH - deltaY);
          updates.h = newHeight;
          updates.y = startPy + (startH - newHeight);
        }
        resize(win.id, updates);
        return;
      }
      if (dragState.current) {
        move(win.id, e.clientX - dragState.current.offsetX, e.clientY - dragState.current.offsetY);
      }
    };
    const onUp = (e: MouseEvent) => {
      if (dragState.current) {
        const snapMargin = 60;
        const { innerWidth, innerHeight } = window;
        const nearLeft = e.clientX < snapMargin;
        const nearRight = e.clientX > innerWidth - snapMargin;
        const nearTop = e.clientY < snapMargin + 20;
        const nearBottom = e.clientY > innerHeight - snapMargin;
        if (nearLeft && nearTop) tile(win.id, 'tl');
        else if (nearRight && nearTop) tile(win.id, 'tr');
        else if (nearLeft && nearBottom) tile(win.id, 'bl');
        else if (nearRight && nearBottom) tile(win.id, 'br');
        else if (nearLeft) tile(win.id, 'left');
        else if (nearRight) tile(win.id, 'right');
        else if (nearTop) tile(win.id, 'top');
        else if (nearBottom) tile(win.id, 'bottom');
      }
      dragState.current = null;
      resizeState.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [move, resize, tile, win.id]);

  const startDrag = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.traffic')) return;
    if (win.maximized) return;
    dragState.current = { offsetX: e.clientX - win.x, offsetY: e.clientY - win.y };
  };

  const startResize = (dir: ResizeDir) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizeState.current = {
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startW: win.w,
      startH: win.h,
      startPx: win.x,
      startPy: win.y
    };
  };

  const style = {
    left: win.x,
    top: win.y,
    width: win.w,
    height: win.h,
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
      {['n','s','e','w','ne','nw','se','sw'].map((dir) => (
        <div key={dir} className={`resize-handle ${dir}`} onMouseDown={startResize(dir as ResizeDir)} />
      ))}
    </div>
  );
};
