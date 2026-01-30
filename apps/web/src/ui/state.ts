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
}

interface Store {
  windows: WindowState[];
  nextZ: number;
  open(app: AppType): void;
  close(id: string): void;
  focus(id: string): void;
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
      z: state.nextZ
    };
    return { windows: [...state.windows, w], nextZ: state.nextZ + 1 };
  }),
  close: (id) => set((state) => ({ windows: state.windows.filter((w) => w.id !== id) })),
  focus: (id) => set((state) => ({
    windows: state.windows.map((w) => w.id === id ? { ...w, z: state.nextZ } : w),
    nextZ: state.nextZ + 1
  }))
}));
