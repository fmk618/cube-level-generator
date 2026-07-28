const DIM_BASE = { r: 0x22, g: 0x24, b: 0x28 };

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
};

const toHex = (value: number): string => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0');

/** brightness 0..1: 0 = 完全暗（未点亮 LED 的深灰底色），1 = 贴纸原色全亮 */
export const blendByBrightness = (hex: string, brightness: number): string => {
  const clamped = Math.min(1, Math.max(0, brightness));
  const face = hexToRgb(hex);
  const r = DIM_BASE.r + (face.r - DIM_BASE.r) * clamped;
  const g = DIM_BASE.g + (face.g - DIM_BASE.g) * clamped;
  const b = DIM_BASE.b + (face.b - DIM_BASE.b) * clamped;
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};
