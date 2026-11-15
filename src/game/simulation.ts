import {
  ENEMY_DEFS,
  FUSION_COST,
  GAME_MODES,
  getCombinedTowerType,
  getLevelDef,
  isBaseTowerType,
  isSuperTowerType,
  MAX_ACTIVE_TOWERS,
  MAX_LEVEL,
  POWER_UP_BY_ID,
  POWER_UP_POOL,
  rollRandomLevelModifiers,
  TOWER_DEFS,
} from './catalog';
import { generateRandomMap } from './mapGen';
import { computeTotalRewardMultiplier, getNextUnlockableTower } from './progression';
import type {
  BaseTowerType,
  EnemyArchetypeId,
  EnemyInstance,
  GameModeId,
  ModifierId,
  PlacedTower,
  PlayerProfile,
  PowerUpDef,
  PowerUpId,
  RunOutcome,
  RunState,
  TacticalPing,
  TacticalPingKind,
  TargetPriority,
  TowerType,
  WaveSpawnEntry,
} from './types';

export const PORTAL_EMERGENCE_DISTANCE = 0.85;
export const TACTICAL_PING_DURATION = 7.0;
export const TACTICAL_PING_FOCUS_RADIUS = 1.85;

export function isEnemyTargetable(enemy: Pick<EnemyInstance, 'dead' | 'reachedExit' | 'distanceTraveled'>): boolean {
  return !enemy.dead && !enemy.reachedExit && enemy.distanceTraveled >= PORTAL_EMERGENCE_DISTANCE;
}

export interface SimEvent {
  type:
    | 'shoot'
    | 'hit'
    | 'kill'
    | 'place'
    | 'upgrade'
    | 'combine'
    | 'sell'
    | 'wave_start'
    | 'wave_clear'
    | 'ability'
    | 'leak'
    | 'victory'
    | 'defeat';
  towerType?: TowerType;
  heavy?: boolean;
  abilityId?: PowerUpId;
}

export interface EffectiveTowerStats {
  damage: number;
  range: number;
  fireRate: number;
  splashRadius: number;
  slowFactor: number;
  slowDuration: number;
  chainCount: number;
  armorPierce: number;
  shieldMultiplier: number;
  critChance: number;
  critMultiplier: number;
  pierceCount: number;
  appliesVulnerability: boolean;
  hasGlacialPulse: boolean;
  hasEmpStun: boolean;
  upgradeCost: number | null;
  sellRefund: number;
}

export function createRunState(
  mode: GameModeId,
  profile: PlayerProfile,
  seed?: number,
): RunState {
  const modeDef = GAME_MODES[mode];
  const level = Math.max(1, Math.min(MAX_LEVEL, profile.selectedLevel || 1));
  const levelDef = getLevelDef(level);
  const levelSeed = profile.levelSeeds?.[level] ?? (seed ?? 1337);
  const levelModifiers = rollRandomLevelModifiers(level, levelSeed);
  const modifiers = [...levelModifiers];

  const hasAusterity = modifiers.includes('austerity');
  const hasFragile = modifiers.includes('fragile_bastion');

  const baseScrap = Math.max(100, modeDef.startingScrap + levelDef.startingScrapOffset);
  const startingScrap = hasAusterity ? Math.round(baseScrap * 0.75) : baseScrap;
  const startingLives = hasFragile ? 10 : modeDef.startingLives;
  const totalWaves =
    modeDef.totalWaves !== null ? modeDef.totalWaves + levelDef.wavesBonus : null;
  const equippedLoadout =
    profile.equippedLoadout.length > 0 ? [...profile.equippedLoadout] : ['cannon', 'cryo', 'tesla', 'rail'];

  return {
    mode,
    level,
    map: generateRandomMap(seed, level),
    scrap: startingScrap,
    lives: startingLives,
    maxLives: startingLives,
    wave: 0,
    totalWaves,
    waveActive: false,
    waveCleared: true,
    autoSkipWave: false,
    autoWaveTimer: 0,
    spawnQueue: [],
    spawnTimer: 0,
    towers: [],
    enemies: [],
    projectiles: [],
    arcs: [],
    rings: [],
    floatingTexts: [],
    tacticalPings: [],
    pendingTacticalPing: false,
    showEnemyPath: true,
    nextEntityId: 1,
    passivePowerUps: [],
    activeAbilities: [],
    draftOptions: null,
    pendingTargetingAbility: null,
    pendingCombineTowerId: null,
    overdriveTimer: 0,
    hitstopTimer: 0,
    trauma: 0,
    enemiesDefeated: 0,
    totalDamageDealt: 0,
    score: 0,
    speedMultiplier: 1,
    equippedLoadout: equippedLoadout as BaseTowerType[],
    unlockedTowersSnapshot: [...profile.unlockedTowers],
    levelModifiers,
    activeModifiers: modifiers,
    evolutionsSnapshot: structuredClone(profile.evolutions),
    outcome: null,
    defeatDelayTimer: 0,
    selectedTowerId: null,
    selectedBuildType: (equippedLoadout[0] as BaseTowerType) ?? 'cannon',
  };
}

export function rerollRunMap(run: RunState, seed?: number): RunState {
  if (run.wave > 0 || run.waveActive) return run;
  let refundedScrap = run.scrap;
  for (const t of run.towers) {
    refundedScrap += t.totalSpent;
  }
  return {
    ...run,
    map: generateRandomMap(seed, run.level),
    towers: [],
    selectedTowerId: null,
    pendingCombineTowerId: null,
    autoWaveTimer: 0,
    scrap: refundedScrap,
  };
}

