import * as THREE from 'three';
import { TOWER_DEFS, isSuperTowerType } from './catalog';
import type { EnemyArchetypeId, TowerType } from './types';
import type { ProceduralTextureSet } from './textures3d';

export interface TowerModelHandle {
  group: THREE.Group;
  headGroup: THREE.Group;
  barrelGroup: THREE.Group;
  spinnerMesh?: THREE.Object3D;
  overdriveRing: THREE.Mesh;
  combineTargetRing: THREE.Mesh;
  dispose: () => void;
}

export interface EnemyModelHandle {
  group: THREE.Group;
  bodyGroup: THREE.Group;
  tintableMaterials: THREE.MeshStandardMaterial[];
  baseColors: { color: THREE.Color; emissive: THREE.Color; emissiveIntensity: number }[];
  shieldMesh: THREE.Mesh;
  telegraphMesh?: THREE.Mesh;
  barGroup: THREE.Group;
  hpBarFill: THREE.Mesh;
  shieldBarBg: THREE.Mesh;
  shieldBarFill: THREE.Mesh;
  barHeight: number;
  dispose: () => void;
}

export interface LandmarkHandle {
  group: THREE.Group;
  animatedPart?: THREE.Object3D;
  dispose: () => void;
}

function disposeGroupResources(root: THREE.Object3D) {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m) m.dispose();
      }
    }
  });
}

