import { useMemo } from 'react';
import * as THREE from 'three';
import {
  makeInitialCube,
  findBrightnessByStateId,
  INITIAL_COLOR_MATRIX,
  type BrightnessMatrix,
  type ColorMatrix,
  type StateMatrix,
} from '@/core/cube';
import { blendByBrightness } from './colorBlend';

const STEP = 0.54;
const CUBELET_SIZE = STEP * 0.94;

type CubeletMeshProps = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  faceColors: string[];
  stickerIds: number[];
  brightnessMatrix: BrightnessMatrix;
};

function CubeletMesh({ position, quaternion, faceColors, stickerIds, brightnessMatrix }: CubeletMeshProps) {
  // faceColors order: [Up, Down, Right, Left, Front, Back]
  // stickerIds order:  [Up, Down, Right, Left, Front, Back]
  // three.js BoxGeometry material order: [+x, -x, +y, -y, +z, -z] = [Right, Left, Up, Down, Front, Back]
  const materials = useMemo(() => {
    const order = [2, 3, 0, 1, 4, 5];
    return order.map((faceIdx) => {
      const stickerId = stickerIds[faceIdx];
      const brightness = stickerId >= 0 ? findBrightnessByStateId(stickerId, brightnessMatrix) / 10 : 1;
      const color = stickerId >= 0 ? blendByBrightness(faceColors[faceIdx], brightness) : '#101014';
      return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 });
    });
  }, [faceColors, stickerIds, brightnessMatrix]);

  return (
    <group position={position} quaternion={quaternion}>
      <mesh material={materials}>
        <boxGeometry args={[CUBELET_SIZE, CUBELET_SIZE, CUBELET_SIZE]} />
      </mesh>
    </group>
  );
}

export type CubeSceneProps = {
  stateMatrix: StateMatrix;
  brightnessMatrix: BrightnessMatrix;
  colorMatrix?: ColorMatrix;
};

export function CubeScene({ stateMatrix, brightnessMatrix, colorMatrix }: CubeSceneProps) {
  const { cubelets } = useMemo(
    () => makeInitialCube(STEP, colorMatrix ?? INITIAL_COLOR_MATRIX, stateMatrix),
    [stateMatrix, colorMatrix],
  );

  return (
    <group>
      {cubelets.map((cubelet) => (
        <CubeletMesh
          key={cubelet.id}
          position={cubelet.pos}
          quaternion={cubelet.quat}
          faceColors={cubelet.faceColors}
          stickerIds={cubelet.stickerIds}
          brightnessMatrix={brightnessMatrix}
        />
      ))}
    </group>
  );
}
