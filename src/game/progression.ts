import {
  BASE_TOWER_TYPES,
  GAME_MODES,
  getLevelDef,
  MAX_EQUIPPED_TURRETS,
  MAX_LEVEL,
  MODIFIERS,
  STARTER_TOWERS,
  TOWER_EVOLUTIONS,
  UNLOCKABLE_TOWERS,
} from './catalog';
import type {
  ApexBranch,
  BaseTowerType,
  GameModeId,
  ModifierId,
  PlayerProfile,
  TowerEvolutionProgress,
} from './types';

const STORAGE_KEY = 'bastion_grid_profile_v1';

function createDefaultEvolutions(): Record<BaseTowerType, TowerEvolutionProgress> {
  return Object.fromEntries(
    BASE_TOWER_TYPES.map((id) => [id, { tier: 0, apexChoice: 'a' as const }]),
  ) as Record<BaseTowerType, TowerEvolutionProgress>;
}

function createDefaultLevelSeeds(): Record<number, number> {
  const seeds: Record<number, number> = {};
  for (let lvl = 1; lvl <= MAX_LEVEL; lvl++) {
    seeds[lvl] = lvl * 1337 + 42;
  }
  return seeds;
}

export function createDefaultProfile(): PlayerProfile {
  return {
    shards: 4, // Starter core shards so players can experience Tower Evolutions immediately
    totalShardsEarned: 4,
    runsCompleted: 0,
    runsWon: 0,
    bestWaveByMode: {
      standard: 0,
      blitz: 0,
      endless: 0,
    },
    bestScoreByMode: {
      standard: 0,
      blitz: 0,
      endless: 0,
    },
    evolutions: createDefaultEvolutions(),
    unlockedTowers: [...STARTER_TOWERS],
    equippedLoadout: [...STARTER_TOWERS],
    selectedMode: 'standard',
    selectedLevel: 1,
    highestUnlockedLevel: 1,
    levelSeeds: createDefaultLevelSeeds(),
    activeModifiers: [],
    muted: false,
  };
}

export function loadProfile(): PlayerProfile {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return createDefaultProfile();
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProfile();
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
    const def = createDefaultProfile();

    const evolutions = createDefaultEvolutions();
    for (const id of BASE_TOWER_TYPES) {
      if (parsed.evolutions?.[id]) {
        evolutions[id] = { ...evolutions[id], ...parsed.evolutions[id] };
      }
    }

    const unlockedSet = new Set<BaseTowerType>(STARTER_TOWERS);
    if (Array.isArray(parsed.unlockedTowers)) {
      for (const id of parsed.unlockedTowers) {
        if ((BASE_TOWER_TYPES as string[]).includes(id)) {
          unlockedSet.add(id as BaseTowerType);
        }
      }
    }
    const unlockedTowers = Array.from(unlockedSet);

    let equippedLoadout: BaseTowerType[] = Array.isArray(parsed.equippedLoadout)
      ? parsed.equippedLoadout
          .filter((id): id is BaseTowerType => unlockedSet.has(id as BaseTowerType))
          .slice(0, MAX_EQUIPPED_TURRETS)
      : [...STARTER_TOWERS];

    if (equippedLoadout.length === 0) {
      equippedLoadout = [...STARTER_TOWERS];
    }

    const highestUnlockedLevel = Math.max(
      1,
      Math.min(MAX_LEVEL, Number(parsed.highestUnlockedLevel) || 1),
    );
    const selectedLevel = Math.max(
      1,
      Math.min(highestUnlockedLevel, Number(parsed.selectedLevel) || 1),
    );

    return {
      ...def,
      ...parsed,
      bestWaveByMode: { ...def.bestWaveByMode, ...(parsed.bestWaveByMode ?? {}) },
      bestScoreByMode: { ...def.bestScoreByMode, ...(parsed.bestScoreByMode ?? {}) },
      evolutions,
      unlockedTowers,
      equippedLoadout,
      selectedLevel,
      highestUnlockedLevel,
      levelSeeds: { ...def.levelSeeds, ...(parsed.levelSeeds ?? {}) },
      activeModifiers: Array.isArray(parsed.activeModifiers)
        ? parsed.activeModifiers.filter((id): id is ModifierId =>
            MODIFIERS.some((m) => m.id === id),
          )
        : [],
    };
  } catch {
    return createDefaultProfile();
  }
}