export function computeTowerEffectiveStats(
  tower: Pick<PlacedTower, 'type' | 'level' | 'onVantage' | 'totalSpent'> & {
    fusedParents?: PlacedTower['fusedParents'];
  },
  run: Pick<
    RunState,
    'evolutionsSnapshot' | 'passivePowerUps' | 'overdriveTimer'
  >,
): EffectiveTowerStats {
  const base = TOWER_DEFS[tower.type];

  let damage = base.damage;
  let range = base.range;
  let fireRate = base.fireRate;
  let splashRadius = base.splashRadius;
  let slowFactor = base.slowFactor;
  let slowDuration = base.slowDuration;
  let chainCount = base.chainCount;
  let armorPierce = base.armorPierce;
  let shieldMultiplier = base.shieldMultiplier;
  let critChance = 0;
  let critMultiplier = 1.6;
  let pierceCount = base.pierceCount ?? 1;
  let appliesVulnerability =
    tower.type === 'inferno_hydra' || tower.type === 'singularity_core';
  let hasGlacialPulse =
    tower.type === 'absolute_zero' || tower.type === 'singularity_core';
  let hasEmpStun = tower.type === 'tesla_nexus';

  // In-match upgrade scaling (Level 1 -> 2 -> 3)
  if (tower.level === 2) {
    damage *= 1.52;
    range *= 1.12;
    fireRate *= 1.15;
  } else if (tower.level === 3) {
    damage *= 2.35;
    range *= 1.24;
    fireRate *= 1.32;
  }

  // Main menu Tower Evolution bonuses
  if (isBaseTowerType(tower.type)) {
    const evo = run.evolutionsSnapshot[tower.type];
    if (evo) {
      if (evo.tier >= 1) {
        if (tower.type === 'cannon') {
          damage *= 1.15;
          range *= 1.1;
        } else if (tower.type === 'cryo') {
          damage *= 1.15;
          range *= 1.1;
        } else if (tower.type === 'tesla') {
          damage *= 1.15;
          range *= 1.12;
        } else if (tower.type === 'rail') {
          damage *= 1.18;
          range *= 1.1;
        } else if (tower.type === 'pyro') {
          damage *= 1.18;
          range *= 1.1;
        } else if (tower.type === 'missile') {
          damage *= 1.15;
          range *= 1.12;
        } else if (tower.type === 'laser') {
          damage *= 1.18;
          range *= 1.1;
        } else if (tower.type === 'chrono') {
          damage *= 1.15;
          range *= 1.12;
        }
      }

      if (evo.tier >= 2) {
        if (tower.type === 'cannon') {
          armorPierce = Math.min(1, armorPierce + 0.25);
          fireRate *= 1.1;
        } else if (tower.type === 'cryo') {
          splashRadius *= 1.25;
          slowDuration += 1.2;
        } else if (tower.type === 'tesla') {
          chainCount += 2;
        } else if (tower.type === 'rail') {
          fireRate *= 1.2;
          pierceCount += 1;
        } else if (tower.type === 'pyro') {
          splashRadius *= 1.25;
          armorPierce = Math.min(1, armorPierce + 0.2);
        } else if (tower.type === 'missile') {
          splashRadius *= 1.28;
          fireRate *= 1.15;
        } else if (tower.type === 'laser') {
          fireRate *= 1.2;
          armorPierce = 1.0;
        } else if (tower.type === 'chrono') {
          slowDuration += 1.2;
          chainCount += 2;
        }
      }

      if (evo.tier >= 3) {
        if (tower.type === 'cannon') {
          if (evo.apexChoice === 'a') {
            fireRate *= 1.4;
          } else {
            appliesVulnerability = true;
          }
        } else if (tower.type === 'cryo') {
          if (evo.apexChoice === 'a') {
            slowFactor = 0.48;
            damage *= 1.35;
          } else {
            hasGlacialPulse = true;
          }
        } else if (tower.type === 'tesla') {
          if (evo.apexChoice === 'a') {
            shieldMultiplier = 2.8;
            damage *= 1.25;
          } else {
            hasEmpStun = true;
          }
        } else if (tower.type === 'rail') {
          if (evo.apexChoice === 'a') {
            pierceCount = 4;
            armorPierce = 1.0;
          } else {
            critMultiplier = 2.15;
            critChance += 0.2;
          }
        } else if (tower.type === 'pyro') {
          if (evo.apexChoice === 'a') {
            damage *= 1.35;
            armorPierce = Math.max(armorPierce, 0.85);
          } else {
            appliesVulnerability = true;
          }
        } else if (tower.type === 'missile') {
          if (evo.apexChoice === 'a') {
            damage *= 1.4;
            shieldMultiplier = Math.max(shieldMultiplier, 1.8);
          } else {
            slowFactor = Math.max(slowFactor, 0.25);
            slowDuration = Math.max(slowDuration, 2.0);
          }
        } else if (tower.type === 'laser') {
          if (evo.apexChoice === 'a') {
            damage *= 1.45;
            critChance += 0.25;
          } else {
            pierceCount = 3;
          }
        } else if (tower.type === 'chrono') {
          if (evo.apexChoice === 'a') {
            hasGlacialPulse = true;
          } else {
            slowFactor = Math.max(slowFactor, 0.55);
            shieldMultiplier = Math.max(shieldMultiplier, 2.0);
          }
        }
      }
    }
  } else {
    const effectiveParents = tower.fusedParents ?? base.parents;
    if (effectiveParents) {
      // Super Turrets inherit combined evolution synergy from both actual fused parent chassis
      const combinedTiers =
        (run.evolutionsSnapshot[effectiveParents[0]]?.tier ?? 0) +
        (run.evolutionsSnapshot[effectiveParents[1]]?.tier ?? 0);
      damage *= 1 + combinedTiers * 0.06;
      range *= 1 + combinedTiers * 0.03;
      for (const parent of effectiveParents) {
        const pEvo = run.evolutionsSnapshot[parent];
        if (pEvo && pEvo.tier >= 3) {
          if ((parent === 'cannon' || parent === 'pyro') && pEvo.apexChoice === 'b') {
            appliesVulnerability = true;
          }
          if (parent === 'cryo' && pEvo.apexChoice === 'b') hasGlacialPulse = true;
          if (parent === 'chrono' && pEvo.apexChoice === 'a') hasGlacialPulse = true;
          if (parent === 'tesla' && pEvo.apexChoice === 'b') hasEmpStun = true;
          if (parent === 'rail' && pEvo.apexChoice === 'b') critChance += 0.15;
          if (parent === 'laser' && pEvo.apexChoice === 'a') critChance += 0.15;
        }
      }
    }
  }

  // High-ground vantage bonus
  if (tower.onVantage) {
    range *= 1.15;
  }

  // In-run Power-Up bonuses
  for (const p of run.passivePowerUps) {
    if (p === 'high_velocity_barrels') fireRate *= 1.18;
    if (p === 'precision_optics') {
      range *= 1.15;
      critChance += 0.15;
    }
  }

  // Active Overdrive Beacon
  if (run.overdriveTimer > 0) {
    fireRate *= 1.6;
  }

  const upgradeCost =
    tower.level === 1
      ? base.upgradeBaseCost
      : tower.level === 2
        ? Math.round(base.upgradeBaseCost * 1.65)
        : null;

  return {
    damage: Math.round(damage),
    range: Number(range.toFixed(2)),
    fireRate: Number(fireRate.toFixed(2)),
    splashRadius: Number(splashRadius.toFixed(2)),
    slowFactor,
    slowDuration,
    chainCount,
    armorPierce,
    shieldMultiplier,
    critChance: Math.min(0.85, critChance),
    critMultiplier,
    pierceCount,
    appliesVulnerability,
    hasGlacialPulse,
    hasEmpStun,
    upgradeCost,
    sellRefund: Math.round(tower.totalSpent * 0.7),
  };
}

export const TOWER_MIN_SPACING = 0.78;
export const TOWER_PATH_CLEARANCE = 0.84;
export const TOWER_OBSTACLE_CLEARANCE = 0.82;

export function getTowerCoords(
  tower: Pick<PlacedTower, 'col' | 'row'> & Partial<Pick<PlacedTower, 'x' | 'y'>>,
): { x: number; y: number } {
  return {
    x: tower.x ?? tower.col + 0.5,
    y: tower.y ?? tower.row + 0.5,
  };
}

export function normalizePlacementPoint(
  colOrX: number,
  rowOrY: number,
): { x: number; y: number } {
  if (Number.isInteger(colOrX) && Number.isInteger(rowOrY)) {
    return { x: colOrX + 0.5, y: rowOrY + 0.5 };
  }
  return { x: colOrX, y: rowOrY };
}

function distPointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 0.000001) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lenSq));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

export function isPointNearPath(run: Pick<RunState, 'map'>, x: number, y: number, margin: number): boolean {
  const path = run.map.path;
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const ax = a.col + 0.5;
    const ay = a.row + 0.5;
    if (i < path.length - 1) {
      const b = path[i + 1];
      if (distPointToSegment(x, y, ax, ay, b.col + 0.5, b.row + 0.5) < margin) {
        return true;
      }
    } else if (Math.hypot(x - ax, y - ay) < margin) {
      return true;
    }
  }
  return false;
}

