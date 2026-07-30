import { useEffect, useMemo, useRef, useState } from 'react';
import { useCatalogStore } from '@/shared/store/useCatalogStore';
import { useUiStore } from '@/shared/store/useUiStore';
import { useSkillGraphStore } from '@/shared/store/useSkillGraphStore';
import { useLevelSkillMapStore } from '@/shared/store/useLevelSkillMapStore';
import { SelectDropdown } from '@/shared/ui/SelectDropdown';
import { deriveLevelFormulaPreset, type LevelFormulaTarget } from '@/core/levels';
import {
  buildFormulaSystemPrompt,
  buildLevelSummaries,
  buildMappingSystemPrompt,
  buildSkillSystemPrompt,
  filterLevelsForMapScope,
  type MapScope,
} from './aiPrompts';
import {
  parseMappingProposals,
  parseSkillProposals,
  type AiMappingProposal,
  type AiSkillProposal,
} from './aiParsers';

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
  const aiMapLevelIds = useUiStore((s) => s.aiMapLevelIds);

  const levels = useCatalogStore((s) => s.levels);
  const chapters = useCatalogStore((s) => s.chapters);
  const isCatalogLoaded = useCatalogStore((s) => s.isLoaded);
  const refreshCatalog = useCatalogStore((s) => s.refreshCatalog);

  const skills = useSkillGraphStore((s) => s.skills);
  const skillGraph = useSkillGraphStore((s) => s.skillGraph);
  const applyAiSkillProposals = useSkillGraphStore((s) => s.applyAiSkillProposals);
  const saveSkillGraph = useSkillGraphStore((s) => s.saveSkillGraph);

  const levelSkillMap = useLevelSkillMapStore((s) => s.levelSkillMap);
  const applyAiMappings = useLevelSkillMapStore((s) => s.applyAiMappings);
  const saveMap = useLevelSkillMapStore((s) => s.saveMap);

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
  const [mapMode, setMapMode] = useState<'merge' | 'replace'>('merge');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [formulaCandidates, setFormulaCandidates] = useState<FormulaCandidate[]>([]);
  const [skillProposals, setSkillProposals] = useState<AiSkillProposal[]>([]);
  const [mappingProposals, setMappingProposals] = useState<AiMappingProposal[]>([]);

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
  }, [editMode]);

  const modeMeta = useMemo(() => {
    if (editMode === 'skills') {
      return {
        title: 'AI 技能助手',
        subtitle: '描述教学目标，AI 生成或补充技能节点，确认后一键应用',
        placeholder: '例如：为 F2L 阶段补充「角块在底層」相关技能，按从易到难排列…',
        actionLabel: 'AI 生成技能提案',
      };
    }
    if (editMode === 'levelSkillMap') {
      return {
        title: 'AI 映射助手',
        subtitle: '根据关卡内容与技能树，AI 自动填写关卡-技能映射',
        placeholder: '可选：补充映射偏好，例如「入门关用 guided、挑战关用 challenge」…',
        actionLabel: 'AI 自动映射',
      };
    }
    return {
      title: 'AI 公式助手',
      subtitle: '描述训练目标，AI 生成候选公式',
      placeholder: '例如：训练识别顶层十字的边块位置，只需处理一个错位边块…',
      actionLabel: '生成候选公式',
    };
  }, [editMode]);

  const difficultyHint = useMemo(
    () => DIFFICULTY_OPTIONS.find((d) => d.key === difficulty)?.hint ?? '',
    [difficulty],
  );

  const levelOptions = useMemo(() => {
    return levels.map((level) => {
      const chapter = chapters.find((c) => c.id === level.chapterId);
      const chapterLabel = chapter ? `${chapter.partName} ${chapter.title}` : level.chapterId;
      return { value: level.id, label: `${chapterLabel} / ${level.title}` };
    });
  }, [levels, chapters]);

  const selectedLevelLabel = useMemo(
    () => levelOptions.find((option) => option.value === selectedLevelId)?.label ?? '',
    [levelOptions, selectedLevelId],
  );

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
      const validSkillIds = new Set(skills.map((s) => s.id));
      setMappingProposals(parseMappingProposals(content, validLevelIds, validSkillIds));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = () => {
    if (editMode === 'skills') void handleGenerateSkills();
    else if (editMode === 'levelSkillMap') void handleGenerateMappings();
    else void handleGenerateFormula();
  };

  const adoptFormula = (candidate: FormulaCandidate, kind: 'rotation' | 'guidance') => {
    setError(null);
    setNotice(null);
    if (!selectedLevelId) {
      setError('请先在「应用到关卡」中选择目标关卡。');
      return;
    }
    requestFormulaAdoption({ kind, formula: candidate.formula, target });
    if (editMode !== 'catalog') {
      onSwitchToCatalog?.();
      setNotice('已写入待应用公式，已切换到「关卡编辑」。请在对应 Tab 检查后保存。');
      return;
    }
    setNotice('已写入当前关卡编辑器。请在对应 Tab 检查后保存关卡。');
  };

  const applySkillProposals = async () => {
    if (skillProposals.length === 0) return;
    try {
      const { created, updated } = applyAiSkillProposals(skillProposals);
      setNotice(`✓ 已应用 ${created} 个新建、${updated} 个更新。请在左侧技能页核对后点击「保存」。`);
      setSkillProposals([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const applyMappingProposals = async () => {
    if (mappingProposals.length === 0) return;
    try {
      const applied = applyAiMappings(
        mappingProposals.map((p) => ({
          levelId: p.levelId,
          bindings: p.skills.map(({ skillId, cfopStage, teachMode, formulaDifficulty }) => ({
            skillId,
            cfopStage,
            teachMode,
            formulaDifficulty,
          })),
        })),
        mapMode,
      );
      setNotice(`✓ 已应用 ${applied} 个关卡的映射。请在映射页核对后点击「保存」。`);
      setMappingProposals([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const applyAndSaveSkills = async () => {
    if (skillProposals.length === 0) return;
    try {
      applyAiSkillProposals(skillProposals);
      await saveSkillGraph();
      setNotice('✓ 技能提案已应用并保存到云端。');
      setSkillProposals([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const applyAndSaveMappings = async () => {
    if (mappingProposals.length === 0) return;
    try {
      applyAiMappings(
        mappingProposals.map((p) => ({
          levelId: p.levelId,
          bindings: p.skills.map(({ skillId, cfopStage, teachMode, formulaDifficulty }) => ({
            skillId,
            cfopStage,
            teachMode,
            formulaDifficulty,
          })),
        })),
        mapMode,
      );
      await saveMap();
      setNotice('✓ 映射提案已应用并保存到云端。');
      setMappingProposals([]);
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
          <div className="ai-target-card">
            <div className="ai-target-row">
              <span className="ai-target-label">应用到关卡</span>
              <SelectDropdown
                size="sm"
                className="ai-target-select"
                value={selectedLevelId ?? ''}
                options={levelOptions}
                placeholder={levels.length > 0 ? '选择要应用的关卡...' : '暂无可选关卡'}
                searchable
                disabled={levels.length === 0}
                onChange={(value) => {
                  selectLevel(value || null);
                  setError(null);
                  setNotice(null);
                }}
              />
            </div>
            <div className="ai-target-meta">
              {selectedLevelLabel ? (
                <span>当前：{selectedLevelLabel}</span>
              ) : (
                <span>未选择关卡，候选公式无法落地到编辑器。</span>
              )}
            </div>
          </div>
        )}

        {editMode === 'levelSkillMap' && (
          <div className="ai-map-controls">
            <div className="ai-map-field">
              <span className="ai-map-field-label">映射范围</span>
              <div className="ai-map-segmented" role="group" aria-label="映射范围">
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
            <div className="ai-map-field">
              <span className="ai-map-field-label">应用方式</span>
              <div className="ai-map-segmented" role="group" aria-label="应用方式">
                <button type="button" className={mapMode === 'merge' ? 'is-active' : ''} onClick={() => setMapMode('merge')}>合并</button>
                <button type="button" className={mapMode === 'replace' ? 'is-active' : ''} onClick={() => setMapMode('replace')}>覆盖</button>
              </div>
            </div>
            <p className={`ai-map-hint ${mapScope === 'selected' ? 'is-visible' : ''}`} aria-hidden={mapScope !== 'selected'}>
              {mapScope === 'selected'
                ? `已同步映射页勾选：${aiMapLevelIds.length} 个关卡`
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
            {editMode === 'catalog' ? '训练目标' : '补充说明（可留空）'}
          </label>
          <textarea
            id="ai-instruction"
            className="ai-prompt-input"
            placeholder={modeMeta.placeholder}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={4}
          />

          {editMode === 'catalog' && (
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

        {editMode === 'catalog' && formulaCandidates.length > 0 && (
          <div className="panel-section">
            <p className="ai-results-header">公式候选 · {formulaCandidates.length}</p>
            <div className="llm-results">
              {formulaCandidates.map((candidate, index) => (
                <div key={`${candidate.formula}-${index}`} className="llm-candidate">
                  <div className="llm-candidate-formula">{candidate.formula}</div>
                  {candidate.note && <div className="llm-candidate-note">{candidate.note}</div>}
                  <span className={`badge ${candidate.validation.ok ? 'badge-ready' : 'badge-error'}`}>
                    {candidate.validation.ok ? `${candidate.validation.stepCount} 步 · 可解析` : '解析失败'}
                  </span>
                  <div className="llm-candidate-actions">
                    <button type="button" className="btn btn-sm" disabled={!candidate.validation.ok} onClick={() => adoptFormula(candidate, 'rotation')}>旋转公式</button>
                    <button type="button" className="btn btn-sm" disabled={!candidate.validation.ok} onClick={() => adoptFormula(candidate, 'guidance')}>指引公式</button>
                  </div>
                </div>
              ))}
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
            <p className="ai-results-header">映射提案 · {mappingProposals.length} 关</p>
            <div className="llm-results">
              {mappingProposals.map((proposal) => (
                <div key={proposal.levelId} className="llm-candidate">
                  <div className="llm-candidate-formula">{levelTitleById.get(proposal.levelId) ?? proposal.levelId}</div>
                  {proposal.skills.length === 0 ? (
                    <div className="llm-candidate-note">（无绑定）</div>
                  ) : (
                    proposal.skills.map((binding) => (
                      <div key={binding.skillId} className="llm-candidate-note">
                        → {skillLabelById.get(binding.skillId) ?? binding.skillId}
                        {' · '}{binding.teachMode} · 难度 {binding.formulaDifficulty}
                        {binding.reason ? ` · ${binding.reason}` : ''}
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
            <div className="llm-candidate-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => void applyMappingProposals()}>应用到映射页（待保存）</button>
              <button type="button" className="btn btn-sm" onClick={() => void applyAndSaveMappings()}>应用并保存</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
