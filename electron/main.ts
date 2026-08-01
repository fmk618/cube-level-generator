import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  closePool,
  countRows,
  pingDb,
  pullCatalog,
  pullLevelSkillMap,
  pullSkills,
  pushCatalog,
  pushLevelSkillMap,
  pushSkills,
  type CloudCatalogDocument,
  type CloudLevelSkillMap,
  type CloudSkillGraphDocument,
} from './db/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

const USER_DATA_DIR = () => app.getPath('userData');
const CATALOG_FILE = () => path.join(USER_DATA_DIR(), 'levels.runtime.json');
const CATALOG_BACKUP_FILE = () => path.join(USER_DATA_DIR(), 'levels.runtime.bak.json');
const SKILL_GRAPH_FILE = () => path.join(USER_DATA_DIR(), 'skill_graph.runtime.json');
const SKILL_GRAPH_BACKUP_FILE = () => path.join(USER_DATA_DIR(), 'skill_graph.runtime.bak.json');
const LEVEL_SKILL_MAP_FILE = () => path.join(USER_DATA_DIR(), 'level_skill_map.runtime.json');
const LEVEL_SKILL_MAP_BACKUP_FILE = () => path.join(USER_DATA_DIR(), 'level_skill_map.runtime.bak.json');
const SECRETS_FILE = () => path.join(USER_DATA_DIR(), 'secrets.bin');
const DEFAULT_CATALOG_FILE = () => (
  VITE_DEV_SERVER_URL
    ? path.join(process.env.APP_ROOT!, 'src/core/levels/game_levels_english.json')
    : path.join(process.env.VITE_PUBLIC!, 'game_levels_english.json')
);
const DEFAULT_SKILL_GRAPH_FILE = () => (
  path.join(process.env.VITE_PUBLIC!, 'skill_graph_default.json')
);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    title: 'cube-level-generator',
    backgroundColor: '#f5f5f4',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 15 } }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

async function readJsonFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function writeFileAtomically(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tempPath, content, 'utf-8');
  await fs.rename(tempPath, filePath);
}

ipcMain.handle('catalog:loadDefault', async () => {
  const content = await readJsonFileIfExists(DEFAULT_CATALOG_FILE());
  if (content === null) {
    throw new Error(`Bundled default catalog not found at ${DEFAULT_CATALOG_FILE()}`);
  }
  return content;
});

ipcMain.handle('catalog:loadRuntime', async () => {
  return readJsonFileIfExists(CATALOG_FILE());
});

ipcMain.handle('catalog:saveRuntime', async (_event, json: string) => {
  const existing = await readJsonFileIfExists(CATALOG_FILE());
  if (existing !== null) {
    await writeFileAtomically(CATALOG_BACKUP_FILE(), existing);
  }
  await writeFileAtomically(CATALOG_FILE(), json);
  return CATALOG_FILE();
});

ipcMain.handle('catalog:getRuntimePath', () => CATALOG_FILE());

ipcMain.handle('catalog:importFromDisk', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入关卡内容',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const content = await fs.readFile(result.filePaths[0], 'utf-8');
  return { filePath: result.filePaths[0], content };
});

ipcMain.handle('catalog:exportToDisk', async (_event, json: string, suggestedName: string) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出关卡内容',
    defaultPath: suggestedName,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, json, 'utf-8');
  return result.filePath;
});

ipcMain.handle('skillGraph:loadDefault', async () => {
  const content = await readJsonFileIfExists(DEFAULT_SKILL_GRAPH_FILE());
  if (content === null) {
    throw new Error(`Bundled default skill graph not found at ${DEFAULT_SKILL_GRAPH_FILE()}`);
  }
  return content;
});

ipcMain.handle('skillGraph:loadRuntime', async () => {
  const content = await readJsonFileIfExists(SKILL_GRAPH_FILE());
  if (content === null) return null;
  return { filePath: SKILL_GRAPH_FILE(), content };
});

ipcMain.handle('skillGraph:saveRuntime', async (_event, json: string) => {
  const existing = await readJsonFileIfExists(SKILL_GRAPH_FILE());
  if (existing !== null) {
    await writeFileAtomically(SKILL_GRAPH_BACKUP_FILE(), existing);
  }
  await writeFileAtomically(SKILL_GRAPH_FILE(), json);
  return SKILL_GRAPH_FILE();
});

ipcMain.handle('skillGraph:importFromDisk', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入 AI 能力标签',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const content = await fs.readFile(result.filePaths[0], 'utf-8');
  return { filePath: result.filePaths[0], content };
});

ipcMain.handle('skillGraph:exportToDisk', async (_event, json: string, suggestedName: string) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出 AI 能力标签',
    defaultPath: suggestedName,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, json, 'utf-8');
  return result.filePath;
});

