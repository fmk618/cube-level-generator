import { useCatalogStore } from '@/shared/store/useCatalogStore';
import { useCloudSyncStore } from '@/shared/store/useCloudSyncStore';
import { useLevelSkillMapStore } from '@/shared/store/useLevelSkillMapStore';
import { useSkillGraphStore } from '@/shared/store/useSkillGraphStore';

const quiet = { manageSync: false as const };

/** 有未落盘改动的 store 分别写本地 runtime（不推远程） */
export async function saveAllLocal(): Promise<void> {
  const sync = useCloudSyncStore.getState();
  const catalog = useCatalogStore.getState();
  const skills = useSkillGraphStore.getState();
  const map = useLevelSkillMapStore.getState();

  const parts: string[] = [];
  if (catalog.hasUnsavedChanges) parts.push('关卡');
  if (skills.hasUnsavedChanges) parts.push('能力标签');
  if (map.hasUnsavedChanges) parts.push('推荐配置');

  if (parts.length === 0) {
    sync.finishOk('本地无需保存');
    return;
  }

  sync.beginLocal(`正在本地保存（${parts.join(' / ')}）…`);
  try {
    if (catalog.hasUnsavedChanges) await catalog.saveLocal(quiet);
    if (skills.hasUnsavedChanges) await skills.saveLocal(quiet);
    if (map.hasUnsavedChanges) await map.saveLocal(quiet);
    sync.finishOk(`已保存到本地（未推远程；${parts.join(' / ')}）`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sync.finishError(message, '本地保存失败');
    throw error;
  }
}

/**
 * 先自动本地保存有改动的三份数据，再批量推远程。
 * 进度分三段；任一步失败标明是哪一份，不回滚本地。
 */
export async function pushAllRemote(): Promise<void> {
  const sync = useCloudSyncStore.getState();
  const catalog = useCatalogStore.getState();
  const skills = useSkillGraphStore.getState();
  const map = useLevelSkillMapStore.getState();

  const dirtyParts: string[] = [];
  if (catalog.hasUnsavedChanges) dirtyParts.push('关卡');
  if (skills.hasUnsavedChanges) dirtyParts.push('能力标签');
  if (map.hasUnsavedChanges) dirtyParts.push('推荐配置');

  if (dirtyParts.length > 0) {
    sync.beginLocal(`有未落盘草稿，先本地保存（${dirtyParts.join(' / ')}）…`);
    try {
      if (catalog.hasUnsavedChanges) await useCatalogStore.getState().saveLocal(quiet);
      if (skills.hasUnsavedChanges) await useSkillGraphStore.getState().saveLocal(quiet);
      if (map.hasUnsavedChanges) await useLevelSkillMapStore.getState().saveLocal(quiet);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sync.finishError(message, '本地已有草稿保存失败，已中止远程推送');
      throw error;
    }
  }

  sync.markCloud('正在推送关卡到远程…', 20);
  try {
    await useCatalogStore.getState().pushRemote(quiet);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sync.finishError(message, '远程推送失败（关卡）');
    throw new Error(`远程推送失败（关卡）：${message}`);
  }

  sync.setProgress(50, '正在推送能力标签到远程…');
  try {
    await useSkillGraphStore.getState().pushRemote(quiet);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sync.finishError(message, '远程推送失败（能力标签）；关卡已推送');
    throw new Error(`远程推送失败（能力标签）：${message}`);
  }

  sync.setProgress(80, '正在推送推荐配置到远程…');
  try {
    await useLevelSkillMapStore.getState().pushRemote(quiet);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sync.finishError(message, '远程推送失败（推荐配置）；关卡与能力标签已推送');
    throw new Error(`远程推送失败（推荐配置）：${message}`);
  }

  sync.finishOk('已批量推送到远程（关卡 / 能力标签 / 推荐配置）');
}