export function canPlaceTowerAt(run: RunState, colOrX: number, rowOrY: number): boolean {
  const { x, y } = normalizePlacementPoint(colOrX, rowOrY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (x < 0.45 || x > run.map.cols - 0.45 || y < 0.45 || y > run.map.rows - 0.45) {
    return false;
  }

  // Must stay outside sunken path trench & spawn/exit portals
  if (isPointNearPath(run, x, y, TOWER_PATH_CLEARANCE)) {
    return false;
  }

  // Must stay clear of obstacle props/structures
  for (let r = 0; r < run.map.rows; r++) {
    for (let c = 0; c < run.map.cols; c++) {
      if (run.map.tiles[r][c] === 'obstacle') {
        if (Math.hypot(x - (c + 0.5), y - (r + 0.5)) < TOWER_OBSTACLE_CLEARANCE) {
          return false;
        }
      }
    }
  }

  // Smooth collision radius against already placed turrets
  for (const t of run.towers) {
    const tc = getTowerCoords(t);
    if (Math.hypot(x - tc.x, y - tc.y) < TOWER_MIN_SPACING) {
      return false;
    }
  }
  return true;
}

export function getDeployedCountByType(
  towers: Pick<PlacedTower, 'type' | 'fusedParents'>[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of towers) {
    counts[t.type] = (counts[t.type] ?? 0) + 1;
    if (isSuperTowerType(t.type)) {
      const parents = t.fusedParents ?? TOWER_DEFS[t.type].parents;
      if (parents) {
        for (const p of parents) {
          counts[p] = (counts[p] ?? 0) + 1;
        }
      }
    }
  }
  return counts;
}

export function getUsedGridCapacity(towers: Pick<PlacedTower, 'type'>[]): number {
  let used = 0;
  for (const t of towers) {
    used += isSuperTowerType(t.type) ? 2 : 1;
  }
  return used;
}

export function canBuildTower(
  run: Pick<RunState, 'outcome' | 'equippedLoadout' | 'towers'>,
  type: BaseTowerType,
): { ok: boolean; reason?: string } {
  if (run.outcome) return { ok: false, reason: 'Run ended' };
  if (!run.equippedLoadout.includes(type)) {
    return { ok: false, reason: 'Not in equipped lineup' };
  }
  if (getUsedGridCapacity(run.towers) >= MAX_ACTIVE_TOWERS) {
    return { ok: false, reason: `Grid cap (${MAX_ACTIVE_TOWERS}) reached` };
  }
  const def = TOWER_DEFS[type];
  const deployedByType = getDeployedCountByType(run.towers);
  const deployedOfType = deployedByType[type] ?? 0;
  if (deployedOfType >= def.maxCount) {
    return { ok: false, reason: `${def.name} cap (${def.maxCount}) reached` };
  }
  return { ok: true };
}

export function placeTower(
  run: RunState,
  type: BaseTowerType,
  colOrX: number,
  rowOrY: number,
): { ok: boolean; tower?: PlacedTower; reason?: string } {
  const buildCheck = canBuildTower(run, type);
  if (!buildCheck.ok) return buildCheck;

  const def = TOWER_DEFS[type];
  if (run.scrap < def.cost) return { ok: false, reason: 'Insufficient scrap' };
  if (!canPlaceTowerAt(run, colOrX, rowOrY)) return { ok: false, reason: 'Blocked terrain' };

  const { x, y } = normalizePlacementPoint(colOrX, rowOrY);
  const col = Math.max(0, Math.min(run.map.cols - 1, Math.floor(x)));
  const row = Math.max(0, Math.min(run.map.rows - 1, Math.floor(y)));

  const tower: PlacedTower = {
    id: run.nextEntityId++,
    type,
    col,
    row,
    x,
    y,
    level: 1,
    priority: 'first',
    onVantage: false,
    totalSpent: def.cost,
    kills: 0,
    damageDealt: 0,
    cooldown: 0.1,
    angle: 0,
    recoil: 0,
    pulseTimer: 4.0,
  };

  run.scrap -= def.cost;
  run.towers.push(tower);
  run.selectedTowerId = tower.id;
  run.pendingCombineTowerId = null;
  return { ok: true, tower };
}

export function upgradeTower(run: RunState, towerId: number): boolean {
  const tower = run.towers.find((t) => t.id === towerId);
  if (!tower || tower.level >= 3) return false;
  const stats = computeTowerEffectiveStats(tower, run);
  if (stats.upgradeCost === null || run.scrap < stats.upgradeCost) return false;

  run.scrap -= stats.upgradeCost;
  tower.totalSpent += stats.upgradeCost;
  tower.level = (tower.level + 1) as 2 | 3;
  const tc = getTowerCoords(tower);
  run.rings.push({
    x: tc.x,
    y: tc.y,
    radius: 0.2,
    maxRadius: 1.0,
    color: TOWER_DEFS[tower.type].accentColor,
    life: 0.35,
    maxLife: 0.35,
  });
  return true;
}

export function canCombineTowers(
  run: RunState,
  primaryId: number,
  partnerId: number,
): boolean {
  if (run.outcome || primaryId === partnerId || run.scrap < FUSION_COST) return false;
  const primary = run.towers.find((t) => t.id === primaryId);
  const partner = run.towers.find((t) => t.id === partnerId);
  if (!primary || !partner) return false;
  const superType = getCombinedTowerType(primary.type, partner.type);
  if (!superType) return false;
  const superDef = TOWER_DEFS[superType];
  const existingSuperCount = run.towers.filter(
    (t) => t.type === superType && t.id !== primaryId && t.id !== partnerId,
  ).length;
  return existingSuperCount < superDef.maxCount;
}

export function combineTowers(
  run: RunState,
  primaryId: number,
  partnerId: number,
  emit: (ev: SimEvent) => void = () => {},
): { ok: boolean; tower?: PlacedTower } {
  if (!canCombineTowers(run, primaryId, partnerId)) {
    return { ok: false };
  }
  const primary = run.towers.find((t) => t.id === primaryId)!;
  const partnerIdx = run.towers.findIndex((t) => t.id === partnerId);
  const partner = run.towers[partnerIdx]!;
  const superType = getCombinedTowerType(primary.type, partner.type);
  if (!superType) return { ok: false };

  run.scrap -= FUSION_COST;
  primary.fusedParents = [primary.type as BaseTowerType, partner.type as BaseTowerType];
  primary.type = superType;
  primary.level = Math.max(primary.level, partner.level) as 1 | 2 | 3;
  primary.totalSpent += partner.totalSpent + FUSION_COST;
  primary.kills += partner.kills;
  primary.damageDealt += partner.damageDealt;
  primary.cooldown = 0.05;
  primary.recoil = 1;
  primary.pulseTimer = 3.5;

  run.towers.splice(partnerIdx, 1);
  run.selectedTowerId = primary.id;
  run.pendingCombineTowerId = null;

  const def = TOWER_DEFS[superType];
  const tc = getTowerCoords(primary);
  run.rings.push({
    x: tc.x,
    y: tc.y,
    radius: 0.2,
    maxRadius: 1.6,
    color: def.accentColor,
    life: 0.5,
    maxLife: 0.5,
  });
  run.floatingTexts.push({
    x: tc.x,
    y: tc.y - 0.25,
    vy: -0.7,
    text: `${def.name}!`,
    color: '#FBBF24',
    life: 1.0,
    maxLife: 1.0,
  });
  run.trauma = Math.min(1, run.trauma + 0.28);
  emit({ type: 'combine', towerType: superType });
  return { ok: true, tower: primary };
}

export function sellTower(run: RunState, towerId: number): number {
  const idx = run.towers.findIndex((t) => t.id === towerId);
  if (idx === -1) return 0;
  const tower = run.towers[idx];
  const refund = Math.round(tower.totalSpent * 0.7);
  run.scrap += refund;
  run.towers.splice(idx, 1);
  if (run.selectedTowerId === towerId) {
    run.selectedTowerId = null;
  }
  if (run.pendingCombineTowerId === towerId) {
    run.pendingCombineTowerId = null;
  }
  return refund;
}

export function cycleTowerPriority(run: RunState, towerId: number): TargetPriority | null {
  const tower = run.towers.find((t) => t.id === towerId);
  if (!tower) return null;
  const order: TargetPriority[] = ['first', 'strongest', 'closest'];
  const next = order[(order.indexOf(tower.priority) + 1) % order.length];
  tower.priority = next;
  return next;
}

export function addTacticalPing(
  run: RunState,
  colOrX: number,
  rowOrY: number,
): TacticalPing | null {
  const { x: px, y: py } = normalizePlacementPoint(colOrX, rowOrY);
  const col = Math.floor(px);
  const row = Math.floor(py);
  if (col < 0 || col >= run.map.cols || row < 0 || row >= run.map.rows) {
    return null;
  }
  const tile = run.map.tiles[row]?.[col];
  let kind: TacticalPingKind = 'build';
  let label = 'BUILD';
  let color = '#38BDF8';
  if (tile === 'path' || tile === 'spawn' || tile === 'exit' || isPointNearPath(run, px, py, 0.6)) {
    kind = 'focus';
    label = 'FOCUS';
    color = '#F97316';
  } else if (tile === 'obstacle') {
    kind = 'defend';
    label = 'HOLD';
    color = '#FBBF24';
  }

  const ping: TacticalPing = {
    id: run.nextEntityId++,
    col,
    row,
    x: px,
    y: py,
    kind,
    label,
    color,
    life: TACTICAL_PING_DURATION,
    maxLife: TACTICAL_PING_DURATION,
  };

  if (run.tacticalPings.length >= 4) {
    run.tacticalPings.shift();
  }
  run.tacticalPings.push(ping);
  run.pendingTacticalPing = false;

  run.rings.push({
    x: px,
    y: py,
    radius: 0.2,
    maxRadius: kind === 'focus' ? TACTICAL_PING_FOCUS_RADIUS : 1.15,
    color,
    life: 0.5,
    maxLife: 0.5,
  });
  run.floatingTexts.push({
    x: px,
    y: py - 0.25,
    vy: -0.5,
    text: label,
    color,
    life: 1.0,
    maxLife: 1.0,
  });

  return ping;
}

export function generateWaveSpawns(
  wave: number,
  mode: GameModeId,
  modifiers: ModifierId[],
): WaveSpawnEntry[] {
  const modeDef = GAME_MODES[mode];
  const hasSwarm = modifiers.includes('swarm_surge');
  const countScale = hasSwarm ? 1.3 : 1.0;
  const intervalScale = modeDef.spawnIntervalScale * (hasSwarm ? 0.85 : 1.0);

  const entries: WaveSpawnEntry[] = [];
  const totalUnits = Math.round((6 + wave * 2.4) * countScale);

  // Boss spawns every 5 waves across all modes
  const isBossWave = wave > 0 && wave % 5 === 0;

  for (let i = 0; i < totalUnits; i++) {
    let archetype: EnemyArchetypeId = 'scout';
    if (wave === 1) {
      archetype = i >= totalUnits - 2 ? 'tank' : 'scout';
    } else if (wave === 2) {
      archetype = i % 3 === 0 ? 'tank' : 'scout';
    } else if (wave === 3) {
      archetype = i % 4 === 0 ? 'shielded' : i % 3 === 0 ? 'tank' : 'scout';
    } else if (wave >= 4) {
      const mod = i % 7;
      if (mod === 0 || mod === 4) archetype = 'scout';
      else if (mod === 1 || mod === 5) archetype = 'tank';
      else if (mod === 2) archetype = 'shielded';
      else archetype = 'regenerator';
    }

    const baseDelay = Math.max(0.28, (0.92 - wave * 0.03) * intervalScale);
    entries.push({
      archetype,
      delay: i === 0 ? 0.15 : baseDelay,
    });
  }

  if (isBossWave) {
    const bossCount = wave >= 15 ? 2 : 1;
    for (let b = 0; b < bossCount; b++) {
      entries.push({
        archetype: 'boss',
        delay: b === 0 ? 1.1 : 2.2,
      });
    }
  }

  return entries;
}

export function startNextWave(run: RunState): boolean {
  if (run.waveActive || run.outcome || run.draftOptions) return false;
  if (run.totalWaves !== null && run.wave >= run.totalWaves) return false;

  run.wave += 1;
  run.waveActive = true;
  run.waveCleared = false;
  run.autoWaveTimer = 0;
  run.spawnQueue = generateWaveSpawns(run.wave, run.mode, run.activeModifiers);
  run.spawnTimer = 0.05;
  return true;
}

export function computeWaveHpMultiplier(wave: number): number {
  if (wave <= 1) return 1.0;
  return Math.pow(1.24, wave - 1) * (1 + (wave - 1) * 0.06);
}

function spawnEnemyFromQueue(run: RunState, archetype: EnemyArchetypeId): void {
  const def = ENEMY_DEFS[archetype];
  const modeDef = GAME_MODES[run.mode];
  const levelDef = getLevelDef(run.level);
  const spawn = run.map.path[0];

  const waveScale = computeWaveHpMultiplier(run.wave);
  const hpMod = run.activeModifiers.includes('armored_vanguard') ? 1.4 : 1.0;
  const speedMod = run.activeModifiers.includes('hyper_march') ? 1.25 : 1.0;
  const bountyMod = run.activeModifiers.includes('austerity') ? 0.85 : 1.0;
  const aegisProto = run.activeModifiers.includes('shielded_legion');

  const maxHp = Math.round(
    def.baseHp * waveScale * modeDef.enemyHpScale * levelDef.enemyHpScale * hpMod,
  );
  let maxShield = Math.round(
    def.baseShield * waveScale * modeDef.enemyHpScale * levelDef.enemyHpScale,
  );
  if (aegisProto && (archetype === 'tank' || archetype === 'regenerator') && maxShield === 0) {
    maxShield = Math.round(maxHp * 0.45);
  }

  const enemy: EnemyInstance = {
    id: run.nextEntityId++,
    archetype,
    x: spawn.col + 0.5,
    y: spawn.row + 0.5,
    pathIndex: 1,
    distanceTraveled: 0,
    hp: maxHp,
    maxHp,
    shield: maxShield,
    maxShield,
    shieldRegenDelay: 0,
    speed: def.speed * levelDef.enemySpeedScale * speedMod,
    armor: def.armor,
    regenPerSec: def.regenPerSec * (1 + (run.wave - 1) * 0.08),
    bounty: Math.max(3, Math.round(def.bounty * bountyMod)),
    lifeCost: def.lifeCost,
    radius: def.radius,
    color: def.color,
    slowTimer: 0,
    slowFactor: 0,
    stunTimer: 0,
    vulnerabilityStacks: 0,
    hitFlashTimer: 0,
    bossAbilityTimer: archetype === 'boss' ? 5.5 : 0,
    bossTelegraphTimer: 0,
    dead: false,
    koTimer: 0,
    reachedExit: false,
  };

  run.enemies.push(enemy);
}

function applyDamageToEnemy(
  run: RunState,
  enemy: EnemyInstance,
  rawDamage: number,
  options: {
    armorPierce: number;
    shieldMultiplier: number;
    towerId?: number;
    isCrit?: boolean;
    appliesVulnerability?: boolean;
  },
  emit: (ev: SimEvent) => void,
): void {
  if (enemy.dead || enemy.reachedExit) return;

  let dmg = rawDamage;
  // Vulnerability stacks (from Cannon Shredder Shells)
  if (enemy.vulnerabilityStacks > 0) {
    dmg *= 1 + enemy.vulnerabilityStacks * 0.06;
  }
  // Cryo Brittle Matrix power-up
  if (enemy.slowTimer > 0 && run.passivePowerUps.includes('cryo_brittle')) {
    dmg *= 1.22;
  }
  // Capacitor Overcharge power-up
  if (
    (enemy.shield > 0 || enemy.archetype === 'boss') &&
    run.passivePowerUps.includes('capacitor_overcharge')
  ) {
    dmg *= 1.25;
  }

  let dealt = 0;

  if (enemy.shield > 0) {
    const shieldDmg = dmg * options.shieldMultiplier;
    const absorbed = Math.min(enemy.shield, shieldDmg);
    enemy.shield -= absorbed;
    enemy.shieldRegenDelay = 3.0;
    dealt += absorbed;
    const overflow = Math.max(0, dmg - absorbed / options.shieldMultiplier);
    if (overflow > 0) {
      const effectiveArmor = enemy.armor * (1 - options.armorPierce);
      const hpDmg = overflow * (1 - effectiveArmor);
      enemy.hp -= hpDmg;
      dealt += hpDmg;
    }
  } else {
    const effectiveArmor = enemy.armor * (1 - options.armorPierce);
    const hpDmg = dmg * (1 - effectiveArmor);
    enemy.hp -= hpDmg;
    dealt += hpDmg;
  }

  if (options.appliesVulnerability) {
    enemy.vulnerabilityStacks = Math.min(5, enemy.vulnerabilityStacks + 1);
  }

  enemy.hitFlashTimer = 0.06;
  run.totalDamageDealt += Math.round(dealt);

  if (options.towerId) {
    const tower = run.towers.find((t) => t.id === options.towerId);
    if (tower) {
      tower.damageDealt += Math.round(dealt);
    }
  }

  if (options.isCrit) {
    run.floatingTexts.push({
      x: enemy.x,
      y: enemy.y - 0.35,
      vy: -0.9,
      text: `${Math.round(dealt)}!`,
      color: '#FBBF24',
      life: 0.55,
      maxLife: 0.55,
    });
  }

  if (enemy.hp <= 0 && !enemy.dead) {
    enemy.hp = 0;
    enemy.dead = true;
    enemy.koTimer = 0.28;
    run.enemiesDefeated += 1;

    const salvageMult = run.passivePowerUps.includes('scrap_recycler') ? 1.2 : 1.0;
    const bounty = Math.round(enemy.bounty * salvageMult);
    run.scrap += bounty;
    run.score += bounty * 10 + (enemy.archetype === 'boss' ? 500 : 0);

    if (options.towerId) {
      const tower = run.towers.find((t) => t.id === options.towerId);
      if (tower) tower.kills += 1;
    }

    run.floatingTexts.push({
      x: enemy.x,
      y: enemy.y - 0.2,
      vy: -0.75,
      text: `+${bounty}`,
      color: '#E5A93C',
      life: 0.7,
      maxLife: 0.7,
    });

    const isHeavy = enemy.archetype === 'boss' || enemy.archetype === 'tank';
    if (enemy.archetype === 'boss') {
      run.hitstopTimer = Math.max(run.hitstopTimer, 0.065);
      run.trauma = Math.min(1, run.trauma + 0.65);
    } else if (enemy.archetype === 'tank') {
      run.trauma = Math.min(1, run.trauma + 0.16);
    }

    run.rings.push({
      x: enemy.x,
      y: enemy.y,
      radius: 0.12,
      maxRadius: enemy.archetype === 'boss' ? 1.5 : 0.65,
      color: enemy.color,
      life: 0.32,
      maxLife: 0.32,
    });

    emit({ type: 'kill', heavy: isHeavy });
  } else {
    emit({ type: 'hit', heavy: Boolean(options.isCrit) });
  }
}

function pickTargetForTower(
  tower: PlacedTower,
  range: number,
  enemies: EnemyInstance[],
  tacticalPings: TacticalPing[] = [],
): EnemyInstance | null {
  const { x: tx, y: ty } = getTowerCoords(tower);
  let best: EnemyInstance | null = null;
  let bestScore = -Infinity;

  const focusPings = tacticalPings.filter((p) => p.kind === 'focus' && p.life > 0);

  for (const e of enemies) {
    if (!isEnemyTargetable(e)) continue;
    const dx = e.x - tx;
    const dy = e.y - ty;
    const dist = Math.hypot(dx, dy);
    if (dist > range + e.radius * 0.4) continue;

    let score = 0;
    if (tower.priority === 'first') {
      score = e.distanceTraveled;
    } else if (tower.priority === 'strongest') {
      score = e.hp + e.shield * 1.1;
    } else {
      score = -dist;
    }

    if (
      focusPings.some(
        (fp) => Math.hypot(e.x - fp.x, e.y - fp.y) <= TACTICAL_PING_FOCUS_RADIUS,
      )
    ) {
      score += 10000;
    }

    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

export function buildDraftChoices(run: RunState): PowerUpDef[] {
  const ownedActives = new Set(run.activeAbilities.map((a) => a.id));
  const candidates = POWER_UP_POOL.filter((p) => {
    if (p.category === 'active' && ownedActives.has(p.id)) return false;
    // Don't duplicate singletons that are boring twice unless stackable; allow passives except cap actives
    return true;
  });

  // Deterministic pseudo-random shuffle seeded from wave + seed + defeated
  let s = (run.map.seed + run.wave * 977 + run.enemiesDefeated * 31) >>> 0;
  const nextRand = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const pool = [...candidates];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

export function applyPowerUpChoice(run: RunState, powerUpId: PowerUpId): boolean {
  if (!run.draftOptions || !run.draftOptions.some((p) => p.id === powerUpId)) {
    return false;
  }
  const def = POWER_UP_BY_ID[powerUpId];
  if (def.category === 'active') {
    run.activeAbilities.push({
      id: powerUpId,
      cooldownRemaining: 0,
      maxCooldown: def.cooldown ?? 15,
    });
  } else {
    run.passivePowerUps.push(powerUpId);
    if (powerUpId === 'scrap_recycler') {
      run.scrap += 65;
    } else if (powerUpId === 'bastion_reinforcements') {
      run.maxLives += 3;
      run.lives = Math.min(run.maxLives, run.lives + 5);
    }
  }
  run.draftOptions = null;
  if (
    run.autoSkipWave &&
    !run.waveActive &&
    !run.outcome &&
    run.wave > 0 &&
    (run.totalWaves === null || run.wave < run.totalWaves)
  ) {
    run.autoWaveTimer = 1.6;
  }
  return true;
}

export function triggerActiveAbility(
  run: RunState,
  abilityId: PowerUpId,
  targetX?: number,
  targetY?: number,
  emit: (ev: SimEvent) => void = () => {},
): boolean {
  const slot = run.activeAbilities.find((a) => a.id === abilityId);
  if (!slot || slot.cooldownRemaining > 0 || run.outcome) return false;

  if (abilityId === 'overdrive_beacon') {
    run.overdriveTimer = 6.0;
    slot.cooldownRemaining = slot.maxCooldown;
    run.pendingTargetingAbility = null;
    for (const t of run.towers) {
      const tc = getTowerCoords(t);
      run.rings.push({
        x: tc.x,
        y: tc.y,
        radius: 0.15,
        maxRadius: 0.85,
        color: '#E5A93C',
        life: 0.45,
        maxLife: 0.45,
      });
    }
    emit({ type: 'ability', abilityId });
    return true;
  }

  if (abilityId === 'emp_field') {
    slot.cooldownRemaining = slot.maxCooldown;
    run.pendingTargetingAbility = null;
    run.hitstopTimer = Math.max(run.hitstopTimer, 0.045);
    run.trauma = Math.min(1, run.trauma + 0.35);
    for (const e of run.enemies) {
      if (e.dead || e.reachedExit) continue;
      e.stunTimer = Math.max(e.stunTimer, 2.6);
      e.shield = Math.max(0, e.shield * 0.55);
      e.hitFlashTimer = 0.08;
    }
    run.rings.push({
      x: run.map.cols / 2,
      y: run.map.rows / 2,
      radius: 0.5,
      maxRadius: 9.5,
      color: '#38BDF8',
      life: 0.55,
      maxLife: 0.55,
    });
    emit({ type: 'ability', abilityId });
    return true;
  }

  if (abilityId === 'orbital_lance') {
    let cx = targetX;
    let cy = targetY;
    if (cx === undefined || cy === undefined) {
      // Auto-pick lead living enemy outside portal if activated via keyboard
      const target =
        run.enemies
          .filter((e) => isEnemyTargetable(e))
          .sort((a, b) => b.distanceTraveled - a.distanceTraveled)[0] ?? null;
      if (!target) return false;
      cx = target.x;
      cy = target.y;
    }

    slot.cooldownRemaining = slot.maxCooldown;
    run.pendingTargetingAbility = null;
    run.hitstopTimer = Math.max(run.hitstopTimer, 0.055);
    run.trauma = Math.min(1, run.trauma + 0.5);

    const blastRadius = 2.15;
    const baseDmg = 180 + run.wave * 32;
    for (const e of run.enemies) {
      if (!isEnemyTargetable(e)) continue;
      if (Math.hypot(e.x - cx, e.y - cy) <= blastRadius + e.radius) {
        e.stunTimer = Math.max(e.stunTimer, 0.8);
        applyDamageToEnemy(
          run,
          e,
          baseDmg,
          { armorPierce: 1.0, shieldMultiplier: 1.5, isCrit: true },
          emit,
        );
      }
    }

    run.rings.push({
      x: cx,
      y: cy,
      radius: 0.2,
      maxRadius: blastRadius,
      color: '#EF4444',
      life: 0.45,
      maxLife: 0.45,
    });
    emit({ type: 'ability', abilityId });
    return true;
  }

  return false;
}

export function computeRunOutcome(run: RunState, victory: boolean): RunOutcome {
  const wavesCleared = victory ? run.wave : Math.max(0, run.wave - (run.waveActive ? 1 : 0));
  const multiplier = computeTotalRewardMultiplier(run.mode, run.activeModifiers, run.level);
  const baseShards =
    wavesCleared * 0.9 +
    (victory ? 4 : 0) +
    Math.floor(run.enemiesDefeated / 28);
  const shardsEarned = Math.max(
    wavesCleared > 0 ? 1 : 0,
    Math.round(baseShards * multiplier),
  );

  return {
    victory,
    mode: run.mode,
    level: run.level,
    wavesCleared,
    enemiesDefeated: run.enemiesDefeated,
    damageDealt: run.totalDamageDealt,
    livesRemaining: Math.max(0, run.lives),
    maxLives: run.maxLives,
    score: run.score + (victory ? run.lives * 50 + run.scrap * 2 : 0),
    shardsEarned,
    unlockedTowerId: victory ? getNextUnlockableTower(run.unlockedTowersSnapshot) : null,
    unlockedNextLevel: victory && run.level < MAX_LEVEL ? run.level + 1 : null,
    modifierMultiplier: multiplier,
    activeModifiers: [...run.activeModifiers],
  };
}

export function stepSimulation(
  run: RunState,
  rawDt: number,
  emit: (ev: SimEvent) => void = () => {},
): void {
  if (run.outcome) return;

  const dt = Math.min(Math.max(rawDt, 0), 0.05);

  // Decay visual trauma and hit flashes in real dt
  run.trauma = Math.max(0, run.trauma - dt * 1.9);
  for (const e of run.enemies) {
    if (e.hitFlashTimer > 0) e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
  }
  for (const t of run.towers) {
    if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 5.5);
  }

  // Update visual-only effects even during hitstop
  for (let i = run.arcs.length - 1; i >= 0; i--) {
    run.arcs[i].life -= dt;
    if (run.arcs[i].life <= 0) run.arcs.splice(i, 1);
  }
  for (let i = run.rings.length - 1; i >= 0; i--) {
    const r = run.rings[i];
    r.life -= dt;
    const progress = 1 - Math.max(0, r.life / r.maxLife);
    r.radius = r.maxRadius * (0.2 + 0.8 * progress);
    if (r.life <= 0) run.rings.splice(i, 1);
  }
  for (let i = run.floatingTexts.length - 1; i >= 0; i--) {
    const ft = run.floatingTexts[i];
    ft.life -= dt;
    ft.y += ft.vy * dt;
    if (ft.life <= 0) run.floatingTexts.splice(i, 1);
  }
  for (let i = run.tacticalPings.length - 1; i >= 0; i--) {
    run.tacticalPings[i].life -= dt;
    if (run.tacticalPings[i].life <= 0) run.tacticalPings.splice(i, 1);
  }

  // Handle brief defeat delay before popping Game Over modal
  if (run.defeatDelayTimer > 0) {
    run.defeatDelayTimer -= dt;
    if (run.defeatDelayTimer <= 0) {
      run.outcome = computeRunOutcome(run, false);
      emit({ type: 'defeat' });
    }
    return;
  }

  // Sim hitstop freeze on heavy impacts
  if (run.hitstopTimer > 0) {
    run.hitstopTimer = Math.max(0, run.hitstopTimer - dt);
    return;
  }

  const simDt = dt * run.speedMultiplier;

  if (run.overdriveTimer > 0) {
    run.overdriveTimer = Math.max(0, run.overdriveTimer - simDt);
  }

  for (const ab of run.activeAbilities) {
    if (ab.cooldownRemaining > 0) {
      ab.cooldownRemaining = Math.max(0, ab.cooldownRemaining - simDt);
    }
  }

  // Auto-skip next wave countdown when enabled between cleared waves
  if (
    !run.waveActive &&
    !run.outcome &&
    !run.draftOptions &&
    run.autoSkipWave &&
    run.wave > 0 &&
    (run.totalWaves === null || run.wave < run.totalWaves)
  ) {
    run.autoWaveTimer = Math.max(0, run.autoWaveTimer - simDt);
    if (run.autoWaveTimer <= 0 && startNextWave(run)) {
      emit({ type: 'wave_start' });
    }
  }

  // Spawn queue progression
  if (run.waveActive && run.spawnQueue.length > 0) {
    run.spawnTimer -= simDt;
    while (run.spawnQueue.length > 0 && run.spawnTimer <= 0) {
      const next = run.spawnQueue.shift()!;
      spawnEnemyFromQueue(run, next.archetype);
      run.spawnTimer += run.spawnQueue[0]?.delay ?? 0;
    }
  }

  // Update enemies
  const path = run.map.path;
  for (let i = run.enemies.length - 1; i >= 0; i--) {
    const e = run.enemies[i];
    if (e.dead) {
      e.koTimer -= simDt;
      if (e.koTimer <= 0) {
        run.enemies.splice(i, 1);
      }
      continue;
    }
    if (e.reachedExit) {
      run.enemies.splice(i, 1);
      continue;
    }

    if (e.slowTimer > 0) {
      e.slowTimer = Math.max(0, e.slowTimer - simDt);
      if (e.slowTimer === 0) e.slowFactor = 0;
    }
    if (e.stunTimer > 0) {
      e.stunTimer = Math.max(0, e.stunTimer - simDt);
    }

    // Regeneration & Shield recharge
    if (e.regenPerSec > 0 && e.hp < e.maxHp) {
      const chillPenalty = e.slowTimer > 0 ? 0.4 : 1.0;
      e.hp = Math.min(e.maxHp, e.hp + e.regenPerSec * chillPenalty * simDt);
    }
    if (e.maxShield > 0) {
      if (e.shieldRegenDelay > 0) {
        e.shieldRegenDelay = Math.max(0, e.shieldRegenDelay - simDt);
      } else if (e.shield < e.maxShield) {
        e.shield = Math.min(e.maxShield, e.shield + e.maxShield * 0.14 * simDt);
      }
    }

    // Boss Dreadnought telegraph + periodic shield/speed pulse
    if (e.archetype === 'boss') {
      if (e.bossTelegraphTimer > 0) {
        e.bossTelegraphTimer -= simDt;
        if (e.bossTelegraphTimer <= 0) {
          // Pulse: restore 20% shield & haste nearby allies
          e.shield = Math.min(e.maxShield, e.shield + e.maxShield * 0.25);
          run.rings.push({
            x: e.x,
            y: e.y,
            radius: 0.3,
            maxRadius: 2.2,
            color: '#EF4444',
            life: 0.45,
            maxLife: 0.45,
          });
        }
      } else {
        e.bossAbilityTimer -= simDt;
        if (e.bossAbilityTimer <= 0) {
          e.bossTelegraphTimer = 0.65; // Visible 0.65s windup ring before pulse
          e.bossAbilityTimer = 6.5;
        }
      }
    }

    // Movement along path waypoints
    if (e.stunTimer <= 0) {
      const moveSpeed = e.speed * (1 - e.slowFactor);
      let remaining = moveSpeed * simDt;

      while (remaining > 0 && e.pathIndex < path.length) {
        const wp = path[e.pathIndex];
        const wx = wp.col + 0.5;
        const wy = wp.row + 0.5;
        const dx = wx - e.x;
        const dy = wy - e.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= remaining) {
          e.x = wx;
          e.y = wy;
          e.distanceTraveled += dist;
          remaining -= dist;
          e.pathIndex += 1;
        } else {
          e.x += (dx / dist) * remaining;
          e.y += (dy / dist) * remaining;
          e.distanceTraveled += remaining;
          remaining = 0;
        }
      }

      if (e.pathIndex >= path.length) {
        e.reachedExit = true;
        run.lives = Math.max(0, run.lives - e.lifeCost);
        run.trauma = Math.min(1, run.trauma + 0.45);
        run.floatingTexts.push({
          x: e.x - 0.3,
          y: e.y - 0.3,
          vy: -0.7,
          text: `-${e.lifeCost} HP`,
          color: '#EF4444',
          life: 0.9,
          maxLife: 0.9,
        });
        emit({ type: 'leak', heavy: true });

        if (run.lives <= 0 && run.defeatDelayTimer <= 0) {
          run.defeatDelayTimer = 0.45;
          return;
        }
      }
    }
  }

  // Update towers & firing
  for (const tower of run.towers) {
    const stats = computeTowerEffectiveStats(tower, run);
    const { x: tx, y: ty } = getTowerCoords(tower);

    // Glacial Pulse Apex for Cryo Mortar
    if (stats.hasGlacialPulse) {
      tower.pulseTimer -= simDt;
      if (tower.pulseTimer <= 0) {
        tower.pulseTimer = 6.0;
        let hitAny = false;
        for (const e of run.enemies) {
          if (!isEnemyTargetable(e)) continue;
          if (Math.hypot(e.x - tx, e.y - ty) <= stats.range) {
            e.stunTimer = Math.max(e.stunTimer, 1.1);
            e.slowTimer = Math.max(e.slowTimer, stats.slowDuration);
            e.slowFactor = Math.max(e.slowFactor, stats.slowFactor);
            hitAny = true;
          }
        }
        if (hitAny) {
          run.rings.push({
            x: tx,
            y: ty,
            radius: 0.2,
            maxRadius: stats.range,
            color: '#38BDF8',
            life: 0.45,
            maxLife: 0.45,
          });
        }
      }
    }

    if (tower.cooldown > 0) {
      tower.cooldown -= simDt;
    }

    const target = pickTargetForTower(tower, stats.range, run.enemies, run.tacticalPings);
    if (target) {
      tower.angle = Math.atan2(target.y - ty, target.x - tx);

      if (tower.cooldown <= 0) {
        tower.cooldown = 1 / stats.fireRate;
        tower.recoil = 1;

        const rollCrit =
          stats.critChance > 0 &&
          ((tower.kills + tower.id + run.enemiesDefeated + Math.floor(target.x * 10)) % 100) /
            100 <
            stats.critChance;
        let dmg = stats.damage;
        if (
          (tower.type === 'rail' || tower.type === 'omega_railgun') &&
          (run.evolutionsSnapshot.rail?.tier ?? 0) >= 3 &&
          run.evolutionsSnapshot.rail?.apexChoice === 'b' &&
          (target.archetype === 'boss' || target.archetype === 'tank')
        ) {
          dmg *= 1.55;
        }
        if (rollCrit) {
          dmg *= stats.critMultiplier;
        }

        const isPureArcTower =
          tower.type === 'tesla' ||
          tower.type === 'tempest_prism' ||
          tower.type === 'tesla_nexus' ||
          tower.type === 'chrono' ||
          tower.type === 'singularity_core';

        const isBeamLaserTower =
          tower.type === 'laser' || tower.type === 'solar_obelisk';

        if (isPureArcTower) {
          // Instant chain lightning / stasis arc
          const arcPoints: { x: number; y: number }[] = [{ x: tx, y: ty }];
          const hitSet = new Set<number>();
          let curTarget: EnemyInstance | null = target;
          let curDamage = dmg;

          for (let c = 0; c < stats.chainCount && curTarget; c++) {
            arcPoints.push({ x: curTarget.x, y: curTarget.y });
            hitSet.add(curTarget.id);

            if (c === 0 && stats.hasEmpStun) {
              curTarget.stunTimer = Math.max(curTarget.stunTimer, 0.35);
            }
            if (stats.slowFactor > 0) {
              curTarget.slowTimer = Math.max(curTarget.slowTimer, stats.slowDuration);
              curTarget.slowFactor = Math.max(curTarget.slowFactor, stats.slowFactor);
            }

            applyDamageToEnemy(
              run,
              curTarget,
              curDamage,
              {
                armorPierce: stats.armorPierce,
                shieldMultiplier: stats.shieldMultiplier,
                towerId: tower.id,
                isCrit: rollCrit && c === 0,
                appliesVulnerability: stats.appliesVulnerability,
              },
              emit,
            );

            // Chrono / Singularity splash stasis wave on primary target
            if (
              c === 0 &&
              (tower.type === 'chrono' || tower.type === 'singularity_core') &&
              stats.splashRadius > 0
            ) {
              for (const near of run.enemies) {
                if (near.dead || near.reachedExit || near.id === curTarget.id) continue;
                if (Math.hypot(near.x - curTarget.x, near.y - curTarget.y) <= stats.splashRadius) {
                  near.slowTimer = Math.max(near.slowTimer, stats.slowDuration);
                  near.slowFactor = Math.max(near.slowFactor, stats.slowFactor);
                  if (stats.appliesVulnerability) {
                    near.vulnerabilityStacks = Math.min(5, near.vulnerabilityStacks + 1);
                  }
                }
              }
              run.rings.push({
                x: curTarget.x,
                y: curTarget.y,
                radius: 0.14,
                maxRadius: stats.splashRadius * 0.72,
                color: TOWER_DEFS[tower.type].accentColor,
                life: 0.28,
                maxLife: 0.28,
              });
            }

            // Find next nearest targetable enemy within 2.3 tiles
            let nextEnemy: EnemyInstance | null = null;
            let bestDist = 2.3;
            for (const cand of run.enemies) {
              if (!isEnemyTargetable(cand) || hitSet.has(cand.id)) continue;
              const d = Math.hypot(cand.x - curTarget.x, cand.y - curTarget.y);
              if (d <= bestDist) {
                bestDist = d;
                nextEnemy = cand;
              }
            }
            curTarget = nextEnemy;
            curDamage *= 0.8;
          }

          run.arcs.push({
            points: arcPoints,
            color: TOWER_DEFS[tower.type].accentColor,
            life: 0.18,
            maxLife: 0.18,
            width: tower.type === 'tesla' || tower.type === 'chrono' ? 2.5 : 3.4,
          });
          emit({ type: 'shoot', towerType: tower.type });
        } else if (isBeamLaserTower) {
          // Focused Beam Laser (pierces aligned targets along firing line)
          const dx = target.x - tx;
          const dy = target.y - ty;
          const len = Math.max(0.001, Math.hypot(dx, dy));
          const ux = dx / len;
          const uy = dy / len;
          const maxLen = stats.range + 0.35;

          const candidates = run.enemies
            .filter((e) => isEnemyTargetable(e))
            .map((e) => {
              const rx = e.x - tx;
              const ry = e.y - ty;
              const proj = rx * ux + ry * uy;
              const perp = Math.abs(rx * -uy + ry * ux);
              return { e, proj, perp };
            })
            .filter(({ e, proj, perp }) => proj > 0 && proj <= maxLen && perp <= e.radius + 0.28)
            .sort((a, b) => a.proj - b.proj)
            .slice(0, Math.max(1, stats.pierceCount));

          const hitTargets = candidates.length > 0 ? candidates.map((c) => c.e) : [target];
          let endPt = {
            x: hitTargets[hitTargets.length - 1].x,
            y: hitTargets[hitTargets.length - 1].y,
          };

          hitTargets.forEach((ht, idx) => {
            applyDamageToEnemy(
              run,
              ht,
              dmg * (idx === 0 ? 1 : 0.72),
              {
                armorPierce: stats.armorPierce,
                shieldMultiplier: stats.shieldMultiplier,
                towerId: tower.id,
                isCrit: rollCrit && idx === 0,
                appliesVulnerability: stats.appliesVulnerability,
              },
              emit,
            );
          });

          run.arcs.push({
            points: [{ x: tx, y: ty }, endPt],
            color: TOWER_DEFS[tower.type].accentColor,
            life: 0.14,
            maxLife: 0.14,
            width: tower.type === 'solar_obelisk' ? 4.2 : 3.2,
          });
          emit({ type: 'shoot', towerType: tower.type });
        } else {
          // Projectile fire
          const dx = target.x - tx;
          const dy = target.y - ty;
          const dist = Math.max(0.001, Math.hypot(dx, dy));

          const isRailLike =
            tower.type === 'rail' ||
            tower.type === 'siege_autocannon' ||
            tower.type === 'glacial_lance' ||
            tower.type === 'plasma_railgun' ||
            tower.type === 'omega_railgun';
          const isMortarLike = tower.type === 'cryo' || tower.type === 'absolute_zero';
          const isMissileLike = tower.type === 'missile' || tower.type === 'salvo_bastion';
          const isPyroLike = tower.type === 'pyro' || tower.type === 'inferno_hydra';

          const projSpeed = isRailLike
            ? 24
            : isMortarLike
              ? 9.2
              : isMissileLike
                ? 11.4
                : isPyroLike
                  ? 14.8
                  : tower.type === 'frost_vulcan'
                    ? 14.5
                    : 13.8;

          run.projectiles.push({
            id: run.nextEntityId++,
            towerId: tower.id,
            towerType: tower.type,
            x: tx + (dx / dist) * 0.28,
            y: ty + (dy / dist) * 0.28,
            targetId: target.id,
            targetX: target.x,
            targetY: target.y,
            speed: projSpeed,
            damage: dmg,
            armorPierce: stats.armorPierce,
            shieldMultiplier: stats.shieldMultiplier,
            splashRadius: stats.splashRadius,
            slowFactor: stats.slowFactor,
            slowDuration: stats.slowDuration,
            isCrit: rollCrit,
            appliesVulnerability: stats.appliesVulnerability,
            color: TOWER_DEFS[tower.type].accentColor,
            pierceRemaining: isRailLike || tower.type === 'vulcan_behemoth' ? stats.pierceCount : 1,
            hitIds: [],
            vx: (dx / dist) * projSpeed,
            vy: (dy / dist) * projSpeed,
            life: isRailLike ? 0.5 : 1.45,
          });

          // Storm Gatling fires alternating chain lightning arcs alongside rapid shells
          if (tower.type === 'storm_gatling') {
            tower.pulseTimer = tower.pulseTimer > 0 ? 0 : 1;
            if (tower.pulseTimer === 0) {
              const arcPoints: { x: number; y: number }[] = [{ x: tx, y: ty }];
              const hitSet = new Set<number>();
              let curTarget: EnemyInstance | null = target;
              let arcDmg = dmg * 0.65;
              for (let c = 0; c < stats.chainCount && curTarget; c++) {
                arcPoints.push({ x: curTarget.x, y: curTarget.y });
                hitSet.add(curTarget.id);
                applyDamageToEnemy(
                  run,
                  curTarget,
                  arcDmg,
                  {
                    armorPierce: stats.armorPierce,
                    shieldMultiplier: stats.shieldMultiplier,
                    towerId: tower.id,
                  },
                  emit,
                );
                let nextEnemy: EnemyInstance | null = null;
                let bestDist = 2.1;
                for (const cand of run.enemies) {
                  if (cand.dead || cand.reachedExit || hitSet.has(cand.id)) continue;
                  const d = Math.hypot(cand.x - curTarget.x, cand.y - curTarget.y);
                  if (d <= bestDist) {
                    bestDist = d;
                    nextEnemy = cand;
                  }
                }
                curTarget = nextEnemy;
                arcDmg *= 0.75;
              }
              run.arcs.push({
                points: arcPoints,
                color: '#A78BFA',
                life: 0.14,
                maxLife: 0.14,
                width: 2.2,
              });
            }
          }

          emit({ type: 'shoot', towerType: tower.type });
        }
      }
    }
  }

  // Update projectiles
  for (let i = run.projectiles.length - 1; i >= 0; i--) {
    const p = run.projectiles[i];
    p.life -= simDt;
    if (p.life <= 0) {
      run.projectiles.splice(i, 1);
      continue;
    }

    const isHomingKinetic =
      p.towerType === 'cannon' ||
      p.towerType === 'storm_gatling' ||
      p.towerType === 'frost_vulcan' ||
      p.towerType === 'pyro' ||
      p.towerType === 'inferno_hydra' ||
      p.towerType === 'missile' ||
      p.towerType === 'salvo_bastion';
    const isMortarSplash = p.towerType === 'cryo' || p.towerType === 'absolute_zero';

    if (isHomingKinetic) {
      const target = run.enemies.find((e) => e.id === p.targetId && !e.dead && !e.reachedExit);
      if (target) {
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const dist = Math.max(0.001, Math.hypot(dx, dy));
        p.vx = (dx / dist) * p.speed;
        p.vy = (dy / dist) * p.speed;
      }
      p.x += p.vx * simDt;
      p.y += p.vy * simDt;

      let collided = false;
      for (const e of run.enemies) {
        if (!isEnemyTargetable(e)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) <= e.radius + 0.18) {
          if (p.splashRadius > 0) {
            for (const splashEnemy of run.enemies) {
              if (!isEnemyTargetable(splashEnemy)) continue;
              if (
                Math.hypot(splashEnemy.x - p.x, splashEnemy.y - p.y) <=
                p.splashRadius + splashEnemy.radius
              ) {
                if (p.slowFactor > 0) {
                  splashEnemy.slowTimer = Math.max(splashEnemy.slowTimer, p.slowDuration);
                  splashEnemy.slowFactor = Math.max(splashEnemy.slowFactor, p.slowFactor);
                }
                applyDamageToEnemy(
                  run,
                  splashEnemy,
                  splashEnemy.id === e.id ? p.damage : p.damage * 0.6,
                  {
                    armorPierce: p.armorPierce,
                    shieldMultiplier: p.shieldMultiplier,
                    towerId: p.towerId,
                    isCrit: p.isCrit && splashEnemy.id === e.id,
                    appliesVulnerability: p.appliesVulnerability,
                  },
                  emit,
                );
              }
            }
            run.rings.push({
              x: p.x,
              y: p.y,
              radius: 0.12,
              maxRadius: p.splashRadius,
              color: p.color,
              life: 0.24,
              maxLife: 0.24,
            });
          } else {
            applyDamageToEnemy(
              run,
              e,
              p.damage,
              {
                armorPierce: p.armorPierce,
                shieldMultiplier: p.shieldMultiplier,
                towerId: p.towerId,
                isCrit: p.isCrit,
                appliesVulnerability: p.appliesVulnerability,
              },
              emit,
            );
          }
          collided = true;
          break;
        }
      }
      if (collided) {
        run.projectiles.splice(i, 1);
      }
    } else if (isMortarSplash) {
      // Mortar travels to target impact coordinate and bursts AoE
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * simDt;
      if (dist <= step + 0.12) {
        for (const e of run.enemies) {
          if (!isEnemyTargetable(e)) continue;
          if (Math.hypot(e.x - p.targetX, e.y - p.targetY) <= p.splashRadius + e.radius) {
            e.slowTimer = Math.max(e.slowTimer, p.slowDuration);
            e.slowFactor = Math.max(e.slowFactor, p.slowFactor);
            applyDamageToEnemy(
              run,
              e,
              p.damage,
              {
                armorPierce: p.armorPierce,
                shieldMultiplier: p.shieldMultiplier,
                towerId: p.towerId,
                isCrit: p.isCrit,
              },
              emit,
            );
          }
        }
        run.rings.push({
          x: p.targetX,
          y: p.targetY,
          radius: 0.15,
          maxRadius: p.splashRadius,
          color: '#38BDF8',
          life: 0.3,
          maxLife: 0.3,
        });
        run.projectiles.splice(i, 1);
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
    } else {
      // High-speed linear piercing slug
      p.x += p.vx * simDt;
      p.y += p.vy * simDt;

      for (const e of run.enemies) {
        if (!isEnemyTargetable(e) || p.hitIds.includes(e.id)) continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) <= e.radius + 0.24) {
          const isFirstHit = p.hitIds.length === 0;
          p.hitIds.push(e.id);
          p.pierceRemaining -= 1;

          if (p.slowFactor > 0) {
            e.slowTimer = Math.max(e.slowTimer, p.slowDuration);
            e.slowFactor = Math.max(e.slowFactor, p.slowFactor);
          }

          applyDamageToEnemy(
            run,
            e,
            p.damage,
            {
              armorPierce: p.armorPierce,
              shieldMultiplier: p.shieldMultiplier,
              towerId: p.towerId,
              isCrit: p.isCrit,
              appliesVulnerability: p.appliesVulnerability,
            },
            emit,
          );

          // Glacial Lance bursts a cryo ring on first hit
          if (p.towerType === 'glacial_lance' && isFirstHit) {
            for (const cand of run.enemies) {
              if (cand.dead || cand.reachedExit || cand.id === e.id) continue;
              if (Math.hypot(cand.x - e.x, cand.y - e.y) <= p.splashRadius) {
                cand.slowTimer = Math.max(cand.slowTimer, p.slowDuration);
                cand.slowFactor = Math.max(cand.slowFactor, p.slowFactor);
              }
            }
            run.rings.push({
              x: e.x,
              y: e.y,
              radius: 0.15,
              maxRadius: p.splashRadius,
              color: '#38BDF8',
              life: 0.32,
              maxLife: 0.32,
            });
          }

          // Plasma Railgun discharges chain lightning from first struck enemy
          if (p.towerType === 'plasma_railgun' && isFirstHit) {
            const arcPts: { x: number; y: number }[] = [{ x: e.x, y: e.y }];
            const arcHit = new Set<number>([e.id]);
            let cur: EnemyInstance | null = e;
            for (let c = 0; c < 3 && cur; c++) {
              let nextCand: EnemyInstance | null = null;
              let bestD = 2.4;
              for (const cand of run.enemies) {
                if (cand.dead || cand.reachedExit || arcHit.has(cand.id)) continue;
                const d = Math.hypot(cand.x - cur.x, cand.y - cur.y);
                if (d <= bestD) {
                  bestD = d;
                  nextCand = cand;
                }
              }
              if (!nextCand) break;
              arcPts.push({ x: nextCand.x, y: nextCand.y });
              arcHit.add(nextCand.id);
              applyDamageToEnemy(
                run,
                nextCand,
                p.damage * 0.45,
                {
                  armorPierce: p.armorPierce,
                  shieldMultiplier: p.shieldMultiplier,
                  towerId: p.towerId,
                },
                emit,
              );
              cur = nextCand;
            }
            if (arcPts.length > 1) {
              run.arcs.push({
                points: arcPts,
                color: '#A78BFA',
                life: 0.18,
                maxLife: 0.18,
                width: 2.6,
              });
            }
          }

          if (p.pierceRemaining <= 0) {
            run.projectiles.splice(i, 1);
            break;
          }
        }
      }
    }
  }

  // Wave completion check
  const anyLivingEnemies = run.enemies.some((e) => !e.dead && !e.reachedExit);
  if (run.waveActive && run.spawnQueue.length === 0 && !anyLivingEnemies) {
    run.waveActive = false;
    run.waveCleared = true;

    const waveBonus = 22 + run.wave * 5;
    run.scrap += waveBonus;
    run.score += waveBonus * 10;
    emit({ type: 'wave_clear' });

    // Check victory condition
    if (run.totalWaves !== null && run.wave >= run.totalWaves) {
      run.outcome = computeRunOutcome(run, true);
      emit({ type: 'victory' });
      return;
    }

    // Trigger unique Power-Up Draft at milestone waves
    const shouldOfferDraft =
      run.mode === 'blitz'
        ? run.wave === 1 || run.wave === 3 || run.wave === 5
        : run.wave % 2 === 0;
    if (shouldOfferDraft) {
      run.draftOptions = buildDraftChoices(run);
    } else if (run.autoSkipWave) {
      run.autoWaveTimer = 1.6;
    }
  }
}
