import { createEmptyBlinkMaskMatrix, type BlinkMaskMatrix, type BrightnessMatrix } from '@/core/cube';

const FACE_NAMES = ['U', 'L', 'F', 'R', 'B', 'D'];
const EMPTY_BLINK = createEmptyBlinkMaskMatrix();

type Props = {
  brightnessMatrix: BrightnessMatrix;
  blinkMaskMatrix?: BlinkMaskMatrix | null;
  selectedFace: number;
  onSelectFace: (face: number) => void;
};

function MiniFace({
  faceIndex,
  brightnessRow,
  blinkRow,
  isSelected,
  onPress,
}: {
  faceIndex: number;
  brightnessRow: number[][];
  blinkRow: number[][];
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      className={`cross-preview-face ${isSelected ? 'cross-preview-face-selected' : ''}`}
      onClick={onPress}
      aria-label={`选择面 ${FACE_NAMES[faceIndex]}`}
    >
      <span className={`cross-preview-face-label ${isSelected ? 'is-selected' : ''}`}>
        {FACE_NAMES[faceIndex]}
      </span>
      {[0, 1, 2].map((row) => (
        <div key={row} className="cross-preview-row">
          {[0, 1, 2].map((col) => {
            const lit = (brightnessRow[row]?.[col] ?? 0) > 0;
            const blink = lit && (blinkRow[row]?.[col] ?? 0) > 0;
            return (
              <div
                key={col}
                className={[
                  'cross-preview-cell',
                  lit ? 'cross-preview-cell-on' : '',
                  blink ? 'cross-preview-cell-blink' : '',
                ].filter(Boolean).join(' ')}
              />
            );
          })}
        </div>
      ))}
    </button>
  );
}

export function BrightnessCrossPreview({
  brightnessMatrix,
  blinkMaskMatrix = null,
  selectedFace,
  onSelectFace,
}: Props) {
  const blink = blinkMaskMatrix ?? EMPTY_BLINK;
  const renderFace = (faceIndex: number) => (
    <MiniFace
      faceIndex={faceIndex}
      brightnessRow={brightnessMatrix[faceIndex]}
      blinkRow={blink[faceIndex]}
      isSelected={faceIndex === selectedFace}
      onPress={() => onSelectFace(faceIndex)}
    />
  );

  return (
    <div className="cross-preview">
      <span className="cross-preview-label">选择面</span>
      <span className="cross-preview-legend">深灰=灭 · 绿=亮 · 品红=闪烁</span>
      <div className="cross-preview-layout">
        <div className="cross-preview-line">
          <div className="cross-preview-spacer" />
          {renderFace(0)}
          <div className="cross-preview-spacer" />
          <div className="cross-preview-spacer" />
        </div>
        <div className="cross-preview-line">
          {renderFace(1)}
          {renderFace(2)}
          {renderFace(3)}
          {renderFace(4)}
        </div>
        <div className="cross-preview-line">
          <div className="cross-preview-spacer" />
          {renderFace(5)}
          <div className="cross-preview-spacer" />
          <div className="cross-preview-spacer" />
        </div>
      </div>
    </div>
  );
}
