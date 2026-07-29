import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { CubeScene } from './CubeScene';
import type { BrightnessMatrix, ColorMatrix, StateMatrix } from '@/core/cube';

export type CubePreviewProps = {
  stateMatrix: StateMatrix;
  brightnessMatrix: BrightnessMatrix;
  colorMatrix?: ColorMatrix;
  className?: string;
};

function SceneContent({ stateMatrix, brightnessMatrix, colorMatrix }: Omit<CubePreviewProps, 'className'>) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#f0f4ff', '#e2e8f0', 0.4]} />
      <directionalLight
        position={[4, 6, 5]}
        intensity={1.0}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-3, 2, -4]} intensity={0.3} />
      <directionalLight position={[0, 4, 6]} intensity={0.2} />
      <CubeScene stateMatrix={stateMatrix} brightnessMatrix={brightnessMatrix} colorMatrix={colorMatrix} />
      <ContactShadows
        position={[0, -1.2, 0]}
        opacity={0.25}
        scale={4}
        blur={2.5}
        far={4}
      />
      <OrbitControls enablePan={false} minDistance={3.2} maxDistance={7} />
    </>
  );
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#e2e8f0" />
    </mesh>
  );
}

export function CubePreview({ stateMatrix, brightnessMatrix, colorMatrix, className }: CubePreviewProps) {
  return (
    <div className={className ?? 'cube-preview'}>
      <Canvas
        camera={{ position: [3.5, 3.2, 3.8], fov: 36 }}
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#f1f5f9']} />
        <fog attach="fog" args={['#f1f5f9', 8, 18]} />
        <Suspense fallback={<LoadingFallback />}>
          <SceneContent stateMatrix={stateMatrix} brightnessMatrix={brightnessMatrix} colorMatrix={colorMatrix} />
        </Suspense>
      </Canvas>
    </div>
  );
}
