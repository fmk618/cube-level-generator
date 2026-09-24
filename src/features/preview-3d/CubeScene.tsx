import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  makeInitialCube,
  findBrightnessByStateId,
  findColorByStateId,
  colorIndexToHex,
  rotateStateMatrixLayer,
  INITIAL_COLOR_MATRIX,
  getAffectedCubeletIds,
  createTurnSnapshot,
  applyTurnToCubelets,
  qFromAxisAngle,
  qMul,
  type ActiveTurn,
  type Axis,
  type BlinkMaskMatrix,
  type BrightnessMatrix,
  type ColorMatrix,
  type Cubelet,
  type StateMatrix,
  type TurnDir,
  type Vec3,
} from '@/core/cube';
import type { FormulaLayerMove, GuidanceArrowMove } from '@/core/formula';
import { GuidanceArrow } from '@/features/guidance-preview';
import { blendByBrightness } from './colorBlend';

const STEP = 0.54;
const CUBELET_SIZE = STEP * 0.92;
const BODY_COLOR = '#252A34';
const LED_OFF_COLOR = '#A8A8B0';
const TURN_DURATION_MS = 220;

function getVisualFaceColors(
  cubelet: Cubelet,
  colorMatrix: ColorMatrix,
  brightnessMatrix: BrightnessMatrix,
  dimUnlitWithFaceColor: boolean,
): string[] {
  return cubelet.stickerIds.map((stickerId, i) => {
    if (stickerId < 0) return cubelet.faceColors[i];
    const brightness = findBrightnessByStateId(stickerId, brightnessMatrix);
    const faceHex = colorIndexToHex(findColorByStateId(stickerId, colorMatrix));
    if (brightness <= 0) {
      return dimUnlitWithFaceColor ? blendByBrightness(faceHex, 0.28) : LED_OFF_COLOR;
    }
    return faceHex;
  });
}

type CubeletMeshProps = {
  cubelet: Cubelet;
  colorMatrix: ColorMatrix;
  brightnessMatrix: BrightnessMatrix;
  overlayBrightnessMatrix?: BrightnessMatrix | null;
  blinkMaskMatrix?: BlinkMaskMatrix | null;
  dimUnlitWithFaceColor?: boolean;
  activeTurn: ActiveTurn | null;
  progress: number;
};

function rotateVecAroundAxis(pos: Vec3, axis: Axis, angle: number): Vec3 {
  const v = new THREE.Vector3(pos[0], pos[1], pos[2]);
  const axisVec =
    axis === 'x' ? new THREE.Vector3(1, 0, 0)
      : axis === 'y' ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
  v.applyAxisAngle(axisVec, angle);
  return [v.x, v.y, v.z];
}

