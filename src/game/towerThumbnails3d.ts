import * as THREE from 'three';
import { TOWER_DEFS } from './catalog';
import { createTowerModel } from './models3d';
import { createProceduralTextures } from './textures3d';
import type { TowerType } from './types';

const thumbnailCache = new Map<TowerType, string>();
let batchAttempted = false;

function renderTowerBatch(): void {
  if (batchAttempted) return;
  batchAttempted = true;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  let renderer: THREE.WebGLRenderer | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;

    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'default',
    });
    renderer.setSize(128, 128, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.28;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x263242, 1.4);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff4e0, 2.45);
    key.position.set(2.4, 3.8, 2.6);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x60a5fa, 1.2);
    rim.position.set(-2.6, 2.1, -2.2);
    scene.add(rim);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    camera.position.set(1.06, 1.02, 1.28);
    camera.lookAt(0, 0.34, 0);

    const textures = createProceduralTextures();
    const allTypes = Object.keys(TOWER_DEFS) as TowerType[];

    for (const type of allTypes) {
      const handle = createTowerModel(type, 1, textures);
      // Slight 3/4 showcase rotation so barrel silhouette & armored chassis read cleanly
      handle.group.rotation.y = -0.35;
      handle.headGroup.rotation.y = -0.22;
      scene.add(handle.group);

      renderer.render(scene, camera);
      const dataUrl = canvas.toDataURL('image/png');
      thumbnailCache.set(type, dataUrl);

      scene.remove(handle.group);
      handle.dispose();
    }

    textures.dispose();
  } catch {
    // WebGL unavailable (e.g. headless DOM test without GL): fall back to SVG icon cleanly
  } finally {
    if (renderer) {
      try {
        const gl = renderer.getContext();
        renderer.dispose();
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        // ignore cleanup error
      }
    }
  }
}

/**
 * Returns a cached 3D-rendered miniature PNG data URL for the turret type,
 * or null if WebGL thumbnail capture is unavailable.
 */
export function getTowerThumbnail3D(type: TowerType): string | null {
  if (!batchAttempted) {
    renderTowerBatch();
  }
  return thumbnailCache.get(type) ?? null;
}
