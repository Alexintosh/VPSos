import { PropsWithChildren } from 'react';
import { WindowState, useUI } from './state';

export const Window = ({ win, children }: PropsWithChildren<{ win: WindowState }>) => {
  const { close, focus } = useUI();
  return (
    <div
      className="window"
      style={{ left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }}
      onMouseDown={() => focus(win.id)}
    >
      <div className="titlebar">
        <div className="traffic">
          <span className="close" onClick={() => close(win.id)} />
          <span className="min" />
          <span className="max" />
        </div>
        <div>{win.title}</div>
      </div>
      <div className="content">{children}</div>
    </div>
  );
};