ipcMain.handle('levelSkillMap:loadRuntime', async () => {
  const content = await readJsonFileIfExists(LEVEL_SKILL_MAP_FILE());
  if (content === null) return null;
  return { filePath: LEVEL_SKILL_MAP_FILE(), content };
});

ipcMain.handle('levelSkillMap:saveRuntime', async (_event, json: string) => {
  const existing = await readJsonFileIfExists(LEVEL_SKILL_MAP_FILE());
  if (existing !== null) {
    await writeFileAtomically(LEVEL_SKILL_MAP_BACKUP_FILE(), existing);
  }
  await writeFileAtomically(LEVEL_SKILL_MAP_FILE(), json);
  return LEVEL_SKILL_MAP_FILE();
});

ipcMain.handle('levelSkillMap:importFromDisk', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入 AI 推荐配置',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const content = await fs.readFile(result.filePaths[0], 'utf-8');
  return { filePath: result.filePaths[0], content };
});

ipcMain.handle('levelSkillMap:exportToDisk', async (_event, json: string, suggestedName: string) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出 AI 推荐配置',
    defaultPath: suggestedName,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, json, 'utf-8');
  return result.filePath;
});

ipcMain.handle('migration:exportAppBundle', async (_event, files: {
  catalog: string;
  skillGraph: string;
  levelSkillMap: string;
}) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 App 数据导出文件夹',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const directory = result.filePaths[0];
  const outputs = [
    { name: 'game_levels_english.json', content: files.catalog },
    { name: 'skill_graph_cfop.json', content: files.skillGraph },
    { name: 'level_skill_map.json', content: files.levelSkillMap },
  ];
  const existing = [];
  for (const output of outputs) {
    if (await readJsonFileIfExists(path.join(directory, output.name)) !== null) {
      existing.push(output.name);
    }
  }
  if (existing.length > 0) {
    const confirmation = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '确认覆盖导出文件',
      message: `目标文件夹已有 ${existing.length} 个同名文件。`,
      detail: `${existing.join('\n')}\n\n是否用当前已校验的数据覆盖？`,
      buttons: ['取消', '覆盖'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (confirmation.response !== 1) return null;
  }

  await Promise.all(outputs.map((output) => (
    writeFileAtomically(path.join(directory, output.name), output.content)
  )));
  return {
    directory,
    filePaths: outputs.map((output) => path.join(directory, output.name)),
  };
});

ipcMain.handle('db:ping', async () => pingDb());

ipcMain.handle('db:pullCatalog', async () => pullCatalog());
ipcMain.handle('db:pushCatalog', async (_event, doc: CloudCatalogDocument) => {
  await pushCatalog(doc);
  return countRows();
});

ipcMain.handle('db:pullSkills', async () => pullSkills());
ipcMain.handle('db:pushSkills', async (_event, doc: CloudSkillGraphDocument) => {
  await pushSkills(doc);
  return countRows();
});

ipcMain.handle('db:pullLevelSkillMap', async () => pullLevelSkillMap());
ipcMain.handle('db:pushLevelSkillMap', async (_event, map: CloudLevelSkillMap) => {
  await pushLevelSkillMap(map);
  return countRows();
});

ipcMain.handle('db:counts', async () => countRows());

ipcMain.handle('secrets:has', async (_event, key: string) => {
  const content = await readJsonFileIfExists(SECRETS_FILE());
  if (!content) return false;
  const store = JSON.parse(content) as Record<string, string>;
  return Boolean(store[key]);
});

ipcMain.handle('secrets:get', async (_event, key: string) => {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const content = await readJsonFileIfExists(SECRETS_FILE());
  if (!content) return null;
  const store = JSON.parse(content) as Record<string, string>;
  const encoded = store[key];
  if (!encoded) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
  } catch {
    return null;
  }
});

ipcMain.handle('secrets:set', async (_event, key: string, value: string) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统未提供安全存储（safeStorage），无法保存密钥。');
  }
  const content = await readJsonFileIfExists(SECRETS_FILE());
  const store = content ? (JSON.parse(content) as Record<string, string>) : {};
  const encrypted = safeStorage.encryptString(value);
  store[key] = encrypted.toString('base64');
  await writeFileAtomically(SECRETS_FILE(), JSON.stringify(store));
});

ipcMain.handle('secrets:delete', async (_event, key: string) => {
  const content = await readJsonFileIfExists(SECRETS_FILE());
  if (!content) return;
  const store = JSON.parse(content) as Record<string, string>;
  delete store[key];
  await writeFileAtomically(SECRETS_FILE(), JSON.stringify(store));
});

ipcMain.handle(
  'dashscope:generate',
  async (_event, args: { apiKey: string; model: string; prompt: string; systemPrompt?: string }) => {
    const { apiKey, model, prompt, systemPrompt } = args;
    const response = await fetch(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`DashScope 请求失败 (${response.status}): ${text || response.statusText}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? '';
  },
);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    mainWindow = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  void closePool();
});

void app.whenReady().then(createWindow);
