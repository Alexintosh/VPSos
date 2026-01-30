export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface GitStatusSummary {
  branch: string;
  ahead: number;
  behind: number;
  counts: {
    added: number;
    modified: number;
    deleted: number;
    untracked: number;
  };
}

export interface ProjectInfo {
  path: string;
  git?: {
    root: string;
    status: GitStatusSummary;
  };
  node?: {
    root: string;
    packageManager: PackageManager;
    scripts: string[];
  };
  make?: {
    root: string;
    targets: string[];
  };
}

export interface ProcMessageStdout {
  t: 'stdout';
  data: string;
}

export interface ProcMessageStderr {
  t: 'stderr';
  data: string;
}

export interface ProcMessageExit {
  t: 'exit';
  code: number;
}

export type ProcMessage = ProcMessageStdout | ProcMessageStderr | ProcMessageExit;

export interface PtyMessageData {
  t: 'data';
  data: Uint8Array;
}

export interface PtyMessageExit {
  t: 'exit';
  code: number;
}

export type PtyMessage = PtyMessageData | PtyMessageExit;
