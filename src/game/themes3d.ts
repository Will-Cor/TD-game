import * as THREE from 'three';
import type { ProceduralTextureSet } from './textures3d';

export type BiomePropStyle =
  | 'alpine'
  | 'foundry'
  | 'marsh'
  | 'cryo'
  | 'volcanic'
  | 'desert'
  | 'rift'
  | 'reactor';

export interface LevelThemeConfig {
  level: number;
  propStyle: BiomePropStyle;
  skyColor: number;
  fogDensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  keyColor: number;
  keyIntensity: number;
  rimColor: number;
  rimIntensity: number;
  terrainColor: number;
  plazaColor: number;
  trimColor: number;
  pylonColor: number;
  beaconColor: number;
  roadColor: number;
  roadEmissive: number;
  roadEmissiveIntensity: number;
  curbColor: number;
  chevronColor: number;
  rockColor: number;
  crystalColor: number;
  crystalEmissive: number;
  canopyColorA: number;
  canopyColorB: number;
}

export const LEVEL_THEMES: LevelThemeConfig[] = [
  // Level 1: Skyward Plaza (Edge of Heaven bright marble plaza + deep sapphire sunken canal)
  {
    level: 1,
    propStyle: 'alpine',
    skyColor: 0x112438,
    fogDensity: 0.018,
    hemiSky: 0xdbeafe,
    hemiGround: 0x3b5875,
    hemiIntensity: 0.92,
    keyColor: 0xfff3dc,
    keyIntensity: 2.35,
    rimColor: 0x60a5fa,
    rimIntensity: 0.85,
    terrainColor: 0x8ea7c4,
    plazaColor: 0xd0dce9,
    trimColor: 0x9ab0c7,
    pylonColor: 0x5c728a,
    beaconColor: 0x38bdf8,
    roadColor: 0x1d4078,
    roadEmissive: 0x0c244f,
    roadEmissiveIntensity: 0.55,
    curbColor: 0x4b70a6,
    chevronColor: 0x7dd3fc,
    rockColor: 0x7b93ad,
    crystalColor: 0x38bdf8,
    crystalEmissive: 0x0284c7,
    canopyColorA: 0xef4444,
    canopyColorB: 0xfbbf24,
  },
  // Level 2: Foundry Canyon (Warm Sandstone & Ochre Industrial Canal)
  {
    level: 2,
    propStyle: 'foundry',
    skyColor: 0x1d130e,
    fogDensity: 0.02,
    hemiSky: 0xfed7aa,
    hemiGround: 0x3d2419,
    hemiIntensity: 0.85,
    keyColor: 0xffd7ae,
    keyIntensity: 2.35,
    rimColor: 0xf97316,
    rimIntensity: 0.85,
    terrainColor: 0x6b4735,
    plazaColor: 0xa67c63,
    trimColor: 0xc27844,
    pylonColor: 0x4d3428,
    beaconColor: 0xf97316,
    roadColor: 0x3d1f14,
    roadEmissive: 0x7c2d12,
    roadEmissiveIntensity: 0.5,
    curbColor: 0x9c6244,
    chevronColor: 0xfb923c,
    rockColor: 0x704a38,
    crystalColor: 0xf59e0b,
    crystalEmissive: 0xb45309,
    canopyColorA: 0xea580c,
    canopyColorB: 0xfef08a,
  },
  // Level 3: Verdant Courtyard (Sage Marble & Emerald Canal)
  {
    level: 3,
    propStyle: 'marsh',
    skyColor: 0x0c1e18,
    fogDensity: 0.02,
    hemiSky: 0xbbf7d0,
    hemiGround: 0x19382a,
    hemiIntensity: 0.86,
    keyColor: 0xeaffdf,
    keyIntensity: 2.25,
    rimColor: 0x34d399,
    rimIntensity: 0.85,
    terrainColor: 0x2f5946,
    plazaColor: 0x5c8c72,
    trimColor: 0x86c9a5,
    pylonColor: 0x2b4d3c,
    beaconColor: 0x34d399,
    roadColor: 0x123829,
    roadEmissive: 0x065f46,
    roadEmissiveIntensity: 0.45,
    curbColor: 0x457d62,
    chevronColor: 0x6ee7b7,
    rockColor: 0x446b57,
    crystalColor: 0x34d399,
    crystalEmissive: 0x059669,
    canopyColorA: 0x10b981,
    canopyColorB: 0xfef9c3,
  },
  // Level 4: Glacial Cryo Shelf (Frost Plaza & Luminous Ice Channel)
  {
    level: 4,
    propStyle: 'cryo',
    skyColor: 0x102136,
    fogDensity: 0.019,
    hemiSky: 0xe0f2fe,
    hemiGround: 0x223b54,
    hemiIntensity: 0.9,
    keyColor: 0xf0f9ff,
    keyIntensity: 2.3,
    rimColor: 0x38bdf8,
    rimIntensity: 0.92,
    terrainColor: 0x698dae,
    plazaColor: 0xb8d4eb,
    trimColor: 0x7dd3fc,
    pylonColor: 0x3f6080,
    beaconColor: 0x38bdf8,
    roadColor: 0x164e78,
    roadEmissive: 0x0284c7,
    roadEmissiveIntensity: 0.52,
    curbColor: 0x5a91ba,
    chevronColor: 0xbae6fd,
    rockColor: 0x6d92b2,
    crystalColor: 0x7dd3fc,
    crystalEmissive: 0x0284c7,
    canopyColorA: 0x0ea5e9,
    canopyColorB: 0xf1f5f9,
  },
  // Level 5: Volcanic Caldera (Basalt Terrace & Magma Trench)
  {
    level: 5,
    propStyle: 'volcanic',
    skyColor: 0x1c0d0d,
    fogDensity: 0.022,
    hemiSky: 0xfca5a5,
    hemiGround: 0x2e1414,
    hemiIntensity: 0.8,
    keyColor: 0xffd5c4,
    keyIntensity: 2.35,
    rimColor: 0xef4444,
    rimIntensity: 0.95,
    terrainColor: 0x3d2222,
    plazaColor: 0x573434,
    trimColor: 0xc8553d,
    pylonColor: 0x361e1e,
    beaconColor: 0xef4444,
    roadColor: 0x59120c,
    roadEmissive: 0x991b1b,
    roadEmissiveIntensity: 0.62,
    curbColor: 0x7d3a32,
    chevronColor: 0xfca5a5,
    rockColor: 0x4a2c2c,
    crystalColor: 0xef4444,
    crystalEmissive: 0xb91c1c,
    canopyColorA: 0xdc2626,
    canopyColorB: 0xfbbf24,
  },
  // Level 6: Sunstone Dunes (Golden Plaza & Turquoise Oasis Trench)
  {
    level: 6,
    propStyle: 'desert',
    skyColor: 0x1f170e,
    fogDensity: 0.019,
    hemiSky: 0xfef3c7,
    hemiGround: 0x42301a,
    hemiIntensity: 0.88,
    keyColor: 0xffebc2,
    keyIntensity: 2.4,
    rimColor: 0xfbbf24,
    rimIntensity: 0.78,
    terrainColor: 0x9e7d52,
    plazaColor: 0xd4b483,
    trimColor: 0xe5a93c,
    pylonColor: 0x6e5435,
    beaconColor: 0xfbbf24,
    roadColor: 0x174e5c,
    roadEmissive: 0x0e7490,
    roadEmissiveIntensity: 0.45,
    curbColor: 0x8f6b41,
    chevronColor: 0xfde68a,
    rockColor: 0x94724a,
    crystalColor: 0xfbbf24,
    crystalEmissive: 0xd97706,
    canopyColorA: 0xe11d48,
    canopyColorB: 0xfde047,
  },
  // Level 7: Amethyst Rift (Twilight Courtyard & Glowing Violet Channel)
  {
    level: 7,
    propStyle: 'rift',
    skyColor: 0x140d24,
    fogDensity: 0.021,
    hemiSky: 0xe9d5ff,
    hemiGround: 0x22153a,
    hemiIntensity: 0.82,
    keyColor: 0xf5ebff,
    keyIntensity: 2.25,
    rimColor: 0xa78bfa,
    rimIntensity: 1.0,
    terrainColor: 0x443269,
    plazaColor: 0x715a9e,
    trimColor: 0xc084fc,
    pylonColor: 0x382859,
    beaconColor: 0xc084fc,
    roadColor: 0x28134f,
    roadEmissive: 0x6b21a8,
    roadEmissiveIntensity: 0.58,
    curbColor: 0x866ec2,
    chevronColor: 0xddd6fe,
    rockColor: 0x564182,
    crystalColor: 0xc084fc,
    crystalEmissive: 0x7e22ce,
    canopyColorA: 0xa855f7,
    canopyColorB: 0xf472b6,
  },
  // Level 8: Omega Citadel (Obsidian Steel Plaza & Crimson Reactor Channel)
  {
    level: 8,
    propStyle: 'reactor',
    skyColor: 0x0a0e17,
    fogDensity: 0.021,
    hemiSky: 0xcbd5e1,
    hemiGround: 0x1c1721,
    hemiIntensity: 0.78,
    keyColor: 0xffe4cc,
    keyIntensity: 2.35,
    rimColor: 0xf43f5e,
    rimIntensity: 1.0,
    terrainColor: 0x273040,
    plazaColor: 0x3a465c,
    trimColor: 0xe5a93c,
    pylonColor: 0x1f2633,
    beaconColor: 0xf43f5e,
    roadColor: 0x451220,
    roadEmissive: 0x9f1239,
    roadEmissiveIntensity: 0.62,
    curbColor: 0x7a5c32,
    chevronColor: 0xfda4af,
    rockColor: 0x323d52,
    crystalColor: 0xf43f5e,
    crystalEmissive: 0xbe123c,
    canopyColorA: 0xf43f5e,
    canopyColorB: 0xfbbf24,
  },
];

