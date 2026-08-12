import { useEffect, useMemo, useRef, useState } from 'react';
import { useCatalogStore } from '@/shared/store/useCatalogStore';
import { useUiStore } from '@/shared/store/useUiStore';
import { useSkillGraphStore } from '@/shared/store/useSkillGraphStore';
import { useLevelSkillMapStore } from '@/shared/store/useLevelSkillMapStore';
import { SelectDropdown } from '@/shared/ui/SelectDropdown';
import { deriveLevelFormulaPreset, type LevelFormulaTarget } from '@/core/levels';
import {
  buildChapterLevelsSystemPrompt,
  buildChaptersSystemPrompt,
  buildFormulaSystemPrompt,
  buildLevelSummaries,
  buildMappingSystemPrompt,
  buildSkillSystemPrompt,
  filterLevelsForMapScope,
  type MapScope,
} from './aiPrompts';
import {
  parseChapterProposals,
  parseLevelProposals,
  parseMappingProposals,
  parseSkillProposals,
  type AiChapterProposal,
  type AiLevelProposal,
  type AiMappingProposal,
  type AiSkillProposal,
} from './aiParsers';
import type { CatalogAiMode } from '@/shared/store/useUiStore';

const API_KEY_STORAGE_KEY = 'dashscope-api-key';
const MODEL_PRESETS = ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long', 'qwen-vl-plus'];
const DIFFICULTY_OPTIONS: { key: 'short' | 'medium' | 'long'; label: string; hint: string }[] = [
  { key: 'short', label: '短', hint: '4-6 步，适合入门关卡' },
  { key: 'medium', label: '中', hint: '7-12 步，适合中期关卡' },
  { key: 'long', label: '长', hint: '13-20 步，适合挑战关卡' },
];

const MAP_SCOPE_OPTIONS: { value: MapScope; label: string; shortLabel: string }[] = [
  { value: 'unmapped', label: '仅未映射关卡', shortLabel: '未映射' },
  { value: 'selected', label: '仅勾选关卡', shortLabel: '已勾选' },
  { value: 'all', label: '全部关卡', shortLabel: '全部' },
];

type FormulaCandidate = {
  raw: string;
  formula: string;
  note: string;
  validation:
    | { ok: true; stepCount: number }
    | { ok: false; message: string };
};

function ModelComboInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <label>
      模型
      <div className="combo-input" ref={ref}>
        <input
          className="text-input combo-input-field"
          placeholder="输入或选择模型名称"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
        />
        <button type="button" className="combo-input-arrow" onClick={() => setOpen((v) => !v)} aria-label="展开模型列表">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        {open && (
          <ul className="combo-input-list">
            {MODEL_PRESETS.map((m) => (
              <li key={m} className={`combo-input-item ${m === value ? 'is-active' : ''}`} onMouseDown={() => { onChange(m); setOpen(false); }}>{m}</li>
            ))}
          </ul>
        )}
      </div>
    </label>
  );
}

type LlmPanelProps = {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  editMode?: 'catalog' | 'skills' | 'levelSkillMap';
  onSwitchToCatalog?: () => void;
};