export function rerollLevelSeedInProfile(
  profile: PlayerProfile,
  level: number,
  seedOverride?: number,
): PlayerProfile {
  const nextSeed =
    seedOverride ?? Math.floor(Math.random() * 899_999 + 100_000);
  return {
    ...profile,
    levelSeeds: {
      ...profile.levelSeeds,
      [level]: nextSeed,
    },
  };
}

export function saveProfile(profile: PlayerProfile): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    }
  } catch {
    // Ignore storage quota errors in restricted sandboxes
  }
}

export function getNextUnlockableTower(
  unlockedTowers: BaseTowerType[],
): BaseTowerType | null {
  for (const id of UNLOCKABLE_TOWERS) {
    if (!unlockedTowers.includes(id)) return id;
  }
  return null;
}

export function toggleEquipTowerInProfile(
  profile: PlayerProfile,
  towerId: BaseTowerType,
): { profile: PlayerProfile; changed: boolean; reason?: string } {
  if (!profile.unlockedTowers.includes(towerId)) {
    return { profile, changed: false, reason: 'Turret locked' };
  }
  const exists = profile.equippedLoadout.includes(towerId);
  if (exists) {
    if (profile.equippedLoadout.length <= 1) {
      return { profile, changed: false, reason: 'Keep at least 1 turret equipped' };
    }
    return {
      changed: true,
      profile: {
        ...profile,
        equippedLoadout: profile.equippedLoadout.filter((id) => id !== towerId),
      },
    };
  }
  if (profile.equippedLoadout.length >= MAX_EQUIPPED_TURRETS) {
    return { profile, changed: false, reason: `Maximum ${MAX_EQUIPPED_TURRETS} turrets equipped` };
  }
  return {
    changed: true,
    profile: {
      ...profile,
      equippedLoadout: [...profile.equippedLoadout, towerId],
    },
  };
}

export function getNextEvolutionCost(
  towerId: BaseTowerType,
  currentTier: 0 | 1 | 2 | 3,
): number | null {
  const def = TOWER_EVOLUTIONS[towerId];
  if (currentTier === 0) return def.tier1Cost;
  if (currentTier === 1) return def.tier2Cost;
  if (currentTier === 2) return def.apexCost;
  return null;
}

export function evolveTowerInProfile(
  profile: PlayerProfile,
  towerId: BaseTowerType,
): { profile: PlayerProfile; evolved: boolean } {
  const cur = profile.evolutions[towerId];
  const cost = getNextEvolutionCost(towerId, cur.tier);
  if (cost === null || profile.shards < cost) {
    return { profile, evolved: false };
  }
  const nextTier = (cur.tier + 1) as 1 | 2 | 3;
  return {
    evolved: true,
    profile: {
      ...profile,
      shards: profile.shards - cost,
      evolutions: {
        ...profile.evolutions,
        [towerId]: {
          ...cur,
          tier: nextTier,
        },
      },
    },
  };
}

export function setTowerApexChoice(
  profile: PlayerProfile,
  towerId: BaseTowerType,
  branch: ApexBranch,
): PlayerProfile {
  return {
    ...profile,
    evolutions: {
      ...profile.evolutions,
      [towerId]: {
        ...profile.evolutions[towerId],
        apexChoice: branch,
      },
    },
  };
}

export function toggleModifierInProfile(
  profile: PlayerProfile,
  modifierId: ModifierId,
): PlayerProfile {
  const exists = profile.activeModifiers.includes(modifierId);
  return {
    ...profile,
    activeModifiers: exists
      ? profile.activeModifiers.filter((m) => m !== modifierId)
      : [...profile.activeModifiers, modifierId],
  };
}

export function computeModifierRewardMultiplier(activeModifiers: ModifierId[]): number {
  let bonus = 0;
  for (const modId of activeModifiers) {
    const def = MODIFIERS.find((m) => m.id === modId);
    if (def) bonus += def.rewardBonus;
  }
  return Number((1 + bonus).toFixed(2));
}

export function computeTotalRewardMultiplier(
  mode: GameModeId,
  activeModifiers: ModifierId[],
  level = 1,
): number {
  const modeMult = GAME_MODES[mode].rewardMultiplier;
  const levelMult = getLevelDef(level).rewardMultiplier;
  const modMult = computeModifierRewardMultiplier(activeModifiers);
  return Number((modeMult * levelMult * modMult).toFixed(2));
}

export function computeHazardRating(activeModifiers: ModifierId[]): number {
  return activeModifiers.reduce((sum, id) => {
    const def = MODIFIERS.find((m) => m.id === id);
    return sum + (def ? def.hazardPoints : 0);
  }, 0);
}
