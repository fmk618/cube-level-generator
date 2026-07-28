import { useEffect, useMemo, useState } from 'react';
import { useUiStore } from '@/shared/store/useUiStore';
import { deriveLevelFormulaPreset, type LevelFormulaTarget } from '@/core/levels';

const API_KEY_STORAGE_KEY = 'dashscope-api-key';
const MODEL_OPTIONS = ['qwen-turbo', 'qwen-plus', 'qwen-max'];
const DIFFICULTY_OPTIONS: { key: 'short' | 'medium' | 'long'; label: string; hint: string }[] = [
  { key: 'short', label: '短公式', hint: '4-6 步，适合入门关卡' },
  { key: 'medium', label: '中等', hint: '7-12 步，适合中期关卡' },
  { key: 'long', label: '长公式', hint: '13-20 步，适合挑战关卡' },
];

type Candidate = {
  raw: string;
  formula: string;
  note: string;
  validation:
    | { ok: true; stepCount: number }
    | { ok: false; message: string };
};

const buildSystemPrompt = (target: LevelFormulaTarget, difficulty: string): string => `你是魔方公式设计助手，服务于 LiberCube 智能魔方关卡工厂。
用户会描述一个教学目标（例如某个 skill 点、某类贴纸识别）。你需要给出候选魔方公式（记谱），用于生成关卡的旋转/指引公式。

严格要求：
- 目标类型：${target.toUpperCase()}（f2l=还原前两层部分状态，oll=顶层朝向，pll=顶层排列）
- 难度：${difficulty}
- 记谱只能使用标准 WCA 记号：U D F B L R（可加 ' 或 2），宽转 u d f b l r，切片 M E S，整体旋转 x y z
- 严禁输出中文说明混入公式本体，公式与说明用 " :: " 分隔
- 每行一个候选，格式固定为：<序号>. <公式> :: <一句话说明这个公式训练的技能点>
- 不要输出任何其他文字、前后缀说明或 markdown 代码块`;

export function LlmPanel() {
  const requestFormulaAdoption = useUiStore((s) => s.requestFormulaAdoption);
  const selectedLevelId = useUiStore((s) => s.selectedLevelId);

  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [model, setModel] = useState(MODEL_OPTIONS[1]);
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
      setError('请描述这个关卡想训练的目标 / skill。');
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
      setError('请先在左侧选择一个关卡，再采纳候选公式。');
      return;
    }
    requestFormulaAdoption({ kind, formula: candidate.formula, target });
  };

  return (
    <div className="panel llm-panel">
      <div className="panel-header">
        <h2>LLM 公式助手</h2>
        <button className="icon-btn" onClick={() => setShowSettings((v) => !v)}>⚙</button>
      </div>

      {showSettings && (
        <div className="llm-settings">
          <p className="hint-text">
            {hasStoredKey ? 'DashScope API Key 已保存（加密存储在本机）。' : '尚未配置 DashScope API Key。'}
          </p>
          <input
            className="text-input"
            type="password"
            placeholder="输入通义千问 DashScope API Key"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
          />
          <div className="field-row">
            <button className="btn btn-primary" onClick={() => void handleSaveKey()}>保存 Key</button>
            <button className="btn btn-danger" disabled={!hasStoredKey} onClick={() => void handleClearKey()}>清除 Key</button>
          </div>
          <label>模型
            <select className="text-input" value={model} onChange={(e) => setModel(e.target.value)}>
              {MODEL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          {settingsNotice && <div className="banner banner-ok">{settingsNotice}</div>}
        </div>
      )}

      <div className="llm-form">
        <label>教学目标 / 训练点描述
          <textarea
            className="text-input"
            placeholder="例如：训练识别顶层十字的边块位置，只需要处理一个错位的边块"
            value={goalDescription}
            onChange={(e) => setGoalDescription(e.target.value)}
          />
        </label>
        <div className="field-row">
          {(['f2l', 'oll', 'pll'] as LevelFormulaTarget[]).map((t) => (
            <button key={t} className={`chip ${target === t ? 'chip-active' : ''}`} onClick={() => setTarget(t)}>{t.toUpperCase()}</button>
          ))}
        </div>
        <div className="field-row">
          {DIFFICULTY_OPTIONS.map((d) => (
            <button key={d.key} className={`chip ${difficulty === d.key ? 'chip-active' : ''}`} onClick={() => setDifficulty(d.key)}>{d.label}</button>
          ))}
        </div>
        <label>候选数量
          <input
            className="text-input"
            type="number"
            min={1}
            max={6}
            value={candidateCount}
            onChange={(e) => setCandidateCount(Math.min(6, Math.max(1, Number(e.target.value) || 1)))}
          />
        </label>
        <button className="btn btn-primary btn-block" disabled={loading} onClick={() => void handleGenerate()}>
          {loading ? '生成中…' : '生成候选公式'}
        </button>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="llm-results">
        {candidates.map((candidate, index) => (
          <div key={`${candidate.formula}-${index}`} className="llm-candidate">
            <div className="llm-candidate-formula">{candidate.formula}</div>
            {candidate.note && <div className="llm-candidate-note">{candidate.note}</div>}
            <div className={`badge ${candidate.validation.ok ? 'badge-ready' : 'badge-error'}`}>
              {candidate.validation.ok ? `可解析 · ${candidate.validation.stepCount} 步` : `解析失败：${candidate.validation.message}`}
            </div>
            <div className="field-row">
              <button className="btn" disabled={!candidate.validation.ok} onClick={() => adopt(candidate, 'rotation')}>作为旋转公式采纳</button>
              <button className="btn" disabled={!candidate.validation.ok} onClick={() => adopt(candidate, 'guidance')}>作为指引公式采纳</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