export function getLevelTheme(level: number): LevelThemeConfig {
  const idx = Math.max(1, Math.min(LEVEL_THEMES.length, Math.round(level))) - 1;
  return LEVEL_THEMES[idx];
}

function seededRand(seed: number, offset: number): number {
  const x = Math.sin(seed * 12.9898 + offset * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Stepped architectural courtyard props & flanking structures inspired by Edge of Heaven:
 * uses 16x16 pixel terrace masonry + canopies + trees/crystals.
 */
export function createCourtyardPocketProp(
  theme: LevelThemeConfig,
  seed: number,
  textures: ProceduralTextureSet,
): THREE.Group {
  const group = new THREE.Group();
  const r1 = seededRand(seed, 1);
  const r2 = seededRand(seed, 2);

  const stoneMat = new THREE.MeshStandardMaterial({
    color: theme.plazaColor,
    map: textures.terraceMap,
    roughness: 0.85,
    metalness: 0.08,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: theme.trimColor,
    roughness: 0.55,
    metalness: 0.25,
  });

  // Stepped courtyard terrace plinth
  const step1 = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.14, 0.88), stoneMat);
  step1.position.y = 0.07;
  step1.receiveShadow = true;
  step1.castShadow = true;
  group.add(step1);

  if (r1 < 0.36) {
    // Edge-of-Heaven style striped plaza umbrella & bench terrace
    const step2 = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.12, 0.68), stoneMat);
    step2.position.y = 0.2;
    group.add(step2);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.72, 6), trimMat);
    pole.position.y = 0.56;
    group.add(pole);

    const canopyA = new THREE.Mesh(
      new THREE.ConeGeometry(0.46, 0.2, 8),
      new THREE.MeshStandardMaterial({
        color: theme.canopyColorA,
        roughness: 0.65,
        flatShading: true,
      }),
    );
    canopyA.position.y = 0.88;
    canopyA.castShadow = true;
    const canopyRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.44, 0.08, 8),
      new THREE.MeshStandardMaterial({ color: theme.canopyColorB, roughness: 0.65 }),
    );
    canopyRing.position.y = 0.81;
    group.add(canopyA, canopyRing);
  } else if (r1 < 0.7) {
    // Stepped Amphitheater Monument + glowing crystal/flora cluster
    const step2 = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.14, 0.66), stoneMat);
    step2.position.y = 0.21;
    const step3 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.42), trimMat);
    step3.position.y = 0.35;
    group.add(step2, step3);

    const spire = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.2 + r2 * 0.06, 0),
      new THREE.MeshStandardMaterial({
        color: theme.crystalColor,
        emissive: theme.crystalEmissive,
        emissiveIntensity: 0.9,
        roughness: 0.25,
        metalness: 0.3,
      }),
    );
    spire.scale.set(0.8, 1.5, 0.8);
    spire.position.y = 0.64;
    spire.castShadow = true;
    group.add(spire);
  } else {
    // Planter garden box with stylized coral/foliage cluster
    const planter = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.72), trimMat);
    planter.position.y = 0.22;
    group.add(planter);

    const floraColor = theme.propStyle === 'alpine' || theme.propStyle === 'marsh' ? 0x22c55e : theme.crystalColor;
    const floraMat = new THREE.MeshStandardMaterial({
      color: floraColor,
      emissive: theme.propStyle === 'alpine' || theme.propStyle === 'marsh' ? 0x052e16 : theme.crystalEmissive,
      emissiveIntensity: 0.35,
      roughness: 0.72,
      flatShading: true,
    });
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + r2 * 2;
      const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 - k * 0.025, 0), floraMat);
      bush.position.set(Math.cos(a) * 0.15, 0.38 + (k === 0 ? 0.1 : 0), Math.sin(a) * 0.15);
      bush.castShadow = true;
      group.add(bush);
    }
  }

  return group;
}

