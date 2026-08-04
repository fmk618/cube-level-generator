import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'release');
const projectMarker = 'cube-level-generator';
const cleanupTargets = ['win-unpacked.tmp', 'win-unpacked'];

function killProjectElectron() {
  if (process.platform !== 'win32') return;

  const ps = [
    `Get-Process electron -ErrorAction SilentlyContinue`,
    `| Where-Object { $_.Path -like '*${projectMarker}*' }`,
    `| Stop-Process -Force`,
  ].join(' ');

  try {
    execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'pipe' });
    console.log('[prebuild:win] 已结束本项目的 Electron 进程');
  } catch {
    // 无占用进程时忽略
  }
}

function cleanReleaseArtifacts() {
  for (const name of cleanupTargets) {
    const target = join(releaseDir, name);
    if (!existsSync(target)) continue;

    try {
      rmSync(target, { recursive: true, force: true });
      console.log(`[prebuild:win] 已清理 release/${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[prebuild:win] 无法清理 release/${name}: ${message}`);
    }
  }
}

killProjectElectron();
await sleep(1000);
cleanReleaseArtifacts();
