import {
  ENEMY_DEFS,
  FUSION_COST,
  GAME_MODES,
  getCombinedTowerType,
  getLevelDef,
  isBaseTowerType,
  MAX_ACTIVE_TOWERS,
  MAX_EQUIPPED_TURRETS,
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
  spa: string; // Seconds Per Attack (e.g. "0.69s")
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
  pendingTacticalPing: boolean;
  showEnemyPath: boolean;
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
    pendingTacticalPing: run.pendingTacticalPing,
    showEnemyPath: run.showEnemyPath,
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
  onTogglePingMode: () => void;
  onToggleEnemyPath: () => void;
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
  onTogglePingMode,
  onToggleEnemyPath,
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

  const deckSlots = Array.from(
    { length: MAX_EQUIPPED_TURRETS },
    (_, i) => hud.equippedLoadout[i] ?? null,
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-2.5 sm:p-4">
      {/* Top Telemetry Strip + Tactical Utility Bar */}
      <div className="flex items-start justify-between gap-2">
        <div className="ui-frame pointer-events-auto flex flex-wrap items-center gap-3 rounded-lg px-3.5 py-1.5 sm:gap-4 sm:px-4 sm:py-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#94A3B8]">
              Bastion
            </span>
            <span
              className={`font-mono-num text-arcade-shadow text-base font-black sm:text-lg ${
                lowHp ? 'text-[#F87171]' : 'text-[#34D399]'
              }`}
            >
              {hud.lives}/{hud.maxLives}
            </span>
          </div>

          <span className="text-[#334155]" aria-hidden="true">
            |
          </span>

          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#94A3B8]">
              Scrap
            </span>
            <span
              className="font-mono-num text-arcade-shadow text-base font-black text-[#FBBF24] sm:text-lg"
              data-testid="hud-scrap"
            >
              {hud.scrap}
            </span>
          </div>

          <span className="text-[#334155]" aria-hidden="true">
            |
          </span>

          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#94A3B8]">
              Wave
            </span>
            <span
              className="font-mono-num text-arcade-shadow text-base font-black text-white sm:text-lg"
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
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#94A3B8]">
              Grid
            </span>
            <span
              data-testid="hud-grid-cap"
              className={`font-mono-num text-arcade-shadow text-sm font-black sm:text-base ${
                gridFull ? 'text-[#FB923C]' : 'text-white'
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
            <span className="font-extrabold text-[#EAE4D7]">
              Lv.{hud.level} · {GAME_MODES[hud.mode].name}
            </span>
            <span className="font-mono-num font-black text-[#FBBF24]">
              {hud.rewardMultiplier.toFixed(2)}x
            </span>
            {hud.activeModifiers.length > 0 && (
              <span className="font-bold text-[#FB923C]">
                · {activeHazardNames}
              </span>
            )}
          </div>
        </div>

        {/* Top Right Compact Tactical & Utility Controls */}
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <button
            type="button"
            tabIndex={-1}
            data-testid="ping-mode-btn"
            onClick={(e) => {
              e.currentTarget.blur();
              onTogglePingMode();
            }}
            title="Place Tactical Ping on board [T or Shift+Click] — Focuses fire on paths"
            className={`arcade-btn cursor-pointer rounded-lg border-2 px-2.5 py-1.5 text-xs font-extrabold uppercase tracking-wide sm:px-3 sm:py-1.5 whitespace-nowrap ${
              hud.pendingTacticalPing
                ? 'border-[#38BDF8] border-b-[#0284C7] bg-[#0F2F44] text-[#7DD3FC]'
                : 'border-[#38BDF8]/40 border-b-[#0B1218] bg-[#10161D]/95 text-[#BAE6FD] hover:border-[#38BDF8]'
            }`}
          >
            {hud.pendingTacticalPing ? 'Ping Armed [T]' : 'Ping [T]'}
          </button>

          <button
            type="button"
            tabIndex={-1}
            data-testid="toggle-path-btn"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleEnemyPath();
            }}
            title="Show or hide animated enemy travel path [V]"
            className={`arcade-btn cursor-pointer rounded-lg border-2 px-2.5 py-1.5 text-xs font-extrabold uppercase tracking-wide sm:px-3 sm:py-1.5 whitespace-nowrap ${
              hud.showEnemyPath
                ? 'border-[#34D399]/70 border-b-[#065F46] bg-[#112820] text-[#34D399]'
                : 'border-[#334155] border-b-[#090D12] bg-[#10161D]/95 text-[#94A3B8] hover:text-white'
            }`}
          >
            Path [V]
          </button>

          {hud.canRerollMap && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onRerollMap();
              }}
              className="arcade-btn hidden cursor-pointer rounded-lg border-2 border-[#E2C896]/35 border-b-[#090D12] bg-[#10161D]/95 px-2.5 py-1.5 text-xs font-bold text-[#EAE4D7] hover:border-[#FBBF24] sm:inline-block whitespace-nowrap"
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
            className="arcade-btn hidden cursor-pointer rounded-lg border-2 border-[#334155] border-b-[#090D12] bg-[#10161D]/95 px-2.5 py-1.5 text-xs font-bold text-[#94A3B8] hover:border-[#FBBF24]/50 hover:text-white md:inline-block whitespace-nowrap"
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
            className={`arcade-btn cursor-pointer rounded-lg border-2 px-2.5 py-1.5 font-mono-num text-xs font-black sm:px-3 whitespace-nowrap ${
              hud.speedMultiplier === 2
                ? 'border-[#FBBF24] border-b-[#92400E] bg-[#2D2112] text-[#FBBF24]'
                : 'border-[#334155] border-b-[#090D12] bg-[#10161D]/95 text-[#EAE4D7] hover:border-[#FBBF24]/60'
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
            className="arcade-btn flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-2 border-[#334155] border-b-[#090D12] bg-[#10161D]/95 text-[#EAE4D7] hover:border-[#FBBF24]/60 sm:h-9 sm:w-9"
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
            className="arcade-btn flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-2 border-[#334155] border-b-[#090D12] bg-[#10161D]/95 text-[#EAE4D7] hover:border-[#FBBF24]/60 sm:h-9 sm:w-9"
            title="Pause [P / Esc]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" />
              <rect x="14" y="5" width="4" height="14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tactical Ping Prompt Strip when armed */}
      {hud.pendingTacticalPing && (
        <div className="pointer-events-none flex justify-center pt-1.5">
          <div className="rounded-lg border-2 border-[#38BDF8] bg-[#0B1D2C]/95 px-4 py-1 text-xs font-extrabold text-[#BAE6FD] shadow-lg">
            TACTICAL PING ARMED — Click path tile to FOCUS fire, open tile to mark BUILD, or Esc to cancel
          </div>
        </div>
      )}

      {/* Middle Row: Right-Docked Tower Upgrade & Inspector Card */}
      <div className="flex min-h-0 flex-1 items-center justify-end py-2">
        {hud.selectedTower && hud.selectedTowerStats && selectedDef && (
          <aside
            data-testid="tower-inspector-panel"
            aria-label="Selected turret upgrades and stats"
            className="ui-frame pointer-events-auto flex max-h-full w-[280px] flex-col gap-2.5 overflow-y-auto rounded-xl border-[#FBBF24]/75 p-3.5 sm:w-[300px]"
          >
            {/* Card Header: Icon, Name, Crimson Close X */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  style={{ borderColor: selectedDef.accentColor }}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2 bg-[#0D1319]"
                >
                  <TowerIcon type={hud.selectedTower.type} className="h-10 w-10" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-arcade-shadow truncate text-sm font-black text-white sm:text-base">
                    {selectedDef.name}
                  </h3>
                  <div className="truncate text-[11px] font-semibold text-[#94A3B8]">
                    {isFusedSuper && fusedParents ? (
                      <span className="font-bold text-[#38BDF8]">
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
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[#090D12] border-b-2 border-b-[#7F1D1D] bg-[#DC2626] text-xs font-black text-white hover:brightness-110"
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
                    className={`rounded border px-1.5 py-0.5 font-black ${
                      hud.selectedTower!.level >= lvl
                        ? 'border-[#FBBF24]/60 bg-[#F59E0B]/20 text-[#FBBF24]'
                        : 'border-[#253241] bg-[#17202A] text-[#64748B]'
                    }`}
                  >
                    MK {lvl}
                  </span>
                ))}
              </div>
              <span className="font-mono-num font-semibold text-[#94A3B8] tabular-nums">
                {hud.selectedTower.kills} Kills · {hud.selectedTower.damageDealt} DMG
              </span>
            </div>

            {/* 3-Column Combat Stat Grid (ATK / RNG / SPA) */}
            <div className="grid grid-cols-3 gap-1.5 rounded-lg border-2 border-[#E2C896]/20 bg-[#151D26] p-2 text-center font-mono-num">
              <div>
                <div className="text-[10px] font-bold text-[#64748B]">ATK</div>
                <div className="text-arcade-shadow text-xs font-black text-white">
                  {hud.selectedTowerStats.damage}
                </div>
                {dmgDelta > 0 && (
                  <div className="text-[10px] font-black text-[#34D399]">+{dmgDelta}</div>
                )}
              </div>
              <div className="border-x border-[#E2C896]/15">
                <div className="text-[10px] font-bold text-[#64748B]">RNG</div>
                <div className="text-arcade-shadow text-xs font-black text-white">
                  {hud.selectedTowerStats.range}
                </div>
                {rngDelta > 0 && (
                  <div className="text-[10px] font-black text-[#34D399]">+{rngDelta}</div>
                )}
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#64748B]">SPA</div>
                <div className="text-arcade-shadow text-xs font-black text-white">
                  {selectedSpa.toFixed(2)}s
                </div>
                {spaDelta < 0 && (
                  <div className="text-[10px] font-black text-[#34D399]">{spaDelta}s</div>
                )}
              </div>
            </div>

            {/* Card Actions */}
            {hud.pendingCombineTowerId === hud.selectedTower.id ? (
              <div className="flex flex-col gap-2 border-t border-[#E2C896]/15 pt-2.5">
                <div className="rounded-lg border-2 border-[#38BDF8]/50 bg-[#122230] px-2.5 py-2 text-xs font-semibold text-[#BAE6FD]">
                  Fusion Mode: click another base turret on the board ({FUSION_COST} Scrap).
                </div>
                <button
                  type="button"
                  onClick={onCancelCombine}
                  className="arcade-btn w-full cursor-pointer rounded-md border-2 border-[#38BDF8]/60 border-b-[#0369A1] bg-[#182938] py-1.5 text-xs font-extrabold text-[#BAE6FD] hover:brightness-110"
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
                    className={`arcade-btn w-full rounded-md border-2 py-2 text-xs font-black uppercase tracking-wide ${
                      hud.scrap >= hud.selectedTowerStats.upgradeCost
                        ? 'text-arcade-shadow cursor-pointer border-[#FEF08A]/70 border-b-[#92400E] bg-gradient-to-b from-[#FBBF24] to-[#D97706] text-white hover:brightness-105'
                        : 'cursor-not-allowed border-[#334155] border-b-[#090D12] bg-[#17202A] text-[#64748B]'
                    }`}
                  >
                    Upgrade MK {hud.selectedTower.level + 1} [U] ·{' '}
                    {hud.selectedTowerStats.upgradeCost} Scrap
                  </button>
                ) : (
                  <div className="w-full rounded-md border-2 border-[#34D399]/50 bg-[#122922] py-1.5 text-center text-xs font-extrabold uppercase text-[#34D399]">
                    Max Tier Reached
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onCyclePriority(hud.selectedTower!.id)}
                  className="arcade-btn flex w-full cursor-pointer items-center justify-between rounded-md border-2 border-[#334155] border-b-[#090D12] bg-[#17202A] px-3 py-1.5 text-xs font-bold text-[#EAE4D7] hover:border-[#FBBF24]"
                >
                  <span className="text-[#94A3B8]">Target Priority</span>
                  <span className="capitalize text-[#FBBF24]">{hud.selectedTower.priority}</span>
                </button>

                <div className="flex items-center gap-2">
                  {isBaseTowerType(hud.selectedTower.type) && (
                    <button
                      type="button"
                      data-testid="combine-tower-btn"
                      disabled={!hud.hasCombinePartner || hud.scrap < FUSION_COST}
                      onClick={() => onStartCombine(hud.selectedTower!.id)}
                      className={`arcade-btn flex-1 rounded-md border-2 px-2.5 py-1.5 text-xs font-extrabold whitespace-nowrap ${
                        hud.hasCombinePartner && hud.scrap >= FUSION_COST
                          ? 'cursor-pointer border-[#38BDF8]/70 border-b-[#0369A1] bg-[#162C3D] text-[#7DD3FC] hover:brightness-110'
                          : 'cursor-not-allowed border-[#334155] border-b-[#090D12] bg-[#17202A] text-[#64748B]'
                      }`}
                    >
                      {hud.hasCombinePartner ? `Combine [B] · ${FUSION_COST}` : 'Need 2nd Turret'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onSellTower(hud.selectedTower!.id)}
                    className={`arcade-btn cursor-pointer rounded-md border-2 border-[#EF4444]/60 border-b-[#7F1D1D] bg-[#3B171D] px-2.5 py-1.5 text-xs font-extrabold text-[#FCA5A5] hover:brightness-110 whitespace-nowrap ${
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

      {/* Bottom Dock: 6-Slot Lineup Deck Cards (ATK / RNG / SPA) + Wave Controls */}
      <div className="flex flex-col gap-2">
        <div className="ui-frame pointer-events-auto flex items-end justify-between gap-2.5 rounded-xl p-2">
          {/* All 6 Loadout Deck Slots */}
          <div className="flex items-stretch gap-1.5 overflow-x-auto pb-0.5 sm:gap-2 sm:pb-0">
            {deckSlots.map((towerId, idx) => {
              if (!towerId) {
                return (
                  <div
                    key={`locked-slot-${idx}`}
                    className="flex w-[132px] shrink-0 flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#334155]/75 bg-[#0C1117] p-2 text-center sm:w-[144px]"
                  >
                    <span className="font-mono-num text-[11px] font-bold text-[#475569]">
                      [{idx + 1}]
                    </span>
                    <span className="mt-1 text-[11px] font-bold text-[#475569]">Slot Open</span>
                  </div>
                );
              }

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
                  style={{
                    borderColor: active ? '#FBBF24' : tower.accentColor,
                  }}
                  className={`arcade-btn flex w-[138px] shrink-0 cursor-pointer flex-col justify-between rounded-lg border-2 border-b-[4px] p-2 text-left transition-colors sm:w-[154px] ${
                    active ? 'bg-[#1F2B38]' : 'bg-[#141C25] hover:bg-[#1B2531]'
                  } ${!affordable || capped ? 'opacity-65' : ''}`}
                >
                  {/* Card Top: Key + Name + Cost */}
                  <div className="flex items-center justify-between gap-1 text-[11px] font-extrabold">
                    <span className="text-arcade-shadow truncate text-white">
                      <span className="font-mono-num text-[#94A3B8]">[{idx + 1}]</span>{' '}
                      {tower.name}
                    </span>
                    <span
                      className={`font-mono-num text-arcade-shadow shrink-0 ${
                        affordable ? 'text-[#FBBF24]' : 'text-[#F87171]'
                      }`}
                    >
                      {tower.cost}
                    </span>
                  </div>

                  {/* Card Middle: 3D Portrait + Cap */}
                  <div className="my-1 flex items-center justify-between gap-1.5">
                    <TowerIcon type={tower.id} className="h-9 w-9 shrink-0" />
                    <span
                      className={`font-mono-num text-[11px] font-bold ${
                        typeCapped ? 'text-[#FB923C]' : 'text-[#CBD5E1]'
                      }`}
                    >
                      Cap {deployed}/{tower.maxCount}
                    </span>
                  </div>

                  {/* Card Bottom: ATK / RNG / SPA */}
                  <div className="grid grid-cols-3 gap-0.5 rounded bg-[#0C1117]/90 px-1 py-1 text-center font-mono-num text-[10px]">
                    <div>
                      <div className="text-[9px] font-bold text-[#64748B]">ATK</div>
                      <div className="font-extrabold text-white">{stats.attack}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-[#64748B]">RNG</div>
                      <div className="font-extrabold text-white">{stats.range}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-[#64748B]">SPA</div>
                      <div className="font-extrabold text-[#38BDF8]">{stats.spa}</div>
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
                      className={`arcade-btn cursor-pointer rounded-md border-2 px-2.5 py-1 text-[11px] font-extrabold whitespace-nowrap ${
                        priming
                          ? 'border-[#EF4444] border-b-[#7F1D1D] bg-[#3B1920] text-[#FCA5A5]'
                          : ready
                            ? 'border-[#38BDF8]/70 border-b-[#0369A1] bg-[#162939] text-white hover:brightness-110'
                            : 'cursor-not-allowed border-[#334155] border-b-[#090D12] bg-[#161E27] text-[#64748B]'
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
                className={`arcade-btn cursor-pointer rounded-lg border-2 px-3 py-2 text-xs font-extrabold uppercase tracking-wide whitespace-nowrap ${
                  hud.autoSkipWave
                    ? 'border-[#34D399]/75 border-b-[#065F46] bg-[#132C24] text-[#34D399]'
                    : 'border-[#334155] border-b-[#090D12] bg-[#161E27] text-[#94A3B8] hover:border-[#FBBF24]/50 hover:text-white'
                }`}
              >
                {hud.autoSkipWave
                  ? !hud.waveActive && hud.wave > 0 && hud.autoWaveTimer > 0
                    ? `Auto ${hud.autoWaveTimer.toFixed(1)}s`
                    : 'Auto: On'
                  : 'Auto: Off'}
              </button>

              {hud.waveActive ? (
                <div className="rounded-lg border-2 border-[#E2C896]/25 bg-[#151D26] px-3.5 py-2 text-xs font-bold text-[#EAE4D7] tabular-nums whitespace-nowrap">
                  Hostiles:{' '}
                  <span className="font-mono-num text-arcade-shadow font-black text-[#FBBF24]">
                    {hud.enemiesRemaining}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onStartWave}
                  data-testid="send-wave-btn"
                  className="font-display arcade-btn text-arcade-shadow cursor-pointer rounded-lg border-2 border-[#FEF08A]/70 border-b-[#92400E] bg-gradient-to-b from-[#FBBF24] to-[#D97706] px-4 py-2 text-xs font-black uppercase tracking-wide text-white hover:brightness-105 sm:px-5 sm:text-sm whitespace-nowrap"
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
