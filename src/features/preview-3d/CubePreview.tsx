import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { CubeScene } from './CubeScene';
import type { BrightnessMatrix, ColorMatrix, StateMatrix } from '@/core/cube';

export type CubePreviewProps = {
  stateMatrix: StateMatrix;
  brightnessMatrix: BrightnessMatrix;
  colorMatrix?: ColorMatrix;
  className?: string;
};

export function CubePreview({ stateMatrix, brightnessMatrix, colorMatrix, className }: CubePreviewProps) {
  return (
    <div className={className ?? 'cube-preview'}>
      <Canvas camera={{ position: [3.2, 3.0, 3.6], fov: 38 }}>
        <color attach="background" args={['#f0ede8']} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[4, 6, 5]} intensity={1.1} />
        <directionalLight position={[-4, -3, -5]} intensity={0.35} />
        <CubeScene stateMatrix={stateMatrix} brightnessMatrix={brightnessMatrix} colorMatrix={colorMatrix} />
        <OrbitControls enablePan={false} minDistance={2.8} maxDistance={7} />
      </Canvas>
    </div>
  );
}
