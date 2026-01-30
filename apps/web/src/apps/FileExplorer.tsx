import { useEffect, useState, useCallback } from 'react';
import { FsEntry, getConfig, gitBranches, gitCheckout, gitCreateBranch, gitPull, gitPush, inspectProject, listDir, makeRun, makeTargets, nodeInstall, nodeRun, nodeScripts } from '../api/client';
import { useTasks } from '../ui/tasksStore';
import { useUI } from '../ui/state';

export const FileExplorer = ({ windowId }: { windowId: string }) => {
  const [cwd, setCwd] = useState<string>('');
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gitData, setGitData] = useState<{ branches: string[]; current: string } | null>(null);
  const [nodeData, setNodeData] = useState<{ pm: string; scripts: string[] } | null>(null);
  const [makeData, setMakeData] = useState<string[] | null>(null);
  const [selectedScript, setSelectedScript] = useState<string>('');
  const [selectedMake, setSelectedMake] = useState<string>('');
  const tasks = useTasks();
  const setMenus = useUI((s) => s.setMenus);

  const refresh = useCallback(async (path: string) => {
    setLoading(true); setError(null);
    try {
      const l = await listDir(path);
      setEntries(l.entries);
      const info = await inspectProject(path);
      setProject(info);
      if (info.git) {
        const gb = await gitBranches(info.git.root);
        setGitData(gb);
      } else setGitData(null);
      if (info.node) {
        const ns = await nodeScripts(info.node.root);
        setNodeData({ pm: ns.packageManager, scripts: ns.scripts });
        setSelectedScript(ns.scripts[0] || '');
      } else setNodeData(null);
      if (info.make) {
        try {
          const mt = await makeTargets(info.make.root);
          setMakeData(mt.targets);
          setSelectedMake(mt.targets[0] || '');
        } catch {
          setMakeData([]);
        }
      } else setMakeData(null);
    } catch (e: any) {
      setError(e?.message || 'failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const cfg = await getConfig();
      const start = cfg.fsRoot || cfg.defaultCwd || '/';
      setCwd(start);
      refresh(start);
    };
    init();
  }, [refresh]);

  const open = (entry: FsEntry) => {
    if (entry.type === 'dir') {
      setCwd(entry.path);
      refresh(entry.path);
    }
  };

  const goUp = useCallback(() => {
    if (!cwd) return;
    const parts = cwd.split('/').filter(Boolean);
    if (parts.length === 0) return;
    const parent = '/' + parts.slice(0, -1).join('/');
    setCwd(parent || '/');
    refresh(parent || '/');
  }, [cwd, refresh]);

  const runGit = useCallback(async (action: () => Promise<any>) => {
    setError(null);
    try { await action(); await refresh(cwd); } catch (e: any) { setError(e?.message || 'git failed'); }
  }, [cwd, refresh]);

  const runTask = useCallback(async (label: string, fn: () => Promise<{ procId: string }>) => {
    try {
      const { procId } = await fn();
      tasks.add({ id: procId, label });
    } catch (e: any) {
      setError(e?.message || 'task failed');
    }
  }, [tasks]);

  useEffect(() => {
    const sections = [];
    sections.push({
      title: 'File',
      items: [
        { label: 'Refresh', action: () => refresh(cwd) },
        { label: 'Up', action: () => goUp(), disabled: cwd === '/' }
      ]
    });
    if (project?.git && gitData) {
      sections.push({
        title: 'Git',
        items: [
          { label: 'Pull', action: () => runGit(() => gitPull(project.git.root)) },
          { label: 'Push', action: () => runGit(() => gitPush(project.git.root)) }
        ]
      });
    }
    if (project?.node && nodeData) {
      sections.push({
        title: 'Run',
        items: [
          { label: 'Install deps', action: () => runTask(`install:${project.node.root}`, () => nodeInstall(project.node.root)) },
          ...nodeData.scripts.map((s) => ({ label: `Run ${s}`, action: () => runTask(`script:${s}`, () => nodeRun(project.node.root, s)) }))
        ]
      });
    }
    setMenus(windowId, sections);
    return () => setMenus(windowId, []);
  }, [cwd, gitData, nodeData, project, runGit, runTask, setMenus, windowId, goUp, refresh]);

  return (
    <div className="flex-col" style={{ height: '100%' }}>
      <div className="toolbar">
        <div className="path">{cwd || '/'}</div>
        <div className="actions">
          <button onClick={() => refresh(cwd)} disabled={loading}>Refresh</button>
          <button onClick={goUp} disabled={cwd === '/'}>Up</button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}

      {project?.git && gitData && (
        <div className="panel">
          <div className="panel-title">Git</div>
          <div className="row gap">
            <select value={gitData.current} onChange={(e) => runGit(() => gitCheckout(project.git.root, e.target.value))}>
              {gitData.branches.map((b) => <option key={b}>{b}</option>)}
            </select>
            <button onClick={() => runGit(() => gitPull(project.git.root))}>Pull</button>
            <button onClick={() => runGit(() => gitPush(project.git.root))}>Push</button>
            <input placeholder="new branch" onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value) {
                const name = e.currentTarget.value;
                runGit(() => gitCreateBranch(project.git.root, name, gitData.current));
                e.currentTarget.value = '';
              }
            }} />
          </div>
        </div>
      )}

      {project?.node && nodeData && (
        <div className="panel">
          <div className="panel-title">Node ({nodeData.pm})</div>
          <div className="row gap">
            <button onClick={() => runTask(`install:${project.node.root}`, () => nodeInstall(project.node.root))}>Install</button>
            <select value={selectedScript} onChange={(e) => setSelectedScript(e.target.value)}>
              {nodeData.scripts.map((s) => <option key={s}>{s}</option>)}
            </select>
            <button onClick={() => {
              if (selectedScript) runTask(`script:${selectedScript}`, () => nodeRun(project.node.root, selectedScript));
            }}>Run</button>
          </div>
        </div>
      )}

      {project?.make && makeData && (
        <div className="panel">
          <div className="panel-title">Make</div>
          <div className="row gap">
            <select value={selectedMake} onChange={(e) => setSelectedMake(e.target.value)}>
              <option value="">(default)</option>
              {makeData.map((t) => <option key={t}>{t}</option>)}
            </select>
            <button onClick={() => {
              const target = selectedMake || undefined;
              runTask(`make:${target || 'default'}`, () => makeRun(project.make.root, target));
            }}>Run</button>
          </div>
        </div>
      )}

      <div className="list" style={{ flex: 1 }}>
        {loading && <div>Loading...</div>}
        {!loading && entries.map((e) => (
          <div key={e.path} className="entry" onDoubleClick={() => open(e)}>
            <span className="type">{e.type === 'dir' ? '📁' : '📄'}</span>
            <span>{e.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
