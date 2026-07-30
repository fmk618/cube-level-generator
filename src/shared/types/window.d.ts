export {};

declare global {
  interface Window {
    api: {
      catalog: {
        loadDefault: () => Promise<string>;
        loadRuntime: () => Promise<string | null>;
        saveRuntime: (json: string) => Promise<string>;
        getRuntimePath: () => Promise<string>;
        importFromDisk: () => Promise<{ filePath: string; content: string } | null>;
        exportToDisk: (json: string, suggestedName: string) => Promise<string | null>;
      };
      skillGraph: {
        loadDefault: () => Promise<string>;
        loadRuntime: () => Promise<{ filePath: string; content: string } | null>;
        saveRuntime: (json: string) => Promise<string>;
        importFromDisk: () => Promise<{ filePath: string; content: string } | null>;
        exportToDisk: (json: string, suggestedName: string) => Promise<string | null>;
      };
      secrets: {
        has: (key: string) => Promise<boolean>;
        get: (key: string) => Promise<string | null>;
        set: (key: string, value: string) => Promise<void>;
        delete: (key: string) => Promise<void>;
      };
      dashscope: {
        generate: (args: {
          apiKey: string;
          model: string;
          prompt: string;
          systemPrompt?: string;
        }) => Promise<string>;
      };
    };
    platform: 'darwin' | 'win32' | 'linux' | string;
  }
}
