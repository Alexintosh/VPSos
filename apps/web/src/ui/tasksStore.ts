import { create } from 'zustand';

export interface TaskItem {
  id: string;
  label: string;
}

interface Store {
  tasks: TaskItem[];
  add: (task: TaskItem) => void;
}

export const useTasks = create<Store>((set) => ({
  tasks: [],
  add: (task) => set((s) => {
    if (s.tasks.find((t) => t.id === task.id)) return s;
    return { tasks: [...s.tasks, task] };
  })
}));
