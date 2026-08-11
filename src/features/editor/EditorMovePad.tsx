import { useMemo, type CSSProperties } from 'react';
import { colorIndexToHex } from '@/core/cube';
import { formatLevelDebugOrientation } from '@/core/levels';
import {
  resolveOrientationRecord,
  type DevCustomColor,
  type DevCustomOrientation,
} from '@/core/formula';

const FACE_TOKENS = ['U', 'D', 'F', 'B', 'L', 'R'] as const;

type EditorMovePadProps = {
  onMove: (token: string) => void;
  orientation: DevCustomOrientation;
};

export function EditorMovePad({ onMove, orientation }: EditorMovePadProps) {
  const faces = useMemo(() => {
    const { faceToColor } = resolveOrientationRecord(orientation);
    return FACE_TOKENS.map((token) => {
      const colorIndex = faceToColor[token] as DevCustomColor;
      return {
        token,
        label: token,
        color: colorIndexToHex(colorIndex),
      };
    });
  }, [orientation]);

  const gripLabel = useMemo(
    () => formatLevelDebugOrientation(orientation),
    [orientation],
  );

  return (
    <section className="editor-move-pad" aria-label="手动转动">
      <div className="editor-move-pad-header">
        <strong>手动转动</strong>
        <p className="editor-move-pad-hint">键位为握持字母：U=顶色面，F=前色面</p>
        <p className="editor-move-pad-grip" title={gripLabel}>握持 · {gripLabel}</p>
      </div>

      <div className="editor-move-pad-grid">
        {faces.map((face) => (
          <button
            key={face.token}
            type="button"
            className="editor-move-pad-btn editor-move-pad-btn--cw"
            style={{ '--move-face-color': face.color } as CSSProperties}
            onClick={() => onMove(face.token)}
            title={`握持 ${face.label} 顺时针 90°`}
          >
            <span className="editor-move-pad-face">{face.label}</span>
            <span className="editor-move-pad-dir">90°</span>
          </button>
        ))}
      </div>

      <div className="editor-move-pad-grid editor-move-pad-grid--prime">
        {faces.map((face) => (
          <button
            key={`${face.token}-prime`}
            type="button"
            className="editor-move-pad-btn editor-move-pad-btn--ccw"
            style={{ '--move-face-color': face.color } as CSSProperties}
            onClick={() => onMove(`${face.token}'`)}
            title={`握持 ${face.label} 逆时针 90°`}
          >
            <span className="editor-move-pad-face">{face.label}′</span>
            <span className="editor-move-pad-dir">90°</span>
          </button>
        ))}
      </div>
    </section>
  );
}
