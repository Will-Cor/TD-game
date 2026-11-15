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
  getTowerCoords,
} from './simulation';
import { createProceduralTextures, type ProceduralTextureSet } from './textures3d';
import {
  createCourtyardPocketProp,
  createThemedSceneryProp,
  getLevelTheme,
  type LevelThemeConfig,
} from './themes3d';
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
const _ptA = new THREE.Vector3();
const _ptB = new THREE.Vector3();

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

interface ArcLineSlot {
  line: THREE.Line;
  positions: Float32Array;
  mat: THREE.LineBasicMaterial;
}

interface PingVisualSlot {
  group: THREE.Group;
  zoneRing: THREE.Mesh;
  pulseRing: THREE.Mesh;
  pillar: THREE.Mesh;
  diamond: THREE.Mesh;
  zoneMat: THREE.MeshBasicMaterial;
  pulseMat: THREE.MeshBasicMaterial;
  pillarMat: THREE.MeshBasicMaterial;
  diamondMat: THREE.MeshStandardMaterial;
}

export interface BoardHoverEvent {
  inside: boolean;
  col: number;
  row: number;
  simX: number;
  simY: number;
}

export interface BoardClickEvent {
  inside: boolean;
  col: number;
  row: number;
  simX: number;
  simY: number;
  shiftKey?: boolean;
  button?: number;
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

/**
 * Builds a single continuous, seamless plaza floor mesh over [-apron, cols+apron] x [-apron, rows+apron]
 * skipping path/spawn/exit cells so the sunken glowing canal channel is genuinely carved below y = 0.
 * Continuous world UVs ensure zero visible tile borders anywhere on the plaza.
 */
function buildSeamlessPlazaGeometry(map: GameMap, apron = 2): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const isPathCell = (c: number, r: number) => {
    if (c < 0 || c >= map.cols || r < 0 || r >= map.rows) return false;
    const k = map.tiles[r]?.[c];
    return k === 'path' || k === 'spawn' || k === 'exit';
  };

  let vertOffset = 0;
  for (let r = -apron; r < map.rows + apron; r++) {
    for (let c = -apron; c < map.cols + apron; c++) {
      if (isPathCell(c, r)) continue;
      const x0 = c - map.cols * 0.5;
      const x1 = x0 + 1;
      const z0 = r - map.rows * 0.5;
      const z1 = z0 + 1;

      positions.push(
        x0, 0, z0,
        x1, 0, z0,
        x1, 0, z1,
        x0, 0, z1,
      );
      normals.push(
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
      );
      // Continuous world UV tiling (1 tile unit = one 16x16 pixel repeat)
      uvs.push(
        c, r,
        c + 1, r,
        c + 1, r + 1,
        c, r + 1,
      );
      indices.push(
        vertOffset, vertOffset + 3, vertOffset + 2,
        vertOffset, vertOffset + 2, vertOffset + 1,
      );
      vertOffset += 4;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
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
  private perimeterGroup = new THREE.Group();
  private horizonMat!: THREE.MeshStandardMaterial;
  private hemiLight!: THREE.HemisphereLight;
  private keyLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private currentMapSeed: number | null = null;
  private currentMapLevel: number | null = null;
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
  private pathPreviewGroup = new THREE.Group();
  private pathPulseArrows: THREE.Mesh[] = [];
  private currentPathPoints: THREE.Vector3[] = [];
  private pingGroup = new THREE.Group();

  // Shared unit geometries + static VFX/Ping pools (ZERO per-frame dispose/alloc)
  private projSphereGeo = new THREE.SphereGeometry(0.1, 8, 6);
  private projBoltGeo = new THREE.BoxGeometry(0.32, 0.07, 0.07);
  private projMissileGeo = new THREE.ConeGeometry(0.085, 0.34, 6);
  private projMeshes: THREE.Mesh[] = [];

  private unitRingGeo = new THREE.RingGeometry(0.84, 1.0, 28);
  private unitBeamGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
  private unitSkyBeamGeo = new THREE.CylinderGeometry(0.18, 0.42, 9, 10);
  private unitPingDiamondGeo = new THREE.OctahedronGeometry(0.22, 0);
  private unitPingPillarGeo = new THREE.CylinderGeometry(0.035, 0.11, 2.8, 8);

  private ringPool: THREE.Mesh[] = [];
  private skyBeamPool: THREE.Mesh[] = [];
  private arcLinePool: ArcLineSlot[] = [];
  private arcBeamPool: THREE.Mesh[] = [];
  private pingPool: PingVisualSlot[] = [];

  // Pooled 3D particle InstancedMesh
  private readonly maxParticles = 220;
  private particles: Particle3D[] = [];
  private particleInstanced: THREE.InstancedMesh;

  // Floating 3D text sprite pool
  private floatingSlots: FloatingSpriteSlot[] = [];
  private floatingGroup = new THREE.Group();

  // Smooth circular tactical cursor / selection / orbital target overlays (no square tile box!)
  private hoverCircleFrame: THREE.Group;
  private hoverCircleMat: THREE.MeshBasicMaterial;
  private hoverCircleEdgeMat: THREE.MeshBasicMaterial;
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
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.5),
    );
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
    this.scene.background = new THREE.Color(0x112438);
    this.scene.fog = new THREE.FogExp2(0x112438, 0.018);

