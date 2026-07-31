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
      title: '三页 + 发布检查',
      content:
        '流程：关卡内容 → AI 能力标签 → AI 推荐配置 → 发布检查。AI 用标签判断薄弱项，最终推荐并执行的始终是可玩关卡。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'catalog', 'module-tabs');
      },
    },
    {
      id: 'tab-catalog',
      target: tourSelector('tab-catalog'),
      title: '① 关卡内容',
      content:
        '维护真实可玩数据：章节、起终状态、旋转/指引公式、亮度与步数星级。公式请只在这里配置。',
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
        '左侧按章节列出关卡。可用上下箭头排序；点选后中间编辑区载入该关。',
      placement: 'right',
      before: async () => {
        await prepareMode(ctx, 'catalog', 'level-list');
      },
    },
    {
      id: 'level-search',
      target: tourSelector('level-search'),
      title: '搜索关卡',
      content: '用搜索快速定位章节或关卡标题 / ID。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'catalog', 'level-search');
      },
    },
    {
      id: 'level-editor',
      target: tourSelector('level-editor'),
      title: '编辑玩法与只读推荐摘要',
      content:
        '在基础信息里可看到只读「AI 推荐配置」摘要，并可跳转到推荐配置页。旋转公式、指引与 3D 预览仍在本页维护。',
      placement: 'left',
      before: async () => {
        await prepareMode(ctx, 'catalog', 'level-editor');
      },
    },
    {
      id: 'import-export',
      target: tourSelector('import-export'),
      title: '关卡导入 / 导出',
      content: '可从已有配置导入关卡，或导出当前目录做备份。',
      placement: 'top',
      before: async () => {
        await prepareMode(ctx, 'catalog', 'import-export');
      },
    },
    {
      id: 'tab-skills',
      target: tourSelector('tab-skills'),
      title: '② AI 能力标签',
      content:
        '能力标签是内部判定维度，不是独立玩法，也不配公式。一关只绑一个主标签；一个标签可关联多关。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'skills', 'tab-skills');
      },
    },
    {
      id: 'skill-editor',
      target: tourSelector('skill-editor'),
      title: '筛选与新建标签',
      content: '按 Stage 筛选，或新建标签（可填稳定 ID）。草稿标签不得进入推荐。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'skills', 'skill-editor');
      },
    },
    {
      id: 'skill-list',
      target: tourSelector('skill-list'),
      title: '维护标签定义',
      content:
        '编辑内部名称、能力定义、前置标签、筛选顺序与启用状态，并查看被哪些关卡引用。',
      placement: 'top',
      before: async () => {
        await prepareMode(ctx, 'skills', 'skill-list');
      },
    },
    {
      id: 'skill-save',
      target: tourSelector('skill-save'),
      title: '保存 / 导出能力标签',
      content: '改动后点保存落盘；需要分发时再导出 skill_graph。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'skills', 'skill-save');
      },
    },
    {
      id: 'tab-map',
      target: tourSelector('tab-map'),
      title: '③ AI 推荐配置',
      content:
        '为每个关卡指定唯一主能力标签，并设置教学模式与推荐难度。综合关请绑综合标签（如 cross.integrate）。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'levelSkillMap', 'tab-map');
      },
    },
    {
      id: 'map-list',
      target: tourSelector('map-list'),
      title: '逐关配置主标签',
      content:
        '选择主能力标签、教学模式与难度；可查看推荐状态与不可推荐原因。勾选多关可批量替换配置。',
      placement: 'top',
      before: async () => {
        await prepareMode(ctx, 'levelSkillMap', 'map-list');
      },
    },
    {
      id: 'map-save',
      target: tourSelector('map-save'),
      title: '④ 发布检查与导出',
      content:
        '先点「发布检查」，通过后再「导出给 App」。导出为 App v1：version=1 且 map 下一关一条主标签。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'levelSkillMap', 'map-save');
      },
    },
    {
      id: 'ai-assistant',
      target: tourSelector('ai-assistant'),
      title: 'AI 助手（可选）',
      content:
        '可按页生成公式、章节/关卡、能力标签或主标签配置。提案需人工审核后再应用。',
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
        '验收：① 关卡内容正确；② 能力标签非玩法且已保存；③ 每关一个主标签；④ 发布检查通过并导出 App v1。可从「帮助 → 新手引导」重看。',
      placement: 'center',
      hideOverlay: false,
      skipBeacon: true,
      buttons: ['primary'],
    },
  ];
}
