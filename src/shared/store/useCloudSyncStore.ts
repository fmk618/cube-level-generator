import { create } from 'zustand';

export type CloudSyncPhase = 'idle' | 'local' | 'cloud' | 'done' | 'error';

type CloudSyncState = {
  phase: CloudSyncPhase;
  label: string;
  progress: number;
  error: string | null;
  beginLocal: (label: string) => void;
  markCloud: (label?: string, progress?: number) => void;
  setProgress: (progress: number, label?: string) => void;
  finishOk: (label?: string) => void;
  finishError: (message: string, label?: string) => void;
  reset: () => void;
};

let clearTimer: ReturnType<typeof setTimeout> | null = null;

const clearLater = (reset: () => void, delayMs = 2200) => {
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    clearTimer = null;
    reset();
  }, delayMs);
};

export const useCloudSyncStore = create<CloudSyncState>((set, get) => ({
  phase: 'idle',
  label: '',
  progress: 0,
  error: null,

  beginLocal: (label) => {
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    set({ phase: 'local', label, progress: 12, error: null });
  },

  markCloud: (label, progress = 40) => {
    set({
      phase: 'cloud',
      label: label ?? get().label,
      progress,
      error: null,
    });
  },

  setProgress: (progress, label) => {
    set({
      progress: Math.max(0, Math.min(100, progress)),
      ...(label ? { label } : {}),
    });
  },

  finishOk: (label) => {
    set({
      phase: 'done',
      label: label ?? '已同步到云端',
      progress: 100,
      error: null,
    });
    clearLater(() => {
      if (get().phase === 'done') {
        set({ phase: 'idle', label: '', progress: 0, error: null });
      }
    });
  },

  finishError: (message, label) => {
    set({
      phase: 'error',
      label: label ?? '本地已保存，云端同步失败',
      progress: 100,
      error: message,
    });
  },

  reset: () => {
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
    set({ phase: 'idle', label: '', progress: 0, error: null });
  },
}));