function hexToNum(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export function createTowerModel(
  type: TowerType,
  level: 1 | 2 | 3,
  textures: ProceduralTextureSet,
): TowerModelHandle {
  const def = TOWER_DEFS[type];
  const isSuper = isSuperTowerType(type);
  const group = new THREE.Group();
  const headGroup = new THREE.Group();
  const barrelGroup = new THREE.Group();

  const primaryColor = hexToNum(def.accentColor);
  const secondaryColor = hexToNum(def.secondaryColor ?? def.accentColor);

  const baseMetal = new THREE.MeshStandardMaterial({
    color: level >= 3 ? 0x1d2733 : 0x24303d,
    roughness: 0.58,
    metalness: 0.62,
    bumpMap: textures.metalBump,
    bumpScale: 0.015,
  });
  const chassisMetal = new THREE.MeshStandardMaterial({
    color: level === 1 ? 0x3b4a59 : level === 2 ? 0x4c6074 : 0x62788f,
    roughness: level >= 2 ? 0.3 : 0.42,
    metalness: level >= 2 ? 0.82 : 0.7,
    bumpMap: textures.metalBump,
    bumpScale: 0.012,
  });
  const barrelSteel = new THREE.MeshStandardMaterial({
    color: level === 3 ? 0xf1f5f9 : 0xcbd5e1,
    roughness: 0.2,
    metalness: 0.92,
  });
  const copperMat = new THREE.MeshStandardMaterial({
    color: level === 3 ? 0xe58a3c : 0xc26d2d,
    roughness: 0.26,
    metalness: 0.88,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    roughness: 0.3,
    metalness: 0.64,
  });
  const secondaryMat = new THREE.MeshStandardMaterial({
    color: secondaryColor,
    roughness: 0.3,
    metalness: 0.64,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    emissive: primaryColor,
    emissiveIntensity: level === 3 ? 1.95 : level === 2 ? 1.5 : 1.15,
    roughness: 0.18,
    metalness: 0.2,
  });
  const secondaryGlowMat = new THREE.MeshStandardMaterial({
    color: secondaryColor,
    emissive: secondaryColor,
    emissiveIntensity: level === 3 ? 1.85 : level === 2 ? 1.45 : 1.15,
    roughness: 0.2,
    metalness: 0.2,
  });

  // Grounded contact shadow disc beneath turret
  const shadowSize = isSuper ? 1.06 : 0.92;
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(shadowSize, shadowSize),
    new THREE.MeshBasicMaterial({
      map: textures.contactShadowMap,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.008;
  group.add(contactShadow);

  // --- Tier-Aligned Grounded Plinth Base (bottom at y = 0) ---
  const baseRadiusTop = isSuper
    ? 0.4 + level * 0.025
    : level === 1
      ? 0.35
      : level === 2
        ? 0.38
        : 0.41;
  const baseRadiusBot = isSuper
    ? 0.45 + level * 0.025
    : level === 1
      ? 0.4
      : level === 2
        ? 0.43
        : 0.46;
  const plinthHeight = isSuper ? 0.15 + level * 0.022 : 0.11 + level * 0.02;

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(baseRadiusTop, baseRadiusBot, plinthHeight, 8),
    baseMetal,
  );
  plinth.position.y = plinthHeight * 0.5;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  // MK2+ Corner Buttress Lugs & MK3 Stabilizer Pylons on Plinth
  if (level >= 2 || isSuper) {
    const lugCount = level === 3 ? 4 : isSuper ? 4 : 2;
    for (let i = 0; i < lugCount; i++) {
      const a = (i * Math.PI * 2) / lugCount + Math.PI / 4;
      const lug = new THREE.Mesh(
        new THREE.BoxGeometry(0.1 + level * 0.015, plinthHeight + 0.04 + level * 0.015, 0.11),
        level === 3 || isSuper ? secondaryGlowMat : chassisMetal,
      );
      lug.position.set(
        Math.cos(a) * (baseRadiusBot - 0.04),
        (plinthHeight + 0.04) * 0.5,
        Math.sin(a) * (baseRadiusBot - 0.04),
      );
      lug.rotation.y = -a;
      lug.castShadow = true;
      group.add(lug);
    }
  }

  // Upgrade Tier Collar
  const collarMat = level >= 3 || isSuper ? glowMat : accentMat;
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(baseRadiusTop * 0.82, baseRadiusTop * 0.92, 0.075, 8),
    collarMat,
  );
  collar.position.y = plinthHeight + 0.035;
  collar.castShadow = true;
  group.add(collar);

  if (isSuper) {
    const superTrim = new THREE.Mesh(
      new THREE.TorusGeometry(baseRadiusTop * 0.88, level === 3 ? 0.03 : 0.022, 6, 16),
      secondaryGlowMat,
    );
    superTrim.rotation.x = Math.PI / 2;
    superTrim.position.y = plinthHeight + 0.07;
    group.add(superTrim);

    if (level >= 2) {
      const tierHalo = new THREE.Mesh(
        new THREE.TorusGeometry(baseRadiusTop * 0.98, 0.018, 6, 18),
        glowMat,
      );
      tierHalo.rotation.x = Math.PI / 2;
      tierHalo.position.y = plinthHeight + 0.025;
      group.add(tierHalo);
    }
  }

  // Overdrive Halo Ring
  const overdriveRing = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.48, 24),
    new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    }),
  );
  overdriveRing.rotation.x = -Math.PI / 2;
  overdriveRing.position.y = 0.025;
  overdriveRing.visible = false;
  group.add(overdriveRing);

  // Eligible Fusion Partner Ring
  const combineTargetRing = new THREE.Mesh(
    new THREE.RingGeometry(0.43, 0.54, 28),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    }),
  );
  combineTargetRing.rotation.x = -Math.PI / 2;
  combineTargetRing.position.y = 0.032;
  combineTargetRing.visible = false;
  group.add(combineTargetRing);

  headGroup.position.y = plinthHeight + 0.075;
  group.add(headGroup);
  headGroup.add(barrelGroup);

  let spinnerMesh: THREE.Object3D | undefined;

  const addBarrel = (
    radius: number,
    length: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material = barrelSteel,
  ) => {
    const geo = new THREE.CylinderGeometry(radius, radius * 1.12, length, 8);
    geo.rotateZ(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    barrelGroup.add(m);
    return m;
  };

  // --- 8 Base Turret Designs (MK1 -> MK2 -> MK3) ---
  if (type === 'cannon') {
    const cupolaW = level === 1 ? 0.36 : level === 2 ? 0.44 : 0.48;
    const cupolaH = level === 1 ? 0.2 : level === 2 ? 0.24 : 0.27;
    const cupola = new THREE.Mesh(
      new THREE.BoxGeometry(cupolaW, cupolaH, cupolaW * 0.92),
      chassisMetal,
    );
    cupola.position.set(-0.04, cupolaH * 0.5 + 0.02, 0);
    cupola.castShadow = true;
    headGroup.add(cupola);

    if (level === 1) {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 10), accentMat);
      drum.rotation.x = Math.PI / 2;
      drum.position.set(-0.19, 0.14, 0);
      headGroup.add(drum);
      addBarrel(0.032, 0.38, 0.26, 0.13, -0.07);
      addBarrel(0.032, 0.38, 0.26, 0.13, 0.07);
      const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.11, 0.2), accentMat);
      muzzle.position.set(0.39, 0.13, 0);
      barrelGroup.add(muzzle);
    } else if (level === 2) {
      const shield = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.42), accentMat);
      shield.position.set(0.16, 0.14, 0);
      headGroup.add(shield);
      for (const side of [-1, 1]) {
        const hopper = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.09), accentMat);
        hopper.position.set(-0.06, 0.14, side * 0.23);
        headGroup.add(hopper);
        addBarrel(0.04, 0.48, 0.33, 0.14, side * 0.085);
      }
      const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.26), glowMat);
      muzzle.position.set(0.5, 0.14, 0);
      barrelGroup.add(muzzle);
    } else {
      for (const side of [-1, 1]) {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 10), glowMat);
        drum.rotation.x = Math.PI / 2;
        drum.position.set(-0.24, 0.16, side * 0.14);
        headGroup.add(drum);
      }
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.05), glowMat);
      fin.position.set(-0.08, 0.33, 0);
      headGroup.add(fin);
      const offsets: [number, number][] = [
        [0.11, -0.085],
        [0.11, 0.085],
        [0.21, -0.085],
        [0.21, 0.085],
      ];
      for (const [by, bz] of offsets) {
        addBarrel(0.032, 0.54, 0.36, by, bz);
      }
      const collarRing = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.19, 0.25), glowMat);
      collarRing.position.set(0.54, 0.16, 0);
      barrelGroup.add(collarRing);
    }
  } else if (type === 'cryo') {
    const tankR = level === 1 ? 0.16 : level === 2 ? 0.18 : 0.21;
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(tankR, tankR + 0.02, 0.24, 12),
      chassisMetal,
    );
    tank.position.set(-0.05, 0.12, 0);
    tank.castShadow = true;
    headGroup.add(tank);

    const iceCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(level === 3 ? 0.15 : 0.11, 0),
      glowMat,
    );
    iceCore.position.set(-0.05, level === 3 ? 0.35 : 0.29, 0);
    headGroup.add(iceCore);
    spinnerMesh = iceCore;

    if (level === 1) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.34, 10), barrelSteel);
      tube.rotation.z = -Math.PI / 3.2;
      tube.position.set(0.14, 0.22, 0);
      tube.castShadow = true;
      barrelGroup.add(tube);
    } else if (level === 2) {
      for (const side of [-1, 1]) {
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.24, 8), glowMat);
        bottle.position.set(-0.06, 0.14, side * 0.22);
        headGroup.add(bottle);

        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.068, 0.38, 10), barrelSteel);
        tube.rotation.z = -Math.PI / 3.2;
        tube.position.set(0.15, 0.23, side * 0.1);
        tube.castShadow = true;
        barrelGroup.add(tube);
      }
    } else {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.028, 6, 16), glowMat);
      halo.rotation.x = Math.PI / 2;
      halo.position.set(-0.05, 0.28, 0);
      headGroup.add(halo);
      for (const bz of [-0.13, 0, 0.13]) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.42, 10), barrelSteel);
        tube.rotation.z = -Math.PI / 3.2;
        tube.position.set(0.16, bz === 0 ? 0.28 : 0.21, bz);
        tube.castShadow = true;
        barrelGroup.add(tube);
      }
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), glowMat);
        fin.position.set(Math.cos(a) * 0.23 - 0.05, 0.16, Math.sin(a) * 0.23);
        headGroup.add(fin);
      }
    }
  } else if (type === 'tesla') {
    const mastH = level === 1 ? 0.38 : level === 2 ? 0.46 : 0.56;
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07 + level * 0.015, 0.12 + level * 0.015, mastH, 10),
      copperMat,
    );
    mast.position.y = mastH * 0.5;
    mast.castShadow = true;
    headGroup.add(mast);

    for (let r = 0; r < level; r++) {
      const radius = 0.2 - r * 0.032;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.03, 8, 18),
        r % 2 === 0 ? barrelSteel : glowMat,
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.2 + r * 0.11;
      ring.castShadow = true;
      headGroup.add(ring);
    }

    const orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(level === 3 ? 0.145 : level === 2 ? 0.12 : 0.1, 1),
      glowMat,
    );
    orb.position.y = mastH + 0.09;
    headGroup.add(orb);
    spinnerMesh = orb;

    if (level >= 2) {
      for (const side of [-1, 1]) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 6), chassisMetal);
        rod.position.set(0, 0.18, side * 0.24);
        headGroup.add(rod);
      }
    }
    if (level === 3) {
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3;
        const prong = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.26, 6), glowMat);
        prong.position.set(Math.cos(a) * 0.22, mastH - 0.04, Math.sin(a) * 0.22);
        prong.rotation.z = -Math.cos(a) * 0.4;
        prong.rotation.x = Math.sin(a) * 0.4;
        headGroup.add(prong);
      }
    }
  } else if (type === 'rail') {
    const breech = new THREE.Mesh(
      new THREE.BoxGeometry(0.34 + level * 0.04, 0.18 + level * 0.02, 0.25 + level * 0.03),
      chassisMetal,
    );
    breech.position.set(-0.11, 0.12, 0);
    breech.castShadow = true;
    headGroup.add(breech);

    const railLen = level === 1 ? 0.54 : level === 2 ? 0.72 : 0.86;
    const railH = level === 3 ? 0.06 : 0.045;
    for (const side of [-1, 1]) {
      const rMesh = new THREE.Mesh(new THREE.BoxGeometry(railLen, railH, 0.045), barrelSteel);
      rMesh.position.set(railLen * 0.45, 0.16, side * (0.055 + (level === 3 ? 0.015 : 0)));
      rMesh.castShadow = true;
      barrelGroup.add(rMesh);
    }
    const coreStrip = new THREE.Mesh(
      new THREE.BoxGeometry(railLen * 0.9, 0.03, 0.04),
      glowMat,
    );
    coreStrip.position.set(railLen * 0.42, 0.16, 0);
    barrelGroup.add(coreStrip);

    if (level >= 2) {
      const optic = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.2, 8), accentMat);
      optic.rotation.z = Math.PI / 2;
      optic.position.set(-0.04, 0.26, 0.09);
      headGroup.add(optic);
    }
    if (level === 3) {
      const capPack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.36), glowMat);
      capPack.position.set(-0.24, 0.16, 0);
      headGroup.add(capPack);
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.1), accentMat);
        wing.position.set(0.1, 0.13, side * 0.16);
        headGroup.add(wing);
      }
    }
  } else if (type === 'pyro') {
    // Hellfire Flamer: pressurized canisters + wide flame projector nozzles
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.34 + level * 0.04, 0.22, 0.34 + level * 0.04),
      chassisMetal,
    );
    housing.position.set(-0.05, 0.13, 0);
    housing.castShadow = true;
    headGroup.add(housing);

    for (const side of [-1, 1]) {
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.075, 0.28, 10),
        level >= 2 ? glowMat : copperMat,
      );
      tank.rotation.x = Math.PI / 2;
      tank.position.set(-0.16, 0.17, side * 0.18);
      headGroup.add(tank);
    }

    const nozzleOffsets = level === 1 ? [0] : level === 2 ? [-0.08, 0.08] : [-0.11, 0, 0.11];
    for (const nz of nozzleOffsets) {
      addBarrel(0.045, 0.38 + level * 0.04, 0.25, 0.14, nz);
      const flare = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.12, 8),
        glowMat,
      );
      flare.rotation.z = -Math.PI / 2;
      flare.position.set(0.42 + level * 0.03, 0.14, nz);
      barrelGroup.add(flare);
    }
    if (level === 3) {
      const crownTank = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.24, 10), glowMat);
      crownTank.rotation.z = Math.PI / 2;
      crownTank.position.set(-0.08, 0.31, 0);
      headGroup.add(crownTank);
    }
  } else if (type === 'missile') {
    // Swarm Pod: angled multi-cell rocket launcher box
    const podWidth = level === 1 ? 0.32 : level === 2 ? 0.42 : 0.5;
    const podHeight = level === 1 ? 0.2 : level === 2 ? 0.24 : 0.28;
    const pod = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, podHeight, podWidth),
      chassisMetal,
    );
    pod.position.set(0.02, 0.19, 0);
    pod.rotation.z = 0.24;
    pod.castShadow = true;
    barrelGroup.add(pod);

    const cols = level + 1;
    const rows = level >= 2 ? 2 : 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tz = (c - (cols - 1) / 2) * 0.11;
        const ty = 0.15 + r * 0.09;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.09, 6), glowMat);
        tip.rotation.z = -Math.PI / 2 + 0.24;
        tip.position.set(0.22, ty + 0.04, tz);
        barrelGroup.add(tip);
      }
    }
    if (level >= 2) {
      const radar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.08, 8), accentMat);
      radar.position.set(-0.14, 0.34, 0);
      headGroup.add(radar);
      spinnerMesh = radar;
    }
    if (level === 3) {
      for (const side of [-1, 1]) {
        const wingPod = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.1), accentMat);
        wingPod.position.set(-0.04, 0.16, side * 0.3);
        headGroup.add(wingPod);
      }
    }
  } else if (type === 'laser') {
    // Prism Beam: twin parabolic mirror arms + floating crystal emitter
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.22, 8), chassisMetal);
    body.position.set(-0.04, 0.13, 0);
    body.castShadow = true;
    headGroup.add(body);

    const lensLen = level === 1 ? 0.34 : level === 2 ? 0.44 : 0.54;
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(lensLen, 0.055, 0.06), barrelSteel);
      arm.position.set(lensLen * 0.42, 0.18, side * 0.11);
      barrelGroup.add(arm);
    }
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(level === 3 ? 0.14 : 0.1, 0),
      glowMat,
    );
    crystal.position.set(0.14, 0.2, 0);
    barrelGroup.add(crystal);
    spinnerMesh = crystal;

    if (level >= 2) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 6, 14), glowMat);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(0.3, 0.19, 0);
      barrelGroup.add(ring);
    }
    if (level === 3) {
      const topFin = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.05), glowMat);
      topFin.position.set(0.12, 0.32, 0);
      headGroup.add(topFin);
    }
  } else if (type === 'chrono') {
    // Chrono Spire: gimballed stasis hourglass core
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.36 + level * 0.06, 8), copperMat);
    pillar.position.y = (0.36 + level * 0.06) * 0.5;
    pillar.castShadow = true;
    headGroup.add(pillar);

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.13 + level * 0.018, 0), glowMat);
    core.position.y = 0.44 + level * 0.07;
    headGroup.add(core);
    spinnerMesh = core;

    for (let r = 0; r < level; r++) {
      const gyro = new THREE.Mesh(
        new THREE.TorusGeometry(0.24 - r * 0.03, 0.025, 6, 18),
        r % 2 === 0 ? glowMat : barrelSteel,
      );
      gyro.position.y = 0.42 + level * 0.06;
      gyro.rotation.set((r * Math.PI) / 3, (r * Math.PI) / 4, 0);
      headGroup.add(gyro);
    }
  } else {
    // --- SUPER TURRETS (All 14 Visually Transform Across MK 1 -> MK 2 -> MK 3) ---
    const coreW = level === 1 ? 0.44 : level === 2 ? 0.5 : 0.56;
    const coreH = level === 1 ? 0.25 : level === 2 ? 0.29 : 0.33;
    const coreBlock = new THREE.Mesh(new THREE.BoxGeometry(coreW, coreH, coreW * 0.92), chassisMetal);
    coreBlock.position.set(-0.04, coreH * 0.5 + 0.02, 0);
    coreBlock.castShadow = true;
    headGroup.add(coreBlock);

    // Universal MK2+ & MK3 Super Armor Pauldrons / Overdrive Dorsal Crest
    if (level >= 2) {
      for (const side of [-1, 1]) {
        const pauldron = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 0.18, 0.09),
          level === 3 ? secondaryGlowMat : secondaryMat,
        );
        pauldron.position.set(-0.04, 0.19, side * (coreW * 0.5 + 0.04));
        pauldron.castShadow = true;
        headGroup.add(pauldron);
      }
    }
    if (level === 3) {
      const dorsalCrest = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.14, 0.07),
        glowMat,
      );
      dorsalCrest.position.set(-0.1, coreH + 0.09, 0);
      headGroup.add(dorsalCrest);

      const apexHalo = new THREE.Mesh(
        new THREE.TorusGeometry(0.32, 0.022, 6, 20),
        secondaryGlowMat,
      );
      apexHalo.rotation.x = Math.PI / 2;
      apexHalo.position.set(-0.04, coreH + 0.05, 0);
      headGroup.add(apexHalo);
    }

    if (type === 'frost_vulcan') {
      // MK1: Twin cryo tanks + quad barrels -> MK2: Armored shroud + longer barrels -> MK3: Hex-barrel cryo gatling + floating core
      for (const side of [-1, 1]) {
        const tank = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07 + level * 0.012, 0.07 + level * 0.012, 0.28 + level * 0.04, 10),
          glowMat,
        );
        tank.position.set(-0.08, 0.2, side * 0.27);
        headGroup.add(tank);
      }
      const barrelLen = 0.52 + level * 0.08;
      const bCount = level === 3 ? 6 : 4;
      for (let i = 0; i < bCount; i++) {
        const a = (i * Math.PI * 2) / bCount;
        addBarrel(0.032, barrelLen, 0.32 + level * 0.04, 0.17 + Math.sin(a) * 0.068, Math.cos(a) * 0.068);
      }
      const brake = new THREE.Mesh(
        new THREE.BoxGeometry(0.08 + level * 0.02, 0.2, 0.24 + level * 0.03),
        secondaryGlowMat,
      );
      brake.position.set(0.54 + level * 0.06, 0.17, 0);
      barrelGroup.add(brake);
      if (level >= 2) {
        const iceShard = new THREE.Mesh(new THREE.OctahedronGeometry(0.11 + level * 0.02, 0), glowMat);
        iceShard.position.set(-0.05, 0.42, 0);
        headGroup.add(iceShard);
        spinnerMesh = iceShard;
      }
    } else if (type === 'storm_gatling') {
      // MK1: Dual barrels + twin coils -> MK2: Quad barrels + taller coils -> MK3: Triple arc pylons + crown ring
      const pairs = level >= 2 ? [0.12, 0.22] : [0.16];
      for (const by of pairs) {
        addBarrel(0.036, 0.54 + level * 0.07, 0.36 + level * 0.03, by, -0.08);
        addBarrel(0.036, 0.54 + level * 0.07, 0.36 + level * 0.03, by, 0.08);
      }
      for (const side of [-1, 1]) {
        const coil = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.075, 0.32 + level * 0.07, 8),
          copperMat,
        );
        coil.position.set(-0.06, 0.24 + level * 0.04, side * 0.26);
        headGroup.add(coil);
        const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.075 + level * 0.015, 0), glowMat);
        orb.position.set(-0.06, 0.44 + level * 0.07, side * 0.26);
        headGroup.add(orb);
      }
      const crownOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 + level * 0.02, 1), glowMat);
      crownOrb.position.set(-0.06, 0.38 + level * 0.05, 0);
      headGroup.add(crownOrb);
      spinnerMesh = crownOrb;
    } else if (type === 'siege_autocannon') {
      // MK1: Twin long autocannons -> MK2: Heavy gunshield + muzzle brakes -> MK3: Triple siege barrels + twin drums
      const drumOffsets = level === 3 ? [-0.14, 0.14] : [0];
      for (const dz of drumOffsets) {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 10), secondaryMat);
        drum.rotation.x = Math.PI / 2;
        drum.position.set(-0.26, 0.19, dz);
        headGroup.add(drum);
      }
      const barrelZ = level === 3 ? [-0.12, 0, 0.12] : [-0.095, 0.095];
      for (const bz of barrelZ) {
        addBarrel(0.042, 0.68 + level * 0.09, 0.42 + level * 0.04, bz === 0 ? 0.21 : 0.16, bz);
      }
      const railCore = new THREE.Mesh(
        new THREE.BoxGeometry(0.6 + level * 0.08, 0.055, 0.075),
        glowMat,
      );
      railCore.position.set(0.36 + level * 0.04, 0.16, 0);
      barrelGroup.add(railCore);
      if (level >= 2) {
        const shield = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.48), accentMat);
        shield.position.set(0.18, 0.17, 0);
        headGroup.add(shield);
      }
    } else if (type === 'tempest_prism') {
      const mastH = 0.42 + level * 0.09;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, mastH, 8), copperMat);
      mast.position.y = mastH * 0.5 + 0.04;
      headGroup.add(mast);
      for (let r = 0; r < level + 1; r++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.3 - r * 0.045, 0.03, 8, 18),
          r % 2 === 0 ? glowMat : secondaryGlowMat,
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.24 + r * 0.11;
        headGroup.add(ring);
      }
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.15 + level * 0.025, 0),
        glowMat,
      );
      crystal.position.y = mastH + 0.18;
      headGroup.add(crystal);
      spinnerMesh = crystal;
    } else if (type === 'glacial_lance') {
      const railLen = 0.78 + level * 0.1;
      for (const side of [-1, 1]) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.3 + level * 0.05, 10), glowMat);
        tank.rotation.z = Math.PI / 2;
        tank.position.set(-0.02, 0.26, side * 0.24);
        headGroup.add(tank);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(railLen, 0.055 + level * 0.008, 0.05), barrelSteel);
        rail.position.set(railLen * 0.48, 0.17, side * 0.08);
        barrelGroup.add(rail);
      }
      const beamCore = new THREE.Mesh(new THREE.BoxGeometry(railLen * 0.94, 0.045, 0.06), glowMat);
      beamCore.position.set(railLen * 0.45, 0.17, 0);
      barrelGroup.add(beamCore);
      const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.11 + level * 0.025, 0), secondaryGlowMat);
      crest.position.set(-0.1, 0.38, 0);
      headGroup.add(crest);
      spinnerMesh = crest;
      if (level >= 2) {
        for (const side of [-1, 1]) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.11), glowMat);
          fin.position.set(0.18, 0.16, side * 0.19);
          headGroup.add(fin);
        }
      }
    } else if (type === 'plasma_railgun') {
      const railLen = 0.76 + level * 0.1;
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(railLen, 0.06, 0.05), barrelSteel);
        rail.position.set(railLen * 0.48, 0.17, side * 0.085);
        barrelGroup.add(rail);
      }
      const coilCount = level + 1;
      for (let c = 0; c < coilCount; c++) {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.1 + level * 0.01, 0.024, 6, 12), glowMat);
        coil.position.set(0.14 + c * 0.19, 0.17, 0);
        coil.rotation.y = Math.PI / 2;
        barrelGroup.add(coil);
      }
      const arcCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + level * 0.022, 1), glowMat);
      arcCore.position.set(-0.08, 0.36, 0);
      headGroup.add(arcCore);
      spinnerMesh = arcCore;
    } else if (type === 'vulcan_behemoth') {
      for (const side of [-1, 1]) {
        const drum = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12 + level * 0.015, 0.12 + level * 0.015, 0.22, 10),
          glowMat,
        );
        drum.rotation.x = Math.PI / 2;
        drum.position.set(-0.24, 0.18, side * 0.18);
        headGroup.add(drum);
      }
      const bCount = level === 1 ? 6 : level === 2 ? 8 : 10;
      const bLen = 0.56 + level * 0.09;
      for (let i = 0; i < bCount; i++) {
        const a = (i * Math.PI * 2) / bCount;
        addBarrel(0.026, bLen, 0.36 + level * 0.04, 0.17 + Math.sin(a) * 0.085, Math.cos(a) * 0.085);
      }
      const shroud = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13 + level * 0.015, 0.13 + level * 0.015, 0.12, 12),
        glowMat,
      );
      shroud.rotation.z = Math.PI / 2;
      shroud.position.set(0.58 + level * 0.06, 0.17, 0);
      barrelGroup.add(shroud);
    } else if (type === 'absolute_zero') {
      const tubeOffsets = level === 1 ? [-0.12, 0.12] : level === 2 ? [-0.15, 0, 0.15] : [-0.17, -0.06, 0.06, 0.17];
      for (const tz of tubeOffsets) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.072, 0.44 + level * 0.05, 10), barrelSteel);
        tube.rotation.z = -Math.PI / 3.2;
        tube.position.set(0.18, 0.25 + (Math.abs(tz) < 0.08 ? 0.05 : 0), tz);
        barrelGroup.add(tube);
      }
      for (const side of [-1, 1]) {
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3 + level * 0.04, 8), glowMat);
        bottle.position.set(-0.08, 0.2, side * 0.27);
        headGroup.add(bottle);
      }
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 + level * 0.025, 0), glowMat);
      crystal.position.set(-0.06, 0.44 + level * 0.04, 0);
      headGroup.add(crystal);
      spinnerMesh = crystal;
    } else if (type === 'tesla_nexus') {
      const mastH = 0.56 + level * 0.1;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, mastH, 10), copperMat);
      mast.position.y = mastH * 0.5 + 0.04;
      headGroup.add(mast);
      for (let r = 0; r < level + 2; r++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3 - r * 0.036, 0.032, 8, 18), glowMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.22 + r * 0.11;
        headGroup.add(ring);
      }
      const megaOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + level * 0.025, 1), glowMat);
      megaOrb.position.y = mastH + 0.16;
      headGroup.add(megaOrb);
      spinnerMesh = megaOrb;
      const prongCount = level === 1 ? 3 : level === 2 ? 4 : 6;
      for (let i = 0; i < prongCount; i++) {
        const a = (i * Math.PI * 2) / prongCount;
        const prong = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.28, 6), secondaryGlowMat);
        prong.position.set(Math.cos(a) * 0.26, mastH - 0.04, Math.sin(a) * 0.26);
        headGroup.add(prong);
      }
    } else if (type === 'inferno_hydra') {
      const headOffsets = level === 1 ? [-0.1, 0.1] : level === 2 ? [-0.13, 0, 0.13] : [-0.16, -0.055, 0.055, 0.16];
      for (const hz of headOffsets) {
        addBarrel(0.042, 0.46 + level * 0.07, 0.3 + level * 0.03, 0.16, hz);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.14, 8), glowMat);
        cone.rotation.z = -Math.PI / 2;
        cone.position.set(0.52 + level * 0.06, 0.16, hz);
        barrelGroup.add(cone);
      }
      for (const side of [-1, 1]) {
        const reactor = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.32, 10), secondaryGlowMat);
        reactor.rotation.x = Math.PI / 2;
        reactor.position.set(-0.2, 0.2, side * 0.2);
        headGroup.add(reactor);
      }
    } else if (type === 'salvo_bastion') {
      const podW = 0.44 + level * 0.06;
      const podH = 0.24 + level * 0.04;
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.42, podH, podW), chassisMetal);
      pod.position.set(0.04, 0.23, 0);
      pod.rotation.z = 0.22;
      barrelGroup.add(pod);
      const cols = level + 2;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < cols; c++) {
          const tz = (c - (cols - 1) / 2) * 0.1;
          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.1, 6), glowMat);
          tip.rotation.z = -Math.PI / 2 + 0.22;
          tip.position.set(0.26, 0.19 + r * 0.1, tz);
          barrelGroup.add(tip);
        }
      }
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.08, 10), secondaryGlowMat);
      dish.position.set(-0.14, 0.42, 0);
      headGroup.add(dish);
      spinnerMesh = dish;
    } else if (type === 'solar_obelisk') {
      const obeliskH = 0.52 + level * 0.1;
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.2, obeliskH, 6), chassisMetal);
      spire.position.y = obeliskH * 0.5 + 0.05;
      headGroup.add(spire);
      const emitterLen = 0.42 + level * 0.1;
      for (const side of [-1, 1]) {
        const prong = new THREE.Mesh(new THREE.BoxGeometry(emitterLen, 0.055, 0.06), barrelSteel);
        prong.position.set(emitterLen * 0.46, 0.24, side * 0.12);
        barrelGroup.add(prong);
      }
      const sunOrb = new THREE.Mesh(new THREE.OctahedronGeometry(0.15 + level * 0.025, 0), secondaryGlowMat);
      sunOrb.position.set(0.08, obeliskH + 0.14, 0);
      headGroup.add(sunOrb);
      spinnerMesh = sunOrb;
      for (let r = 0; r < level; r++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24 - r * 0.03, 0.022, 6, 16), glowMat);
        ring.rotation.y = Math.PI / 2;
        ring.position.set(0.24 + r * 0.12, 0.24, 0);
        barrelGroup.add(ring);
      }
    } else if (type === 'singularity_core') {
      const mastH = 0.46 + level * 0.08;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, mastH, 8), copperMat);
      mast.position.y = mastH * 0.5 + 0.04;
      headGroup.add(mast);
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15 + level * 0.028, 1), glowMat);
      orb.position.y = mastH + 0.16;
      headGroup.add(orb);
      spinnerMesh = orb;
      for (let r = 0; r < level + 1; r++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.28 - r * 0.03, 0.026, 8, 20),
          r % 2 === 0 ? glowMat : secondaryGlowMat,
        );
        ring.position.y = mastH + 0.14;
        ring.rotation.set((r * Math.PI) / 3.5, (r * Math.PI) / 4, 0);
        headGroup.add(ring);
      }
    } else {
      // Omega Railgun (scales noticeably across MK 1 -> MK 2 -> MK 3)
      const railLen = 0.88 + level * 0.12;
      for (const side of [-1, 1]) {
        const railTop = new THREE.Mesh(new THREE.BoxGeometry(railLen, 0.055, 0.055), barrelSteel);
        railTop.position.set(railLen * 0.48, 0.22, side * 0.09);
        const railBot = new THREE.Mesh(new THREE.BoxGeometry(railLen, 0.055, 0.055), barrelSteel);
        railBot.position.set(railLen * 0.48, 0.12, side * 0.09);
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.38 + level * 0.06, 0.04, 0.14), accentMat);
        wing.position.set(0.08, 0.15, side * 0.23);
        barrelGroup.add(railTop, railBot);
        headGroup.add(wing);
      }
      if (level >= 2) {
        for (let c = 0; c < level; c++) {
          const coil = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 6, 12), glowMat);
          coil.rotation.y = Math.PI / 2;
          coil.position.set(0.22 + c * 0.24, 0.17, 0);
          barrelGroup.add(coil);
        }
      }
      const coreBeam = new THREE.Mesh(new THREE.BoxGeometry(railLen * 0.92, 0.06, 0.08), glowMat);
      coreBeam.position.set(railLen * 0.45, 0.17, 0);
      barrelGroup.add(coreBeam);
      const reactor = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.22 + level * 0.03, 0.42),
        glowMat,
      );
      reactor.position.set(-0.24, 0.19, 0);
      headGroup.add(reactor);
    }
  }

  return {
    group,
    headGroup,
    barrelGroup,
    spinnerMesh,
    overdriveRing,
    combineTargetRing,
    dispose: () => disposeGroupResources(group),
  };
}

