import { createHash, randomUUID } from 'node:crypto';

export function newSyncUuid(): string {
  return randomUUID();
}

// 由 levelId + skillId 生成稳定 UUID，便于映射行 upsert
export function bindingRowUuid(levelId: string, skillId: string): string {
  const hex = createHash('sha256').update(`binding:${levelId}:${skillId}`).digest('hex');
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