function CubeletMesh({
  cubelet,
  colorMatrix,
  brightnessMatrix,
  overlayBrightnessMatrix = null,
  blinkMaskMatrix = null,
  dimUnlitWithFaceColor = false,
  activeTurn,
  progress,
}: CubeletMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const blinkMetaRef = useRef<Array<{ blink: boolean; faceColor: string }>>([]);

  const visualFaceColors = useMemo(
    () => getVisualFaceColors(cubelet, colorMatrix, brightnessMatrix, dimUnlitWithFaceColor),
    [cubelet, colorMatrix, brightnessMatrix, dimUnlitWithFaceColor],
  );

  const materials = useMemo(() => {
    const order = [2, 3, 0, 1, 4, 5];
    const chaseMark = 11;
    const blinkMeta: Array<{ blink: boolean; faceColor: string }> = [];
    const next = order.map((faceIdx) => {
      const stickerId = cubelet.stickerIds[faceIdx];
      if (stickerId < 0) {
        blinkMeta.push({ blink: false, faceColor: BODY_COLOR });
        return new THREE.MeshStandardMaterial({
          color: BODY_COLOR,
          roughness: 0.8,
          metalness: 0.02,
        });
      }
      const base = findBrightnessByStateId(stickerId, brightnessMatrix);
      const overlay = overlayBrightnessMatrix
        ? findBrightnessByStateId(stickerId, overlayBrightnessMatrix)
        : 0;
      const faceHex = colorIndexToHex(findColorByStateId(stickerId, colorMatrix));
      const isBlink = Boolean(blinkMaskMatrix)
        && findBrightnessByStateId(stickerId, blinkMaskMatrix) > 0
        && base > 0;
      blinkMeta.push({ blink: isBlink, faceColor: faceHex });
      const isChaseLit = Boolean(overlayBrightnessMatrix) && overlay >= chaseMark;
      const brightness = Math.min(1, Math.max(base, isChaseLit ? 10 : overlay) / 10);
      const faceColor = visualFaceColors[faceIdx];
      const color = blendByBrightness(faceColor, brightness);
      return new THREE.MeshStandardMaterial({
        color,
        roughness: isChaseLit || isBlink ? 0.35 : 0.55,
        metalness: isChaseLit || isBlink ? 0.12 : 0.04,
        envMapIntensity: 0.5,
        emissive: isChaseLit
          ? new THREE.Color('#22d3ee')
          : isBlink
            ? new THREE.Color(faceHex)
            : overlay > base
              ? new THREE.Color(faceColor)
              : new THREE.Color('#000000'),
        emissiveIntensity: isChaseLit ? 0.9 : isBlink ? 0.4 : overlay > base ? 0.25 : 0,
      });
    });
    blinkMetaRef.current = blinkMeta;
    return next;
  }, [
    visualFaceColors,
    cubelet.stickerIds,
    brightnessMatrix,
    overlayBrightnessMatrix,
    blinkMaskMatrix,
    colorMatrix,
  ]);

  useFrame(({ clock }) => {
    const meta = blinkMetaRef.current;
    if (!meta.some((item) => item.blink)) return;
    const mats = meshRef.current?.material;
    if (!mats) return;
    const list = Array.isArray(mats) ? mats : [mats];
    // 约 2Hz 方波：本色全亮 ↔ 熄灭，避免只剩「一直变暗」
    const lit = Math.sin(clock.elapsedTime * Math.PI * 2) >= 0;
    list.forEach((mat, index) => {
      const item = meta[index];
      if (!item?.blink || !(mat instanceof THREE.MeshStandardMaterial)) return;
      if (lit) {
        mat.color.set(item.faceColor);
        mat.emissive.set(item.faceColor);
        mat.emissiveIntensity = 0.45;
      } else {
        mat.color.set(LED_OFF_COLOR);
        mat.emissive.set('#000000');
        mat.emissiveIntensity = 0;
      }
    });
  });

  const isAffected = Boolean(activeTurn?.affectedIds.includes(cubelet.id));
  let position: Vec3 = cubelet.pos;
  let quaternion: [number, number, number, number] = cubelet.quat;

  if (activeTurn && isAffected) {
    const snap = activeTurn.snapshot[cubelet.id];
    if (snap) {
      const angle = (Math.PI / 2) * activeTurn.dir * progress;
      position = rotateVecAroundAxis(snap.pos, activeTurn.axis, angle);
      const rotQ = qFromAxisAngle(activeTurn.axis, angle);
      quaternion = qMul(rotQ, snap.quat);
    }
  }

  return (
    <group position={position} quaternion={quaternion}>
      <mesh ref={meshRef} material={materials} castShadow receiveShadow>
        <boxGeometry args={[CUBELET_SIZE, CUBELET_SIZE, CUBELET_SIZE]} />
      </mesh>
    </group>
  );
}

export type CubePlayRequest = {
  id: number;
  moves: FormulaLayerMove[];
};

export type CubeSceneProps = {
  stateMatrix: StateMatrix;
  brightnessMatrix: BrightnessMatrix;
  colorMatrix?: ColorMatrix;
  overlayBrightnessMatrix?: BrightnessMatrix | null;
  blinkMaskMatrix?: BlinkMaskMatrix | null;
  guidanceArrow?: GuidanceArrowMove | null;
  /** 编辑器：熄灭格用本色压暗，便于认出顶/前色 */
  dimUnlitWithFaceColor?: boolean;
  playRequest?: CubePlayRequest | null;
  onPlayComplete?: (requestId: number) => void;
};

