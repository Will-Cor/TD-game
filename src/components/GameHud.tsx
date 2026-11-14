import {
  ENEMY_DEFS,
  FUSION_COST,
  GAME_MODES,
  getCombinedTowerType,
  getLevelDef,
  isBaseTowerType,
  MAX_ACTIVE_TOWERS,
  MODIFIERS,
  POWER_UP_BY_ID,
  TOWER_DEFS,
} from '../game/catalog';
import { computeTotalRewardMultiplier } from '../game/progression';
import {
  computeTowerEffectiveStats,
  generateWaveSpawns,
  getDeployedCountByType,
  getUsedGridCapacity,
} from '../game/simulation';
import type { BaseTowerType, ModifierId, PowerUpId, RunState } from '../game/types';
import { TowerIcon } from './TowerIcon';

export interface BuildCardStats {
  attack: number;
  range: number;
  spa: string; // Seconds Per Attack (e.g. "0.36s")
}

export interface HudSnapshot {
  mode: RunState['mode'];
  level: number;
  levelName: string;
  scrap: number;
  lives: number;
  maxLives: number;
  wave: number;
  totalWaves: number | null;
  waveActive: boolean;
  autoSkipWave: boolean;
  autoWaveTimer: number;
  speedMultiplier: 1 | 2;
  score: number;
  enemiesRemaining: number;
  nextWaveHint: string;
  equippedLoadout: BaseTowerType[];
  buildStatsByType: Record<string, BuildCardStats>;
  towerCount: number;
  maxActiveTowers: number;
  deployedByType: Record<string, number>;
  selectedBuildType: BaseTowerType | null;
  selectedTower: RunState['towers'][number] | null;
  selectedTowerStats: ReturnType<typeof computeTowerEffectiveStats> | null;
  selectedTowerNextStats: ReturnType<typeof computeTowerEffectiveStats> | null;
  pendingCombineTowerId: number | null;
  hasCombinePartner: boolean;
  activeAbilities: RunState['activeAbilities'];
  passivePowerUps: PowerUpId[];
  pendingTargetingAbility: PowerUpId | null;
  activeModifiers: ModifierId[];
  rewardMultiplier: number;
  canRerollMap: boolean;
}

export function extractHudSnapshot(run: RunState): HudSnapshot {
  const selectedTower =
    run.selectedTowerId !== null
      ? run.towers.find((t) => t.id === run.selectedTowerId) ?? null
      : null;

  const hasCombinePartner =
    selectedTower !== null &&
    isBaseTowerType(selectedTower.type) &&
    run.towers.some((t) => {
      if (t.id === selectedTower.id || !isBaseTowerType(t.type)) return false;
      const superType = getCombinedTowerType(selectedTower.type, t.type);
      if (!superType) return false;
      const existingSuperCount = run.towers.filter((x) => x.type === superType).length;
      return existingSuperCount < TOWER_DEFS[superType].maxCount;
    });

  const deployedByType = getDeployedCountByType(run.towers);
  const usedGridCapacity = getUsedGridCapacity(run.towers);

  const buildStatsByType: Record<string, BuildCardStats> = {};
  for (const typeId of run.equippedLoadout) {
    const def = TOWER_DEFS[typeId];
    const eff = computeTowerEffectiveStats(
      { type: typeId, level: 1, onVantage: false, totalSpent: def.cost },
      run,
    );
    buildStatsByType[typeId] = {
      attack: eff.damage,
      range: eff.range,
      spa: `${(1 / Math.max(0.05, eff.fireRate)).toFixed(2)}s`,
    };
  }

  let nextWaveHint = '';
  if (!run.waveActive && (run.totalWaves === null || run.wave < run.totalWaves)) {
    const nextSpawns = generateWaveSpawns(run.wave + 1, run.mode, run.activeModifiers);
    const uniqueTypes = Array.from(new Set(nextSpawns.map((s) => ENEMY_DEFS[s.archetype].name)));
    nextWaveHint = uniqueTypes.join(' · ');
  }

  const selectedTowerStats = selectedTower
    ? computeTowerEffectiveStats(selectedTower, run)
    : null;
  const selectedTowerNextStats =
    selectedTower && selectedTower.level < 3
      ? computeTowerEffectiveStats(
          { ...selectedTower, level: (selectedTower.level + 1) as 2 | 3 },
          run,
        )
      : null;

  return {
    mode: run.mode,
    level: run.level,
    levelName: getLevelDef(run.level).name,
    scrap: run.scrap,
    lives: run.lives,
    maxLives: run.maxLives,
    wave: run.wave,
    totalWaves: run.totalWaves,
    waveActive: run.waveActive,
    autoSkipWave: run.autoSkipWave,
    autoWaveTimer: run.autoWaveTimer,
    speedMultiplier: run.speedMultiplier,
    score: run.score,
    enemiesRemaining:
      run.spawnQueue.length + run.enemies.filter((e) => !e.dead && !e.reachedExit).length,
    nextWaveHint,
    equippedLoadout: [...run.equippedLoadout],
    buildStatsByType,
    towerCount: usedGridCapacity,
    maxActiveTowers: MAX_ACTIVE_TOWERS,
    deployedByType,
    selectedBuildType: run.selectedBuildType,
    selectedTower: selectedTower ? { ...selectedTower } : null,
    selectedTowerStats,
    selectedTowerNextStats,
    pendingCombineTowerId: run.pendingCombineTowerId,
    hasCombinePartner,
    activeAbilities: run.activeAbilities.map((a) => ({ ...a })),
    passivePowerUps: [...run.passivePowerUps],
    pendingTargetingAbility: run.pendingTargetingAbility,
    activeModifiers: [...run.activeModifiers],
    rewardMultiplier: computeTotalRewardMultiplier(run.mode, run.activeModifiers, run.level),
    canRerollMap: run.wave === 0 && !run.waveActive,
  };
}

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  onSelectBuild: (type: BaseTowerType | null) => void;
  onStartWave: () => void;
  onToggleAutoWave: () => void;
  onRerollMap: () => void;
  onToggleSpeed: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onUpgradeTower: (id: number) => void;
  onStartCombine: (id: number) => void;
  onCancelCombine: () => void;
  onSellTower: (id: number) => void;
  onCyclePriority: (id: number) => void;
  onDeselectTower: () => void;
  onActivateAbility: (id: PowerUpId) => void;
  onResetCamera: () => void;
}