    // Environment reflection map for metallic turrets & armor
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envTexture = pmrem.fromScene(roomEnv, 0.04).texture;
    this.scene.environment = this.envTexture;
    roomEnv.dispose();
    pmrem.dispose();

    this.projMissileGeo.rotateZ(-Math.PI / 2);
    this.textures = createProceduralTextures();

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
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x3b5875, 0.92);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff3dc, 2.35);
    this.keyLight.position.set(9.5, 16, 8.5);
    if (!this.isSoftwareGl) {
      this.keyLight.castShadow = true;
      this.keyLight.shadow.mapSize.set(1024, 1024);
      this.keyLight.shadow.camera.left = -12;
      this.keyLight.shadow.camera.right = 12;
      this.keyLight.shadow.camera.top = 9;
      this.keyLight.shadow.camera.bottom = -9;
      this.keyLight.shadow.camera.near = 1;
      this.keyLight.shadow.camera.far = 40;
      this.keyLight.shadow.bias = -0.0005;
      this.keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0x60a5fa, 0.85);
    this.rimLight.position.set(-10, 8, -11);
    this.scene.add(this.rimLight);

    // Sculpted Extended Surround Terrain with tiled 16x16 pixel texture
    const horizonGeo = new THREE.PlaneGeometry(88, 88, 28, 28);
    horizonGeo.rotateX(-Math.PI / 2);
    const posAttr = horizonGeo.attributes.position;
    const uvAttr = horizonGeo.attributes.uv;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      posAttr.setY(i, this.horizonYAt(vx, vz));
      uvAttr.setXY(i, vx, vz);
    }
    horizonGeo.computeVertexNormals();
    this.horizonMat = new THREE.MeshStandardMaterial({
      color: 0x8ea7c4,
      map: this.textures.groundMap,
      roughness: 0.9,
      metalness: 0.04,
      flatShading: true,
    });
    const horizonMesh = new THREE.Mesh(horizonGeo, this.horizonMat);
    horizonMesh.receiveShadow = true;
    this.scene.add(horizonMesh);

    this.scene.add(this.perimeterGroup);

    // Map, Path Preview, Entity, Projectile, VFX, Ping, Floating text groups
    this.mapGroup = new THREE.Group();
    this.scene.add(this.mapGroup);
    this.scene.add(this.pathPreviewGroup);
    this.scene.add(this.entityGroup);
    this.scene.add(this.projectileGroup);
    this.scene.add(this.vfxGroup);
    this.scene.add(this.pingGroup);
    this.scene.add(this.floatingGroup);

    // Pre-allocate VFX & Tactical Ping object pools (eliminates per-frame GC/dispose overhead!)
    this.initPools();

    // Raycast plane covering 16x10 sector cleanly
    const planeGeo = new THREE.PlaneGeometry(16, 10);
    planeGeo.rotateX(-Math.PI / 2);
    this.raycastPlane = new THREE.Mesh(
      planeGeo,
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.raycastPlane.position.y = 0.01;
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

    // Smooth Circular Hover Footprint + Range Ring (no tile grid box!)
    this.hoverCircleFrame = new THREE.Group();
    this.hoverCircleMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const innerDisc = new THREE.Mesh(new THREE.CircleGeometry(0.36, 28), this.hoverCircleMat);
    innerDisc.rotation.x = -Math.PI / 2;
    innerDisc.position.y = 0.025;
    this.hoverCircleFrame.add(innerDisc);

    this.hoverCircleEdgeMat = new THREE.MeshBasicMaterial({
      color: 0xfef3c7,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.42, 28),
      this.hoverCircleEdgeMat,
    );
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.03;
    this.hoverCircleFrame.add(outerRing);
    this.hoverCircleFrame.visible = false;
    this.scene.add(this.hoverCircleFrame);

    this.hoverRangeMat = new THREE.MeshBasicMaterial({
      color: 0xe5a93c,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.hoverRangeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.96, 1.0, 48),
      this.hoverRangeMat,
    );
    this.hoverRangeRing.rotation.x = -Math.PI / 2;
    this.hoverRangeRing.position.y = 0.035;
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
    this.selectedRangeRing.position.y = 0.04;
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

  private initPools() {
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(
        this.unitRingGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.75,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.vfxGroup.add(m);
      this.ringPool.push(m);
    }

    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(
        this.unitSkyBeamGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfca5a5,
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
        }),
      );
      m.visible = false;
      this.vfxGroup.add(m);
      this.skyBeamPool.push(m);
    }

    for (let i = 0; i < 24; i++) {
      const positions = new Float32Array(12 * 3);
      const geo = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(positions, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', attr);
      geo.setDrawRange(0, 0);
      const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      this.vfxGroup.add(line);
      this.arcLinePool.push({ line, positions, mat });
    }

    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(
        this.unitBeamGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
        }),
      );
      m.visible = false;
      this.vfxGroup.add(m);
      this.arcBeamPool.push(m);
    }

    for (let i = 0; i < 4; i++) {
      const group = new THREE.Group();
      const zoneMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const zoneRing = new THREE.Mesh(this.unitRingGeo, zoneMat);
      zoneRing.rotation.x = -Math.PI / 2;
      zoneRing.position.y = 0.048;

      const pulseMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const pulseRing = new THREE.Mesh(this.unitRingGeo, pulseMat);
      pulseRing.rotation.x = -Math.PI / 2;
      pulseRing.position.y = 0.052;

      const pillarMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      });
      const pillar = new THREE.Mesh(this.unitPingPillarGeo, pillarMat);
      pillar.position.y = 1.45;

      const diamondMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.9,
        roughness: 0.2,
        metalness: 0.4,
        transparent: true,
        opacity: 1,
      });
      const diamond = new THREE.Mesh(this.unitPingDiamondGeo, diamondMat);

      group.add(zoneRing, pulseRing, pillar, diamond);
      group.visible = false;
      this.pingGroup.add(group);
      this.pingPool.push({
        group,
        zoneRing,
        pulseRing,
        pillar,
        diamond,
        zoneMat,
        pulseMat,
        pillarMat,
        diamondMat,
      });
    }
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
    const inside =
      simX >= 0 && simX <= this.currentMapCols && simY >= 0 && simY <= this.currentMapRows;
    return {
      inside,
      col: Math.max(0, Math.min(this.currentMapCols - 1, col)),
      row: Math.max(0, Math.min(this.currentMapRows - 1, row)),
      simX,
      simY,
    };
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
    if (now - this.lastHoverRaycastMs < 18) return;
    this.lastHoverRaycastMs = now;
    const hit = this.raycastBoard(e.clientX, e.clientY);
    this.onHoverCallback?.({
      inside: hit.inside,
      col: hit.col,
      row: hit.row,
      simX: hit.simX,
      simY: hit.simY,
    });
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (!this.pointerDownPos) return;
    const dx = e.clientX - this.pointerDownPos.x;
    const dy = e.clientY - this.pointerDownPos.y;
    const dist = Math.hypot(dx, dy);
    const btn = this.pointerDownPos.button;
    const isBoardClick = (btn === 0 && e.button === 0) || (btn === 1 && e.button === 1);
    this.pointerDownPos = null;

    if (isBoardClick && dist < 7) {
      const hit = this.raycastBoard(e.clientX, e.clientY);
      this.onClickCallback?.({ ...hit, shiftKey: e.shiftKey, button: btn });
    }
  };

  private handlePointerLeave = () => {
    this.onHoverCallback?.({ inside: false, col: -1, row: -1, simX: 0, simY: 0 });
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
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.5),
    );
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
    const hasInput =
      this.panKeys.up || this.panKeys.down || this.panKeys.left || this.panKeys.right;
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

  private horizonYAt(vx: number, vz: number): number {
    const distX = Math.max(0, Math.abs(vx) - 10.2);
    const distZ = Math.max(0, Math.abs(vz) - 7.2);
    const radial = Math.hypot(distX, distZ);
    const ridge =
      radial > 0.25
        ? Math.min(2.4, radial * 0.14) *
          (0.65 + 0.35 * Math.sin(vx * 0.4 + vz * 0.3) + 0.25 * Math.cos(vx * 0.8 - vz * 0.6))
        : 0;
    return -0.22 + ridge;
  }

  private applyBiomeScenery(theme: LevelThemeConfig, seed: number) {
    this.scene.background = new THREE.Color(theme.skyColor);
    this.scene.fog = new THREE.FogExp2(theme.skyColor, theme.fogDensity);
    this.hemiLight.color.setHex(theme.hemiSky);
    this.hemiLight.groundColor.setHex(theme.hemiGround);
    this.hemiLight.intensity = theme.hemiIntensity;
    this.keyLight.color.setHex(theme.keyColor);
    this.keyLight.intensity = theme.keyIntensity;
    this.rimLight.color.setHex(theme.rimColor);
    this.rimLight.intensity = theme.rimIntensity;
    this.horizonMat.color.setHex(theme.terrainColor);

    this.perimeterGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) mat?.dispose();
      }
    });
    this.perimeterGroup.clear();

    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2 + (seed % 7) * 0.06;
      const rx = Math.cos(angle) * (10.6 + (i % 3) * 1.45);
      const rz = Math.sin(angle) * (7.3 + ((i + 1) % 3) * 1.25);
      const groundY = this.horizonYAt(rx, rz);

      const prop = createThemedSceneryProp(theme, seed + i * 53, this.textures);
      const sc = 0.95 + (i % 3) * 0.2;
      prop.scale.setScalar(sc);
      prop.rotation.y = Math.round(((i * 1.57) % (Math.PI * 2)) / (Math.PI / 2)) * (Math.PI / 2);
      prop.position.set(rx, Math.max(-0.08, groundY), rz);
      this.perimeterGroup.add(prop);
    }
  }

  private buildMapGeometry(map: GameMap) {
    this.currentMapSeed = map.seed;
    this.currentMapLevel = map.level;
    this.currentMapCols = map.cols;
    this.currentMapRows = map.rows;

    const theme = getLevelTheme(map.level);
    this.applyBiomeScenery(theme, map.seed);

    for (const lm of this.landmarks) lm.dispose();
    this.landmarks = [];
    this.mapGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.Line).isLine) {
        const m = obj as THREE.Mesh | THREE.Line;
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) mat?.dispose();
      }
    });
    this.mapGroup.clear();

    this.pathPreviewGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.Line).isLine) {
        const m = obj as THREE.Mesh | THREE.Line;
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) mat?.dispose();
      }
    });
    this.pathPreviewGroup.clear();
    this.pathPulseArrows = [];
    this.currentPathPoints = [];

    this.raycastPlane.geometry.dispose();
    const newPlane = new THREE.PlaneGeometry(map.cols, map.rows);
    newPlane.rotateX(-Math.PI / 2);
    this.raycastPlane.geometry = newPlane;

    // 1. Continuous Tile-Free Plaza Surface (ZERO chessboard grid tiles, ZERO platforms!)
    const plazaGeo = buildSeamlessPlazaGeometry(map, 2);
    const plazaMat = new THREE.MeshStandardMaterial({
      color: theme.plazaColor,
      map: this.textures.groundMap,
      roughness: 0.84,
      metalness: 0.06,
    });
    const plazaMesh = new THREE.Mesh(plazaGeo, plazaMat);
    plazaMesh.receiveShadow = true;
    this.mapGroup.add(plazaMesh);

    // Subtle recessed plaza foundation apron skirt
    const subBed = new THREE.Mesh(
      new THREE.BoxGeometry(map.cols + 4.0, 0.24, map.rows + 4.0),
      new THREE.MeshStandardMaterial({
        color: theme.terrainColor,
        roughness: 0.9,
        metalness: 0.05,
      }),
    );
    subBed.position.y = -0.27;
    this.mapGroup.add(subBed);

    const pathCoords: GridCoord[] = [];
    const obstacleCoords: GridCoord[] = [];
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const kind = map.tiles[r][c];
        if (kind === 'obstacle') obstacleCoords.push({ col: c, row: r });
        else if (kind === 'path' || kind === 'spawn' || kind === 'exit') {
          pathCoords.push({ col: c, row: r });
        }
      }
    }

    // 2. Sunken Glowing Canal / Trench Trail (recessed below plaza y = 0, styled after Edge of Heaven!)
    if (pathCoords.length > 0) {
      const roadGeo = new THREE.BoxGeometry(1.0, 0.04, 1.0);
      const roadMat = new THREE.MeshStandardMaterial({
        color: theme.roadColor,
        emissive: theme.roadEmissive,
        emissiveIntensity: theme.roadEmissiveIntensity,
        map: this.textures.roadMap,
        roughness: 0.52,
        metalness: 0.24,
      });
      const roadInst = new THREE.InstancedMesh(roadGeo, roadMat, pathCoords.length);
      roadInst.receiveShadow = true;
      pathCoords.forEach((coord, i) => {
        _pos.set(this.simToWorldX(coord.col + 0.5), -0.14, this.simToWorldZ(coord.row + 0.5));
        _quat.identity();
        _scale.set(1, 1, 1);
        _mat4.compose(_pos, _quat, _scale);
        roadInst.setMatrixAt(i, _mat4);
      });
      roadInst.instanceMatrix.needsUpdate = true;
      this.mapGroup.add(roadInst);

      // Crisp sunken trench retaining walls & raised stone curbstones around canal edges
      const curbPositions: { x: number; z: number; rotY: number }[] = [];
      const isRoadKind = (c: number, r: number) => {
        const k = map.tiles[r]?.[c];
        return k === 'path' || k === 'spawn' || k === 'exit';
      };
      for (const coord of pathCoords) {
        const wx = this.simToWorldX(coord.col + 0.5);
        const wz = this.simToWorldZ(coord.row + 0.5);
        if (!isRoadKind(coord.col, coord.row - 1)) {
          curbPositions.push({ x: wx, z: wz - 0.5, rotY: 0 });
        }
        if (!isRoadKind(coord.col, coord.row + 1)) {
          curbPositions.push({ x: wx, z: wz + 0.5, rotY: 0 });
        }
        if (coord.col > 0 && !isRoadKind(coord.col - 1, coord.row)) {
          curbPositions.push({ x: wx - 0.5, z: wz, rotY: Math.PI / 2 });
        }
        if (coord.col < map.cols - 1 && !isRoadKind(coord.col + 1, coord.row)) {
          curbPositions.push({ x: wx + 0.5, z: wz, rotY: Math.PI / 2 });
        }
      }
      if (curbPositions.length > 0) {
        const curbGeo = new THREE.BoxGeometry(1.04, 0.19, 0.085);
        const curbMat = new THREE.MeshStandardMaterial({
          color: theme.curbColor,
          map: this.textures.terraceMap,
          roughness: 0.65,
          metalness: 0.25,
        });
        const curbInst = new THREE.InstancedMesh(curbGeo, curbMat, curbPositions.length);
        curbInst.receiveShadow = true;
        curbInst.castShadow = true;
        curbPositions.forEach((cp, idx) => {
          _pos.set(cp.x, -0.055, cp.z);
          _quat.setFromAxisAngle(_up, cp.rotY);
          _scale.set(1, 1, 1);
          _mat4.compose(_pos, _quat, _scale);
          curbInst.setMatrixAt(idx, _mat4);
        });
        curbInst.instanceMatrix.needsUpdate = true;
        this.mapGroup.add(curbInst);
      }

      // Subtle glowing directional canal chevrons along trench floor
      const markerMat = new THREE.MeshBasicMaterial({
        color: theme.chevronColor,
        transparent: true,
        opacity: 0.58,
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
          -0.112,
          this.simToWorldZ(cur.row + 0.5),
        );
        this.mapGroup.add(chevron);
      }
    }

    // 3. Courtyard Pocket Props (stepped terraces, plaza umbrellas, planters) on obstacles
    for (const coord of obstacleCoords) {
      const prop = createCourtyardPocketProp(
        theme,
        map.seed + coord.col * 31 + coord.row * 97,
        this.textures,
      );
      prop.position.set(this.simToWorldX(coord.col + 0.5), 0, this.simToWorldZ(coord.row + 0.5));
      this.mapGroup.add(prop);
    }

    // 4. Spawn Breach Gate & Exit Citadel Spire (seated neatly at canal ends)
    const gate = createSpawnGateModel();
    gate.group.position.set(
      this.simToWorldX(map.spawn.col + 0.5),
      -0.12,
      this.simToWorldZ(map.spawn.row + 0.5),
    );
    this.mapGroup.add(gate.group);
    this.landmarks.push(gate);

    const citadel = createBastionCitadelModel();
    citadel.group.position.set(
      this.simToWorldX(map.exit.col + 0.5),
      -0.12,
      this.simToWorldZ(map.exit.row + 0.5),
    );
    this.mapGroup.add(citadel.group);
    this.landmarks.push(citadel);

    // 5. Animated Enemy Path Guide Ribbon seated cleanly inside the sunken canal
    if (map.path.length >= 2) {
      const pathPts = map.path.map(
        (wp) =>
          new THREE.Vector3(
            this.simToWorldX(wp.col + 0.5),
            -0.095,
            this.simToWorldZ(wp.row + 0.5),
          ),
      );
      this.currentPathPoints = pathPts;

      const ribbonMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      });

      for (let i = 0; i < pathPts.length - 1; i++) {
        const a = pathPts[i];
        const b = pathPts[i + 1];
        const segLen = a.distanceTo(b);
        const segGeo = new THREE.BoxGeometry(0.14, 0.012, segLen + 0.14);
        const segMesh = new THREE.Mesh(segGeo, ribbonMat);
        segMesh.position.lerpVectors(a, b, 0.5);
        segMesh.position.y = -0.102;
        if (Math.abs(b.x - a.x) > Math.abs(b.z - a.z)) {
          segMesh.rotation.y = Math.PI / 2;
        }
        this.pathPreviewGroup.add(segMesh);
      }

      const exitRing = new THREE.Mesh(
        new THREE.RingGeometry(0.32, 0.43, 24),
        new THREE.MeshBasicMaterial({
          color: 0xef4444,
          transparent: true,
          opacity: 0.72,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      exitRing.rotation.x = -Math.PI / 2;
      const lastPt = pathPts[pathPts.length - 1];
      exitRing.position.set(lastPt.x, -0.095, lastPt.z);
      this.pathPreviewGroup.add(exitRing);

      const arrowMat = new THREE.MeshBasicMaterial({
        color: 0xfcd34d,
        transparent: true,
        opacity: 0.92,
      });
      const arrowGeo = new THREE.ConeGeometry(0.13, 0.28, 4);
      arrowGeo.rotateX(Math.PI / 2);
      const pulseCount = 10;
      for (let k = 0; k < pulseCount; k++) {
        const arrow = new THREE.Mesh(arrowGeo, arrowMat);
        arrow.position.copy(pathPts[0]);
        arrow.position.y = -0.075;
        this.pathPreviewGroup.add(arrow);
        this.pathPulseArrows.push(arrow);
      }
    }
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
      m.visible = false;
    }
    for (const m of this.ringPool) m.visible = false;
    for (const m of this.skyBeamPool) m.visible = false;
    for (const slot of this.arcLinePool) slot.line.visible = false;
    for (const m of this.arcBeamPool) m.visible = false;
    for (const p of this.pingPool) p.group.visible = false;

    for (const slot of this.floatingSlots) {
      slot.sprite.visible = false;
      slot.assignedRef = null;
    }
    this.hoverCircleFrame.visible = false;
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
    const types: TowerType[] = ['cannon', 'tesla', 'cryo'];
    let placed = 0;
    for (let c = 3; c < map.cols - 2 && placed < types.length; c += 3) {
      for (let r = 2; r < map.rows - 2 && placed < types.length; r++) {
        if (map.tiles[r][c] !== 'buildable') continue;
        const nearPath =
          map.tiles[r - 1]?.[c] === 'path' ||
          map.tiles[r + 1]?.[c] === 'path' ||
          map.tiles[r]?.[c - 1] === 'path' ||
          map.tiles[r]?.[c + 1] === 'path';
        if (!nearPath) continue;
        const tType = types[placed];
        const showcaseLevel = (placed === 1 ? 3 : placed === 2 ? 2 : 1) as 1 | 2 | 3;
        const handle = createTowerModel(tType, showcaseLevel, this.textures);
        handle.group.position.set(this.simToWorldX(c + 0.5), 0.0, this.simToWorldZ(r + 0.5));
        this.entityGroup.add(handle.group);
        this.towerModels.set(1000 + placed, { type: tType, level: showcaseLevel, handle });
        placed++;
        break;
      }
    }
  }

  syncTitle(map: GameMap, dt: number, timeSec: number) {
    if (
      !this.isTitleMode ||
      this.currentMapSeed !== map.seed ||
      this.currentMapLevel !== map.level
    ) {
      this.isTitleMode = true;
      this.clearDynamicEntities();
      this.buildMapGeometry(map);
      this.populateTitleShowcase(map);
    }
    this.pathPreviewGroup.visible = false;
    this.syncLandmarks(timeSec);
    this.updateParticles(dt);

    for (const [id, entry] of this.towerModels) {
      entry.handle.headGroup.rotation.y = Math.sin(timeSec * 0.7 + id) * 0.85;
      if (entry.handle.spinnerMesh) {
        entry.handle.spinnerMesh.rotation.y = timeSec * 2.2;
      }
    }

    const orbitX = Math.sin(timeSec * 0.16) * 1.4;
    this.controls.target.set(-2.3, 0, 0.25);
    this.camera.position.set(-2.0 + orbitX, 10.6, 11.4);
    this.controls.update();

    this.renderOnce();
  }

  private syncPathPulses(visible: boolean, timeSec: number) {
    this.pathPreviewGroup.visible = visible;
    if (!visible || this.currentPathPoints.length < 2 || this.pathPulseArrows.length === 0) {
      return;
    }
    const segCount = this.currentPathPoints.length - 1;
    const count = this.pathPulseArrows.length;
    for (let k = 0; k < count; k++) {
      const arrow = this.pathPulseArrows[k];
      const u = ((timeSec * 0.16 + k / count) % 1) * segCount;
      const idx = Math.min(segCount - 1, Math.floor(u));
      const frac = u - idx;
      const a = this.currentPathPoints[idx];
      const b = this.currentPathPoints[idx + 1];
      arrow.position.lerpVectors(a, b, frac);
      arrow.position.y = -0.075;
      arrow.rotation.set(0, Math.atan2(b.x - a.x, b.z - a.z), 0);
    }
  }

  syncRun(
    run: RunState,
    hoverPoint: { col: number; row: number; simX: number; simY: number } | null,
    dt: number,
    timeSec: number,
  ) {
    if (
      this.isTitleMode ||
      this.currentMapSeed !== run.map.seed ||
      this.currentMapLevel !== run.map.level
    ) {
      this.isTitleMode = false;
      this.clearDynamicEntities();
      this.buildMapGeometry(run.map);
    }

    this.syncPathPulses(run.showEnemyPath, timeSec);
    this.applyCameraPan(dt);
    this.controls.update();
    this.clampControlsTarget();
    this.syncLandmarks(timeSec);
    this.updateParticles(dt);

    // 1. Sync Towers directly at smooth continuous coordinates (t.x, t.y)
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
      const tc = getTowerCoords(t);
      h.group.position.set(this.simToWorldX(tc.x), 0.0, this.simToWorldZ(tc.y));
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

    // 2. Sync Enemies (seated smoothly inside the sunken trench floor at y = -0.11)
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
      eh.group.position.set(wx, -0.1, wz);

      const targetWp = run.map.path[Math.min(e.pathIndex, run.map.path.length - 1)];
      if (targetWp) {
        const dx = targetWp.col + 0.5 - e.x;
        const dz = targetWp.row + 0.5 - e.y;
        if (dx * dx + dz * dz > 0.0004) {
          eh.bodyGroup.rotation.y = -Math.atan2(dz, dx);
        }
      }

      const koScale = e.dead ? Math.max(0.01, e.koTimer / 0.3) : 1;
      eh.bodyGroup.scale.setScalar(koScale);

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

      eh.shieldMesh.visible = !e.dead && e.shield > 0;
      if (eh.shieldMesh.visible) {
        eh.shieldMesh.rotation.y = timeSec * 0.9;
      }

      if (eh.telegraphMesh) {
        eh.telegraphMesh.visible = !e.dead && e.bossTelegraphTimer > 0;
        if (eh.telegraphMesh.visible) {
          const pulse = 1 + (1.2 - e.bossTelegraphTimer) * 1.4;
          eh.telegraphMesh.scale.setScalar(pulse);
        }
      }

      eh.barGroup.visible =
        !e.dead && (e.hp < e.maxHp || e.shield < e.maxShield || e.archetype === 'boss');
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

    // 3. Sync Projectiles (pooled meshes)
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

      let py = 0.34;
      if (p.towerType === 'cryo' || p.towerType === 'absolute_zero') {
        const totalDist = Math.max(0.5, Math.hypot(p.targetX - p.x, p.targetY - p.y) + 0.01);
        const arc = Math.min(1.4, totalDist * 0.32);
        py = 0.34 + Math.sin(Math.min(1, p.life) * Math.PI) * arc;
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

    // 4. Sync Transient Arcs, Beams & Rings via Pre-Allocated Pools (ZERO per-frame alloc/dispose)
    let arcSlotIdx = 0;
    let beamSlotIdx = 0;
    for (const arc of run.arcs) {
      if (arc.points.length < 2) continue;
      const opacity = Math.max(0, arc.life / arc.maxLife);

      if (arcSlotIdx < this.arcLinePool.length) {
        const slot = this.arcLinePool[arcSlotIdx++];
        const count = Math.min(arc.points.length, 12);
        for (let k = 0; k < count; k++) {
          const pt = arc.points[k];
          slot.positions[k * 3] = this.simToWorldX(pt.x);
          slot.positions[k * 3 + 1] = 0.4 + (k % 2 === 0 ? 0.04 : -0.02);
          slot.positions[k * 3 + 2] = this.simToWorldZ(pt.y);
        }
        const attr = slot.line.geometry.attributes.position as THREE.BufferAttribute;
        attr.needsUpdate = true;
        slot.line.geometry.setDrawRange(0, count);
        slot.mat.color.set(arc.color);
        slot.mat.opacity = opacity;
        slot.line.visible = true;
      }

      if (arc.width >= 3.0) {
        for (let s = 0; s < arc.points.length - 1 && beamSlotIdx < this.arcBeamPool.length; s++) {
          const pa = arc.points[s];
          const pb = arc.points[s + 1];
          _ptA.set(this.simToWorldX(pa.x), 0.4 + (s % 2 === 0 ? 0.04 : -0.02), this.simToWorldZ(pa.y));
          _ptB.set(
            this.simToWorldX(pb.x),
            0.4 + ((s + 1) % 2 === 0 ? 0.04 : -0.02),
            this.simToWorldZ(pb.y),
          );
          const segLen = _ptA.distanceTo(_ptB);
          if (segLen < 0.05) continue;
          const beamRad = arc.width >= 4.0 ? 0.055 * opacity : 0.036 * opacity;
          const beamMesh = this.arcBeamPool[beamSlotIdx++];
          beamMesh.position.lerpVectors(_ptA, _ptB, 0.5);
          beamMesh.quaternion.setFromUnitVectors(_up, _fwd.subVectors(_ptB, _ptA).normalize());
          beamMesh.scale.set(beamRad, segLen, beamRad);
          const bm = beamMesh.material as THREE.MeshBasicMaterial;
          bm.color.set(arc.color);
          bm.opacity = opacity * 0.85;
          beamMesh.visible = true;
        }
      }
    }
    for (let i = arcSlotIdx; i < this.arcLinePool.length; i++) {
      this.arcLinePool[i].line.visible = false;
    }
    for (let i = beamSlotIdx; i < this.arcBeamPool.length; i++) {
      this.arcBeamPool[i].visible = false;
    }

    let ringIdx = 0;
    let skyIdx = 0;
    for (const ring of run.rings) {
      const alpha = Math.max(0, ring.life / ring.maxLife);
      const rOuter = Math.max(0.1, ring.radius);
      const wx = this.simToWorldX(ring.x);
      const wz = this.simToWorldZ(ring.y);

      if (ringIdx < this.ringPool.length) {
        const rm = this.ringPool[ringIdx++];
        rm.position.set(wx, 0.045, wz);
        rm.scale.setScalar(rOuter);
        const rMat = rm.material as THREE.MeshBasicMaterial;
        rMat.color.set(ring.color);
        rMat.opacity = alpha * 0.78;
        rm.visible = true;
      }

      if (
        ring.maxRadius >= 1.8 &&
        ring.color.toUpperCase() === '#EF4444' &&
        skyIdx < this.skyBeamPool.length
      ) {
        const sb = this.skyBeamPool[skyIdx++];
        sb.position.set(wx, 4.5, wz);
        sb.scale.set(alpha, 1, alpha);
        (sb.material as THREE.MeshBasicMaterial).opacity = alpha * 0.65;
        sb.visible = true;
      }
    }
    for (let i = ringIdx; i < this.ringPool.length; i++) {
      this.ringPool[i].visible = false;
    }
    for (let i = skyIdx; i < this.skyBeamPool.length; i++) {
      this.skyBeamPool[i].visible = false;
    }

    // 4b. Sync Tactical Pings via Pre-Allocated Ping Pool
    for (let i = 0; i < this.pingPool.length; i++) {
      const slot = this.pingPool[i];
      const ping = run.tacticalPings[i];
      if (!ping) {
        slot.group.visible = false;
        continue;
      }
      slot.group.visible = true;
      const fade = THREE.MathUtils.clamp(ping.life / 1.2, 0.15, 1);
      const wx = this.simToWorldX(ping.x);
      const wz = this.simToWorldZ(ping.y);
      const zoneRadius = ping.kind === 'focus' ? 1.85 : 0.72;
      const pulsePhase = (timeSec * 1.35) % 1;
      const pulseRad = 0.25 + pulsePhase * (zoneRadius * 0.9);

      slot.group.position.set(wx, 0, wz);
      slot.zoneRing.scale.setScalar(zoneRadius);
      slot.zoneMat.color.set(ping.color);
      slot.zoneMat.opacity = fade * 0.72;

      slot.pulseRing.scale.setScalar(pulseRad);
      slot.pulseMat.color.set(ping.color);
      slot.pulseMat.opacity = (1 - pulsePhase) * fade * 0.85;

      slot.pillarMat.color.set(ping.color);
      slot.pillarMat.opacity = fade * 0.42;

      slot.diamond.position.y = 1.05 + Math.sin(timeSec * 4.5 + ping.id) * 0.14;
      slot.diamond.rotation.y = timeSec * 2.4 + ping.id;
      slot.diamondMat.color.set(ping.color);
      slot.diamondMat.emissive.set(ping.color);
      slot.diamondMat.opacity = fade;
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

    // 6. Smooth Circular Hover Footprint + Range Ring (follows continuous cursor simX/simY!)
    if (hoverPoint) {
      const wx = this.simToWorldX(hoverPoint.simX);
      const wz = this.simToWorldZ(hoverPoint.simY);
      this.hoverCircleFrame.position.set(wx, 0, wz);
      this.hoverCircleFrame.visible = true;

      if (run.pendingCombineTowerId !== null) {
        const hoveredTower = run.towers.find((t) => {
          const tc = getTowerCoords(t);
          return Math.hypot(tc.x - hoverPoint.simX, tc.y - hoverPoint.simY) <= 0.55;
        });
        const primary = run.towers.find((t) => t.id === run.pendingCombineTowerId);
        if (
          hoveredTower &&
          primary &&
          canCombineTowers(run, primary.id, hoveredTower.id)
        ) {
          const combined = getCombinedTowerType(primary.type, hoveredTower.type);
          const def = combined ? TOWER_DEFS[combined] : null;
          const ptc = getTowerCoords(primary);
          this.hoverCircleMat.color.setHex(0x38bdf8);
          this.hoverCircleEdgeMat.color.setHex(0x7dd3fc);
          this.hoverRangeMat.color.set(def?.accentColor ?? '#38BDF8');
          this.hoverRangeRing.position.set(
            this.simToWorldX(ptc.x),
            0.04,
            this.simToWorldZ(ptc.y),
          );
          this.hoverRangeRing.scale.setScalar(def ? def.range : 3.2);
          this.hoverRangeRing.visible = true;
        } else {
          this.hoverCircleMat.color.setHex(0x64748b);
          this.hoverCircleEdgeMat.color.setHex(0x94a3b8);
          this.hoverRangeRing.visible = false;
        }
      } else if (run.pendingTacticalPing) {
        this.hoverCircleMat.color.setHex(0x38bdf8);
        this.hoverCircleEdgeMat.color.setHex(0xbae6fd);
        this.hoverRangeMat.color.setHex(0x38bdf8);
        this.hoverRangeRing.position.set(wx, 0.04, wz);
        this.hoverRangeRing.scale.setScalar(1.85);
        this.hoverRangeRing.visible = true;
      } else if (run.pendingTargetingAbility === 'orbital_lance') {
        this.hoverCircleMat.color.setHex(0xef4444);
        this.hoverCircleEdgeMat.color.setHex(0xfca5a5);
        this.hoverRangeMat.color.setHex(0xef4444);
        this.hoverRangeRing.position.set(wx, 0.04, wz);
        this.hoverRangeRing.scale.setScalar(2.0);
        this.hoverRangeRing.visible = true;
      } else if (run.selectedBuildType) {
        const def = TOWER_DEFS[run.selectedBuildType];
        const buildable = canPlaceTowerAt(run, hoverPoint.simX, hoverPoint.simY);
        const underCap = canBuildTower(run, run.selectedBuildType).ok;
        const affordable = run.scrap >= def.cost;
        const valid = buildable && affordable && underCap;
        this.hoverCircleMat.color.setHex(valid ? 0x34d399 : 0xef4444);
        this.hoverCircleEdgeMat.color.setHex(valid ? 0xa7f3d0 : 0xfca5a5);
        this.hoverRangeMat.color.set(def.accentColor);
        this.hoverRangeRing.position.set(wx, 0.035, wz);
        this.hoverRangeRing.scale.setScalar(def.range);
        this.hoverRangeRing.visible = buildable && underCap;
      } else {
        this.hoverCircleMat.color.setHex(0xe2c896);
        this.hoverCircleEdgeMat.color.setHex(0xfef3c7);
        this.hoverRangeRing.visible = false;
      }
    } else {
      this.hoverCircleFrame.visible = false;
      this.hoverRangeRing.visible = false;
    }

    const selTower =
      run.selectedTowerId !== null
        ? run.towers.find((t) => t.id === run.selectedTowerId) ?? null
        : null;
    if (selTower) {
      const stats = computeTowerEffectiveStats(selTower, run);
      const stc = getTowerCoords(selTower);
      (this.selectedRangeRing.material as THREE.MeshBasicMaterial).color.set(
        TOWER_DEFS[selTower.type].accentColor,
      );
      this.selectedRangeRing.position.set(
        this.simToWorldX(stc.x),
        0.04,
        this.simToWorldZ(stc.y),
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

  scheduleNextTick(cb: (now: number) => void) {
    this.cancelScheduledFrame();
    if (this.disposed || this.contextLost) return;

    if (!this.isSoftwareGl) {
      this.scheduledRaf = requestAnimationFrame(cb);
      return;
    }

    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync =
      typeof gl.fenceSync === 'function' ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
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
    this.unitRingGeo.dispose();
    this.unitBeamGeo.dispose();
    this.unitSkyBeamGeo.dispose();
    this.unitPingDiamondGeo.dispose();
    this.unitPingPillarGeo.dispose();

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
