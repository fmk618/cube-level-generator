import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GuidanceArrowMove } from '@/core/formula';

const STEP = 0.54;
const ARC_RADIUS = 0.42;
const ARC_TUBE = 0.028;
const HEAD_SIZE = 0.1;

type GuidanceArrowProps = {
  hint: GuidanceArrowMove;
};

/**
 * 简化贴面箭头：在目标层中心外侧放一段弧 + 箭头头，并循环旋转提示方向。
 */
export function GuidanceArrow({ hint }: GuidanceArrowProps) {
  const groupRef = useRef<THREE.Group>(null);
  const spinRef = useRef(0);

  const { position, quaternion, clockwise } = useMemo(() => {
    const axis = new THREE.Vector3(
      hint.axis === 'x' ? 1 : 0,
      hint.axis === 'y' ? 1 : 0,
      hint.axis === 'z' ? 1 : 0,
    );
    const faceNormal = axis.clone().multiplyScalar(hint.index);
    const layerCenter = axis.clone().multiplyScalar(hint.index * STEP);
    const position = layerCenter.clone().add(faceNormal.clone().multiplyScalar(STEP * 0.55));
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      faceNormal,
    );
    // 与 App 一致：外侧面法线朝外时，hint.dir 决定观察顺逆
    const clockwise = hint.index > 0 ? hint.dir < 0 : hint.dir > 0;
    return { position: position.toArray() as [number, number, number], quaternion, clockwise };
  }, [hint.axis, hint.dir, hint.index]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    spinRef.current += delta * (clockwise ? -1.2 : 1.2);
    groupRef.current.rotation.z = spinRef.current;
    const opacity = 0.55 + 0.35 * Math.abs(Math.sin(spinRef.current * 1.4));
    groupRef.current.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const material = child.material;
      if (Array.isArray(material)) return;
      if ('opacity' in material) {
        material.transparent = true;
        material.opacity = opacity;
      }
    });
  });

  return (
    <group ref={groupRef} position={position} quaternion={quaternion}>
      <mesh>
        <torusGeometry args={[ARC_RADIUS, ARC_TUBE, 10, 48, Math.PI * 1.35]} />
        <meshStandardMaterial color="#f59e0b" emissive="#b45309" emissiveIntensity={0.35} transparent />
      </mesh>
      <mesh position={[ARC_RADIUS * 0.15, ARC_RADIUS * 0.92, 0]} rotation={[0, 0, -0.35]}>
        <coneGeometry args={[HEAD_SIZE, HEAD_SIZE * 1.8, 10]} />
        <meshStandardMaterial color="#f59e0b" emissive="#b45309" emissiveIntensity={0.35} transparent />
      </mesh>
    </group>
  );
}
