import { create } from 'zustand';
import type { ReactNode } from 'react';

export type AppType = 'terminal' | 'files' | 'tasks' | 'plugin';

export interface MenuItem {
  label: string;
  action?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
}

export interface MenuSection {
  title: string;
  items: MenuItem[];
}

export interface WindowState {
  id: string;
  app: AppType;
  title: string;
  pluginAppId?: string;
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
  gridRows: number;
  gridCols: number;
  open(app: AppType): void;
  openPlugin(pluginAppId: string, title: string): void;
  close(id: string): void;
  focus(id: string): void;
  minimize(id: string): void;
  toggleMax(id: string): void;
  move(id: string, x: number, y: number): void;
  resize(id: string, size: Partial<Pick<WindowState, 'w' | 'h' | 'x' | 'y'>>): void;
  setMenus(id: string, menus: MenuSection[]): void;
  tile(id: string, layout: TilePreset): void;
  setGrid(rows: number, cols: number): void;
}

export type TilePreset = 'left' | 'right' | 'top' | 'bottom' | 'tl' | 'tr' | 'bl' | 'br' | 'center';

let counter = 0;

export const useUI = create<Store>((set) => ({
  windows: [],
  focusedId: null,
  nextZ: 1,
  gridRows: 2,
  gridCols: 2,
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
  openPlugin: (pluginAppId, title) => set((state) => {
    const id = `plugin-${++counter}`;
    const w: WindowState = {
      id,
      app: 'plugin',
      pluginAppId,
      title,
      x: 80 + state.windows.length * 20,
      y: 80 + state.windows.length * 20,
      w: 720,
      h: 480,
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
    const rows = state.gridRows;
    const cols = state.gridCols;
    const usableW = width - padding * 2;
    const usableH = height - topBar - padding * 2;
    const cellW = usableW / cols;
    const cellH = usableH / rows;

    const preset = (() => {
      const make = (row: number, col: number, rowSpan = 1, colSpan = 1) => ({
        x: padding + col * cellW,
        y: topBar + row * cellH,
        w: cellW * colSpan,
        h: cellH * rowSpan
      });
      switch (layout) {
        case 'left':
          return make(0, 0, rows, 1);
        case 'right':
          return make(0, cols - 1, rows, 1);
        case 'top':
          return make(0, 0, 1, cols);
        case 'bottom':
          return make(rows - 1, 0, 1, cols);
        case 'tl':
          return make(0, 0);
        case 'tr':
          return make(0, cols - 1);
        case 'bl':
          return make(rows - 1, 0);
        case 'br':
          return make(rows - 1, cols - 1);
        case 'center':
        default:
          return { x: padding, y: topBar, w: usableW, h: usableH };
      }
    })();
    return {
      windows: state.windows.map((w) => w.id === id ? {
        ...w,
        ...preset,
        maximized: layout === 'center',
        minimized: false
      } : w)
    };
  }),
  setGrid: (rows, cols) => set((state) => ({ gridRows: rows, gridCols: cols, windows: state.windows }))
}));
