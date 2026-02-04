import { PropsWithChildren, useEffect, useRef, useState, useCallback } from 'react';
import { WindowState, useUI, type TilePreset } from './state';
import { windowMenuItems, getTileIconStyle } from './windowMenu';

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const HOVER_DELAY = 1800; // 1.8 seconds

export const Window = ({ win, children }: PropsWithChildren<{ win: WindowState }>) => {
  const { close, focus, minimize, toggleMax, move, resize, tile } = useUI();
  const dragState = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const resizeState = useRef<{ dir: ResizeDir; startX: number; startY: number; startW: number; startH: number; startPx: number; startPy: number } | null>(null);
  const [showTileMenu, setShowTileMenu] = useState(false);
  const tileMenuRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const maxButtonRef = useRef<HTMLSpanElement>(null);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const handleMaxEnter = useCallback(() => {
    clearHoverTimer();
    hoverTimerRef.current = setTimeout(() => {
      setShowTileMenu(true);
    }, HOVER_DELAY);
  }, [clearHoverTimer]);

  const handleMaxLeave = useCallback(() => {
    clearHoverTimer();
  }, [clearHoverTimer]);

  const handleMaxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    clearHoverTimer();
    // If menu is open, don't maximize - let the menu handle it
    if (showTileMenu) return;
    toggleMax(win.id);
  }, [clearHoverTimer, showTileMenu, toggleMax, win.id]);

  const handleTileSelect = useCallback((preset: TilePreset) => {
    tile(win.id, preset);
    setShowTileMenu(false);
    clearHoverTimer();
  }, [tile, win.id, clearHoverTimer]);

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
    const onClick = (e: MouseEvent) => {
      if (tileMenuRef.current && !tileMenuRef.current.contains(e.target as Node)) {
        setShowTileMenu(false);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    if (showTileMenu) window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('click', onClick);
    };
  }, [move, resize, tile, win.id, showTileMenu]);

  useEffect(() => {
    return () => clearHoverTimer();
  }, [clearHoverTimer]);

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
          <span 
            ref={maxButtonRef}
            className="max" 
            onClick={handleMaxClick}
            onMouseEnter={handleMaxEnter}
            onMouseLeave={handleMaxLeave}
          />
        </div>
        <div>{win.title}</div>
        {showTileMenu && (
          <div className="tile-menu-window" ref={tileMenuRef}>
            {windowMenuItems.map((item) => (
              <button
                key={item.label}
                className="tile-menu-item"
                onClick={() => handleTileSelect(item.action)}
              >
                <span 
                  className="menu-icon" 
                  style={getTileIconStyle(item.icon)}
                />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="content" style={{ display: win.minimized ? 'none' : 'flex' }}>{children}</div>
      {['n','s','e','w','ne','nw','se','sw'].map((dir) => (
        <div key={dir} className={`resize-handle ${dir}`} onMouseDown={startResize(dir as ResizeDir)} />
      ))}
    </div>
  );
};
