import type { CSSProperties } from 'react';

const MOVE_FACES = [
  { token: 'U', label: 'U', color: '#e7e5e4', text: '#44403c' },
  { token: 'D', label: 'D', color: '#facc15', text: '#713f12' },
  { token: 'F', label: 'F', color: '#22c55e', text: '#14532d' },
  { token: 'B', label: 'B', color: '#3b82f6', text: '#1e3a8a' },
  { token: 'L', label: 'L', color: '#f97316', text: '#7c2d12' },
  { token: 'R', label: 'R', color: '#ef4444', text: '#7f1d1d' },
] as const;

type EditorMovePadProps = {
  onMove: (token: string) => void;
};

export function EditorMovePad({ onMove }: EditorMovePadProps) {
  return (
    <section className="editor-move-pad" aria-label="手动转动">
      <div className="editor-move-pad-header">
        <strong>手动转动</strong>
        <span>白顶 · 绿前</span>
      </div>

      <div className="editor-move-pad-grid">
        {MOVE_FACES.map((face) => (
          <button
            key={face.token}
            type="button"
            className="editor-move-pad-btn editor-move-pad-btn--cw"
            style={{
              '--move-face-color': face.color,
              '--move-face-text': face.text,
            } as CSSProperties}
            onClick={() => onMove(face.token)}
            title={`${face.label} 顺时针 90°`}
          >
            <span className="editor-move-pad-face">{face.label}</span>
            <span className="editor-move-pad-dir">90°</span>
          </button>
        ))}
      </div>

      <div className="editor-move-pad-grid editor-move-pad-grid--prime">
        {MOVE_FACES.map((face) => (
          <button
            key={`${face.token}-prime`}
            type="button"
            className="editor-move-pad-btn editor-move-pad-btn--ccw"
            style={{
              '--move-face-color': face.color,
              '--move-face-text': face.text,
            } as CSSProperties}
            onClick={() => onMove(`${face.token}'`)}
            title={`${face.label} 逆时针 90°`}
          >
            <span className="editor-move-pad-face">{face.label}′</span>
            <span className="editor-move-pad-dir">90°</span>
          </button>
        ))}
      </div>
    </section>
  );
}