export function createEnemyModel(
  archetype: EnemyArchetypeId,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): EnemyModelHandle {
  const group = new THREE.Group();
  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  const tintableMaterials: THREE.MeshStandardMaterial[] = [];
  const baseColors: { color: THREE.Color; emissive: THREE.Color; emissiveIntensity: number }[] = [];

  const registerMat = (mat: THREE.MeshStandardMaterial) => {
    tintableMaterials.push(mat);
    baseColors.push({
      color: mat.color.clone(),
      emissive: mat.emissive.clone(),
      emissiveIntensity: mat.emissiveIntensity,
    });
    return mat;
  };

  const darkFrame = new THREE.MeshStandardMaterial({
    color: 0x1e2630,
    roughness: 0.68,
    metalness: 0.45,
  });

  const shadowRadius =
    archetype === 'boss' ? 0.56 : archetype === 'tank' ? 0.42 : archetype === 'scout' ? 0.28 : 0.35;

  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(shadowRadius * 2, shadowRadius * 2),
    new THREE.MeshBasicMaterial({
      map: textures.contactShadowMap,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.015;
  group.add(contactShadow);

  let barHeight = 0.72;
  let shieldRadius = 0.36;

  if (archetype === 'scout') {
    const hullMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        roughness: 0.34,
        metalness: 0.58,
      }),
    );
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.44, 6), hullMat);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(0.05, 0.19, 0);
    nose.castShadow = true;

    const wings = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.42), darkFrame);
    wings.position.set(-0.06, 0.16, 0);
    wings.castShadow = true;

    const thruster = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 0.1, 8),
      registerMat(
        new THREE.MeshStandardMaterial({
          color: 0xfef08a,
          emissive: 0xf59e0b,
          emissiveIntensity: 1.15,
          roughness: 0.3,
        }),
      ),
    );
    thruster.rotation.z = Math.PI / 2;
    thruster.position.set(-0.2, 0.18, 0);
    bodyGroup.add(nose, wings, thruster);
    barHeight = 0.56;
    shieldRadius = 0.32;
  } else if (archetype === 'tank') {
    const armorMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.45,
        metalness: 0.78,
      }),
    );
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.22, 0.44), armorMat);
    hull.position.y = 0.17;
    hull.castShadow = true;

    const tracks = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.12, 0.52), darkFrame);
    tracks.position.y = 0.08;
    tracks.castShadow = true;

    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.13, 8), armorMat);
    turret.position.set(-0.03, 0.33, 0);
    turret.castShadow = true;

    const prow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.36), darkFrame);
    prow.position.set(0.27, 0.15, 0);
    bodyGroup.add(tracks, hull, turret, prow);
    barHeight = 0.68;
    shieldRadius = 0.44;
  } else if (archetype === 'shielded') {
    const aegisMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.28,
        metalness: 0.64,
      }),
    );
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.14, 6), darkFrame);
    base.position.y = 0.09;
    base.castShadow = true;

    const pylon = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), aegisMat);
    pylon.position.y = 0.3;
    pylon.castShadow = true;

    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.028, 6, 16), aegisMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.24;
    bodyGroup.add(base, pylon, halo);
    barHeight = 0.74;
    shieldRadius = 0.4;
  } else if (archetype === 'regenerator') {
    const bioMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0x34d399,
        emissive: 0x059669,
        emissiveIntensity: 0.5,
        roughness: 0.38,
        metalness: 0.28,
      }),
    );
    const torso = new THREE.Mesh(new THREE.DodecahedronGeometry(0.21, 0), bioMat);
    torso.scale.set(1.25, 0.85, 0.95);
    torso.position.y = 0.22;
    torso.castShadow = true;

    for (const sx of [-0.14, 0.12]) {
      for (const sz of [-0.22, 0.22]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.07), darkFrame);
        leg.position.set(sx, 0.09, sz);
        leg.castShadow = true;
        bodyGroup.add(leg);
      }
    }
    const spine = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 5), bioMat);
    spine.position.set(-0.04, 0.4, 0);
    bodyGroup.add(torso, spine);
    barHeight = 0.72;
    shieldRadius = 0.38;
  } else {
    // Dreadnought Boss
    const bossMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        roughness: 0.34,
        metalness: 0.68,
      }),
    );
    const coreMat = registerMat(
      new THREE.MeshStandardMaterial({
        color: 0xfca5a5,
        emissive: 0xef4444,
        emissiveIntensity: 1.5,
        roughness: 0.2,
      }),
    );

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.34, 0.64), darkFrame);
    chassis.position.y = 0.21;
    chassis.castShadow = true;

    const carapace = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 0.26, 8), bossMat);
    carapace.position.set(0.04, 0.46, 0);
    carapace.castShadow = true;

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), coreMat);
    core.position.set(0.22, 0.46, 0);

    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.18), bossMat);
      pod.position.set(-0.06, 0.38, side * 0.4);
      pod.castShadow = true;
      bodyGroup.add(pod);
    }

    bodyGroup.add(chassis, carapace, core);
    barHeight = 0.98;
    shieldRadius = 0.58;
  }

  const shieldMesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(shieldRadius, 1),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: isSoftwareGl ? 0.34 : 0.26,
      wireframe: false,
      depthWrite: false,
    }),
  );
  shieldMesh.position.y = shieldRadius * 0.72;
  shieldMesh.visible = false;
  group.add(shieldMesh);

  let telegraphMesh: THREE.Mesh | undefined;
  if (archetype === 'boss') {
    telegraphMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.85, 32),
      new THREE.MeshBasicMaterial({
        color: 0xef4444,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.75,
      }),
    );
    telegraphMesh.rotation.x = -Math.PI / 2;
    telegraphMesh.position.y = 0.04;
    telegraphMesh.visible = false;
    group.add(telegraphMesh);
  }

  const barGroup = new THREE.Group();
  barGroup.position.y = barHeight;
  const barWidth = archetype === 'boss' ? 0.82 : 0.54;

  const hpBg = new THREE.Mesh(
    new THREE.PlaneGeometry(barWidth + 0.04, 0.08),
    new THREE.MeshBasicMaterial({ color: 0x0b0f14, side: THREE.DoubleSide }),
  );
  barGroup.add(hpBg);

  const hpBarFill = new THREE.Mesh(
    new THREE.PlaneGeometry(barWidth, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x34d399, side: THREE.DoubleSide }),
  );
  hpBarFill.position.z = 0.005;
  barGroup.add(hpBarFill);

  const shieldBarBg = new THREE.Mesh(
    new THREE.PlaneGeometry(barWidth + 0.04, 0.055),
    new THREE.MeshBasicMaterial({ color: 0x0b0f14, side: THREE.DoubleSide }),
  );
  shieldBarBg.position.y = 0.07;
  shieldBarBg.visible = false;
  barGroup.add(shieldBarBg);

  const shieldBarFill = new THREE.Mesh(
    new THREE.PlaneGeometry(barWidth, 0.036),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide }),
  );
  shieldBarFill.position.set(0, 0.07, 0.005);
  shieldBarFill.visible = false;
  barGroup.add(shieldBarFill);

  group.add(barGroup);

  return {
    group,
    bodyGroup,
    tintableMaterials,
    baseColors,
    shieldMesh,
    telegraphMesh,
    barGroup,
    hpBarFill,
    shieldBarBg,
    shieldBarFill,
    barHeight,
    dispose: () => disposeGroupResources(group),
  };
}

