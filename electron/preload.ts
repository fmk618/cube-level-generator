import { contextBridge, ipcRenderer } from 'electron';

export type ImportResult = { filePath: string; content: string } | null;

const api = {
  catalog: {
    loadDefault: (): Promise<string> => ipcRenderer.invoke('catalog:loadDefault'),
    loadRuntime: (): Promise<string | null> => ipcRenderer.invoke('catalog:loadRuntime'),
    saveRuntime: (json: string): Promise<string> => ipcRenderer.invoke('catalog:saveRuntime', json),
    getRuntimePath: (): Promise<string> => ipcRenderer.invoke('catalog:getRuntimePath'),
    importFromDisk: (): Promise<ImportResult> => ipcRenderer.invoke('catalog:importFromDisk'),
    exportToDisk: (json: string, suggestedName: string): Promise<string | null> =>
      ipcRenderer.invoke('catalog:exportToDisk', json, suggestedName),
  },
  skillGraph: {
    loadDefault: (): Promise<string> => ipcRenderer.invoke('skillGraph:loadDefault'),
    loadRuntime: (): Promise<ImportResult> => ipcRenderer.invoke('skillGraph:loadRuntime'),
    saveRuntime: (json: string): Promise<string> => ipcRenderer.invoke('skillGraph:saveRuntime', json),
    importFromDisk: (): Promise<ImportResult> => ipcRenderer.invoke('skillGraph:importFromDisk'),
    exportToDisk: (json: string, suggestedName: string): Promise<string | null> =>
      ipcRenderer.invoke('skillGraph:exportToDisk', json, suggestedName),
  },
  secrets: {
    has: (key: string): Promise<boolean> => ipcRenderer.invoke('secrets:has', key),
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('secrets:get', key),
    set: (key: string, value: string): Promise<void> => ipcRenderer.invoke('secrets:set', key, value),
    delete: (key: string): Promise<void> => ipcRenderer.invoke('secrets:delete', key),
  },
  dashscope: {
    generate: (args: {
      apiKey: string;
      model: string;
      prompt: string;
      systemPrompt?: string;
    }): Promise<string> => ipcRenderer.invoke('dashscope:generate', args),
  },
};

contextBridge.exposeInMainWorld('api', api);
contextBridge.exposeInMainWorld('platform', process.platform);

export type LevelStudioApi = typeof api;
