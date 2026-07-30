import type { Step } from 'react-joyride';
import type { EditMode, OnboardingTourContext } from './onboardingTypes';
import { tourSelector, waitForTourTarget } from './waitForTourTarget';

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

async function prepareMode(
  ctx: OnboardingTourContext,
  mode: EditMode,
  tourId: string,
): Promise<void> {
  ctx.setEditMode(mode);
  await nextFrame();
  let el = await waitForTourTarget(tourId, 4000);
  if (el) return;

  // Retry once — React may still be committing the mode switch.
  ctx.setEditMode(mode);
  await new Promise((r) => window.setTimeout(r, 120));
  await nextFrame();
  el = await waitForTourTarget(tourId, 3000);
  if (!el) {
    console.warn(`[onboarding] target not ready: ${tourId} (mode=${mode})`);
  }
}

export const onboardingLocale = {
  back: '上一步',
  close: '关闭',
  last: '完成',
  next: '下一步',
  nextWithProgress: '下一步 ({current} / {total})',
  open: '打开提示',
  skip: '跳过',
};

export const onboardingOptions = {
  skipBeacon: true,
  overlayClickAction: false as const,
  dismissKeyAction: false as const,
  showProgress: true,
  buttons: ['back', 'skip', 'primary'] as Array<'back' | 'skip' | 'primary'>,
  primaryColor: '#2563EB',
  overlayColor: 'rgba(15, 23, 42, 0.58)',
  backgroundColor: '#FFFFFF',
  textColor: '#0F172A',
  spotlightPadding: 8,
  spotlightRadius: 10,
  targetWaitTimeout: 6000,
  beforeTimeout: 9000,
  width: 360,
  zIndex: 10000,
};

