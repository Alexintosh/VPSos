import type { WindowData } from '../ui/state';

export interface TerminalShortcut {
  id: string;
  name: string;
  command: string;
  cwd?: string;
  icon?: string;
  autoRun?: boolean;
  env?: Record<string, string>;
}

export const terminalShortcuts: TerminalShortcut[] = [
  {
    id: 'kimi',
    name: 'Kimi',
    command: 'kimi',
    icon: 'terminal',
    autoRun: true
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    command: 'claude',
    icon: 'play',
    autoRun: true
  }
];

export interface PluginShortcut {
  id: string;
  name: string;
  pluginAppId: string;
  title?: string;
  data?: WindowData;
}

export const pluginShortcuts: PluginShortcut[] = [
  {
    id: 'cc',
    name: 'CC',
    title: 'CC',
    pluginAppId: 'vpsos.localweb.app',
    data: {
      pluginProps: {
        default_url: 'http://127.0.0.1:3001/',
        showToolbar: false
      }
    }
  }
];

export const getShortcutById = (id: string): TerminalShortcut | undefined => {
  return terminalShortcuts.find(s => s.id === id);
};