/**
 * Multi-part procedural 3D perimeter diorama buildings & biome props grounded at y = 0.
 * Styled after Edge of Heaven's stepped bastion buildings, citadel towers, umbrellas, and flora.
 */
export function createThemedSceneryProp(
  theme: LevelThemeConfig,
  seed: number,
  textures: ProceduralTextureSet,
): THREE.Group {
  const group = new THREE.Group();
  const style = theme.propStyle;
  const r1 = seededRand(seed, 1);
  const r2 = seededRand(seed, 2);

  // Architectural building / bastion house variant (every ~2nd perimeter slot)
  if (r2 > 0.42) {
    const wallMat = new THREE.MeshStandardMaterial({
      color: theme.plazaColor,
      map: textures.terraceMap,
      roughness: 0.8,
      metalness: 0.12,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: theme.pylonColor,
      roughness: 0.65,
      metalness: 0.3,
    });
    const windowMat = new THREE.MeshStandardMaterial({
      color: theme.beaconColor,
      emissive: theme.crystalEmissive,
      emissiveIntensity: 1.0,
      roughness: 0.25,
    });

    const w = 1.15 + r1 * 0.55;
    const d = 1.05 + r2 * 0.45;
    const h = 1.25 + r1 * 1.1;

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.24, 0.26, d + 0.24), roofMat);
    plinth.position.y = 0.13;
    plinth.receiveShadow = true;

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    body.position.y = 0.26 + h * 0.5;
    body.castShadow = true;
    body.receiveShadow = true;

    const cornice = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.18, d + 0.16), roofMat);
    cornice.position.y = 0.26 + h + 0.08;
    cornice.castShadow = true;

    // Rooftop canopy or crenellated turret top
    if (r1 > 0.5) {
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(Math.min(w, d) * 0.58, 0.55, 4),
        new THREE.MeshStandardMaterial({ color: theme.canopyColorA, roughness: 0.6 }),
      );
      cap.rotation.y = Math.PI / 4;
      cap.position.y = 0.26 + h + 0.44;
      group.add(cap);
    } else {
      const turret = new THREE.Mesh(new THREE.BoxGeometry(w * 0.52, 0.42, d * 0.52), wallMat);
      turret.position.y = 0.26 + h + 0.36;
      group.add(turret);
    }

    // Glowing framed windows
    for (const side of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.32, 0.06), windowMat);
      win.position.set(side * (w * 0.24), 0.26 + h * 0.58, d * 0.5 + 0.01);
      group.add(win);
    }

    group.add(plinth, body, cornice);
    return group;
  }

  if (style === 'alpine') {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d28, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: r1 > 0.5 ? 0x228b4e : 0x2ea05a,
      roughness: 0.85,
      flatShading: true,
    });
    const stoneMat = new THREE.MeshStandardMaterial({
      color: theme.rockColor,
      map: textures.terraceMap,
      roughness: 0.85,
    });

    const baseStone = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.24, 0.75), stoneMat);
    baseStone.position.y = 0.12;
    group.add(baseStone);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.55, 6), trunkMat);
    trunk.position.y = 0.48;
    group.add(trunk);

    const tier1 = new THREE.Mesh(new THREE.ConeGeometry(0.56, 0.74, 7), leafMat);
    tier1.position.y = 0.92;
    const tier2 = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.65, 7), leafMat);
    tier2.position.y = 1.32;
    group.add(tier1, tier2);
    return group;
  }

  if (style === 'foundry') {
    const rustMat = new THREE.MeshStandardMaterial({ color: 0x6e402c, map: textures.metalMap, roughness: 0.65, metalness: 0.45 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x2e2623, roughness: 0.45, metalness: 0.75 });
    const emberMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xea580c,
      emissiveIntensity: 1.4,
      roughness: 0.25,
    });

    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.52, 0.24, 8), steelMat);
    plinth.position.y = 0.12;
    const siloH = 0.95 + r1 * 0.45;
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, siloH, 8), rustMat);
    silo.position.y = 0.24 + siloH * 0.5;
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.16, 8), emberMat);
    vent.position.y = 0.24 + siloH + 0.08;
    group.add(plinth, silo, vent);
    return group;
  }

  if (style === 'marsh' || style === 'cryo' || style === 'rift') {
    const stoneMat = new THREE.MeshStandardMaterial({
      color: theme.rockColor,
      map: textures.terraceMap,
      roughness: 0.85,
      flatShading: true,
    });
    const crystalMat = new THREE.MeshStandardMaterial({
      color: theme.crystalColor,
      emissive: theme.crystalEmissive,
      emissiveIntensity: 1.1,
      roughness: 0.22,
      metalness: 0.3,
    });

    const pad = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), stoneMat);
    pad.scale.set(1.25, 0.45, 1.15);
    pad.position.y = 0.16;
    group.add(pad);

    for (let i = 0; i < 3; i++) {
      const h = 0.7 + (i === 0 ? r1 : r2) * 0.55;
      const shard = new THREE.Mesh(new THREE.ConeGeometry(0.16 - i * 0.02, h, 5), crystalMat);
      const angle = i * 2.1 + r1 * Math.PI;
      shard.position.set(Math.cos(angle) * 0.16, 0.2 + h * 0.45, Math.sin(angle) * 0.16);
      shard.rotation.set((r2 - 0.5) * 0.35, angle, (r1 - 0.5) * 0.35);
      group.add(shard);
    }
    return group;
  }

  if (style === 'volcanic') {
    const basaltMat = new THREE.MeshStandardMaterial({ color: 0x331f1f, map: textures.terraceMap, roughness: 0.9, flatShading: true });
    const magmaMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xef4444,
      emissiveIntensity: 1.55,
      roughness: 0.25,
    });

    const coneH = 0.95 + r1 * 0.4;
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.58, coneH, 7), basaltMat);
    cone.position.y = coneH * 0.5;
    const lavaPool = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 7), magmaMat);
    lavaPool.position.y = coneH - 0.02;
    group.add(cone, lavaPool);
    return group;
  }

  if (style === 'desert') {
    const sandMat = new THREE.MeshStandardMaterial({ color: 0x8f6b41, map: textures.terraceMap, roughness: 0.88 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xe5a93c, roughness: 0.3, metalness: 0.75 });

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.24, 0.68), sandMat);
    plinth.position.y = 0.12;
    const obeliskH = 1.1 + r1 * 0.5;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, obeliskH, 4), sandMat);
    shaft.rotation.y = Math.PI / 4;
    shaft.position.y = 0.24 + obeliskH * 0.5;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.3, 4), goldMat);
    cap.rotation.y = Math.PI / 4;
    cap.position.y = 0.24 + obeliskH + 0.15;
    group.add(plinth, shaft, cap);
    return group;
  }

  // Level 8: Reactor Citadel Pylon
  const armorMat = new THREE.MeshStandardMaterial({ color: 0x222938, map: textures.metalMap, roughness: 0.45, metalness: 0.72 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xe5a93c, roughness: 0.3, metalness: 0.82 });
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xf43f5e,
    emissive: 0xe11d48,
    emissiveIntensity: 1.65,
    roughness: 0.2,
  });

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.24, 0.64), armorMat);
  plinth.position.y = 0.12;
  const colH = 1.0 + r1 * 0.4;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, colH, 8), coreMat);
  core.position.y = 0.24 + colH * 0.5;
  const ringTop = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46), trimMat);
  ringTop.position.y = 0.24 + colH;
  group.add(plinth, core, ringTop);
  return group;
}
