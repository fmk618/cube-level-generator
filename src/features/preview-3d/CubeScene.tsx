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
const CUBELET_SIZE = STEP * 0.92;
const BODY_COLOR = '#252A34';

type CubeletMeshProps = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  faceColors: string[];
  stickerIds: number[];
  brightnessMatrix: BrightnessMatrix;
};

function CubeletMesh({ position, quaternion, faceColors, stickerIds, brightnessMatrix }: CubeletMeshProps) {
  const materials = useMemo(() => {
    const order = [2, 3, 0, 1, 4, 5];
    return order.map((faceIdx) => {
      const stickerId = stickerIds[faceIdx];
      if (stickerId < 0) {
        return new THREE.MeshStandardMaterial({
          color: BODY_COLOR,
          roughness: 0.8,
          metalness: 0.02,
        });
      }
      const brightness = findBrightnessByStateId(stickerId, brightnessMatrix) / 10;
      const color = blendByBrightness(faceColors[faceIdx], brightness);
      return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.55,
        metalness: 0.04,
        envMapIntensity: 0.5,
      });
    });
  }, [faceColors, stickerIds, brightnessMatrix]);

  return (
    <group position={position} quaternion={quaternion}>
      <mesh material={materials} castShadow receiveShadow>
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