export function GameHud({
  hud,
  muted,
  onSelectBuild,
  onStartWave,
  onToggleAutoWave,
  onRerollMap,
  onToggleSpeed,
  onToggleMute,
  onPause,
  onUpgradeTower,
  onStartCombine,
  onCancelCombine,
  onSellTower,
  onCyclePriority,
  onDeselectTower,
  onActivateAbility,
  onResetCamera,
}: GameHudProps) {
  const lowHp = hud.lives <= Math.max(3, Math.floor(hud.maxLives * 0.25));
  const gridFull = hud.towerCount >= hud.maxActiveTowers;

  const selectedDef = hud.selectedTower ? TOWER_DEFS[hud.selectedTower.type] : null;
  const fusedParents = hud.selectedTower?.fusedParents ?? selectedDef?.parents;
  const isFusedSuper = Boolean(selectedDef?.isSuper && fusedParents);
  const selectedSpa = hud.selectedTowerStats
    ? Number((1 / Math.max(0.05, hud.selectedTowerStats.fireRate)).toFixed(2))
    : 0;
  const nextSpa = hud.selectedTowerNextStats
    ? Number((1 / Math.max(0.05, hud.selectedTowerNextStats.fireRate)).toFixed(2))
    : selectedSpa;
  const dmgDelta =
    hud.selectedTowerStats && hud.selectedTowerNextStats
      ? hud.selectedTowerNextStats.damage - hud.selectedTowerStats.damage
      : 0;
  const rngDelta =
    hud.selectedTowerStats && hud.selectedTowerNextStats
      ? Number((hud.selectedTowerNextStats.range - hud.selectedTowerStats.range).toFixed(2))
      : 0;
  const spaDelta =
    hud.selectedTowerStats && hud.selectedTowerNextStats
      ? Number((nextSpa - selectedSpa).toFixed(2))
      : 0;

  const activeHazardNames = hud.activeModifiers
    .map((id) => MODIFIERS.find((m) => m.id === id)?.name ?? id)
    .join(', ');

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-2.5 sm:p-4">
      {/* Top Clean Telemetry Strip */}
      <div className="flex items-start justify-between gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-sm border border-[#E2C896]/20 bg-[#10161D]/95 px-3.5 py-1.5 shadow-lg sm:gap-4 sm:px-4 sm:py-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Bastion
            </span>
            <span
              className={`font-mono-num text-base font-bold sm:text-lg ${
                lowHp ? 'text-[#EF4444]' : 'text-[#34D399]'
              }`}
            >
              {hud.lives}/{hud.maxLives}
            </span>
          </div>

          <span className="text-[#334155]" aria-hidden="true">
            |
          </span>

          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Scrap
            </span>
            <span
              className="font-mono-num text-base font-bold text-[#E5A93C] sm:text-lg"
              data-testid="hud-scrap"
            >
              {hud.scrap}
            </span>
          </div>

          <span className="text-[#334155]" aria-hidden="true">
            |
          </span>

          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Wave
            </span>
            <span
              className="font-mono-num text-base font-bold text-[#EAE4D7] sm:text-lg"
              data-testid="hud-wave"
            >
              {hud.wave}
              {hud.totalWaves ? `/${hud.totalWaves}` : ''}
            </span>
          </div>

          <span className="text-[#334155]" aria-hidden="true">
            |
          </span>

          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Grid
            </span>
            <span
              data-testid="hud-grid-cap"
              className={`font-mono-num text-sm font-bold sm:text-base ${
                gridFull ? 'text-[#F97316]' : 'text-[#EAE4D7]'
              }`}
            >
              {hud.towerCount}/{hud.maxActiveTowers}
            </span>
          </div>

          <span className="hidden text-[#334155] sm:inline" aria-hidden="true">
            |
          </span>

          <div
            className="hidden items-baseline gap-2 text-xs sm:flex"
            title={activeHazardNames ? `Active Hazards: ${activeHazardNames}` : undefined}
          >
            <span className="font-semibold text-[#EAE4D7]">
              Lv.{hud.level} · {GAME_MODES[hud.mode].name}
            </span>
            <span className="font-mono-num font-bold text-[#E5A93C]">
              {hud.rewardMultiplier.toFixed(2)}x
            </span>
            {hud.activeModifiers.length > 0 && (
              <span className="font-semibold text-[#F97316]">
                · {hud.activeModifiers.length} Hazard{hud.activeModifiers.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        {/* Top Right Compact Utility Controls */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
          {hud.canRerollMap && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onRerollMap();
              }}
              className="hidden cursor-pointer rounded-sm border border-[#E2C896]/25 bg-[#10161D]/95 px-3 py-2 text-xs font-semibold text-[#EAE4D7] hover:border-[#E5A93C] sm:inline-block whitespace-nowrap"
              title="Generate a new randomized map [R]"
            >
              New Map [R]
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onResetCamera();
            }}
            className="hidden cursor-pointer rounded-sm border border-[#E2C896]/20 bg-[#10161D]/95 px-2.5 py-2 text-xs font-semibold text-[#A39E93] hover:border-[#E5A93C]/50 hover:text-[#EAE4D7] md:inline-block whitespace-nowrap"
            title="Reset 3D camera [C]"
          >
            Cam [C]
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleSpeed();
            }}
            aria-label={`Toggle simulation speed (${hud.speedMultiplier}x)`}
            className={`cursor-pointer rounded-sm border px-2.5 py-1.5 font-mono-num text-xs font-bold sm:px-3 sm:py-2 whitespace-nowrap ${
              hud.speedMultiplier === 2
                ? 'border-[#E5A93C] bg-[#25303C] text-[#E5A93C]'
                : 'border-[#E2C896]/20 bg-[#10161D]/95 text-[#EAE4D7] hover:border-[#E5A93C]/50'
            }`}
          >
            {hud.speedMultiplier}x
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Unmute audio [M]' : 'Mute audio [M]'}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border border-[#E2C896]/20 bg-[#10161D]/95 text-[#EAE4D7] hover:border-[#E5A93C]/50 sm:h-9 sm:w-9"
            title="Mute / Unmute [M]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              {muted ? (
                <line x1="22" y1="9" x2="16" y2="15" />
              ) : (
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              )}
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Pause game [P]"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border border-[#E2C896]/20 bg-[#10161D]/95 text-[#EAE4D7] hover:border-[#E5A93C]/50 sm:h-9 sm:w-9"
            title="Pause [P / Esc]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" />
              <rect x="14" y="5" width="4" height="14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Middle Row: Right-Docked Tower Upgrade & Inspector Card */}
      <div className="flex min-h-0 flex-1 items-center justify-end py-2">
        {hud.selectedTower && hud.selectedTowerStats && selectedDef && (
          <aside
            data-testid="tower-inspector-panel"
            aria-label="Selected turret upgrades and stats"
            className="pointer-events-auto flex max-h-full w-[280px] flex-col gap-2.5 overflow-y-auto rounded-sm border border-[#E5A93C]/50 bg-[#10161D]/95 p-3.5 shadow-2xl sm:w-[300px]"
          >
            {/* Card Header: Icon, Name, Close */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <TowerIcon type={hud.selectedTower.type} className="h-9 w-9 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-display truncate text-sm font-bold text-[#EAE4D7] sm:text-base">
                    {selectedDef.name}
                  </h3>
                  <div className="truncate text-[11px] text-[#94A3B8]">
                    {isFusedSuper && fusedParents ? (
                      <span className="font-semibold text-[#38BDF8]">
                        {TOWER_DEFS[fusedParents[0]].name} + {TOWER_DEFS[fusedParents[1]].name}
                      </span>
                    ) : (
                      selectedDef.role
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onDeselectTower}
                aria-label="Close turret inspector"
                className="shrink-0 cursor-pointer rounded-sm px-1.5 py-0.5 text-xs font-bold text-[#94A3B8] hover:bg-[#1B232C] hover:text-[#EAE4D7]"
              >
                ✕
              </button>
            </div>

            {/* Tier Badges + Combat Record */}
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1 font-mono-num">
                {[1, 2, 3].map((lvl) => (
                  <span
                    key={lvl}
                    className={`rounded-sm px-1.5 py-0.5 font-bold ${
                      hud.selectedTower!.level >= lvl
                        ? 'bg-[#E5A93C]/20 text-[#E5A93C]'
                        : 'bg-[#17202A] text-[#64748B]'
                    }`}
                  >
                    MK {lvl}
                  </span>
                ))}
              </div>
              <span className="font-mono-num text-[#94A3B8] tabular-nums">
                {hud.selectedTower.kills} Kills · {hud.selectedTower.damageDealt} DMG
              </span>
            </div>

            {/* 3-Column Combat Stat Grid (ATK / RNG / SPA) + Upgrade Preview */}
            <div className="grid grid-cols-3 gap-1.5 rounded-sm border border-[#E2C896]/15 bg-[#151D26] p-2 text-center font-mono-num">
              <div>
                <div className="text-[10px] text-[#64748B]">ATK</div>
                <div className="text-xs font-bold text-[#EAE4D7]">
                  {hud.selectedTowerStats.damage}
                </div>
                {dmgDelta > 0 && (
                  <div className="text-[10px] font-bold text-[#34D399]">+{dmgDelta}</div>
                )}
              </div>
              <div className="border-x border-[#E2C896]/10">
                <div className="text-[10px] text-[#64748B]">RNG</div>
                <div className="text-xs font-bold text-[#EAE4D7]">
                  {hud.selectedTowerStats.range}
                </div>
                {rngDelta > 0 && (
                  <div className="text-[10px] font-bold text-[#34D399]">+{rngDelta}</div>
                )}
              </div>
              <div>
                <div className="text-[10px] text-[#64748B]">SPA</div>
                <div className="text-xs font-bold text-[#EAE4D7]">
                  {selectedSpa.toFixed(2)}s
                </div>
                {spaDelta < 0 && (
                  <div className="text-[10px] font-bold text-[#34D399]">{spaDelta}s</div>
                )}
              </div>
            </div>

            {/* Card Actions */}
            {hud.pendingCombineTowerId === hud.selectedTower.id ? (
              <div className="flex flex-col gap-2 border-t border-[#E2C896]/15 pt-2.5">
                <div className="rounded-sm border border-[#38BDF8]/35 bg-[#122230] px-2.5 py-2 text-xs font-medium text-[#BAE6FD]">
                  Fusion Mode active: click another base turret on the board ({FUSION_COST} Scrap).
                </div>
                <button
                  type="button"
                  onClick={onCancelCombine}
                  className="w-full cursor-pointer rounded-sm border border-[#38BDF8]/50 bg-[#182938] py-1.5 text-xs font-semibold text-[#BAE6FD] hover:border-[#38BDF8]"
                >
                  Cancel Fusion [Esc]
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 border-t border-[#E2C896]/15 pt-2.5">
                {hud.selectedTowerStats.upgradeCost !== null ? (
                  <button
                    type="button"
                    data-testid="upgrade-tower-btn"
                    disabled={hud.scrap < hud.selectedTowerStats.upgradeCost}
                    onClick={() => onUpgradeTower(hud.selectedTower!.id)}
                    className={`w-full rounded-sm border py-2 text-xs font-bold transition-colors ${
                      hud.scrap >= hud.selectedTowerStats.upgradeCost
                        ? 'cursor-pointer border-[#FCD34D]/60 bg-[#E5A93C] text-[#11171D] hover:bg-[#F0B94D]'
                        : 'cursor-not-allowed border-[#E2C896]/10 bg-[#17202A] text-[#64748B]'
                    }`}
                  >
                    Upgrade MK {hud.selectedTower.level + 1} [U] ·{' '}
                    {hud.selectedTowerStats.upgradeCost} Scrap
                  </button>
                ) : (
                  <div className="w-full rounded-sm border border-[#34D399]/35 bg-[#122922] py-1.5 text-center text-xs font-semibold text-[#34D399]">
                    Max Upgrade Reached
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onCyclePriority(hud.selectedTower!.id)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-sm border border-[#E2C896]/20 bg-[#17202A] px-3 py-1.5 text-xs font-semibold text-[#EAE4D7] hover:border-[#E5A93C]"
                >
                  <span className="text-[#94A3B8]">Target Priority</span>
                  <span className="capitalize text-[#E5A93C]">{hud.selectedTower.priority}</span>
                </button>

                <div className="flex items-center gap-2">
                  {isBaseTowerType(hud.selectedTower.type) && (
                    <button
                      type="button"
                      data-testid="combine-tower-btn"
                      disabled={!hud.hasCombinePartner || hud.scrap < FUSION_COST}
                      onClick={() => onStartCombine(hud.selectedTower!.id)}
                      className={`flex-1 rounded-sm border px-2.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                        hud.hasCombinePartner && hud.scrap >= FUSION_COST
                          ? 'cursor-pointer border-[#38BDF8]/60 bg-[#162C3D] text-[#7DD3FC] hover:border-[#38BDF8] hover:bg-[#1E3A50]'
                          : 'cursor-not-allowed border-[#E2C896]/10 bg-[#17202A] text-[#64748B]'
                      }`}
                    >
                      {hud.hasCombinePartner ? `Combine [B] · ${FUSION_COST}` : 'Need 2nd Turret'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onSellTower(hud.selectedTower!.id)}
                    className={`cursor-pointer rounded-sm border border-[#EF4444]/40 bg-[#2C181C] px-2.5 py-1.5 text-xs font-semibold text-[#FCA5A5] hover:bg-[#3F1D23] whitespace-nowrap ${
                      isBaseTowerType(hud.selectedTower.type) ? '' : 'w-full'
                    }`}
                  >
                    Sell +{hud.selectedTowerStats.sellRefund}
                  </button>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Bottom Dock: Structured Unit Cards (ATK, RNG, SPA) + Wave Controls */}
      <div className="flex flex-col gap-2">
        <div className="pointer-events-auto flex items-end justify-between gap-2.5 rounded-sm border border-[#E2C896]/20 bg-[#10161D]/95 p-2 shadow-xl">
          {/* Equipped Turret Selector Cards (with Attack, Range, SPA) */}
          <div className="flex items-stretch gap-2 overflow-x-auto pb-0.5 sm:pb-0">
            {hud.equippedLoadout.map((towerId, idx) => {
              const tower = TOWER_DEFS[towerId];
              const stats = hud.buildStatsByType[towerId] ?? {
                attack: tower.damage,
                range: tower.range,
                spa: `${(1 / Math.max(0.05, tower.fireRate)).toFixed(2)}s`,
              };
              const active = hud.selectedBuildType === tower.id;
              const deployed = hud.deployedByType[tower.id] ?? 0;
              const typeCapped = deployed >= tower.maxCount;
              const capped = typeCapped || gridFull;
              const affordable = hud.scrap >= tower.cost;

              return (
                <button
                  key={tower.id}
                  type="button"
                  data-testid={`build-card-${tower.id}`}
                  onClick={() => onSelectBuild(active ? null : towerId)}
                  title={`${tower.name} — ${tower.role}`}
                  className={`flex w-[148px] shrink-0 cursor-pointer flex-col justify-between rounded-sm border p-2 text-left transition-colors ${
                    active
                      ? 'border-[#E5A93C] bg-[#1E2834]'
                      : 'border-[#E2C896]/15 bg-[#151D26] hover:border-[#E2C896]/45'
                  } ${!affordable || capped ? 'opacity-65' : ''}`}
                >
                  {/* Card Top: Key + Name + Cost */}
                  <div className="flex items-center justify-between gap-1 text-xs font-bold">
                    <span className="truncate text-[#EAE4D7]">
                      <span className="font-mono-num text-[#94A3B8]">[{idx + 1}]</span>{' '}
                      {tower.name}
                    </span>
                    <span
                      className={`font-mono-num shrink-0 ${
                        affordable ? 'text-[#E5A93C]' : 'text-[#EF4444]'
                      }`}
                    >
                      {tower.cost}
                    </span>
                  </div>

                  {/* Card Middle: Icon + Cap */}
                  <div className="my-1.5 flex items-center justify-between gap-2">
                    <TowerIcon type={tower.id} className="h-7 w-7 shrink-0" />
                    <span
                      className={`font-mono-num text-[11px] font-semibold ${
                        typeCapped ? 'text-[#F97316]' : 'text-[#94A3B8]'
                      }`}
                    >
                      Cap {deployed}/{tower.maxCount}
                    </span>
                  </div>

                  {/* Card Bottom: ATK / RNG / SPA */}
                  <div className="grid grid-cols-3 gap-1 border-t border-[#E2C896]/10 pt-1.5 text-center font-mono-num text-[10px]">
                    <div>
                      <div className="text-[#64748B]">ATK</div>
                      <div className="font-bold text-[#EAE4D7]">{stats.attack}</div>
                    </div>
                    <div>
                      <div className="text-[#64748B]">RNG</div>
                      <div className="font-bold text-[#EAE4D7]">{stats.range}</div>
                    </div>
                    <div>
                      <div className="text-[#64748B]">SPA</div>
                      <div className="font-bold text-[#EAE4D7]">{stats.spa}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Action Column: Active Abilities + Auto-Wave + Send Wave */}
          <div className="flex shrink-0 flex-col items-end justify-end gap-1.5">
            {hud.activeAbilities.length > 0 && (
              <div className="flex items-center gap-1.5">
                {hud.activeAbilities.map((ab) => {
                  const def = POWER_UP_BY_ID[ab.id];
                  const ready = ab.cooldownRemaining <= 0;
                  const priming = hud.pendingTargetingAbility === ab.id;
                  return (
                    <button
                      key={ab.id}
                      type="button"
                      disabled={!ready}
                      onClick={() => onActivateAbility(ab.id)}
                      className={`cursor-pointer rounded-sm border px-2.5 py-1.5 text-[11px] font-bold whitespace-nowrap ${
                        priming
                          ? 'border-[#EF4444] bg-[#3B1920] text-[#FCA5A5]'
                          : ready
                            ? 'border-[#38BDF8]/60 bg-[#1B2B38] text-[#EAE4D7] hover:border-[#38BDF8]'
                            : 'cursor-not-allowed border-[#E2C896]/10 bg-[#161E27] text-[#64748B]'
                      }`}
                      title={def.desc}
                    >
                      [{def.hotkey}] {def.name}{' '}
                      <span className="font-mono-num">
                        {priming
                          ? 'Target'
                          : ready
                            ? 'Ready'
                            : `${ab.cooldownRemaining.toFixed(1)}s`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                tabIndex={-1}
                data-testid="auto-wave-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleAutoWave();
                }}
                title="Automatically start the next wave after clearing [G]"
                className={`cursor-pointer rounded-sm border px-3 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                  hud.autoSkipWave
                    ? 'border-[#34D399]/70 bg-[#142D26] text-[#34D399]'
                    : 'border-[#E2C896]/20 bg-[#161E27] text-[#A39E93] hover:border-[#E5A93C]/50 hover:text-[#EAE4D7]'
                }`}
              >
                {hud.autoSkipWave
                  ? !hud.waveActive && hud.wave > 0 && hud.autoWaveTimer > 0
                    ? `Auto ${hud.autoWaveTimer.toFixed(1)}s`
                    : 'Auto: On'
                  : 'Auto: Off'}
              </button>

              {hud.waveActive ? (
                <div className="rounded-sm border border-[#E2C896]/15 bg-[#161E27] px-3.5 py-2 text-xs font-semibold text-[#EAE4D7] tabular-nums whitespace-nowrap">
                  Hostiles:{' '}
                  <span className="font-mono-num text-[#E5A93C]">{hud.enemiesRemaining}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onStartWave}
                  data-testid="send-wave-btn"
                  className="font-display cursor-pointer rounded-sm border border-[#FCD34D]/60 bg-[#E5A93C] px-4 py-2 text-xs font-bold text-[#11171D] transition-transform active:scale-[0.98] hover:bg-[#F0B94D] sm:px-5 sm:text-sm whitespace-nowrap"
                >
                  {hud.wave === 0 ? 'Send Wave 1' : `Send Wave ${hud.wave + 1}`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
