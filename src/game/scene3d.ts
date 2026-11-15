import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  TOWER_DEFS,
  getCombinedTowerType,
} from './catalog';
import {
  createBastionCitadelModel,
  createEnemyModel,
  createRockClusterModel,
  createSpawnGateModel,
  createTowerModel,
  type EnemyModelHandle,
  type LandmarkHandle,
  type TowerModelHandle,
} from './models3d';
import {
  canBuildTower,
  canCombineTowers,
  canPlaceTowerAt,
  computeTowerEffectiveStats,
} from './simulation';
import { createProceduralTextures, type ProceduralTextureSet } from './textures3d';
import type { FloatingText, GameMap, GridCoord, RunState, TowerType } from './types';

// Reusable scratch math objects (zero per-frame GC pressure)
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

interface Particle3D {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

interface FloatingSpriteSlot {
  sprite: THREE.Sprite;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  assignedRef: FloatingText | null;
}

export interface BoardHoverEvent {
  inside: boolean;
  col: number;
  row: number;
}

export interface BoardClickEvent {
  inside: boolean;
  col: number;
  row: number;
  simX: number;
  simY: number;
}

export interface PanKeysState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

function detectSoftwareGl(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(renderer);
  } catch {
    return true;
  }
}

export class BastionScene3D {
  readonly isSoftwareGl: boolean;
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private textures: ProceduralTextureSet;
  private envTexture: THREE.Texture;

  private mapGroup: THREE.Group;
  private currentMapSeed: number | null = null;
  private isTitleMode = false;
  private currentMapCols = 16;
  private currentMapRows = 10;
  private landmarks: LandmarkHandle[] = [];
  private raycastPlane: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();

  // Dynamic gameplay entity groups & maps
  private towerModels = new Map<
    number,
    { type: TowerType; level: 1 | 2 | 3; handle: TowerModelHandle }
  >();
  private enemyModels = new Map<number, EnemyModelHandle>();
  private projectileGroup = new THREE.Group();
  private vfxGroup = new THREE.Group();
  private entityGroup = new THREE.Group();

  // Reusable projectile meshes (created dynamically per active count from shared geometries)
  private projSphereGeo = new THREE.SphereGeometry(0.1, 10, 8);
  private projBoltGeo = new THREE.BoxGeometry(0.32, 0.07, 0.07);
  private projMissileGeo = new THREE.ConeGeometry(0.085, 0.34, 6);
  private projMeshes: THREE.Mesh[] = [];

  // Pooled 3D particle InstancedMesh
  private readonly maxParticles = 256;
  private particles: Particle3D[] = [];
  private particleInstanced: THREE.InstancedMesh;

  // Floating 3D text sprite pool
  private floatingSlots: FloatingSpriteSlot[] = [];
  private floatingGroup = new THREE.Group();

  // Tactical cursor / selection / orbital target overlays
  private hoverTileFrame: THREE.Group;
  private hoverTileMat: THREE.MeshBasicMaterial;
  private hoverRangeRing: THREE.Mesh;
  private hoverRangeMat: THREE.MeshBasicMaterial;
  private selectedRangeRing: THREE.Mesh;

  // Pointer & Pan state
  private pointerDownPos: { x: number; y: number; button: number } | null = null;
  private lastHoverRaycastMs = 0;
  private panKeys: PanKeysState = { up: false, down: false, left: false, right: false };

  // Camera shake state
  private shakeOffset = new THREE.Vector3();

  // Callbacks
  private onHoverCallback?: (ev: BoardHoverEvent) => void;
  private onClickCallback?: (ev: BoardClickEvent) => void;

  // ResizeObserver & context-loss tracking
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private contextLost = false;

  // AfterDraw pacing handle
  private scheduledTimeout: number | null = null;
  private scheduledRaf: number | null = null;

