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

export const getShortcutById = (id: string): TerminalShortcut | undefined => {
  return terminalShortcuts.find(s => s.id === id);
};
