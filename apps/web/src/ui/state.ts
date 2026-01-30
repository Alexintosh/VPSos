import { create } from 'zustand';

export type AppType = 'terminal' | 'files' | 'tasks';

export interface WindowState {
  id: string;
  app: AppType;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  prev?: { x: number; y: number; w: number; h: number };
}

interface Store {
  windows: WindowState[];
  nextZ: number;
  open(app: AppType): void;
  close(id: string): void;
  focus(id: string): void;
  minimize(id: string): void;
  toggleMax(id: string): void;
  move(id: string, x: number, y: number): void;
}

let counter = 0;

export const useUI = create<Store>((set) => ({
  windows: [],
  nextZ: 1,
  open: (app) => set((state) => {
    const id = `${app}-${++counter}`;
    const w: WindowState = {
      id,
      app,
      title: app === 'terminal' ? 'Terminal' : app === 'files' ? 'Files' : 'Tasks',
      x: 80 + state.windows.length * 20,
      y: 80 + state.windows.length * 20,
      w: 640,
      h: 420,
      z: state.nextZ,
      minimized: false,
      maximized: false
    };
    return { windows: [...state.windows, w], nextZ: state.nextZ + 1 };
  }),
  close: (id) => set((state) => ({ windows: state.windows.filter((w) => w.id !== id) })),
  focus: (id) => set((state) => ({
    windows: state.windows.map((w) => w.id === id ? { ...w, z: state.nextZ } : w),
    nextZ: state.nextZ + 1
  })),
  minimize: (id) => set((state) => ({
    windows: state.windows.map((w) => w.id === id ? { ...w, minimized: !w.minimized } : w)
  })),
  toggleMax: (id) => set((state) => ({
    windows: state.windows.map((w) => {
      if (w.id !== id) return w;
      if (w.maximized) {
        const prev = w.prev;
        if (prev) return { ...w, maximized: false, x: prev.x, y: prev.y, w: prev.w, h: prev.h, prev: undefined };
        return { ...w, maximized: false };
      }
      const prev = { x: w.x, y: w.y, w: w.w, h: w.h };
      const padding = 16;
      return {
        ...w,
        maximized: true,
        minimized: false,
        prev,
        x: padding,
        y: 52,
        w: window.innerWidth - padding * 2,
        h: window.innerHeight - padding * 2 - 60
      };
    })
  })),
  move: (id, x, y) => set((state) => ({
    windows: state.windows.map((w) => w.id === id ? { ...w, x, y } : w)
  }))
}));