  constructor(
    container: HTMLElement,
    callbacks: {
      onHover?: (ev: BoardHoverEvent) => void;
      onClick?: (ev: BoardClickEvent) => void;
    },
  ) {
    this.container = container;
    this.onHoverCallback = callbacks.onHover;
    this.onClickCallback = callbacks.onClick;
    this.isSoftwareGl = detectSoftwareGl();

    const rect = container.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width || window.innerWidth));
    const height = Math.max(240, Math.floor(rect.height || window.innerHeight));

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    if (!this.isSoftwareGl) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
    } else {
      this.renderer.shadowMap.enabled = false;
    }

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.outline = 'none';
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.dataset.testid = 'game-canvas';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1016);
    this.scene.fog = new THREE.FogExp2(0x0b1016, 0.027);

    // Environment reflection map for metallic turrets & armor
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envTexture = pmrem.fromScene(roomEnv, 0.04).texture;
    this.scene.environment = this.envTexture;
    roomEnv.dispose();
    pmrem.dispose();

    this.projMissileGeo.rotateZ(-Math.PI / 2);
    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());

    // Camera & OrbitControls
    this.camera = new THREE.PerspectiveCamera(44, width / height, 0.2, 120);
    this.camera.position.set(0, 11.4, 11.6);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0.25);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 24;
    this.controls.minPolarAngle = 0.28;
    this.controls.maxPolarAngle = 1.14;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };
    this.controls.update();

    // 3-Point Lighting
    const hemi = new THREE.HemisphereLight(0xa8c6ea, 0x151c24, 0.68);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffe7c2, 2.3);
    keyLight.position.set(9.5, 16, 8.5);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -11;
      keyLight.shadow.camera.right = 11;
      keyLight.shadow.camera.top = 8;
      keyLight.shadow.camera.bottom = -8;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 40;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7cc4ff, 0.78);
    rimLight.position.set(-10, 8, -11);
    this.scene.add(rimLight);

    // Sculpted Extended Highland Terrain (gentle ridges outside the playable 16x10 bastion deck)
    const horizonGeo = new THREE.PlaneGeometry(88, 88, 36, 36);
    horizonGeo.rotateX(-Math.PI / 2);
    const posAttr = horizonGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      // Keep inner bastion footprint flat & recessed; raise rolling rocky foothills outside
      const distX = Math.max(0, Math.abs(vx) - 8.6);
      const distZ = Math.max(0, Math.abs(vz) - 5.6);
      const radial = Math.hypot(distX, distZ);
      const ridge =
        radial > 0.2
          ? Math.min(2.6, radial * 0.16) *
            (0.65 + 0.35 * Math.sin(vx * 0.42 + vz * 0.31) + 0.25 * Math.cos(vx * 0.85 - vz * 0.6))
          : 0;
      posAttr.setY(i, -0.32 + ridge);
    }
    horizonGeo.computeVertexNormals();
    const horizonMat = new THREE.MeshStandardMaterial({
      color: 0x18212b,
      roughness: 0.92,
      metalness: 0.08,
      flatShading: true,
    });
    const horizonMesh = new THREE.Mesh(horizonGeo, horizonMat);
    horizonMesh.receiveShadow = true;
    this.scene.add(horizonMesh);

    // Embedded perimeter basalt outcrops sitting firmly in the highland ridge slopes
    const perimeterGroup = new THREE.Group();
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const rx = Math.cos(angle) * (11.2 + (i % 3) * 1.8);
      const rz = Math.sin(angle) * (7.4 + ((i + 1) % 3) * 1.6);
      const rock = createRockClusterModel(i * 37 + 11);
      const sc = 1.45 + (i % 3) * 0.45;
      rock.scale.set(sc, sc * 0.85, sc);
      rock.position.set(rx, -0.15, rz);
      perimeterGroup.add(rock);
    }
    this.scene.add(perimeterGroup);

    // Map, Entity, Projectile, VFX, Floating text groups
    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);
    this.scene.add(this.entityGroup);
    this.scene.add(this.projectileGroup);
    this.scene.add(this.vfxGroup);
    this.scene.add(this.floatingGroup);

    // Raycast plane (single flat invisible plane covering 16x10 sector)
    const planeGeo = new THREE.PlaneGeometry(16, 10);
    planeGeo.rotateX(-Math.PI / 2);
    this.raycastPlane = new THREE.Mesh(
      planeGeo,
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.raycastPlane.position.y = 0.025;
    this.scene.add(this.raycastPlane);

    // Pooled 3D particle InstancedMesh
    const partGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    const partMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleInstanced = new THREE.InstancedMesh(partGeo, partMat, this.maxParticles);
    this.particleInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleInstanced.frustumCulled = false;
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -10,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        color: new THREE.Color(0xffffff),
      });
      _mat4.makeScale(0, 0, 0);
      this.particleInstanced.setMatrixAt(i, _mat4);
      this.particleInstanced.setColorAt(i, _color.setHex(0xffffff));
    }
    this.particleInstanced.instanceMatrix.needsUpdate = true;
    this.scene.add(this.particleInstanced);

    // Pre-allocate 14 FloatingText sprite slots
    for (let i = 0; i < 14; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 288;
      canvas.height = 56;
      const ctx = canvas.getContext('2d')!;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.visible = false;
      sprite.scale.set(1.7, 0.33, 1);
      this.floatingGroup.add(sprite);
      this.floatingSlots.push({ sprite, canvas, ctx, texture, assignedRef: null });
    }

    // Hover Tile Frame + Range Ring
    this.hoverTileFrame = new THREE.Group();
    this.hoverTileMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const tileOverlay = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), this.hoverTileMat);
    tileOverlay.rotation.x = -Math.PI / 2;
    tileOverlay.position.y = 0.045;
    this.hoverTileFrame.add(tileOverlay);

    const frameBorder = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.47, 0.05, -0.47),
        new THREE.Vector3(0.47, 0.05, -0.47),
        new THREE.Vector3(0.47, 0.05, 0.47),
        new THREE.Vector3(-0.47, 0.05, 0.47),
      ]),
      new THREE.LineBasicMaterial({ color: 0xfef3c7 }),
    );
    this.hoverTileFrame.add(frameBorder);
    this.hoverTileFrame.visible = false;
    this.scene.add(this.hoverTileFrame);

    this.hoverRangeMat = new THREE.MeshBasicMaterial({
      color: 0xe5a93c,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.hoverRangeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.96, 1.0, 48),
      this.hoverRangeMat,
    );
    this.hoverRangeRing.rotation.x = -Math.PI / 2;
    this.hoverRangeRing.position.y = 0.05;
    this.hoverRangeRing.visible = false;
    this.scene.add(this.hoverRangeRing);

    this.selectedRangeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.96, 1.0, 48),
      new THREE.MeshBasicMaterial({
        color: 0xe5a93c,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.selectedRangeRing.rotation.x = -Math.PI / 2;
    this.selectedRangeRing.position.y = 0.055;
    this.selectedRangeRing.visible = false;
    this.scene.add(this.selectedRangeRing);

    // Event listeners
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.handlePointerDown);
    dom.addEventListener('pointermove', this.handlePointerMove);
    dom.addEventListener('pointerup', this.handlePointerUp);
    dom.addEventListener('pointerleave', this.handlePointerLeave);
    dom.addEventListener('contextmenu', this.handleContextMenu);
    dom.addEventListener('webglcontextlost', this.handleContextLost);
    dom.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
  }

  private simToWorldX(simX: number): number {
    return simX - this.currentMapCols * 0.5;
  }

  private simToWorldZ(simY: number): number {
    return simY - this.currentMapRows * 0.5;
  }

  private worldToGrid(worldX: number, worldZ: number): BoardClickEvent {
    const simX = worldX + this.currentMapCols * 0.5;
    const simY = worldZ + this.currentMapRows * 0.5;
    const col = Math.floor(simX);
    const row = Math.floor(simY);
    const inside = col >= 0 && col < this.currentMapCols && row >= 0 && row < this.currentMapRows;
    return { inside, col, row, simX, simY };
  }

  private raycastBoard(clientX: number, clientY: number): BoardClickEvent {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { inside: false, col: -1, row: -1, simX: 0, simY: 0 };
    }
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObject(this.raycastPlane, false);
    if (hits.length === 0) {
      return { inside: false, col: -1, row: -1, simX: 0, simY: 0 };
    }
    const pt = hits[0].point;
    return this.worldToGrid(pt.x, pt.z);
  }

  private handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private handlePointerDown = (e: PointerEvent) => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY, button: e.button };
  };

  private handlePointerMove = (e: PointerEvent) => {
    const now = performance.now();
    if (now - this.lastHoverRaycastMs < 24) return;
    this.lastHoverRaycastMs = now;
    const hit = this.raycastBoard(e.clientX, e.clientY);
    this.onHoverCallback?.({ inside: hit.inside, col: hit.col, row: hit.row });
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (!this.pointerDownPos) return;
    const dx = e.clientX - this.pointerDownPos.x;
    const dy = e.clientY - this.pointerDownPos.y;
    const dist = Math.hypot(dx, dy);
    const wasLeft = this.pointerDownPos.button === 0 && e.button === 0;
    this.pointerDownPos = null;

    if (wasLeft && dist < 7) {
      const hit = this.raycastBoard(e.clientX, e.clientY);
      this.onClickCallback?.(hit);
    }
  };

  private handlePointerLeave = () => {
    this.onHoverCallback?.({ inside: false, col: -1, row: -1 });
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
    this.cancelScheduledFrame();
  };

  private handleContextRestored = () => {
    this.contextLost = false;
    this.renderOnce();
  };

  private handleResize() {
    if (this.disposed) return;
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(240, Math.floor(rect.height));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderOnce();
  }

  setPanKeys(keys: PanKeysState) {
    this.panKeys = keys;
  }

  resetCamera() {
    this.controls.target.set(0, 0, 0.25);
    this.camera.position.set(0, 11.4, 11.6);
    this.controls.update();
    this.renderOnce();
  }

  private applyCameraPan(dt: number) {
    const hasInput = this.panKeys.up || this.panKeys.down || this.panKeys.left || this.panKeys.right;
    if (!hasInput) return;

    this.camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() > 0.0001) _fwd.normalize();
    _right.crossVectors(_fwd, _up).normalize();

    const speed = 9.5 * dt;
    let mx = 0;
    let mz = 0;
    if (this.panKeys.up) {
      mx += _fwd.x * speed;
      mz += _fwd.z * speed;
    }
    if (this.panKeys.down) {
      mx -= _fwd.x * speed;
      mz -= _fwd.z * speed;
    }
    if (this.panKeys.right) {
      mx += _right.x * speed;
      mz += _right.z * speed;
    }
    if (this.panKeys.left) {
      mx -= _right.x * speed;
      mz -= _right.z * speed;
    }

    const prevX = this.controls.target.x;
    const prevZ = this.controls.target.z;
    const nextX = THREE.MathUtils.clamp(prevX + mx, -7.5, 7.5);
    const nextZ = THREE.MathUtils.clamp(prevZ + mz, -4.5, 4.5);
    const dx = nextX - prevX;
    const dz = nextZ - prevZ;

    this.controls.target.x = nextX;
    this.controls.target.z = nextZ;
    this.camera.position.x += dx;
    this.camera.position.z += dz;
  }

  private clampControlsTarget() {
    const clX = THREE.MathUtils.clamp(this.controls.target.x, -7.5, 7.5);
    const clZ = THREE.MathUtils.clamp(this.controls.target.z, -4.5, 4.5);
    const dx = clX - this.controls.target.x;
    const dz = clZ - this.controls.target.z;
    if (dx !== 0 || dz !== 0) {
      this.controls.target.x = clX;
      this.controls.target.z = clZ;
      this.camera.position.x += dx;
      this.camera.position.z += dz;
    }
  }

  private buildMapGeometry(map: GameMap) {
    this.currentMapSeed = map.seed;
    this.currentMapCols = map.cols;
    this.currentMapRows = map.rows;

    // Dispose previous map meshes
    for (const lm of this.landmarks) lm.dispose();
    this.landmarks = [];
    this.mapGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) mat?.dispose();
      }
    });
    this.mapGroup.clear();

    // Update raycast plane size if map dims ever changed
    this.raycastPlane.geometry.dispose();
    const newPlane = new THREE.PlaneGeometry(map.cols, map.rows);
    newPlane.rotateX(-Math.PI / 2);
    this.raycastPlane.geometry = newPlane;

    // Sector Base Slab & Brass Perimeter Frame
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x17202a,
      roughness: 0.78,
      metalness: 0.25,
    });
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(map.cols + 0.5, 0.22, map.rows + 0.5),
      deckMat,
    );
    deck.position.y = -0.11;
    deck.receiveShadow = true;
    this.mapGroup.add(deck);

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x9b8254,
      roughness: 0.4,
      metalness: 0.75,
    });
    for (const sz of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(map.cols + 0.62, 0.1, 0.12), trimMat);
      rail.position.set(0, 0.02, sz * (map.rows * 0.5 + 0.25));
      this.mapGroup.add(rail);
    }
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, map.rows + 0.62), trimMat);
      rail.position.set(sx * (map.cols * 0.5 + 0.25), 0.02, 0);
      this.mapGroup.add(rail);
    }

    // Corner Bastion Perimeter Pylons with warm tactical beacons
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x24303d,
      roughness: 0.5,
      metalness: 0.65,
    });
    const cornerBeaconMat = new THREE.MeshStandardMaterial({
      color: 0xe5a93c,
      emissive: 0xd97706,
      emissiveIntensity: 1.35,
      roughness: 0.25,
    });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = sx * (map.cols * 0.5 + 0.32);
        const pz = sz * (map.rows * 0.5 + 0.32);
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.42), pylonMat);
        pylon.position.set(px, 0.16, pz);
        pylon.castShadow = true;
        pylon.receiveShadow = true;
        this.mapGroup.add(pylon);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.24), cornerBeaconMat);
        cap.position.set(px, 0.44, pz);
        this.mapGroup.add(cap);
      }
    }

    // Collect tile coordinates by kind
    const buildableCoords: GridCoord[] = [];
    const pathCoords: GridCoord[] = [];
    const vantageCoords: GridCoord[] = [];
    const obstacleCoords: GridCoord[] = [];

    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const kind = map.tiles[r][c];
        if (kind === 'buildable') buildableCoords.push({ col: c, row: r });
        else if (kind === 'vantage') vantageCoords.push({ col: c, row: r });
        else if (kind === 'obstacle') obstacleCoords.push({ col: c, row: r });
        else pathCoords.push({ col: c, row: r });
      }
    }

    // Instanced Buildable Tactical Tiles
    if (buildableCoords.length > 0) {
      const tileGeo = new THREE.BoxGeometry(0.95, 0.04, 0.95);
      const tileMat = new THREE.MeshStandardMaterial({
        map: this.textures.groundMap,
        bumpMap: this.textures.groundBump,
        bumpScale: 0.015,
        roughness: 0.72,
        metalness: 0.22,
      });
      const inst = new THREE.InstancedMesh(tileGeo, tileMat, buildableCoords.length);
      inst.receiveShadow = true;
      buildableCoords.forEach((coord, i) => {
        _pos.set(this.simToWorldX(coord.col + 0.5), 0.01, this.simToWorldZ(coord.row + 0.5));
        _quat.identity();
        _scale.set(1, 1, 1);
        _mat4.compose(_pos, _quat, _scale);
        inst.setMatrixAt(i, _mat4);
      });
      inst.instanceMatrix.needsUpdate = true;
      this.mapGroup.add(inst);
    }

    // Instanced Stone Road Tiles + Sculpted Armored Side Curbs
    if (pathCoords.length > 0) {
      const roadGeo = new THREE.BoxGeometry(0.99, 0.02, 0.99);
      const roadMat = new THREE.MeshStandardMaterial({
        map: this.textures.roadMap,
        bumpMap: this.textures.roadBump,
        bumpScale: 0.02,
        roughness: 0.82,
        metalness: 0.14,
      });
      const roadInst = new THREE.InstancedMesh(roadGeo, roadMat, pathCoords.length);
      roadInst.receiveShadow = true;
      pathCoords.forEach((coord, i) => {
        _pos.set(this.simToWorldX(coord.col + 0.5), 0.0, this.simToWorldZ(coord.row + 0.5));
        _quat.identity();
        _scale.set(1, 1, 1);
        _mat4.compose(_pos, _quat, _scale);
        roadInst.setMatrixAt(i, _mat4);
      });
      roadInst.instanceMatrix.needsUpdate = true;
      this.mapGroup.add(roadInst);

      // Raised bevel curbs flanking non-path borders along the path
      const curbPositions: { x: number; z: number; rotY: number }[] = [];
      const isRoadKind = (c: number, r: number) => {
        const k = map.tiles[r]?.[c];
        return k === 'path' || k === 'spawn' || k === 'exit';
      };
      for (const coord of pathCoords) {
        const wx = this.simToWorldX(coord.col + 0.5);
        const wz = this.simToWorldZ(coord.row + 0.5);
        if (coord.row > 0 && !isRoadKind(coord.col, coord.row - 1)) {
          curbPositions.push({ x: wx, z: wz - 0.48, rotY: 0 });
        }
        if (coord.row < map.rows - 1 && !isRoadKind(coord.col, coord.row + 1)) {
          curbPositions.push({ x: wx, z: wz + 0.48, rotY: 0 });
        }
        if (coord.col > 0 && !isRoadKind(coord.col - 1, coord.row)) {
          curbPositions.push({ x: wx - 0.48, z: wz, rotY: Math.PI / 2 });
        }
        if (coord.col < map.cols - 1 && !isRoadKind(coord.col + 1, coord.row)) {
          curbPositions.push({ x: wx + 0.48, z: wz, rotY: Math.PI / 2 });
        }
      }
      if (curbPositions.length > 0) {
        const curbGeo = new THREE.BoxGeometry(0.96, 0.055, 0.07);
        const curbMat = new THREE.MeshStandardMaterial({
          color: 0x5c6d7e,
          roughness: 0.48,
          metalness: 0.6,
        });
        const curbInst = new THREE.InstancedMesh(curbGeo, curbMat, curbPositions.length);
        curbPositions.forEach((cp, idx) => {
          _pos.set(cp.x, 0.032, cp.z);
          _quat.setFromAxisAngle(_up, cp.rotY);
          _scale.set(1, 1, 1);
          _mat4.compose(_pos, _quat, _scale);
          curbInst.setMatrixAt(idx, _mat4);
        });
        curbInst.instanceMatrix.needsUpdate = true;
        this.mapGroup.add(curbInst);
      }

      // Subtle glowing directional chevron nodes every 2 path steps
      const markerMat = new THREE.MeshBasicMaterial({
        color: 0xe2c896,
        transparent: true,
        opacity: 0.42,
      });
      for (let i = 1; i < map.path.length - 1; i += 2) {
        const cur = map.path[i];
        const next = map.path[i + 1];
        const chevron = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 3), markerMat);
        chevron.rotation.x = Math.PI / 2;
        const dx = next.col - cur.col;
        const dz = next.row - cur.row;
        chevron.rotation.z = -Math.atan2(dz, dx) + Math.PI / 2;
        chevron.position.set(
          this.simToWorldX(cur.col + 0.5),
          0.02,
          this.simToWorldZ(cur.row + 0.5),
        );
        this.mapGroup.add(chevron);
      }
    }

    // Elevated Vantage Plinths (+15% Range) — dark tactical steel cap + slim glowing cyan rim
    if (vantageCoords.length > 0) {
      const vanBaseMat = new THREE.MeshStandardMaterial({
        color: 0x263544,
        roughness: 0.42,
        metalness: 0.68,
      });
      const vanTopMat = new THREE.MeshStandardMaterial({
        color: 0x1e2c3a,
        roughness: 0.35,
        metalness: 0.55,
      });
      const vanTrimMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.75,
        roughness: 0.25,
      });
      for (const coord of vantageCoords) {
        const wx = this.simToWorldX(coord.col + 0.5);
        const wz = this.simToWorldZ(coord.row + 0.5);
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.13, 0.92), vanBaseMat);
        pad.position.set(wx, 0.065, wz);
        pad.castShadow = true;
        pad.receiveShadow = true;
        this.mapGroup.add(pad);

        // Glowing cyan collar band around mid-step (never washes out the top surface)
        const collar = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.026, 0.94), vanTrimMat);
        collar.position.set(wx, 0.115, wz);
        this.mapGroup.add(collar);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.02, 0.84), vanTopMat);
        cap.position.set(wx, 0.135, wz);
        cap.receiveShadow = true;
        this.mapGroup.add(cap);
      }
    }

    // Obstacle Rock Clusters
    for (const coord of obstacleCoords) {
      const cluster = createRockClusterModel(map.seed + coord.col * 31 + coord.row * 97);
      cluster.position.set(this.simToWorldX(coord.col + 0.5), 0, this.simToWorldZ(coord.row + 0.5));
      this.mapGroup.add(cluster);
    }

    // Spawn Breach Gate Landmark (Western entry)
    const gate = createSpawnGateModel();
    gate.group.position.set(
      this.simToWorldX(map.spawn.col + 0.5),
      0,
      this.simToWorldZ(map.spawn.row + 0.5),
    );
    this.mapGroup.add(gate.group);
    this.landmarks.push(gate);

    // Bastion Citadel Spire Landmark (Eastern defended core)
    const citadel = createBastionCitadelModel();
    citadel.group.position.set(
      this.simToWorldX(map.exit.col + 0.5),
      0,
      this.simToWorldZ(map.exit.row + 0.5),
    );
    this.mapGroup.add(citadel.group);
    this.landmarks.push(citadel);
  }

  private clearDynamicEntities() {
    for (const [, entry] of this.towerModels) {
      this.entityGroup.remove(entry.handle.group);
      entry.handle.dispose();
    }
    this.towerModels.clear();

    for (const [, handle] of this.enemyModels) {
      this.entityGroup.remove(handle.group);
      handle.dispose();
    }
    this.enemyModels.clear();

    for (const m of this.projMeshes) {
      this.projectileGroup.remove(m);
      (m.material as THREE.Material).dispose();
    }
    this.projMeshes = [];

    this.vfxGroup.traverse((obj) => {
      if ((obj as THREE.Line).isLine || (obj as THREE.Mesh).isMesh) {
        const o = obj as THREE.Mesh | THREE.Line;
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m?.dispose();
      }
    });
    this.vfxGroup.clear();

    for (const slot of this.floatingSlots) {
      slot.sprite.visible = false;
      slot.assignedRef = null;
    }
    this.hoverTileFrame.visible = false;
    this.hoverRangeRing.visible = false;
    this.selectedRangeRing.visible = false;
  }

  spawnBurst(simX: number, simY: number, hexColor: string, count: number, speed: number) {
    const wx = this.simToWorldX(simX);
    const wz = this.simToWorldZ(simY);
    let spawned = 0;
    for (let i = 0; i < this.maxParticles && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        const angle = Math.random() * Math.PI * 2;
        const spd = speed * (0.4 + Math.random() * 0.85);
        p.active = true;
        p.x = wx;
        p.y = 0.28 + Math.random() * 0.15;
        p.z = wz;
        p.vx = Math.cos(angle) * spd;
        p.vy = 1.4 + Math.random() * 2.4;
        p.vz = Math.sin(angle) * spd;
        p.maxLife = 0.3 + Math.random() * 0.3;
        p.life = p.maxLife;
        p.size = 0.65 + Math.random() * 0.9;
        p.color.set(hexColor);
        spawned++;
      }
    }
  }

  private updateParticles(dt: number) {
    let anyChanged = false;
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyChanged = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _mat4.makeScale(0, 0, 0);
        this.particleInstanced.setMatrixAt(i, _mat4);
        continue;
      }
      p.vy -= 9.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.04) {
        p.y = 0.04;
        p.vy = Math.abs(p.vy) * 0.35;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
      const alpha = p.life / p.maxLife;
      const sc = p.size * alpha;
      _pos.set(p.x, p.y, p.z);
      _quat.identity();
      _scale.set(sc, sc, sc);
      _mat4.compose(_pos, _quat, _scale);
      this.particleInstanced.setMatrixAt(i, _mat4);
      this.particleInstanced.setColorAt(i, p.color);
    }
    if (anyChanged) {
      this.particleInstanced.instanceMatrix.needsUpdate = true;
      if (this.particleInstanced.instanceColor) {
        this.particleInstanced.instanceColor.needsUpdate = true;
      }
    }
  }

  private syncLandmarks(timeSec: number) {
    for (const lm of this.landmarks) {
      if (lm.animatedPart) {
        lm.animatedPart.rotation.y = timeSec * 1.1;
      }
    }
  }

  private populateTitleShowcase(map: GameMap) {
    // Place 3 showcase turrets near the path on title diorama so the 3D silhouettes shine immediately
    const types: TowerType[] = ['cannon', 'tesla', 'cryo'];
    let placed = 0;
    for (let c = 3; c < map.cols - 2 && placed < types.length; c += 3) {
      for (let r = 2; r < map.rows - 2 && placed < types.length; r++) {
        const kind = map.tiles[r][c];
        if (kind !== 'buildable' && kind !== 'vantage') continue;
        const nearPath =
          map.tiles[r - 1]?.[c] === 'path' ||
          map.tiles[r + 1]?.[c] === 'path' ||
          map.tiles[r]?.[c - 1] === 'path' ||
          map.tiles[r]?.[c + 1] === 'path';
        if (!nearPath) continue;
        const tType = types[placed];
        const showcaseLevel = (placed === 1 ? 3 : placed === 2 ? 2 : 1) as 1 | 2 | 3;
        const handle = createTowerModel(tType, showcaseLevel, this.textures);
        const baseY = kind === 'vantage' ? 0.14 : 0.03;
        handle.group.position.set(this.simToWorldX(c + 0.5), baseY, this.simToWorldZ(r + 0.5));
        this.entityGroup.add(handle.group);
        this.towerModels.set(1000 + placed, { type: tType, level: showcaseLevel, handle });
        placed++;
        break;
      }
    }
  }

  syncTitle(map: GameMap, dt: number, timeSec: number) {
    if (!this.isTitleMode || this.currentMapSeed !== map.seed) {
      this.isTitleMode = true;
      this.clearDynamicEntities();
      this.buildMapGeometry(map);
      this.populateTitleShowcase(map);
    }
    this.syncLandmarks(timeSec);
    this.updateParticles(dt);

    // Animate showcase turrets scanning the bastion lanes
    for (const [id, entry] of this.towerModels) {
      entry.handle.headGroup.rotation.y = Math.sin(timeSec * 0.7 + id) * 0.85;
      if (entry.handle.spinnerMesh) {
        entry.handle.spinnerMesh.rotation.y = timeSec * 2.2;
      }
    }

    // Frame diorama toward the right side of the viewport so the left Title Lockup stays crisp & uncluttered
    const orbitX = Math.sin(timeSec * 0.16) * 1.4;
    this.controls.target.set(-2.3, 0, 0.25);
    this.camera.position.set(-2.0 + orbitX, 10.6, 11.4);
    this.controls.update();

    this.renderOnce();
  }

  syncRun(run: RunState, hoverCell: GridCoord | null, dt: number, timeSec: number) {
    if (this.isTitleMode || this.currentMapSeed !== run.map.seed) {
      this.isTitleMode = false;
      this.clearDynamicEntities();
      this.buildMapGeometry(run.map);
    }

    this.applyCameraPan(dt);
    this.controls.update();
    this.clampControlsTarget();
    this.syncLandmarks(timeSec);
    this.updateParticles(dt);

    // 1. Sync Towers (rebuild 3D mesh automatically when tower upgrades MK1->MK2->MK3 or combines into Super Turret)
    const activeTowerIds = new Set<number>();
    for (const t of run.towers) {
      activeTowerIds.add(t.id);
      let entry = this.towerModels.get(t.id);
      if (!entry || entry.type !== t.type || entry.level !== t.level) {
        if (entry) {
          this.entityGroup.remove(entry.handle.group);
          entry.handle.dispose();
        }
        const handle = createTowerModel(t.type, t.level, this.textures);
        this.entityGroup.add(handle.group);
        entry = { type: t.type, level: t.level, handle };
        this.towerModels.set(t.id, entry);
      }

      const h = entry.handle;
      const baseY = t.onVantage ? 0.14 : 0.03;
      h.group.position.set(this.simToWorldX(t.col + 0.5), baseY, this.simToWorldZ(t.row + 0.5));
      h.headGroup.rotation.y = -t.angle;
      h.barrelGroup.position.x = -t.recoil * 0.13;
      h.overdriveRing.visible = run.overdriveTimer > 0;
      const canFuseHere =
        run.pendingCombineTowerId !== null &&
        canCombineTowers(run, run.pendingCombineTowerId, t.id);
      h.combineTargetRing.visible = canFuseHere;
      if (canFuseHere) {
        h.combineTargetRing.scale.setScalar(1 + Math.sin(timeSec * 6) * 0.08);
      }
      if (h.spinnerMesh) {
        h.spinnerMesh.rotation.y = timeSec * (run.overdriveTimer > 0 ? 4.2 : 1.8);
      }
    }
    for (const [id, entry] of this.towerModels) {
      if (!activeTowerIds.has(id)) {
        this.entityGroup.remove(entry.handle.group);
        entry.handle.dispose();
        this.towerModels.delete(id);
      }
    }

    // 2. Sync Enemies
    const activeEnemyIds = new Set<number>();
    for (const e of run.enemies) {
      if (e.reachedExit) continue;
      activeEnemyIds.add(e.id);
      let eh = this.enemyModels.get(e.id);
      if (!eh) {
        eh = createEnemyModel(e.archetype, this.textures, this.isSoftwareGl);
        this.entityGroup.add(eh.group);
        this.enemyModels.set(e.id, eh);
      }

      const wx = this.simToWorldX(e.x);
      const wz = this.simToWorldZ(e.y);
      eh.group.position.set(wx, 0.02, wz);

      // Face waypoint movement direction
      const targetWp = run.map.path[Math.min(e.pathIndex, run.map.path.length - 1)];
      if (targetWp) {
        const dx = targetWp.col + 0.5 - e.x;
        const dz = targetWp.row + 0.5 - e.y;
        if (dx * dx + dz * dz > 0.0004) {
          eh.bodyGroup.rotation.y = -Math.atan2(dz, dx);
        }
      }

      // Dissolve scale during KO
      const koScale = e.dead ? Math.max(0.01, e.koTimer / 0.3) : 1;
      eh.bodyGroup.scale.setScalar(koScale);

      // Status / Hit Flash tinting
      for (let i = 0; i < eh.tintableMaterials.length; i++) {
        const mat = eh.tintableMaterials[i];
        const base = eh.baseColors[i];
        if (e.hitFlashTimer > 0) {
          mat.emissive.setHex(0xffffff);
          mat.emissiveIntensity = 1.25;
        } else if (e.stunTimer > 0) {
          mat.emissive.setHex(0xa78bfa);
          mat.emissiveIntensity = 0.85;
        } else if (e.slowTimer > 0) {
          mat.emissive.setHex(0x38bdf8);
          mat.emissiveIntensity = 0.7;
        } else {
          mat.emissive.copy(base.emissive);
          mat.emissiveIntensity = base.emissiveIntensity;
        }
      }

      // Shield shell
      eh.shieldMesh.visible = !e.dead && e.shield > 0;
      if (eh.shieldMesh.visible) {
        eh.shieldMesh.rotation.y = timeSec * 0.9;
      }

      // Boss pulse telegraph
      if (eh.telegraphMesh) {
        eh.telegraphMesh.visible = !e.dead && e.bossTelegraphTimer > 0;
        if (eh.telegraphMesh.visible) {
          const pulse = 1 + (1.2 - e.bossTelegraphTimer) * 1.4;
          eh.telegraphMesh.scale.setScalar(pulse);
        }
      }

      // Billboard HP & Shield Bars
      eh.barGroup.visible = !e.dead && (e.hp < e.maxHp || e.shield < e.maxShield || e.archetype === 'boss');
      if (eh.barGroup.visible) {
        eh.barGroup.quaternion.copy(this.camera.quaternion);
        const hpRatio = THREE.MathUtils.clamp(e.hp / Math.max(1, e.maxHp), 0.001, 1);
        eh.hpBarFill.scale.x = hpRatio;
        const barW = e.archetype === 'boss' ? 0.82 : 0.54;
        eh.hpBarFill.position.x = -(barW * (1 - hpRatio)) * 0.5;

        const hpMat = eh.hpBarFill.material as THREE.MeshBasicMaterial;
        hpMat.color.setHex(hpRatio > 0.5 ? 0x34d399 : hpRatio > 0.25 ? 0xfbbf24 : 0xef4444);

        const hasShield = e.maxShield > 0 && e.shield > 0;
        eh.shieldBarBg.visible = hasShield;
        eh.shieldBarFill.visible = hasShield;
        if (hasShield) {
          const shRatio = THREE.MathUtils.clamp(e.shield / e.maxShield, 0.001, 1);
          eh.shieldBarFill.scale.x = shRatio;
          eh.shieldBarFill.position.x = -(barW * (1 - shRatio)) * 0.5;
        }
      }
    }
    for (const [id, eh] of this.enemyModels) {
      if (!activeEnemyIds.has(id)) {
        this.entityGroup.remove(eh.group);
        eh.dispose();
        this.enemyModels.delete(id);
      }
    }

    // 3. Sync Projectiles (with Cryo parabolic arc!)
    while (this.projMeshes.length < run.projectiles.length) {
      const m = new THREE.Mesh(
        this.projSphereGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      this.projectileGroup.add(m);
      this.projMeshes.push(m);
    }
    for (let i = 0; i < this.projMeshes.length; i++) {
      const m = this.projMeshes[i];
      if (i >= run.projectiles.length) {
        m.visible = false;
        continue;
      }
      const p = run.projectiles[i];
      m.visible = true;
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.set(p.color);

      const isBoltProj =
        p.towerType === 'rail' ||
        p.towerType === 'siege_autocannon' ||
        p.towerType === 'glacial_lance' ||
        p.towerType === 'plasma_railgun' ||
        p.towerType === 'omega_railgun' ||
        p.towerType === 'vulcan_behemoth';
      const isMissileProj = p.towerType === 'missile' || p.towerType === 'salvo_bastion';
      if (isBoltProj) {
        if (m.geometry !== this.projBoltGeo) m.geometry = this.projBoltGeo;
        m.rotation.set(0, -Math.atan2(p.vy, p.vx), 0);
      } else if (isMissileProj) {
        if (m.geometry !== this.projMissileGeo) m.geometry = this.projMissileGeo;
        m.rotation.set(0, -Math.atan2(p.vy, p.vx), 0);
      } else {
        if (m.geometry !== this.projSphereGeo) m.geometry = this.projSphereGeo;
        m.rotation.set(0, 0, 0);
      }

      let py = 0.36;
      if (p.towerType === 'cryo' || p.towerType === 'absolute_zero') {
        const totalDist = Math.max(0.5, Math.hypot(p.targetX - p.x, p.targetY - p.y) + 0.01);
        const arc = Math.min(1.4, totalDist * 0.32);
        py = 0.36 + Math.sin(Math.min(1, p.life) * Math.PI) * arc;
      }
      m.position.set(this.simToWorldX(p.x), py, this.simToWorldZ(p.y));
      m.scale.setScalar(
        p.isCrit
          ? 1.38
          : p.towerType === 'pyro' || p.towerType === 'inferno_hydra'
            ? 1.22
            : 1.0,
      );
    }

    // 4. Sync Transient Arcs, Volumetric Laser Beams & Rings
    this.vfxGroup.traverse((obj) => {
      if ((obj as THREE.Line).isLine || (obj as THREE.Mesh).isMesh) {
        const o = obj as THREE.Mesh | THREE.Line;
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m?.dispose();
      }
    });
    this.vfxGroup.clear();

    for (const arc of run.arcs) {
      if (arc.points.length < 2) continue;
      const pts = arc.points.map(
        (pt, idx) =>
          new THREE.Vector3(
            this.simToWorldX(pt.x),
            0.42 + (idx % 2 === 0 ? 0.04 : -0.02),
            this.simToWorldZ(pt.y),
          ),
      );
      const opacity = Math.max(0, arc.life / arc.maxLife);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({
        color: arc.color,
        transparent: true,
        opacity,
      });
      this.vfxGroup.add(new THREE.Line(lineGeo, lineMat));

      // Render volumetric 3D beam cylinders for wide/heavy energy beams (Laser, Solar Obelisk, Omega arcs)
      if (arc.width >= 3.0) {
        for (let s = 0; s < pts.length - 1; s++) {
          const a = pts[s];
          const b = pts[s + 1];
          const segLen = a.distanceTo(b);
          if (segLen < 0.05) continue;
          const beamRad = arc.width >= 4.0 ? 0.055 * opacity : 0.036 * opacity;
          const beamMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(beamRad, beamRad, segLen, 6),
            new THREE.MeshBasicMaterial({
              color: arc.color,
              transparent: true,
              opacity: opacity * 0.85,
              depthWrite: false,
            }),
          );
          beamMesh.position.lerpVectors(a, b, 0.5);
          beamMesh.quaternion.setFromUnitVectors(
            _up,
            _fwd.subVectors(b, a).normalize(),
          );
          this.vfxGroup.add(beamMesh);
        }
      }
    }

    for (const ring of run.rings) {
      const alpha = Math.max(0, ring.life / ring.maxLife);
      const rOuter = Math.max(0.1, ring.radius);
      const rInner = Math.max(0.04, rOuter - 0.14);
      const ringMesh = new THREE.Mesh(
        new THREE.RingGeometry(rInner, rOuter, 32),
        new THREE.MeshBasicMaterial({
          color: ring.color,
          transparent: true,
          opacity: alpha * 0.78,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.set(this.simToWorldX(ring.x), 0.06, this.simToWorldZ(ring.y));
      this.vfxGroup.add(ringMesh);

      // Orbital Lance vertical thermal sky-beam cylinder
      if (ring.maxRadius >= 1.8 && ring.color.toUpperCase() === '#EF4444') {
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18 * alpha, 0.42 * alpha, 9, 12),
          new THREE.MeshBasicMaterial({
            color: 0xfca5a5,
            transparent: true,
            opacity: alpha * 0.65,
            depthWrite: false,
          }),
        );
        beam.position.set(this.simToWorldX(ring.x), 4.5, this.simToWorldZ(ring.y));
        this.vfxGroup.add(beam);
      }
    }

    // 5. Sync Floating Combat Text Sprites
    for (let i = 0; i < this.floatingSlots.length; i++) {
      const slot = this.floatingSlots[i];
      const ft = run.floatingTexts[i];
      if (!ft) {
        slot.sprite.visible = false;
        slot.assignedRef = null;
        continue;
      }
      if (slot.assignedRef !== ft) {
        slot.assignedRef = ft;
        const c = slot.ctx;
        c.clearRect(0, 0, 288, 56);
        c.font = '700 22px "JetBrains Mono", monospace';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.lineWidth = 4;
        c.strokeStyle = 'rgba(11, 15, 20, 0.9)';
        c.strokeText(ft.text, 144, 28);
        c.fillStyle = ft.color;
        c.fillText(ft.text, 144, 28);
        slot.texture.needsUpdate = true;
      }
      const alpha = THREE.MathUtils.clamp(ft.life / Math.max(0.01, ft.maxLife), 0, 1);
      (slot.sprite.material as THREE.SpriteMaterial).opacity = alpha;
      slot.sprite.position.set(
        this.simToWorldX(ft.x),
        0.72 + (1 - alpha) * 0.55,
        this.simToWorldZ(ft.y),
      );
      slot.sprite.visible = true;
    }

    // 6. Sync Hover & Selected Range Rings
    if (hoverCell) {
      const wx = this.simToWorldX(hoverCell.col + 0.5);
      const wz = this.simToWorldZ(hoverCell.row + 0.5);
      this.hoverTileFrame.position.set(wx, 0, wz);
      this.hoverTileFrame.visible = true;

      if (run.pendingCombineTowerId !== null) {
        const hoveredTower = run.towers.find(
          (t) => t.col === hoverCell.col && t.row === hoverCell.row,
        );
        const primary = run.towers.find((t) => t.id === run.pendingCombineTowerId);
        if (
          hoveredTower &&
          primary &&
          canCombineTowers(run, primary.id, hoveredTower.id)
        ) {
          const combined = getCombinedTowerType(primary.type, hoveredTower.type);
          const def = combined ? TOWER_DEFS[combined] : null;
          this.hoverTileMat.color.setHex(0x38bdf8);
          this.hoverRangeMat.color.set(def?.accentColor ?? '#38BDF8');
          this.hoverRangeRing.position.set(
            this.simToWorldX(primary.col + 0.5),
            0.055,
            this.simToWorldZ(primary.row + 0.5),
          );
          this.hoverRangeRing.scale.setScalar(def ? def.range * (primary.onVantage ? 1.15 : 1) : 3.2);
          this.hoverRangeRing.visible = true;
        } else {
          this.hoverTileMat.color.setHex(0x64748b);
          this.hoverRangeRing.visible = false;
        }
      } else if (run.pendingTargetingAbility === 'orbital_lance') {
        this.hoverTileMat.color.setHex(0xef4444);
        this.hoverRangeMat.color.setHex(0xef4444);
        this.hoverRangeRing.position.set(wx, 0.05, wz);
        this.hoverRangeRing.scale.setScalar(2.0);
        this.hoverRangeRing.visible = true;
      } else if (run.selectedBuildType) {
        const def = TOWER_DEFS[run.selectedBuildType];
        const buildable = canPlaceTowerAt(run, hoverCell.col, hoverCell.row);
        const underCap = canBuildTower(run, run.selectedBuildType).ok;
        const affordable = run.scrap >= def.cost;
        const valid = buildable && affordable && underCap;
        this.hoverTileMat.color.setHex(valid ? 0x34d399 : 0xef4444);
        const onVantage = run.map.tiles[hoverCell.row]?.[hoverCell.col] === 'vantage';
        const range = def.range * (onVantage ? 1.15 : 1.0);
        this.hoverRangeMat.color.set(def.accentColor);
        this.hoverRangeRing.position.set(wx, 0.05, wz);
        this.hoverRangeRing.scale.setScalar(range);
        this.hoverRangeRing.visible = buildable && underCap;
      } else {
        this.hoverTileMat.color.setHex(0xe2c896);
        this.hoverRangeRing.visible = false;
      }
    } else {
      this.hoverTileFrame.visible = false;
      this.hoverRangeRing.visible = false;
    }

    const selTower =
      run.selectedTowerId !== null
        ? run.towers.find((t) => t.id === run.selectedTowerId) ?? null
        : null;
    if (selTower) {
      const stats = computeTowerEffectiveStats(selTower, run);
      (this.selectedRangeRing.material as THREE.MeshBasicMaterial).color.set(
        TOWER_DEFS[selTower.type].accentColor,
      );
      this.selectedRangeRing.position.set(
        this.simToWorldX(selTower.col + 0.5),
        selTower.onVantage ? 0.155 : 0.055,
        this.simToWorldZ(selTower.row + 0.5),
      );
      this.selectedRangeRing.scale.setScalar(stats.range);
      this.selectedRangeRing.visible = true;
    } else {
      this.selectedRangeRing.visible = false;
    }

    // 7. Apply temporary camera shake (trauma^2) around render
    const shakeMag = run.trauma * run.trauma * 0.22;
    if (shakeMag > 0.002) {
      this.shakeOffset.set(
        (Math.random() - 0.5) * shakeMag,
        (Math.random() - 0.5) * shakeMag * 0.4,
        (Math.random() - 0.5) * shakeMag,
      );
      this.camera.position.add(this.shakeOffset);
      this.renderer.render(this.scene, this.camera);
      this.camera.position.sub(this.shakeOffset);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  renderOnce() {
    if (this.disposed || this.contextLost) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Paces the next animation callback.
   * On software WebGL (SwiftShader/llvmpipe), waits for GPU fenceSync to signal
   * so headless screenshots never starve or hang the compositor.
   */
  scheduleNextTick(cb: (now: number) => void) {
    this.cancelScheduledFrame();
    if (this.disposed || this.contextLost) return;

    if (!this.isSoftwareGl) {
      this.scheduledRaf = requestAnimationFrame(cb);
      return;
    }

    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = typeof gl.fenceSync === 'function' ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
    if (!sync) {
      this.scheduledTimeout = window.setTimeout(() => cb(performance.now()), 80);
      return;
    }

    const poll = () => {
      if (this.disposed) {
        gl.deleteSync(sync);
        return;
      }
      const status = gl.clientWaitSync(sync, gl.SYNC_FLUSH_COMMANDS_BIT, 0);
      if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
        gl.deleteSync(sync);
        this.scheduledTimeout = window.setTimeout(() => cb(performance.now()), 80);
      } else {
        this.scheduledTimeout = window.setTimeout(poll, 5);
      }
    };
    this.scheduledTimeout = window.setTimeout(poll, 5);
  }

  cancelScheduledFrame() {
    if (this.scheduledRaf !== null) {
      cancelAnimationFrame(this.scheduledRaf);
      this.scheduledRaf = null;
    }
    if (this.scheduledTimeout !== null) {
      clearTimeout(this.scheduledTimeout);
      this.scheduledTimeout = null;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelScheduledFrame();
    this.resizeObserver.disconnect();

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.handlePointerDown);
    dom.removeEventListener('pointermove', this.handlePointerMove);
    dom.removeEventListener('pointerup', this.handlePointerUp);
    dom.removeEventListener('pointerleave', this.handlePointerLeave);
    dom.removeEventListener('contextmenu', this.handleContextMenu);
    dom.removeEventListener('webglcontextlost', this.handleContextLost);
    dom.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.clearDynamicEntities();
    for (const lm of this.landmarks) lm.dispose();
    this.landmarks = [];

    for (const slot of this.floatingSlots) {
      slot.texture.dispose();
      (slot.sprite.material as THREE.Material).dispose();
    }

    this.projSphereGeo.dispose();
    this.projBoltGeo.dispose();
    this.projMissileGeo.dispose();
    this.particleInstanced.geometry.dispose();
    (this.particleInstanced.material as THREE.Material).dispose();
    this.textures.dispose();
    this.envTexture.dispose();

    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.Line).isLine) {
        const m = obj as THREE.Mesh | THREE.Line;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) mat?.dispose();
      }
    });

    this.controls.dispose();
    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
