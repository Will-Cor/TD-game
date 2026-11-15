import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TOWER_DEFS } from './catalog';
import { createTowerModel } from './models3d';
import { createProceduralTextures } from './textures3d';
import type { TowerLevel, TowerType } from './types';

const thumbnailCache = new Map<string, string>();
let batchAttempted = false;

function renderTypesToCache(entries: Array<{ type: TowerType; level: TowerLevel }>): void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || entries.length === 0) {
    return;
  }

  let renderer: THREE.WebGLRenderer | null = null;
  let envTexture: THREE.Texture | null = null;
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
    renderer.toneMappingExposure = 1.24;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    envTexture = pmrem.fromScene(roomEnv, 0.04).texture;
    scene.environment = envTexture;
    roomEnv.dispose();
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x263547, 1.45);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff4e0, 2.35);
    key.position.set(2.5, 4.0, 2.7);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x60a5fa, 1.45);
    rim.position.set(-2.6, 2.2, -2.2);
    scene.add(rim);

    const fill = new THREE.DirectionalLight(0xdbeafe, 0.95);
    fill.position.set(-1.1, 0.9, 2.4);
    scene.add(fill);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    camera.position.set(1.22, 1.12, 1.44);
    camera.lookAt(0.05, 0.34, 0);

    const textures = createProceduralTextures();

    for (const { type, level } of entries) {
      const handle = createTowerModel(type, level, textures);
      handle.group.rotation.y = -0.35;
      handle.headGroup.rotation.y = -0.22;
      scene.add(handle.group);

      renderer.render(scene, camera);
      const dataUrl = canvas.toDataURL('image/png');
      thumbnailCache.set(`${type}:${level}`, dataUrl);

      scene.remove(handle.group);
      handle.dispose();
    }

    textures.dispose();
  } catch {
    // WebGL unavailable (e.g. headless DOM test without GL): fall back to SVG icon cleanly
  } finally {
    envTexture?.dispose();
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

function renderTowerBatch(): void {
  if (batchAttempted) return;
  batchAttempted = true;
  const allTypes = Object.keys(TOWER_DEFS) as TowerType[];
  renderTypesToCache(allTypes.map((type) => ({ type, level: 1 })));
}

/**
 * Returns a cached 3D-rendered miniature PNG data URL for the turret type and level,
 * or null if WebGL thumbnail capture is unavailable.
 */
export function getTowerThumbnail3D(type: TowerType, level: TowerLevel = 1): string | null {
  if (!batchAttempted) {
    renderTowerBatch();
  }
  const key = `${type}:${level}`;
  const cached = thumbnailCache.get(key);
  if (cached) return cached;

  // Lazily capture upgraded Lv. 2-5 silhouette on first inspection
  if (level > 1) {
    renderTypesToCache([{ type, level }]);
  }
  return thumbnailCache.get(key) ?? thumbnailCache.get(`${type}:1`) ?? null;
}