export function buildOnboardingSteps(ctx: OnboardingTourContext): Step[] {
  return [
    {
      id: 'module-tabs',
      target: tourSelector('module-tabs'),
      title: '三页联调总览',
      content:
        '顶部三个标签是完整数据链路：关卡编辑（内容）→ 技能编辑（技能树）→ 关卡映射（关联）。调试时按这个顺序走，缺一不可。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'catalog', 'module-tabs');
      },
    },

    // —— 关卡编辑 ——
    {
      id: 'tab-catalog',
      target: tourSelector('tab-catalog'),
      title: '① 关卡编辑',
      content:
        '先进入关卡编辑。这里维护关卡本身：章节归属、起终状态、公式、亮度与引导等。没有关卡数据，后面的映射无从校验。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'catalog', 'tab-catalog');
      },
    },
    {
      id: 'level-list',
      target: tourSelector('level-list'),
      title: '选择要调试的关卡',
      content:
        '左侧按章节列出全部关卡。点选一条后，中间编辑区会载入该关卡，便于逐关检查状态与公式。',
      placement: 'right',
      before: async () => {
        await prepareMode(ctx, 'catalog', 'level-list');
      },
    },
    {
      id: 'level-search',
      target: tourSelector('level-search'),
      title: '快速定位关卡',
      content: '可用名称、ID 或章节关键词搜索，批量排查时不必逐章翻找。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'catalog', 'level-search');
      },
    },
    {
      id: 'level-editor',
      target: tourSelector('level-editor'),
      title: '编辑关卡内容',
      content:
        '中间是关卡主编辑区：改标题、起终态、公式与预览。改完记得保存，确保磁盘上的关卡数据与界面一致。',
      placement: 'left',
      before: async () => {
        await prepareMode(ctx, 'catalog', 'level-editor');
      },
    },
    {
      id: 'import-export',
      target: tourSelector('import-export'),
      title: '关卡导入 / 导出',
      content:
        '可从已有配置导入关卡，或导出当前目录做备份与跨环境同步。联调前建议先确认导入的是目标版本。',
      placement: 'top',
      before: async () => {
        await prepareMode(ctx, 'catalog', 'import-export');
      },
    },

    // —— 技能编辑 ——
    {
      id: 'tab-skills',
      target: tourSelector('tab-skills'),
      title: '② 技能编辑',
      content:
        '接下来切到技能编辑。技能树是映射的另一端：关卡要挂到具体 CFOP 技能（白十字 / F2L / OLL / PLL 等）上。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'skills', 'tab-skills');
      },
    },
    {
      id: 'skill-editor',
      target: tourSelector('skill-editor'),
      title: '筛选与新建技能',
      content:
        '按阶段筛选技能，或新建一条。调试时先确认目标技能存在、阶段正确，再去做关卡映射。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'skills', 'skill-editor');
      },
    },
    {
      id: 'skill-list',
      target: tourSelector('skill-list'),
      title: '维护技能定义',
      content:
        '在列表里检查中英文名、训练目标与掌握标准。技能 ID / 阶段会写进映射表，改错会导致关卡挂不上。',
      placement: 'top',
      before: async () => {
        await prepareMode(ctx, 'skills', 'skill-list');
      },
    },
    {
      id: 'skill-save',
      target: tourSelector('skill-save'),
      title: '保存 / 导出技能树',
      content: '技能改动后点保存落盘，需要分发时再导出。映射页读取的是已保存的技能数据。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'skills', 'skill-save');
      },
    },

    // —— 关卡映射 ——
    {
      id: 'tab-map',
      target: tourSelector('tab-map'),
      title: '③ 关卡映射',
      content:
        '最后进入关卡映射：一个关卡可以绑定多个技能，每个技能各自设置教学模式（引导 / 挑战 / 演示）与难度。这是三页联调的验收页。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'levelSkillMap', 'tab-map');
      },
    },
    {
      id: 'skill-select',
      target: tourSelector('map-list'),
      title: '单关添加技能',
      content:
        '在卡片里点「点击选择技能」或「+ 添加技能」即可绑定；一关可绑多个技能，各自设置模式与难度。',
      placement: 'top',
      before: async () => {
        await prepareMode(ctx, 'levelSkillMap', 'map-list');
      },
    },
    {
      id: 'assign-button',
      target: tourSelector('map-list'),
      title: '批量追加（可选）',
      content:
        '需要给多个关卡挂同一技能时：先勾选卡片左侧复选框，顶部会出现「批量追加」条，选技能后一键追加。平时单关编辑不必用它。',
      placement: 'top',
      before: async () => {
        await prepareMode(ctx, 'levelSkillMap', 'map-list');
      },
    },
    {
      id: 'map-list',
      target: tourSelector('map-list'),
      title: '逐关校验映射',
      content:
        '卡片展示已绑技能列表：可改每条的技能 / 模式 / 难度，可移除单条或清除全部。联调目标：目标关卡都挂上正确技能。',
      placement: 'top',
      before: async () => {
        await prepareMode(ctx, 'levelSkillMap', 'map-list');
      },
    },
    {
      id: 'map-save',
      target: tourSelector('map-save'),
      title: '保存 / 导出映射',
      content: '映射调通后保存，并可导出给客户端或其他环境。至此三页数据链路就闭环了。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'levelSkillMap', 'map-save');
      },
    },

    // —— 辅助 ——
    {
      id: 'ai-assistant',
      target: tourSelector('ai-assistant'),
      title: 'AI 公式助手（可选）',
      content:
        '调试关卡公式时，可在这里按目标生成候选公式，再贴回关卡编辑区验证。它不替代三页主流程，只是加速公式排查。',
      placement: 'left',
      before: async () => {
        ctx.ensureLlmExpanded();
        await nextFrame();
        await waitForTourTarget('ai-assistant', 3500);
      },
    },
    {
      id: 'tour-done',
      target: 'body',
      title: '联调清单',
      content:
        '验收时确认：① 关卡内容正确且已保存；② 技能树阶段/名称正确且已保存；③ 映射覆盖目标关卡（可一关多技能），模式与难度合理并已导出。以后可从「帮助 → 新手引导」重看。',
      placement: 'center',
      hideOverlay: false,
      skipBeacon: true,
      buttons: ['primary'],
    },
  ];
}
