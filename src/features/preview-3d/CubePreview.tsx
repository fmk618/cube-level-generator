import { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { CubeScene, type CubePlayRequest } from './CubeScene';
import type { BrightnessMatrix, ColorMatrix, StateMatrix } from '@/core/cube';

export type CubePreviewProps = {
  stateMatrix: StateMatrix;
  brightnessMatrix: BrightnessMatrix;
  colorMatrix?: ColorMatrix;
  className?: string;
  playRequest?: CubePlayRequest | null;
  onPlayComplete?: (requestId: number) => void;
  hideViewControls?: boolean;
};

function SceneContent({
  stateMatrix,
  brightnessMatrix,
  colorMatrix,
  playRequest,
  onPlayComplete,
}: Omit<CubePreviewProps, 'className'>) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#ffffff', '#e7e5e4', 0.4]} />
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
      <CubeScene
        stateMatrix={stateMatrix}
        brightnessMatrix={brightnessMatrix}
        colorMatrix={colorMatrix}
        playRequest={playRequest}
        onPlayComplete={onPlayComplete}
      />
      <ContactShadows
        position={[0, -1.2, 0]}
        opacity={0.25}
        scale={4}
        blur={2.5}
        far={4}
      />
      <OrbitControls enablePan={false} enableZoom={false} minDistance={3.2} maxDistance={7} />
    </>
  );
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#e7e5e4" />
    </mesh>
  );
}

export function CubePreview({
  stateMatrix,
  brightnessMatrix,
  colorMatrix,
  className,
  playRequest = null,
  onPlayComplete,
  hideViewControls = false,
}: CubePreviewProps) {
  const [view, setView] = useState<'perspective' | 'front' | 'top'>('perspective');
  const [zoom, setZoom] = useState(0);
  const [revision, setRevision] = useState(0);
  const cameraPosition = useMemo<[number, number, number]>(() => {
    const base: Record<typeof view, [number, number, number]> = {
      perspective: [3.1, 2.7, 3.3],
      front: [0, 0, 4.5],
      top: [0, 4.5, 0.01],
    };
    const scale = 1 - zoom * 0.1;
    return base[view].map((value) => value * scale) as [number, number, number];
  }, [view, zoom]);

  const resetView = () => {
    setView('perspective');
    setZoom(0);
    setRevision((value) => value + 1);
  };

  return (
    <div className={className ?? 'cube-preview'}>
      <Canvas
        key={`${view}-${zoom}-${revision}`}
        camera={{ position: cameraPosition, fov: 34 }}
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <fog attach="fog" args={['#f5f5f4', 8, 18]} />
        <Suspense fallback={<LoadingFallback />}>
          <SceneContent
            stateMatrix={stateMatrix}
            brightnessMatrix={brightnessMatrix}
            colorMatrix={colorMatrix}
            playRequest={playRequest}
            onPlayComplete={onPlayComplete}
          />
        </Suspense>
      </Canvas>
      {!hideViewControls && (
      <div className="cube-view-controls" aria-label="3D 预览视角控制">
        <button type="button" onClick={resetView} title="重置视角" aria-label="重置视角">↻</button>
        <button type="button" className={view === 'front' ? 'is-active' : ''} onClick={() => setView('front')} title="正视图" aria-label="正视图">▣</button>
        <button type="button" className={view === 'top' ? 'is-active' : ''} onClick={() => setView('top')} title="顶视图" aria-label="顶视图">◇</button>
        <span />
        <button type="button" disabled={zoom >= 2} onClick={() => setZoom((value) => Math.min(2, value + 1))} title="放大" aria-label="放大">＋</button>
        <button type="button" disabled={zoom <= -2} onClick={() => setZoom((value) => Math.max(-2, value - 1))} title="缩小" aria-label="缩小">−</button>
      </div>
      )}
    </div>
  );
}
