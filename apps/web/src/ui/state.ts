import { create } from 'zustand';

export type AppType = 'terminal' | 'files' | 'tasks';

export interface MenuItem {
  label: string;
  action?: () => void;
  disabled?: boolean;
}

export interface MenuSection {
  title: string;
  items: MenuItem[];
}

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
  menus?: MenuSection[];
}

interface Store {
  windows: WindowState[];
  focusedId: string | null;
  nextZ: number;
  open(app: AppType): void;
  close(id: string): void;
  focus(id: string): void;
  minimize(id: string): void;
  toggleMax(id: string): void;
  move(id: string, x: number, y: number): void;
  resize(id: string, size: Partial<Pick<WindowState, 'w' | 'h' | 'x' | 'y'>>): void;
  setMenus(id: string, menus: MenuSection[]): void;
  tile(id: string, layout: 'left' | 'right' | 'top' | 'bottom' | 'tl' | 'tr' | 'bl' | 'br' | 'center'): void;
}

let counter = 0;

export const useUI = create<Store>((set) => ({
  windows: [],
  focusedId: null,
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
      maximized: false,
      menus: []
    };
    return { windows: [...state.windows, w], nextZ: state.nextZ + 1, focusedId: id };
  }),
  close: (id) => set((state) => ({
    windows: state.windows.filter((w) => w.id !== id),
    focusedId: state.focusedId === id ? null : state.focusedId
  })),
  focus: (id) => set((state) => ({
    windows: state.windows.map((w) => w.id === id ? { ...w, z: state.nextZ } : w),
    nextZ: state.nextZ + 1,
    focusedId: id
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
      const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const height = typeof window !== 'undefined' ? window.innerHeight : 720;
      return {
        ...w,
        maximized: true,
        minimized: false,
        prev,
        x: padding,
        y: 52,
        w: width - padding * 2,
        h: height - padding * 2 - 60
      };
    })
  })),
  move: (id, x, y) => set((state) => ({
    windows: state.windows.map((w) => w.id === id ? { ...w, x, y } : w)
  })),
  resize: (id, size) => set((state) => ({
    windows: state.windows.map((w) => w.id === id ? { ...w, ...size } : w)
  })),
  setMenus: (id, menus) => set((state) => ({
    windows: state.windows.map((w) => w.id === id ? { ...w, menus } : w)
  })),
  tile: (id, layout) => set((state) => {
    const padding = 12;
    const topBar = 60;
    const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const height = typeof window !== 'undefined' ? window.innerHeight : 720;
    const halfW = (width - padding * 2) / 2;
    const halfH = (height - topBar - padding * 2) / 2;
    const full = {
      left: padding,
      top: topBar,
      width: width - padding * 2,
      height: height - topBar - padding * 2
    };
    const layouts = {
      left: { x: padding, y: topBar, w: halfW, h: full.height },
      right: { x: padding + halfW, y: topBar, w: halfW, h: full.height },
      top: { x: padding, y: topBar, w: full.width, h: halfH },
      bottom: { x: padding, y: topBar + halfH, w: full.width, h: halfH },
      tl: { x: padding, y: topBar, w: halfW, h: halfH },
      tr: { x: padding + halfW, y: topBar, w: halfW, h: halfH },
      bl: { x: padding, y: topBar + halfH, w: halfW, h: halfH },
      br: { x: padding + halfW, y: topBar + halfH, w: halfW, h: halfH },
      center: full
    } as const;
    const preset = layouts[layout];
    return {
      windows: state.windows.map((w) => w.id === id ? {
        ...w,
        ...preset,
        maximized: layout === 'center',
        minimized: false
      } : w)
    };
  })
}));