export function LlmPanel({
  collapsed = false,
  onToggleCollapsed,
  editMode = 'catalog',
  onSwitchToCatalog,
}: LlmPanelProps) {
  const requestFormulaAdoption = useUiStore((s) => s.requestFormulaAdoption);
  const selectedLevelId = useUiStore((s) => s.selectedLevelId);
  const selectLevel = useUiStore((s) => s.selectLevel);
  const aiTargetChapterId = useUiStore((s) => s.aiTargetChapterId);
  const selectAiTargetChapter = useUiStore((s) => s.selectAiTargetChapter);
  const catalogAiMode = useUiStore((s) => s.catalogAiMode);
  const setCatalogAiMode = useUiStore((s) => s.setCatalogAiMode);
  const aiMapLevelIds = useUiStore((s) => s.aiMapLevelIds);

  const levels = useCatalogStore((s) => s.levels);
  const chapters = useCatalogStore((s) => s.chapters);
  const isCatalogLoaded = useCatalogStore((s) => s.isLoaded);
  const refreshCatalog = useCatalogStore((s) => s.refreshCatalog);
  const applyAiLevelProposals = useCatalogStore((s) => s.applyAiLevelProposals);
  const applyAiChapterProposals = useCatalogStore((s) => s.applyAiChapterProposals);
  const saveCatalog = useCatalogStore((s) => s.saveCatalog);

  const skills = useSkillGraphStore((s) => s.skills);
  const skillGraph = useSkillGraphStore((s) => s.skillGraph);
  const applyAiSkillProposals = useSkillGraphStore((s) => s.applyAiSkillProposals);
  const saveSkillGraph = useSkillGraphStore((s) => s.saveSkillGraph);

  const levelSkillMap = useLevelSkillMapStore((s) => s.levelSkillMap);
  const applyAiMappings = useLevelSkillMapStore((s) => s.applyAiMappings);
  const saveMap = useLevelSkillMapStore((s) => s.saveMap);

  const markAiTouchedSkills = useUiStore((s) => s.markAiTouchedSkills);
  const markAiTouchedLevels = useUiStore((s) => s.markAiTouchedLevels);
  const clearAiTouched = useUiStore((s) => s.clearAiTouched);

  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [model, setModel] = useState('qwen-plus');
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);

  const [instruction, setInstruction] = useState('');
  const [target, setTarget] = useState<LevelFormulaTarget>('f2l');
  const [difficulty, setDifficulty] = useState<'short' | 'medium' | 'long'>('short');
  const [candidateCount, setCandidateCount] = useState(3);
  const [mapScope, setMapScope] = useState<MapScope>('unmapped');
  // mapMode removed: first edition always replaces the single primary binding


  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [formulaCandidates, setFormulaCandidates] = useState<FormulaCandidate[]>([]);
  const [skillProposals, setSkillProposals] = useState<AiSkillProposal[]>([]);
  const [mappingProposals, setMappingProposals] = useState<AiMappingProposal[]>([]);
  const [levelProposals, setLevelProposals] = useState<AiLevelProposal[]>([]);
  const [chapterProposals, setChapterProposals] = useState<AiChapterProposal[]>([]);

  useEffect(() => {
    void window.api.secrets.has(API_KEY_STORAGE_KEY).then(setHasStoredKey);
  }, []);

  useEffect(() => {
    if (!isCatalogLoaded) void refreshCatalog();
  }, [isCatalogLoaded, refreshCatalog]);

  useEffect(() => {
    setError(null);
    setNotice(null);
    setFormulaCandidates([]);
    setSkillProposals([]);
    setMappingProposals([]);
    setLevelProposals([]);
    setChapterProposals([]);
  }, [editMode]);

  useEffect(() => {
    setError(null);
    setNotice(null);
    setFormulaCandidates([]);
    setLevelProposals([]);
    setChapterProposals([]);
  }, [catalogAiMode]);

  useEffect(() => {
    if (!selectedLevelId) return;
    const level = levels.find((l) => l.id === selectedLevelId);
    if (level && level.chapterId !== aiTargetChapterId) {
      selectAiTargetChapter(level.chapterId);
    }
  }, [selectedLevelId, levels, aiTargetChapterId, selectAiTargetChapter]);

  const modeMeta = useMemo(() => {
    if (editMode === 'skills') {
      return {
        title: 'AI 能力标签助手',
        subtitle: '描述教学目标，AI 生成或补充能力标签（非玩法），确认后一键应用',
        placeholder: '例如：为 F2L 阶段补充「角块在底层」相关能力标签…',
        actionLabel: 'AI 生成能力标签提案',
      };
    }
    if (editMode === 'levelSkillMap') {
      return {
        title: 'AI 推荐配置助手',
        subtitle: '为关卡指定唯一主能力标签与推荐参数，确认后写入 AI 推荐配置',
        placeholder: '可选：补充偏好，例如「入门关用 guided、难度偏低」…',
        actionLabel: 'AI 生成主标签配置',
      };
    }
    if (catalogAiMode === 'chapters') {
      return {
        title: 'AI 公式助手',
        subtitle: '描述课程结构，AI 生成新章节（可附带初始关卡），确认后写入目录',
        placeholder: '例如：新增「OLL 入门」章节，容量 6，前两关只练识别…',
        actionLabel: 'AI 生成章节提案',
      };
    }
    if (catalogAiMode === 'levels') {
      return {
        title: 'AI 公式助手',
        subtitle: '选定章节后，AI 生成该章关卡草案（含公式），确认后写入目录',
        placeholder: '可选：补充章节教学偏好，例如「前两关只做十字、循序渐进」…',
        actionLabel: 'AI 生成关卡提案',
      };
    }
    return {
      title: 'AI 公式助手',
      subtitle: '描述训练目标，AI 生成候选公式',
      placeholder: '例如：训练识别顶层十字的边块位置，只需处理一个错位边块…',
      actionLabel: '生成候选公式',
    };
  }, [editMode, catalogAiMode]);

  const chapterOptions = useMemo(
    () =>
      chapters.map((chapter) => ({
        value: chapter.id,
        label: `${chapter.partName} ${chapter.title}`,
      })),
    [chapters],
  );

  const selectedChapterLabel = useMemo(() => {
    const chapter = chapters.find((c) => c.id === aiTargetChapterId);
    if (!chapter) return '';
    const count = levels.filter((l) => l.chapterId === chapter.id).length;
    return `${chapter.partName} ${chapter.title}（已有 ${count}/${chapter.capacity} 关）`;
  }, [chapters, levels, aiTargetChapterId]);

  const switchCatalogMode = (mode: CatalogAiMode) => {
    setCatalogAiMode(mode);
    setError(null);
    setNotice(null);
  };

  const difficultyHint = useMemo(
    () => DIFFICULTY_OPTIONS.find((d) => d.key === difficulty)?.hint ?? '',
    [difficulty],
  );

  const levelOptions = useMemo(() => {
    const scoped = aiTargetChapterId
      ? levels.filter((level) => level.chapterId === aiTargetChapterId)
      : levels;
    return scoped.map((level) => {
      const chapter = chapters.find((c) => c.id === level.chapterId);
      const chapterLabel = chapter ? `${chapter.partName} ${chapter.title}` : level.chapterId;
      return { value: level.id, label: `${chapterLabel} / ${level.title}` };
    });
  }, [levels, chapters, aiTargetChapterId]);

  const selectedLevelLabel = useMemo(
    () => levelOptions.find((option) => option.value === selectedLevelId)?.label
      ?? (selectedLevelId
        ? (() => {
            const level = levels.find((l) => l.id === selectedLevelId);
            if (!level) return '';
            const chapter = chapters.find((c) => c.id === level.chapterId);
            return chapter ? `${chapter.partName} ${chapter.title} / ${level.title}` : level.title;
          })()
        : ''),
    [levelOptions, selectedLevelId, levels, chapters],
  );

  const pickFormulaTargetLevel = (levelId: string | null) => {
    selectLevel(levelId);
    if (levelId) {
      const level = levels.find((l) => l.id === levelId);
      if (level) selectAiTargetChapter(level.chapterId);
    }
    setError(null);
    setNotice(null);
  };

  const pickFormulaTargetChapter = (chapterId: string | null) => {
    selectAiTargetChapter(chapterId);
    if (chapterId && selectedLevelId) {
      const level = levels.find((l) => l.id === selectedLevelId);
      if (level && level.chapterId !== chapterId) selectLevel(null);
    }
    setError(null);
    setNotice(null);
  };

  const skillLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of skills) map.set(s.id, s.displayNameZh);
    return map;
  }, [skills]);

  const levelTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of levels) map.set(l.id, l.title);
    return map;
  }, [levels]);

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return;
    await window.api.secrets.set(API_KEY_STORAGE_KEY, apiKeyInput.trim());
    setHasStoredKey(true);
    setApiKeyInput('');
    setSettingsNotice('API Key 已加密保存到本机。');
  };

  const handleClearKey = async () => {
    if (!window.confirm('确定要清除本机保存的 API Key 吗？')) return;
    await window.api.secrets.delete(API_KEY_STORAGE_KEY);
    setHasStoredKey(false);
    setSettingsNotice('已清除本机保存的 API Key。');
  };

  const getApiKey = async (): Promise<string | null> => {
    const apiKey = await window.api.secrets.get(API_KEY_STORAGE_KEY);
    if (!apiKey) {
      setError('请先在设置中保存 DashScope API Key。');
      setShowSettings(true);
      return null;
    }
    return apiKey;
  };

  const parseFormulaCandidates = (text: string): FormulaCandidate[] => {
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    const results: FormulaCandidate[] = [];
    for (const line of lines) {
      const match = line.match(/^\d+[.、)]\s*(.+?)\s*::\s*(.+)$/);
      const formula = (match ? match[1] : line).trim();
      const note = match ? match[2].trim() : '';
      if (!formula) continue;
      let validation: FormulaCandidate['validation'];
      try {
        const preset = deriveLevelFormulaPreset(formula, target);
        validation = { ok: true, stepCount: preset.mappedTokens.length };
      } catch (err) {
        validation = { ok: false, message: err instanceof Error ? err.message : String(err) };
      }
      results.push({ raw: line, formula, note, validation });
    }
    return results;
  };

  const handleGenerateFormula = async () => {
    setError(null);
    setNotice(null);
    setFormulaCandidates([]);
    const apiKey = await getApiKey();
    if (!apiKey) return;
    if (!instruction.trim()) {
      setError('请描述训练目标。');
      return;
    }

    setLoading(true);
    try {
      const prompt = `教学目标描述：${instruction.trim()}\n请给出 ${candidateCount} 条候选公式。`;
      const content = await window.api.dashscope.generate({
        apiKey,
        model,
        prompt,
        systemPrompt: buildFormulaSystemPrompt(target, `${difficulty}（${difficultyHint}）`),
      });
      const parsed = parseFormulaCandidates(content);
      if (parsed.length === 0) setError('模型没有返回可解析的候选公式，请重试或调整描述。');
      setFormulaCandidates(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSkills = async () => {
    setError(null);
    setNotice(null);
    setSkillProposals([]);
    if (!skillGraph) {
      setError('技能树尚未加载，请稍候或打开「技能编辑」页。');
      return;
    }
    const apiKey = await getApiKey();
    if (!apiKey) return;

    setLoading(true);
    try {
      const prompt = instruction.trim()
        ? `用户补充要求：${instruction.trim()}\n请基于现有技能树生成 create/update 提案。`
        : '请检查现有技能树，补充缺失的关键 CFOP 技能节点（优先 create），按教学顺序给出提案。';
      const content = await window.api.dashscope.generate({
        apiKey,
        model,
        prompt,
        systemPrompt: buildSkillSystemPrompt(skills),
      });
      setSkillProposals(parseSkillProposals(content, skills));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMappings = async () => {
    setError(null);
    setNotice(null);
    setMappingProposals([]);
    if (!skillGraph || skills.length === 0) {
      setError('技能树为空，请先在「技能编辑」加载或生成技能。');
      return;
    }
    if (levels.length === 0) {
      setError('没有可用关卡，请先在「关卡编辑」加载关卡。');
      return;
    }
    if (mapScope === 'selected' && aiMapLevelIds.length === 0) {
      setError('请先在映射页勾选至少一个关卡，或切换为「仅未映射/全部关卡」。');
      return;
    }

    const summaries = buildLevelSummaries(levels, chapters, levelSkillMap);
    const scoped = filterLevelsForMapScope(summaries, mapScope, aiMapLevelIds);
    if (scoped.length === 0) {
      setError('当前范围内没有需要映射的关卡。');
      return;
    }
    if (scoped.length > 60) {
      setError(`当前范围有 ${scoped.length} 个关卡，请缩小范围（建议 ≤60）后再试。`);
      return;
    }

    const apiKey = await getApiKey();
    if (!apiKey) return;

    setLoading(true);
    try {
      const extra = instruction.trim() ? `\n用户补充要求：${instruction.trim()}` : '';
      const prompt = `请为以下 ${scoped.length} 个关卡生成映射提案。${extra}`;
      const content = await window.api.dashscope.generate({
        apiKey,
        model,
        prompt,
        systemPrompt: buildMappingSystemPrompt(skills, scoped, mapScope),
      });
      const validLevelIds = new Set(scoped.map((s) => s.id));
      const validSkillIds = new Set(skills.filter((s) => !s.draft).map((s) => s.id));
      const skillStageById = new Map(skills.map((s) => [s.id, s.stage]));
      setMappingProposals(parseMappingProposals(content, validLevelIds, validSkillIds, skillStageById));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateLevels = async () => {
    setError(null);
    setNotice(null);
    setLevelProposals([]);

    const chapter = chapters.find((c) => c.id === aiTargetChapterId);
    if (!chapter) {
      setError('请先在上方选择目标章节。');
      return;
    }

    const existing = levels.filter((l) => l.chapterId === chapter.id);
    const remaining = Math.max(0, chapter.capacity - existing.length);
    if (remaining <= 0) {
      setError(`章节「${chapter.title}」已满（容量 ${chapter.capacity}），请先扩容或删除关卡。`);
      return;
    }

    const apiKey = await getApiKey();
    if (!apiKey) return;

    setLoading(true);
    try {
      const extra = instruction.trim() ? `\n用户补充要求：${instruction.trim()}` : '';
      const prompt = `请为该章节生成不超过 ${Math.min(remaining, 6)} 个新关卡。剩余容量 ${remaining}。${extra}`;
      const content = await window.api.dashscope.generate({
        apiKey,
        model,
        prompt,
        systemPrompt: buildChapterLevelsSystemPrompt(
          {
            id: chapter.id,
            partName: chapter.partName,
            title: chapter.title,
            description: chapter.description,
            capacity: chapter.capacity,
          },
          existing.map((l) => l.title),
        ),
      });
      setLevelProposals(parseLevelProposals(content).slice(0, remaining));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateChapters = async () => {
    setError(null);
    setNotice(null);
    setChapterProposals([]);

    const apiKey = await getApiKey();
    if (!apiKey) return;

    setLoading(true);
    try {
      const extra = instruction.trim()
        ? `\n用户补充要求：${instruction.trim()}`
        : '\n请基于现有课程结构，补充 1-2 个合理的新章节，并尽量附带 2-4 个初始关卡。';
      const content = await window.api.dashscope.generate({
        apiKey,
        model,
        prompt: `请生成新章节提案。${extra}`,
        systemPrompt: buildChaptersSystemPrompt(
          chapters.map((c) => ({
            partName: c.partName,
            title: c.title,
            capacity: c.capacity,
          })),
        ),
      });
      setChapterProposals(parseChapterProposals(content).slice(0, 3));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = () => {
    if (editMode === 'skills') void handleGenerateSkills();
    else if (editMode === 'levelSkillMap') void handleGenerateMappings();
    else if (catalogAiMode === 'chapters') void handleGenerateChapters();
    else if (catalogAiMode === 'levels') void handleGenerateLevels();
    else void handleGenerateFormula();
  };

  const adoptFormula = (candidate: FormulaCandidate, kind: 'rotation' | 'guidance') => {
    setError(null);
    setNotice(null);
    if (!selectedLevelId) {
      setError('请先选择目标章节，再选择该章下的关卡，然后点应用。');
      return;
    }
    if (!candidate.validation.ok) {
      setError('该公式无法解析，请换一条候选。');
      return;
    }
    const level = levels.find((l) => l.id === selectedLevelId);
    if (level) selectAiTargetChapter(level.chapterId);
    requestFormulaAdoption({
      kind,
      formula: candidate.formula,
      target,
      autoApply: true,
    });
    markAiTouchedLevels([selectedLevelId]);
    if (editMode !== 'catalog') {
      onSwitchToCatalog?.();
    }
    const where = selectedLevelLabel || '当前关卡';
    setNotice(
      kind === 'rotation'
        ? `✓ 已写入「${where}」的旋转公式并生成起始/目标态，请在左侧编辑器检查后保存。`
        : `✓ 已写入「${where}」的指引公式，请在左侧编辑器检查后保存。`,
    );
  };

  const applySkillProposals = async () => {
    if (skillProposals.length === 0) return;
    try {
      const ids = skillProposals.map((p) => p.id);
      const { created, updated } = applyAiSkillProposals(skillProposals);
      markAiTouchedSkills(ids);
      setNotice(`✓ 已应用 ${created} 个新建、${updated} 个更新（高亮卡片）。请在左侧核对后保存。`);
      setSkillProposals([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const applyMappingProposals = async () => {
    if (mappingProposals.length === 0) return;
    try {
      const levelIds = mappingProposals.map((p) => p.levelId);
      const skillById = new Map(skills.map((s) => [s.id, s]));
      const applied = applyAiMappings(
        mappingProposals.map((p) => {
          const skill = skillById.get(p.skillId);
          if (!skill) throw new Error(`能力标签不存在：${p.skillId}`);
          return {
            levelId: p.levelId,
            binding: {
              skillId: skill.id,
              cfopStage: skill.stage,
              teachMode: p.teachMode,
              formulaDifficulty: p.formulaDifficulty,
            },
          };
        }),
      );
      markAiTouchedLevels(levelIds);
      setNotice(`✓ 已应用 ${applied} 个关卡主标签配置（高亮）。请在左侧核对后保存。`);
      setMappingProposals([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const applyAndSaveSkills = async () => {
    if (skillProposals.length === 0) return;
    try {
      const ids = skillProposals.map((p) => p.id);
      applyAiSkillProposals(skillProposals);
      markAiTouchedSkills(ids);
      await saveSkillGraph();
      clearAiTouched();
      setNotice('✓ 技能提案已应用并保存到本地（未推远程）。');
      setSkillProposals([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const applyAndSaveMappings = async () => {
    if (mappingProposals.length === 0) return;
    try {
      const levelIds = mappingProposals.map((p) => p.levelId);
      const skillById = new Map(skills.map((s) => [s.id, s]));
      applyAiMappings(
        mappingProposals.map((p) => {
          const skill = skillById.get(p.skillId);
          if (!skill) throw new Error(`能力标签不存在：${p.skillId}`);
          return {
            levelId: p.levelId,
            binding: {
              skillId: skill.id,
              cfopStage: skill.stage,
              teachMode: p.teachMode,
              formulaDifficulty: p.formulaDifficulty,
            },
          };
        }),
      );
      markAiTouchedLevels(levelIds);
      await saveMap();
      clearAiTouched();
      setNotice('✓ 推荐配置已应用并保存到本地（未推远程）。');
      setMappingProposals([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const applyChapterProposals = () => {
    if (chapterProposals.length === 0) return;
    try {
      const { chapterIds, levelIds } = applyAiChapterProposals(chapterProposals);
      markAiTouchedLevels(levelIds);
      if (chapterIds[0]) selectAiTargetChapter(chapterIds[0]);
      if (levelIds[0]) selectLevel(levelIds[0]);
      const levelPart = levelIds.length > 0 ? `，含 ${levelIds.length} 个初始关卡（高亮）` : '';
      setNotice(`✓ 已写入 ${chapterIds.length} 个章节${levelPart}。可用上下箭头排序，核对后保存。`);
      setChapterProposals([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const applyAndSaveChapters = async () => {
    if (chapterProposals.length === 0) return;
    try {
      const { chapterIds, levelIds } = applyAiChapterProposals(chapterProposals);
      markAiTouchedLevels(levelIds);
      if (chapterIds[0]) selectAiTargetChapter(chapterIds[0]);
      if (levelIds[0]) selectLevel(levelIds[0]);
      await saveCatalog();
      clearAiTouched();
      setNotice('✓ 章节提案已应用并保存到本地（未推远程）。');
      setChapterProposals([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const applyLevelProposals = () => {
    if (levelProposals.length === 0 || !aiTargetChapterId) return;
    try {
      const createdIds = applyAiLevelProposals(aiTargetChapterId, levelProposals);
      markAiTouchedLevels(createdIds);
      if (createdIds[0]) selectLevel(createdIds[0]);
      setNotice(`✓ 已写入 ${createdIds.length} 个关卡（高亮）。可用上下箭头排序，核对后保存。`);
      setLevelProposals([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const applyAndSaveLevels = async () => {
    if (levelProposals.length === 0 || !aiTargetChapterId) return;
    try {
      const createdIds = applyAiLevelProposals(aiTargetChapterId, levelProposals);
      markAiTouchedLevels(createdIds);
      if (createdIds[0]) selectLevel(createdIds[0]);
      await saveCatalog();
      clearAiTouched();
      setNotice('✓ 关卡提案已应用并保存到本地（未推远程）。');
      setLevelProposals([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (collapsed) {
    return (
      <div className="panel panel--assistant llm-panel llm-panel-collapsed" data-tour="ai-assistant">
        <button type="button" className="ai-rail-button" onClick={onToggleCollapsed} title="展开 AI 助手" aria-label="展开 AI 助手">
          <span aria-hidden>✦</span>
          <span>AI</span>
        </button>
      </div>
    );
  }

  return (
    <div className="panel panel--assistant llm-panel" data-tour="ai-assistant">
      <div className="panel-scroll">
        <div className="ai-header">
          <div className="ai-header-text">
            <h2>{modeMeta.title}</h2>
            <p>{modeMeta.subtitle}</p>
          </div>
          <button type="button" className="icon-btn ai-collapse-button" onClick={onToggleCollapsed} title="折叠 AI 助手" aria-label="折叠 AI 助手">
            →
          </button>
        </div>

        <div className="ai-model-status">
          <div>
            <span>当前模型</span>
            <strong>{model}</strong>
          </div>
          <span className={`api-status ${hasStoredKey ? 'is-ready' : ''}`}>
            <i />
            {hasStoredKey ? '已配置' : '未配置'}
          </span>
        </div>

        {editMode === 'catalog' && (
          <>
            <div className="ai-map-controls">
              <div className="ai-map-field">
                <span className="ai-map-field-label">助手模式</span>
                <div className="ai-map-segmented" role="group" aria-label="助手模式">
                  <button
                    type="button"
                    className={catalogAiMode === 'formula' ? 'is-active' : ''}
                    onClick={() => switchCatalogMode('formula')}
                  >
                    改公式
                  </button>
                  <button
                    type="button"
                    className={catalogAiMode === 'chapters' ? 'is-active' : ''}
                    onClick={() => switchCatalogMode('chapters')}
                  >
                    生成章节
                  </button>
                  <button
                    type="button"
                    className={catalogAiMode === 'levels' ? 'is-active' : ''}
                    onClick={() => switchCatalogMode('levels')}
                  >
                    生成关卡
                  </button>
                </div>
              </div>
            </div>

            {catalogAiMode === 'formula' && (
              <div className="ai-target-card">
                <div className="ai-target-row">
                  <span className="ai-target-label">1. 目标章节</span>
                  <SelectDropdown
                    size="sm"
                    className="ai-target-select"
                    value={aiTargetChapterId ?? ''}
                    options={chapterOptions}
                    placeholder={chapters.length > 0 ? '先选章节，例如章节四...' : '暂无章节'}
                    searchable
                    disabled={chapters.length === 0}
                    onChange={(value) => pickFormulaTargetChapter(value || null)}
                  />
                </div>
                <div className="ai-target-row">
                  <span className="ai-target-label">2. 目标关卡</span>
                  <SelectDropdown
                    size="sm"
                    className="ai-target-select"
                    value={selectedLevelId ?? ''}
                    options={levelOptions}
                    placeholder={
                      !aiTargetChapterId
                        ? '请先选择章节'
                        : levelOptions.length > 0
                          ? '再选该章下的关卡...'
                          : '该章暂无关卡'
                    }
                    searchable
                    disabled={!aiTargetChapterId || levelOptions.length === 0}
                    onChange={(value) => pickFormulaTargetLevel(value || null)}
                  />
                </div>
                <div className="ai-target-meta">
                  {selectedLevelLabel ? (
                    <span>应用位置：{selectedLevelLabel}</span>
                  ) : aiTargetChapterId ? (
                    <span>已选章节，请再选关卡；点「应用」后公式会写入该关编辑器。</span>
                  ) : (
                    <span>先选章节再选关卡。也可在左侧目录点选关卡。</span>
                  )}
                </div>
              </div>
            )}

            {catalogAiMode === 'chapters' && (
              <div className="ai-target-card">
                <div className="ai-target-meta">
                  <span>应用位置：目录末尾新建章节（提案可含初始关卡）。</span>
                </div>
              </div>
            )}

            {catalogAiMode === 'levels' && (
              <div className="ai-target-card">
                <div className="ai-target-row">
                  <span className="ai-target-label">目标章节</span>
                  <SelectDropdown
                    size="sm"
                    className="ai-target-select"
                    value={aiTargetChapterId ?? ''}
                    options={chapterOptions}
                    placeholder={chapters.length > 0 ? '选择章节，例如章节四...' : '暂无章节'}
                    searchable
                    disabled={chapters.length === 0}
                    onChange={(value) => {
                      selectAiTargetChapter(value || null);
                      setError(null);
                      setNotice(null);
                    }}
                  />
                </div>
                <div className="ai-target-meta">
                  {selectedChapterLabel ? (
                    <span>应用位置：写入「{selectedChapterLabel}」下方新关卡。</span>
                  ) : (
                    <span>先选章节；应用后关卡会出现在该章列表末尾。</span>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {editMode === 'levelSkillMap' && (
          <div className="ai-map-controls">
            <div className="ai-map-field">
              <span className="ai-map-field-label">配置范围</span>
              <div className="ai-map-segmented" role="group" aria-label="配置范围">
                {MAP_SCOPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={mapScope === opt.value ? 'is-active' : ''}
                    onClick={() => setMapScope(opt.value)}
                  >
                    {opt.shortLabel}
                  </button>
                ))}
              </div>
            </div>
            <p className={`ai-map-hint ${mapScope === 'selected' ? 'is-visible' : ''}`} aria-hidden={mapScope !== 'selected'}>
              {mapScope === 'selected'
                ? `已同步推荐配置页勾选：${aiMapLevelIds.length} 个关卡`
                : '\u00a0'}
            </p>
          </div>
        )}

        <button
          type="button"
          className="model-settings-toggle"
          onClick={() => setShowSettings((value) => !value)}
          aria-expanded={showSettings}
        >
          <span>模型设置</span>
          <span className={showSettings ? 'is-open' : ''}>⌄</span>
        </button>

        {showSettings && (
          <div className="ai-settings">
            <p className="hint-text">
              {hasStoredKey
                ? 'API Key 已加密保存在本机。'
                : <>请填入 DashScope API Key（<a href="https://bailian.console.aliyun.com/" target="_blank" rel="noopener noreferrer">前往阿里云百炼获取</a>）</>}
            </p>
            <input
              className="text-input"
              type="password"
              placeholder="DashScope API Key"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            <div className="btn-grid">
              <button type="button" className="btn btn-sm" disabled={!apiKeyInput.trim()} onClick={() => void handleSaveKey()}>保存 API Key</button>
              <button type="button" className="btn btn-danger btn-sm" disabled={!hasStoredKey} onClick={() => void handleClearKey()}>清除</button>
            </div>
            <ModelComboInput value={model} onChange={setModel} />
            {settingsNotice && <div className="banner banner-ok">{settingsNotice}</div>}
          </div>
        )}

        <div className="ai-prompt-card">
          <label className="ai-prompt-label" htmlFor="ai-instruction">
            {editMode === 'catalog' && catalogAiMode === 'formula' ? '训练目标' : '补充说明（可留空）'}
          </label>
          <textarea
            id="ai-instruction"
            className="ai-prompt-input"
            placeholder={modeMeta.placeholder}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={4}
          />

          {editMode === 'catalog' && catalogAiMode === 'formula' && (
            <div className="ai-options">
              <div className="ai-option-row">
                <span className="ai-option-label">类型</span>
                <div className="segmented">
                  {(['f2l', 'oll', 'pll'] as LevelFormulaTarget[]).map((t) => (
                    <button key={t} type="button" className={`chip ${target === t ? 'chip-active' : ''}`} onClick={() => setTarget(t)}>{t.toUpperCase()}</button>
                  ))}
                </div>
              </div>
              <div className="ai-option-row">
                <span className="ai-option-label">长度</span>
                <div className="segmented">
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <button key={d.key} type="button" className={`chip ${difficulty === d.key ? 'chip-active' : ''}`} onClick={() => setDifficulty(d.key)}>{d.label}</button>
                  ))}
                </div>
              </div>
              <div className="ai-option-row">
                <span className="ai-option-label">数量</span>
                <div className="count-stepper">
                  <button type="button" disabled={candidateCount <= 1} onClick={() => setCandidateCount((v) => Math.max(1, v - 1))} aria-label="减少">−</button>
                  <span>{candidateCount}</span>
                  <button type="button" disabled={candidateCount >= 6} onClick={() => setCandidateCount((v) => Math.min(6, v + 1))} aria-label="增加">＋</button>
                </div>
              </div>
            </div>
          )}

          <button type="button" className="btn btn-primary btn-block ai-generate-btn" disabled={loading} onClick={handleGenerate}>
            {loading ? <><span className="spinner" />生成中</> : modeMeta.actionLabel}
          </button>
        </div>

        {error && <div className="banner banner-error">{error}</div>}
        {notice && <div className="banner banner-ok">{notice}</div>}

        {editMode === 'catalog' && catalogAiMode === 'formula' && formulaCandidates.length > 0 && (
          <div className="panel-section">
            <p className="ai-results-header">公式候选 · {formulaCandidates.length}</p>
            {!selectedLevelId && (
              <div className="banner banner-error">请先完成上方「目标章节 → 目标关卡」，再点应用。</div>
            )}
            <div className="llm-results">
              {formulaCandidates.map((candidate, index) => (
                <div key={`${candidate.formula}-${index}`} className="llm-candidate">
                  <div className="llm-candidate-formula">{candidate.formula}</div>
                  {candidate.note && <div className="llm-candidate-note">{candidate.note}</div>}
                  <span className={`badge ${candidate.validation.ok ? 'badge-ready' : 'badge-error'}`}>
                    {candidate.validation.ok ? `${candidate.validation.stepCount} 步 · 可解析` : '解析失败'}
                  </span>
                  {!candidate.validation.ok && (
                    <div className="llm-candidate-note">{candidate.validation.message}</div>
                  )}
                  <div className="llm-candidate-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={!candidate.validation.ok || !selectedLevelId}
                      onClick={() => adoptFormula(candidate, 'rotation')}
                    >
                      应用为旋转公式
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={!candidate.validation.ok || !selectedLevelId}
                      onClick={() => adoptFormula(candidate, 'guidance')}
                    >
                      应用为指引公式
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {editMode === 'catalog' && catalogAiMode === 'chapters' && chapterProposals.length > 0 && (
          <div className="panel-section">
            <p className="ai-results-header">章节提案 · {chapterProposals.length}</p>
            <div className="llm-results">
              {chapterProposals.map((proposal, index) => (
                <div key={`${proposal.partName}-${index}`} className="llm-candidate">
                  <div className="llm-candidate-formula">
                    {proposal.partName} · {proposal.title}
                  </div>
                  <div className="llm-candidate-note">{proposal.description}</div>
                  {proposal.reason && <div className="llm-candidate-note">{proposal.reason}</div>}
                  <span className="badge badge-ready">
                    容量 {proposal.capacity}
                    {proposal.levels && proposal.levels.length > 0 ? ` · 含 ${proposal.levels.length} 关` : ''}
                  </span>
                  {proposal.levels?.map((level, levelIndex) => (
                    <div key={`${level.title}-${levelIndex}`} className="llm-candidate-note">
                      → {level.title} · {level.rotationFormula}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="llm-candidate-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={applyChapterProposals}>
                应用到目录（待保存）
              </button>
              <button type="button" className="btn btn-sm" onClick={() => void applyAndSaveChapters()}>
                应用并保存
              </button>
            </div>
          </div>
        )}

        {editMode === 'catalog' && catalogAiMode === 'levels' && levelProposals.length > 0 && (
          <div className="panel-section">
            <p className="ai-results-header">关卡提案 · {levelProposals.length}</p>
            {!aiTargetChapterId && (
              <div className="banner banner-error">请先选择「目标章节」，再点下方应用按钮。</div>
            )}
            <div className="llm-results">
              {levelProposals.map((proposal, index) => (
                <div key={`${proposal.title}-${index}`} className="llm-candidate">
                  <div className="llm-candidate-formula">{proposal.title}</div>
                  <div className="llm-candidate-note">{proposal.description}</div>
                  <div className="llm-candidate-note">公式：{proposal.rotationFormula}</div>
                  {proposal.reason && <div className="llm-candidate-note">{proposal.reason}</div>}
                  <span className="badge badge-ready">
                    {proposal.rotationTarget.toUpperCase()} · 上限 {proposal.maxMoves} 步
                  </span>
                </div>
              ))}
            </div>
            <div className="llm-candidate-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-sm btn-primary" disabled={!aiTargetChapterId} onClick={applyLevelProposals}>
                应用到目录（待保存）
              </button>
              <button type="button" className="btn btn-sm" disabled={!aiTargetChapterId} onClick={() => void applyAndSaveLevels()}>
                应用并保存
              </button>
            </div>
          </div>
        )}

        {editMode === 'skills' && skillProposals.length > 0 && (
          <div className="panel-section">
            <p className="ai-results-header">技能提案 · {skillProposals.length}</p>
            <div className="llm-results">
              {skillProposals.map((proposal) => (
                <div key={proposal.id} className="llm-candidate">
                  <div className="llm-candidate-formula">
                    [{proposal.action === 'create' ? '新建' : '更新'}] {proposal.displayNameZh}
                  </div>
                  <div className="llm-candidate-note">{proposal.goal}</div>
                  {proposal.reason && <div className="llm-candidate-note">{proposal.reason}</div>}
                  <span className="badge badge-ready">{proposal.stage} · {proposal.id}</span>
                </div>
              ))}
            </div>
            <div className="llm-candidate-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => void applySkillProposals()}>应用到技能页（待保存）</button>
              <button type="button" className="btn btn-sm" onClick={() => void applyAndSaveSkills()}>应用并保存</button>
            </div>
          </div>
        )}

        {editMode === 'levelSkillMap' && mappingProposals.length > 0 && (
          <div className="panel-section">
            <p className="ai-results-header">主标签提案 · {mappingProposals.length} 关</p>
            <div className="llm-results">
              {mappingProposals.map((proposal) => (
                <div key={proposal.levelId} className="llm-candidate">
                  <div className="llm-candidate-formula">{levelTitleById.get(proposal.levelId) ?? proposal.levelId}</div>
                  <div className="llm-candidate-note">
                    → {skillLabelById.get(proposal.skillId) ?? proposal.skillId}
                    {' · '}{proposal.teachMode} · 难度 {proposal.formulaDifficulty}
                    {proposal.reason ? ` · ${proposal.reason}` : ''}
                  </div>
                </div>
              ))}
            </div>
            <div className="llm-candidate-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => void applyMappingProposals()}>应用到推荐配置（待保存）</button>
              <button type="button" className="btn btn-sm" onClick={() => void applyAndSaveMappings()}>应用并保存</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