export function CubeScene({
  stateMatrix,
  brightnessMatrix,
  colorMatrix,
  overlayBrightnessMatrix = null,
  blinkMaskMatrix = null,
  guidanceArrow = null,
  dimUnlitWithFaceColor = false,
  playRequest = null,
  onPlayComplete,
}: CubeSceneProps) {
  const cubeletsRef = useRef(
    makeInitialCube(STEP, colorMatrix ?? INITIAL_COLOR_MATRIX, stateMatrix).cubelets,
  );
  const [, setRenderTick] = useState(0);
  const forceRender = () => setRenderTick((n) => n + 1);

  const activeTurnRef = useRef<ActiveTurn | null>(null);
  const progressRef = useRef(0);
  const queueRef = useRef<FormulaLayerMove[]>([]);
  const playingRequestIdRef = useRef<number | null>(null);
  const finishingRef = useRef(false);
  const onPlayCompleteRef = useRef(onPlayComplete);
  const stateMatrixRef = useRef(stateMatrix);
  const colorMatrixRef = useRef(colorMatrix);
  onPlayCompleteRef.current = onPlayComplete;
  stateMatrixRef.current = stateMatrix;
  colorMatrixRef.current = colorMatrix;

  const rebuildFromState = () => {
    cubeletsRef.current = makeInitialCube(
      STEP,
      colorMatrixRef.current ?? INITIAL_COLOR_MATRIX,
      stateMatrixRef.current,
    ).cubelets;
    forceRender();
  };

  // 非动画时跟随外部矩阵
  useEffect(() => {
    if (activeTurnRef.current || queueRef.current.length > 0 || playingRequestIdRef.current !== null) {
      return;
    }
    rebuildFromState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateMatrix, colorMatrix]);

  // 新播放请求：从当前 prop 态重建，动画期间由内部 stateMatrixRef 逐步推进
  useEffect(() => {
    if (!playRequest || playRequest.moves.length === 0) return;
    if (playingRequestIdRef.current === playRequest.id) return;
    playingRequestIdRef.current = playRequest.id;
    finishingRef.current = false;
    queueRef.current = [...playRequest.moves];
    activeTurnRef.current = null;
    progressRef.current = 0;
    stateMatrixRef.current = stateMatrix;
    rebuildFromState();
    forceRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playRequest]);

  const beginTurn = (move: FormulaLayerMove) => {
    const cubelets = cubeletsRef.current;
    const affectedIds = getAffectedCubeletIds(cubelets, STEP, move.axis, move.index);
    const snapshot = createTurnSnapshot(cubelets, affectedIds);
    cubeletsRef.current = applyTurnToCubelets(
      cubelets,
      STEP,
      move.axis,
      move.dir as TurnDir,
      affectedIds,
      snapshot,
    );
    stateMatrixRef.current = rotateStateMatrixLayer(
      stateMatrixRef.current,
      move.axis,
      move.index,
      move.dir as TurnDir,
    );
    activeTurnRef.current = {
      axis: move.axis,
      index: move.index,
      dir: move.dir as TurnDir,
      startMs: performance.now(),
      durationMs: TURN_DURATION_MS,
      affectedIds,
      snapshot,
    };
    progressRef.current = 0;
    forceRender();
  };

  const finishRequest = () => {
    const finishedId = playingRequestIdRef.current;
    playingRequestIdRef.current = null;
    activeTurnRef.current = null;
    progressRef.current = 0;
    if (finishedId !== null) onPlayCompleteRef.current?.(finishedId);
  };

  useFrame(() => {
    // 启动下一步
    if (!activeTurnRef.current && queueRef.current.length > 0 && playingRequestIdRef.current !== null) {
      const next = queueRef.current.shift()!;
      beginTurn(next);
      return;
    }

    // 队列耗尽且无进行中转动
    if (
      !activeTurnRef.current
      && queueRef.current.length === 0
      && playingRequestIdRef.current !== null
      && !finishingRef.current
    ) {
      finishingRef.current = true;
      finishRequest();
      return;
    }

    const activeTurn = activeTurnRef.current;
    if (!activeTurn) return;

    const elapsed = performance.now() - activeTurn.startMs;
    const raw = Math.min(1, elapsed / activeTurn.durationMs);
    progressRef.current = 1 - (1 - raw) ** 3;
    forceRender();

    if (raw < 1) return;

    activeTurnRef.current = null;
    progressRef.current = 0;
    forceRender();
  });

  const activeTurn = activeTurnRef.current;
  const progress = progressRef.current;
  const resolvedColorMatrix = colorMatrix ?? INITIAL_COLOR_MATRIX;

  return (
    <group>
      {cubeletsRef.current.map((cubelet) => (
        <CubeletMesh
          key={cubelet.id}
          cubelet={cubelet}
          colorMatrix={resolvedColorMatrix}
          brightnessMatrix={brightnessMatrix}
          overlayBrightnessMatrix={overlayBrightnessMatrix}
          blinkMaskMatrix={blinkMaskMatrix}
          dimUnlitWithFaceColor={dimUnlitWithFaceColor}
          activeTurn={activeTurn}
          progress={progress}
        />
      ))}
      {guidanceArrow ? <GuidanceArrow hint={guidanceArrow} /> : null}
    </group>
  );
}
