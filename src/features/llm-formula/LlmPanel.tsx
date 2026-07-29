import { useEffect, useMemo, useRef, useState } from 'react';
import { useUiStore } from '@/shared/store/useUiStore';
import { deriveLevelFormulaPreset, type LevelFormulaTarget } from '@/core/levels';

const API_KEY_STORAGE_KEY = 'dashscope-api-key';
const MODEL_PRESETS = ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long', 'qwen-vl-plus'];
const DIFFICULTY_OPTIONS: { key: 'short' | 'medium' | 'long'; label: string; hint: string }[] = [
  { key: 'short', label: '短', hint: '4-6 步，适合入门关卡' },
  { key: 'medium', label: '中', hint: '7-12 步，适合中期关卡' },
  { key: 'long', label: '长', hint: '13-20 步，适合挑战关卡' },
];

type Candidate = {
  raw: string;
  formula: string;
  note: string;
  validation:
    | { ok: true; stepCount: number }
    | { ok: false; message: string };
};

const buildSystemPrompt = (target: LevelFormulaTarget, difficulty: string): string => `你是魔方公式设计助手，服务于 cube-level-generator 关卡编辑工具。
用户会描述一个教学目标（例如某个 skill 点、某类贴纸识别）。你需要给出候选魔方公式（记谱），用于生成关卡的旋转/指引公式。

严格要求：
- 目标类型：${target.toUpperCase()}（f2l=还原前两层部分状态，oll=顶层朝向，pll=顶层排列）
- 难度：${difficulty}
- 记谱只能使用标准 WCA 记号：U D F B L R（可加 ' 或 2），宽转 u d f b l r，切片 M E S，整体旋转 x y z
- 严禁输出中文说明混入公式本体，公式与说明用 " :: " 分隔
- 每行一个候选，格式固定为：<序号>. <公式> :: <一句话说明这个公式训练的技能点>
- 不要输出任何其他文字、前后缀说明或 markdown 代码块`;

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
};

export function LlmPanel({ collapsed = false, onToggleCollapsed }: LlmPanelProps) {
  const requestFormulaAdoption = useUiStore((s) => s.requestFormulaAdoption);
  const selectedLevelId = useUiStore((s) => s.selectedLevelId);

  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [model, setModel] = useState('qwen-plus');
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);

  const [goalDescription, setGoalDescription] = useState('');
  const [target, setTarget] = useState<LevelFormulaTarget>('f2l');
  const [difficulty, setDifficulty] = useState<'short' | 'medium' | 'long'>('short');
  const [candidateCount, setCandidateCount] = useState(3);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  useEffect(() => {
    void window.api.secrets.has(API_KEY_STORAGE_KEY).then(setHasStoredKey);
  }, []);

  const difficultyHint = useMemo(
    () => DIFFICULTY_OPTIONS.find((d) => d.key === difficulty)?.hint ?? '',
    [difficulty],
  );

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

  const parseCandidates = (text: string): Candidate[] => {
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    const results: Candidate[] = [];
    for (const line of lines) {
      const match = line.match(/^\d+[.、)]\s*(.+?)\s*::\s*(.+)$/);
      const formula = (match ? match[1] : line).trim();
      const note = match ? match[2].trim() : '';
      if (!formula) continue;
      let validation: Candidate['validation'];
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

  const handleGenerate = async () => {
    setError(null);
    setCandidates([]);
    const apiKey = await window.api.secrets.get(API_KEY_STORAGE_KEY);
    if (!apiKey) {
      setError('请先在设置中保存 DashScope API Key。');
      setShowSettings(true);
      return;
    }
    if (!goalDescription.trim()) {
      setError('请描述训练目标。');
      return;
    }

    setLoading(true);
    try {
      const prompt = `教学目标描述：${goalDescription.trim()}\n请给出 ${candidateCount} 条候选公式。`;
      const content = await window.api.dashscope.generate({
        apiKey,
        model,
        prompt,
        systemPrompt: buildSystemPrompt(target, `${difficulty}（${difficultyHint}）`),
      });
      const parsed = parseCandidates(content);
      if (parsed.length === 0) {
        setError('模型没有返回可解析的候选公式，请重试或调整描述。');
      }
      setCandidates(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const adopt = (candidate: Candidate, kind: 'rotation' | 'guidance') => {
    if (!selectedLevelId) {
      setError('请先在左侧选择一个关卡。');
      return;
    }
    requestFormulaAdoption({ kind, formula: candidate.formula, target });
  };

  if (collapsed) {
    return (
      <div className="panel panel--assistant llm-panel llm-panel-collapsed">
        <button type="button" className="ai-rail-button" onClick={onToggleCollapsed} title="展开公式助手" aria-label="展开公式助手">
          <span aria-hidden>✦</span>
          <span>AI</span>
        </button>
      </div>
    );
  }

  return (
    <div className="panel panel--assistant llm-panel">
      <div className="panel-scroll">
        <div className="ai-header">
          <div className="ai-header-text">
            <h2>公式助手</h2>
            <p>描述训练目标，AI 生成候选公式</p>
          </div>
          <button type="button" className="icon-btn ai-collapse-button" onClick={onToggleCollapsed} title="折叠公式助手" aria-label="折叠公式助手">
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
          <label className="ai-prompt-label" htmlFor="training-goal">训练目标</label>
          <textarea
            id="training-goal"
            className="ai-prompt-input"
            placeholder="例如：训练识别顶层十字的边块位置，只需处理一个错位边块…"
            value={goalDescription}
            onChange={(e) => setGoalDescription(e.target.value)}
            rows={4}
          />

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
                <button type="button" disabled={candidateCount <= 1} onClick={() => setCandidateCount((value) => Math.max(1, value - 1))} aria-label="减少生成数量">−</button>
                <span>{candidateCount}</span>
                <button type="button" disabled={candidateCount >= 6} onClick={() => setCandidateCount((value) => Math.min(6, value + 1))} aria-label="增加生成数量">＋</button>
              </div>
            </div>
          </div>

          <button type="button" className="btn btn-primary btn-block ai-generate-btn" disabled={loading} onClick={() => void handleGenerate()}>
            {loading ? <><span className="spinner" />生成中</> : '生成候选公式'}
          </button>
        </div>

        {error && <div className="banner banner-error">{error}</div>}

        {candidates.length > 0 && (
          <div className="panel-section">
            <p className="ai-results-header">生成结果 · {candidates.length}</p>
            <div className="llm-results">
              {candidates.map((candidate, index) => (
                <div key={`${candidate.formula}-${index}`} className="llm-candidate">
                  <div className="llm-candidate-formula">{candidate.formula}</div>
                  {candidate.note && <div className="llm-candidate-note">{candidate.note}</div>}
                  <span className={`badge ${candidate.validation.ok ? 'badge-ready' : 'badge-error'}`}>
                    {candidate.validation.ok ? `${candidate.validation.stepCount} 步 · 可解析` : '解析失败'}
                  </span>
                  <div className="llm-candidate-actions">
                    <button type="button" className="btn btn-sm" disabled={!candidate.validation.ok} onClick={() => adopt(candidate, 'rotation')}>旋转公式</button>
                    <button type="button" className="btn btn-sm" disabled={!candidate.validation.ok} onClick={() => adopt(candidate, 'guidance')}>指引公式</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
