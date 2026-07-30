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
      levelSkillMap: {
        loadRuntime: () => Promise<{ filePath: string; content: string } | null>;
        saveRuntime: (json: string) => Promise<string>;
      };
      db: {
        ping: () => Promise<{
          ok: boolean;
          database: string;
          version: string;
          user: string;
          host: string;
          error?: string;
        }>;
        counts: () => Promise<{
          chapters: number;
          levels: number;
          skills: number;
          bindings: number;
        }>;
        pullCatalog: () => Promise<import('@/core/levels').LevelCatalogDocument | null>;
        pushCatalog: (doc: import('@/core/levels').LevelCatalogDocument) => Promise<{
          chapters: number;
          levels: number;
          skills: number;
          bindings: number;
        }>;
        pullSkills: () => Promise<import('@/core/skill-graph/types').SkillGraphDocument | null>;
        pushSkills: (doc: import('@/core/skill-graph/types').SkillGraphDocument) => Promise<{
          chapters: number;
          levels: number;
          skills: number;
          bindings: number;
        }>;
        pullLevelSkillMap: () => Promise<import('@/core/skill-graph/types').LevelSkillMap | null>;
        pushLevelSkillMap: (map: import('@/core/skill-graph/types').LevelSkillMap) => Promise<{
          chapters: number;
          levels: number;
          skills: number;
          bindings: number;
        }>;
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
