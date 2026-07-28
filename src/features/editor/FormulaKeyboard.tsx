const QUICK_TOKENS = ['U', 'D', 'F', 'B', 'L', 'R', 'M', 'E', 'S', 'x', 'y', 'z'];

type FormulaKeyboardProps = {
  value: string;
  onChange: (next: string) => void;
};

export function FormulaKeyboard({ value, onChange }: FormulaKeyboardProps) {
  const append = (token: string) => {
    const trimmed = value.trimEnd();
    onChange(trimmed.length > 0 ? `${trimmed} ${token}` : token);
  };

  const applyModifierToLast = (modifier: "'" | '2') => {
    const tokens = value.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return;
    const last = tokens[tokens.length - 1];
    const base = last.replace(/['2]/g, '');
    tokens[tokens.length - 1] = modifier === "'" ? `${base}'` : `${base}2`;
    onChange(tokens.join(' '));
  };

  const backspace = () => {
    const tokens = value.trim().split(/\s+/).filter(Boolean);
    tokens.pop();
    onChange(tokens.join(' '));
  };

  return (
    <div className="formula-keyboard">
      <input
        className="text-input formula-text-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="例如 R U R' U'"
        spellCheck={false}
      />
      <div className="formula-key-grid">
        {QUICK_TOKENS.map((token) => (
          <button key={token} type="button" className="formula-key" onClick={() => append(token)}>{token}</button>
        ))}
        <button type="button" className="formula-key formula-key-mod" onClick={() => applyModifierToLast("'")}>'</button>
        <button type="button" className="formula-key formula-key-mod" onClick={() => applyModifierToLast('2')}>2</button>
        <button type="button" className="formula-key formula-key-danger" onClick={backspace}>⌫</button>
        <button type="button" className="formula-key formula-key-danger" onClick={() => onChange('')}>清空</button>
      </div>
      <p className="hint-text">小写 u/d/f/b/l/r 为宽转，M/E/S 为切片，x/y/z 为整体旋转；也可以直接在输入框里打字（支持 R2、(R U)2 等写法）。</p>
    </div>
  );
}