export function createSpawnGateModel(): LandmarkHandle {
  const group = new THREE.Group();
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x242e38,
    roughness: 0.58,
    metalness: 0.6,
  });
  const amberGlow = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 1.5,
    roughness: 0.3,
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.1, 0.92), darkMat);
  base.position.y = 0.05;
  base.receiveShadow = true;
  group.add(base);

  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.92, 0.18), darkMat);
    pillar.position.set(0, 0.51, side * 0.36);
    pillar.castShadow = true;
    group.add(pillar);

    const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.12), amberGlow);
    beacon.position.set(0, 1.0, side * 0.36);
    group.add(beacon);
  }

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.96), darkMat);
  lintel.position.y = 0.98;
  lintel.castShadow = true;
  group.add(lintel);

  const portalField = new THREE.Mesh(
    new THREE.PlaneGeometry(0.58, 0.8),
    new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  portalField.rotation.y = Math.PI / 2;
  portalField.position.y = 0.5;
  group.add(portalField);

  return {
    group,
    animatedPart: portalField,
    dispose: () => disposeGroupResources(group),
  };
}

export function createBastionCitadelModel(): LandmarkHandle {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x26323f,
    roughness: 0.52,
    metalness: 0.55,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xe2c896,
    roughness: 0.32,
    metalness: 0.78,
  });
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x34d399,
    emissive: 0x10b981,
    emissiveIntensity: 1.6,
    roughness: 0.2,
  });

  const plinth1 = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.16, 8), stoneMat);
  plinth1.position.y = 0.08;
  plinth1.castShadow = true;
  plinth1.receiveShadow = true;

  const plinth2 = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.22, 8), stoneMat);
  plinth2.position.y = 0.27;
  plinth2.castShadow = true;

  const spireBody = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.95, 8), stoneMat);
  spireBody.position.y = 0.85;
  spireBody.castShadow = true;

  const trimCollar = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.032, 8, 16), trimMat);
  trimCollar.rotation.x = Math.PI / 2;
  trimCollar.position.y = 1.18;

  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const buttress = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 0.14), stoneMat);
    buttress.position.set(Math.cos(a) * 0.28, 0.62, Math.sin(a) * 0.28);
    buttress.rotation.y = -a;
    buttress.castShadow = true;
    group.add(buttress);
  }

  const coreCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), coreMat);
  coreCrystal.position.y = 1.56;
  coreCrystal.castShadow = true;

  group.add(plinth1, plinth2, spireBody, trimCollar, coreCrystal);

  return {
    group,
    animatedPart: coreCrystal,
    dispose: () => disposeGroupResources(group),
  };
}

