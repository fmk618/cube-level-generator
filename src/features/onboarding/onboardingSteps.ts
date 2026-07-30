import type { Step } from 'react-joyride';
import type { OnboardingTourContext } from './onboardingTypes';
import { tourSelector, waitForTourTarget } from './waitForTourTarget';

async function prepareMode(
  ctx: OnboardingTourContext,
  mode: 'catalog' | 'levelSkillMap',
  tourId: string,
): Promise<void> {
  ctx.setEditMode(mode);
  await waitForTourTarget(tourId, 3500);
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
  targetWaitTimeout: 3000,
  beforeTimeout: 5000,
  width: 340,
  zIndex: 10000,
};

export function buildOnboardingSteps(ctx: OnboardingTourContext): Step[] {
  return [
    {
      id: 'module-tabs',
      target: tourSelector('module-tabs'),
      title: '功能模块',
      content: '你可以在这里切换关卡编辑、技能编辑和关卡映射功能。',
      placement: 'bottom',
      before: async () => {
        await waitForTourTarget('module-tabs', 2000);
      },
    },
    {
      id: 'level-list',
      target: tourSelector('level-list'),
      title: '选择关卡',
      content: '在这里查看并选择需要编辑或分配技能的关卡。',
      placement: 'right',
      before: async () => {
        await prepareMode(ctx, 'catalog', 'level-list');
      },
    },
    {
      id: 'level-search',
      target: tourSelector('level-search'),
      title: '搜索与筛选',
      content: '可以根据关卡名称、编号或状态快速查找需要的关卡。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'catalog', 'level-search');
      },
    },
    {
      id: 'skill-select',
      target: tourSelector('skill-select'),
      title: '选择技能',
      content: '选择需要关联到当前关卡的技能。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'levelSkillMap', 'skill-select');
      },
    },
    {
      id: 'assign-button',
      target: tourSelector('assign-button'),
      title: '分配技能',
      content: '选择关卡和技能后，点击这里完成关卡与技能的映射。',
      placement: 'bottom',
      before: async () => {
        await prepareMode(ctx, 'levelSkillMap', 'assign-button');
      },
    },
    {
      id: 'import-export',
      target: tourSelector('import-export'),
      title: '导入与导出',
      content: '可以导入已有配置，也可以将当前配置导出并同步到其他项目。',
      placement: 'top',
      before: async () => {
        await prepareMode(ctx, 'catalog', 'import-export');
      },
    },
    {
      id: 'ai-assistant',
      target: tourSelector('ai-assistant'),
      title: 'AI 公式助手',
      content: '输入训练目标并选择公式类型后，可以让 AI 生成候选魔方公式。',
      placement: 'left',
      before: async () => {
        ctx.ensureLlmExpanded();
        await waitForTourTarget('ai-assistant', 3500);
      },
    },
    {
      id: 'tour-done',
      target: 'body',
      title: '引导完成',
      content: '你已经了解主要功能。以后可以通过「帮助 → 新手引导」重新查看。',
      placement: 'center',
      hideOverlay: false,
      skipBeacon: true,
      buttons: ['primary'],
    },
  ];
}
