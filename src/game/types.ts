export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export type GameModeId = 'standard' | 'blitz' | 'endless';

export type BaseTowerType =
  | 'cannon'
  | 'cryo'
  | 'tesla'
  | 'rail'
  | 'pyro'
  | 'missile'
  | 'laser'
  | 'chrono';

export type SuperTowerType =
  | 'frost_vulcan'
  | 'storm_gatling'
  | 'siege_autocannon'
  | 'tempest_prism'
  | 'glacial_lance'
  | 'plasma_railgun'
  | 'vulcan_behemoth'
  | 'absolute_zero'
  | 'tesla_nexus'
  | 'omega_railgun'
  | 'inferno_hydra'
  | 'salvo_bastion'
  | 'solar_obelisk'
  | 'singularity_core';

export type TowerType = BaseTowerType | SuperTowerType;

export type TowerLevel = 1 | 2 | 3;

export interface GameSettings {
  disableDamageIndicators: boolean;
  showEnemyHpNumbers: boolean;
}

export type ApexBranch = 'a' | 'b';

export type TargetPriority = 'first' | 'strongest' | 'closest';

export type EnemyArchetypeId = 'scout' | 'tank' | 'shielded' | 'regenerator' | 'boss';

export type ModifierId =
  | 'armored_vanguard'
  | 'hyper_march'
  | 'austerity'
  | 'fragile_bastion'
  | 'shielded_legion'
  | 'swarm_surge';

export type PowerUpId =
  | 'high_velocity_barrels'
  | 'cryo_brittle'
  | 'scrap_recycler'
  | 'bastion_reinforcements'
  | 'capacitor_overcharge'
  | 'precision_optics'
  | 'orbital_lance'
  | 'emp_field'
  | 'overdrive_beacon';

export type TileKind = 'buildable' | 'path' | 'spawn' | 'exit' | 'obstacle' | 'vantage';

export interface GridCoord {
  col: number;
  row: number;
}

export interface GameMap {
  seed: number;
  cols: number;
  rows: number;
  tiles: TileKind[][];
  path: GridCoord[];
  spawn: GridCoord;
  exit: GridCoord;
}

export interface TowerBaseDef {
  id: TowerType;
  name: string;
  role: string;
  hotkey: string;
  cost: number;
  upgradeBaseCost: number;
  damage: number;
  range: number; // in grid tile units
  fireRate: number; // shots per second
  splashRadius: number; // in tiles, 0 for single-target
  slowFactor: number; // e.g., 0.35 means 35% slow
  slowDuration: number; // seconds
  chainCount: number; // for tesla / hybrid chain discharges
  armorPierce: number; // 0..1 fraction of armor ignored
  shieldMultiplier: number; // damage multiplier vs shields
  accentColor: string;
  maxCount: number; // strategic per-match deployment cap for this turret type
  unlockOrder?: number; // 0 = starter, 1..4 = unlocked upon completing missions
  isSuper?: boolean;
  parents?: [BaseTowerType, BaseTowerType];
  secondaryColor?: string;
  pierceCount?: number;
}

export interface TowerEvolutionDef {
  towerId: BaseTowerType;
  tier1Name: string;
  tier1Desc: string;
  tier1Cost: number;
  tier2Name: string;
  tier2Desc: string;
  tier2Cost: number;
  apexCost: number;
  apexA: {
    name: string;
    desc: string;
  };
  apexB: {
    name: string;
    desc: string;
  };
}

export interface TowerEvolutionProgress {
  tier: 0 | 1 | 2 | 3; // 3 means apex unlocked
  apexChoice: ApexBranch;
}

export interface GameModeDef {
  id: GameModeId;
  name: string;
  subtitle: string;
  totalWaves: number | null; // null for endless
  startingScrap: number;
  startingLives: number;
  rewardMultiplier: number;
  enemyHpScale: number;
  spawnIntervalScale: number;
}

export interface LevelDef {
  level: number;
  name: string;
  subtitle: string;
  wavesBonus: number;
  enemyHpScale: number;
  enemySpeedScale: number;
  startingScrapOffset: number;
  rewardMultiplier: number;
  randomModifierCount: number;
}

export interface ModifierDef {
  id: ModifierId;
  name: string;
  desc: string;
  rewardBonus: number; // e.g. 0.35 adds +35%
  hazardPoints: number;
}

export interface PowerUpDef {
  id: PowerUpId;
  name: string;
  category: 'passive' | 'active';
  desc: string;
  hotkey?: string;
  cooldown?: number; // seconds for active abilities
  accentColor: string;
}

export interface EnemyArchetypeDef {
  id: EnemyArchetypeId;
  name: string;
  trait: string;
  baseHp: number;
  baseShield: number;
  speed: number; // tiles per second
  armor: number; // 0..0.55 kinetic mitigation
  regenPerSec: number;
  bounty: number;
  lifeCost: number;
  radius: number; // relative to tile size (0.2..0.42)
  color: string;
}