export function createRockClusterModel(seed: number): THREE.Group {
  const group = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x354352,
    roughness: 0.85,
    metalness: 0.14,
    flatShading: true,
  });

  const s1 = ((seed * 9301 + 49297) % 233280) / 233280;
  const s2 = ((seed * 1234 + 76543) % 233280) / 233280;
  const isAmberVein = seed % 2 === 0;

  const crystalMat = new THREE.MeshStandardMaterial({
    color: isAmberVein ? 0xf59e0b : 0x38bdf8,
    emissive: isAmberVein ? 0xb45309 : 0x0284c7,
    emissiveIntensity: 0.85,
    roughness: 0.25,
    metalness: 0.3,
  });

  const mainRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28 + s1 * 0.08, 0), rockMat);
  mainRock.scale.set(1.12, 0.86 + s2 * 0.42, 1.0);
  mainRock.rotation.set(s1 * 1.4, s2 * 3.1, s1 * 0.8);
  mainRock.position.set(0, 0.18, 0);
  mainRock.castShadow = true;
  mainRock.receiveShadow = true;
  group.add(mainRock);

  const sideRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17 + s2 * 0.05, 0), rockMat);
  sideRock.rotation.set(s2 * 2, s1 * 4, 0.4);
  sideRock.position.set((s1 - 0.5) * 0.34, 0.11, (s2 - 0.5) * 0.34);
  sideRock.castShadow = true;
  sideRock.receiveShadow = true;
  group.add(sideRock);

  // Mineral crystal shard jutting out of the rock formation
  const shard = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.28, 5), crystalMat);
  shard.position.set((s2 - 0.5) * 0.18, 0.32, (s1 - 0.5) * 0.18);
  shard.rotation.set((s1 - 0.5) * 0.6, s2 * 2, (s2 - 0.5) * 0.6);
  group.add(shard);

  return group;
}
