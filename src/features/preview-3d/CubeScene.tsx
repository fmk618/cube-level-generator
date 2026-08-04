import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  makeInitialCube,
  findBrightnessByStateId,
  INITIAL_COLOR_MATRIX,
  getAffectedCubeletIds,
  createTurnSnapshot,
  applyTurnToCubelets,
  qFromAxisAngle,
  qMul,
  type ActiveTurn,
  type Axis,
  type BrightnessMatrix,
  type ColorMatrix,
  type Cubelet,
  type StateMatrix,
  type TurnDir,
  type Vec3,
} from '@/core/cube';
import type { FormulaLayerMove } from '@/core/formula';
import { blendByBrightness } from './colorBlend';

const STEP = 0.54;
const CUBELET_SIZE = STEP * 0.92;
const BODY_COLOR = '#252A34';
const TURN_DURATION_MS = 220;

type CubeletMeshProps = {
  cubelet: Cubelet;
  brightnessMatrix: BrightnessMatrix;
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

function CubeletMesh({ cubelet, brightnessMatrix, activeTurn, progress }: CubeletMeshProps) {
  const materials = useMemo(() => {
    const order = [2, 3, 0, 1, 4, 5];
    return order.map((faceIdx) => {
      const stickerId = cubelet.stickerIds[faceIdx];
      if (stickerId < 0) {
        return new THREE.MeshStandardMaterial({
          color: BODY_COLOR,
          roughness: 0.8,
          metalness: 0.02,
        });
      }
      const brightness = findBrightnessByStateId(stickerId, brightnessMatrix) / 10;
      const color = blendByBrightness(cubelet.faceColors[faceIdx], brightness);
      return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.55,
        metalness: 0.04,
        envMapIntensity: 0.5,
      });
    });
  }, [cubelet.faceColors, cubelet.stickerIds, brightnessMatrix]);

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
      <mesh material={materials} castShadow receiveShadow>
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
  playRequest?: CubePlayRequest | null;
  onPlayComplete?: (requestId: number) => void;
};

export function CubeScene({
  stateMatrix,
  brightnessMatrix,
  colorMatrix,
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

  // 新播放请求
  useEffect(() => {
    if (!playRequest || playRequest.moves.length === 0) return;
    if (playingRequestIdRef.current === playRequest.id) return;
    playingRequestIdRef.current = playRequest.id;
    finishingRef.current = false;
    queueRef.current = [...playRequest.moves];
    activeTurnRef.current = null;
    progressRef.current = 0;
    forceRender();
  }, [playRequest]);

  const beginTurn = (move: FormulaLayerMove) => {
    const cubelets = cubeletsRef.current;
    const affectedIds = getAffectedCubeletIds(cubelets, STEP, move.axis, move.index);
    const snapshot = createTurnSnapshot(cubelets, affectedIds);
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
    rebuildFromState();
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

    cubeletsRef.current = applyTurnToCubelets(
      cubeletsRef.current,
      STEP,
      activeTurn.axis,
      activeTurn.dir,
      activeTurn.affectedIds,
      activeTurn.snapshot,
    );
    activeTurnRef.current = null;
    progressRef.current = 0;
    forceRender();
  });

  const activeTurn = activeTurnRef.current;
  const progress = progressRef.current;

  return (
    <group>
      {cubeletsRef.current.map((cubelet) => (
        <CubeletMesh
          key={cubelet.id}
          cubelet={cubelet}
          brightnessMatrix={brightnessMatrix}
          activeTurn={activeTurn}
          progress={progress}
        />
      ))}
    </group>
  );
}
