import { PluginDefinition } from './types';

// Vite: include plugin modules at build time.
const modules = import.meta.glob('./**/plugin.tsx', { eager: true }) as Record<string, any>;

const plugins: PluginDefinition[] = Object.values(modules)
  .map((m) => m?.default)
  .filter(Boolean);

export const pluginRegistry = {
  plugins,
  apps: plugins.flatMap((p) => p.apps.map((a) => ({ pluginId: p.id, pluginName: p.name, ...a })))
};

export type PluginAppRecord = (typeof pluginRegistry.apps)[number];

export const findPluginApp = (id: string) => pluginRegistry.apps.find((a) => a.id === id);