export interface PlacedTower {
  id: number;
  type: TowerType;
  fusedParents?: [BaseTowerType, BaseTowerType];
  col: number;
  row: number;
  level: 1 | 2 | 3;
  priority: TargetPriority;
  onVantage: boolean;
  totalSpent: number;
  kills: number;
  damageDealt: number;
  cooldown: number;
  angle: number;
  recoil: number; // 0..1 animation decay
  pulseTimer: number; // for glacial nova or special apex perks
}

export interface EnemyInstance {
  id: number;
  archetype: EnemyArchetypeId;
  x: number; // in grid coordinate space (col + 0.5 center)
  y: number; // in grid coordinate space (row + 0.5 center)
  pathIndex: number; // current waypoint index moving toward
  distanceTraveled: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  shieldRegenDelay: number;
  speed: number;
  armor: number;
  regenPerSec: number;
  bounty: number;
  lifeCost: number;
  radius: number;
  color: string;
  slowTimer: number;
  slowFactor: number;
  stunTimer: number;
  vulnerabilityStacks: number;
  hitFlashTimer: number;
  bossAbilityTimer: number;
  bossTelegraphTimer: number;
  dead: boolean;
  koTimer: number; // 0.3s dissolve animation on death
  reachedExit: boolean;
}

export interface ProjectileInstance {
  id: number;
  towerId: number;
  towerType: TowerType;
  x: number;
  y: number;
  targetId: number;
  targetX: number;
  targetY: number;
  speed: number;
  damage: number;
  armorPierce: number;
  shieldMultiplier: number;
  splashRadius: number;
  slowFactor: number;
  slowDuration: number;
  isCrit: boolean;
  appliesVulnerability: boolean;
  color: string;
  pierceRemaining: number;
  hitIds: number[];
  vx: number;
  vy: number;
  life: number;
}

export interface ArcEffect {
  points: { x: number; y: number }[];
  color: string;
  life: number;
  maxLife: number;
  width: number;
}

export interface RingEffect {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export interface WaveSpawnEntry {
  archetype: EnemyArchetypeId;
  delay: number;
}

export interface RunOutcome {
  victory: boolean;
  mode: GameModeId;
  level: number;
  wavesCleared: number;
  enemiesDefeated: number;
  damageDealt: number;
  livesRemaining: number;
  maxLives: number;
  score: number;
  shardsEarned: number;
  unlockedTowerId: BaseTowerType | null;
  unlockedNextLevel: number | null;
  modifierMultiplier: number;
  activeModifiers: ModifierId[];
}

export interface PlayerProfile {
  shards: number;
  totalShardsEarned: number;
  runsCompleted: number;
  runsWon: number;
  bestWaveByMode: Record<GameModeId, number>;
  bestScoreByMode: Record<GameModeId, number>;
  evolutions: Record<BaseTowerType, TowerEvolutionProgress>;
  unlockedTowers: BaseTowerType[];
  equippedLoadout: BaseTowerType[]; // max 6 turrets equipped
  selectedMode: GameModeId;
  selectedLevel: number;
  highestUnlockedLevel: number;
  levelSeeds: Record<number, number>;
  activeModifiers: ModifierId[];
  muted: boolean;
}

export interface ActiveAbilityState {
  id: PowerUpId;
  cooldownRemaining: number;
  maxCooldown: number;
}

export interface RunState {
  mode: GameModeId;
  level: number;
  map: GameMap;
  scrap: number;
  lives: number;
  maxLives: number;
  wave: number;
  totalWaves: number | null;
  waveActive: boolean;
  waveCleared: boolean;
  autoSkipWave: boolean;
  autoWaveTimer: number;
  spawnQueue: WaveSpawnEntry[];
  spawnTimer: number;
  towers: PlacedTower[];
  enemies: EnemyInstance[];
  projectiles: ProjectileInstance[];
  arcs: ArcEffect[];
  rings: RingEffect[];
  floatingTexts: FloatingText[];
  nextEntityId: number;
  passivePowerUps: PowerUpId[];
  activeAbilities: ActiveAbilityState[];
  draftOptions: PowerUpDef[] | null;
  pendingTargetingAbility: PowerUpId | null;
  pendingCombineTowerId: number | null;
  overdriveTimer: number;
  hitstopTimer: number;
  trauma: number;
  enemiesDefeated: number;
  totalDamageDealt: number;
  score: number;
  speedMultiplier: 1 | 2;
  equippedLoadout: BaseTowerType[];
  unlockedTowersSnapshot: BaseTowerType[];
  levelModifiers: ModifierId[];
  activeModifiers: ModifierId[];
  evolutionsSnapshot: Record<BaseTowerType, TowerEvolutionProgress>;
  outcome: RunOutcome | null;
  defeatDelayTimer: number;
  selectedTowerId: number | null;
  selectedBuildType: BaseTowerType | null;
}
