import {
  BASE_TOWER_TYPES,
  GAME_MODES,
  getLevelDef,
  MAX_EQUIPPED_TURRETS,
  MAX_LEVEL,
  MODIFIERS,
  rollRandomLevelModifiers,
} from '../game/catalog';
import { computeTotalRewardMultiplier } from '../game/progression';
import type { GameModeId, PlayerProfile } from '../game/types';
import { ShardIcon } from './TowerIcon';

interface TitleScreenProps {
  profile: PlayerProfile;
  onSelectMode: (mode: GameModeId) => void;
  onSelectLevel: (level: number) => void;
  onRerollLevelModifiers: (level: number) => void;
  onStartMission: () => void;
  onOpenLevels: () => void;
  onOpenLoadout: () => void;
  onOpenEvolutions: () => void;
  onOpenModifiers: () => void;
}

const MODE_ORDER: GameModeId[] = ['standard', 'blitz', 'endless'];

export function TitleScreen({
  profile,
  onSelectMode,
  onSelectLevel,
  onRerollLevelModifiers,
  onStartMission,
  onOpenLevels,
  onOpenLoadout,
  onOpenEvolutions,
  onOpenModifiers,
}: TitleScreenProps) {
  const modeDef = GAME_MODES[profile.selectedMode];
  const levelDef = getLevelDef(profile.selectedLevel);
  const levelSeed = profile.levelSeeds?.[levelDef.level] ?? levelDef.level * 1337 + 42;
  const levelRandomMods = rollRandomLevelModifiers(levelDef.level, levelSeed);
  const combinedMods = Array.from(new Set([...levelRandomMods, ...profile.activeModifiers]));

  const rewardMult = computeTotalRewardMultiplier(
    profile.selectedMode,
    combinedMods,
    levelDef.level,
  );
  const totalEvoTier = Object.values(profile.evolutions).reduce((acc, e) => acc + e.tier, 0);
  const maxEvoTiers = BASE_TOWER_TYPES.length * 3;
  const waveText =
    modeDef.totalWaves !== null ? `${modeDef.totalWaves + levelDef.wavesBonus} Waves` : 'Infinite';
  const hazardNames = levelRandomMods
    .map((id) => MODIFIERS.find((m) => m.id === id)?.name ?? id)
    .filter(Boolean);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-6 md:p-10 lg:p-14">
      {/* Contrast Scrim behind left command column */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 left-0 w-full max-w-2xl bg-gradient-to-r from-[#0B1015]/95 via-[#0B1015]/80 to-transparent"
      />

      {/* Top Right Quiet Resource Readout */}
      <div className="relative z-10 flex items-center justify-end">
        <div className="pointer-events-auto flex items-center gap-4 rounded-sm border border-[#E2C896]/20 bg-[#10161D]/95 px-4 py-2 text-sm shadow-lg">
          <div className="flex items-center gap-2">
            <ShardIcon className="h-4 w-4" />
            <span className="text-[#A39E93]">Shards</span>
            <span className="font-mono-num font-bold text-[#EAE4D7]">{profile.shards}</span>
          </div>
          <span className="text-[#475569]" aria-hidden="true">
            ·
          </span>
          <span className="text-[#A39E93] tabular-nums">
            Sector{' '}
            <strong className="font-semibold text-[#EAE4D7]">
              {profile.highestUnlockedLevel}/{MAX_LEVEL}
            </strong>
          </span>
          <span className="text-[#475569]" aria-hidden="true">
            ·
          </span>
          <span className="text-[#A39E93] tabular-nums">
            Turrets{' '}
            <strong className="font-semibold text-[#EAE4D7]">
              {profile.unlockedTowers.length}/{BASE_TOWER_TYPES.length}
            </strong>
          </span>
          <span className="text-[#475569]" aria-hidden="true">
            ·
          </span>
          <span className="text-[#A39E93] tabular-nums">
            Wins <strong className="font-semibold text-[#EAE4D7]">{profile.runsWon}</strong>
          </span>
        </div>
      </div>

      {/* Main Left Command Column (Clean, Uncluttered Hierarchy) */}
      <div className="pointer-events-auto relative z-10 my-auto max-w-lg">
        {/* Bespoke SVG Title Lockup */}
        <div className="mb-7">
          <svg
            viewBox="0 0 420 96"
            className="h-auto w-full max-w-[360px]"
            role="img"
            aria-label="Bastion Grid"
          >
            <g>
              <polygon
                points="28,12 52,25 52,55 28,68 4,55 4,25"
                fill="#1D2731"
                stroke="#E5A93C"
                strokeWidth="2.5"
              />
              <polygon
                points="28,22 42,30 42,50 28,58 14,50 14,30"
                fill="none"
                stroke="#34D399"
                strokeWidth="1.6"
              />
              <circle cx="28" cy="40" r="5" fill="#E5A93C" />
            </g>
            <text
              x="72"
              y="48"
              fill="#EAE4D7"
              fontFamily="Outfit, sans-serif"
              fontWeight="800"
              fontSize="40"
              letterSpacing="2"
            >
              BASTION GRID
            </text>
            <text
              x="74"
              y="72"
              fill="#A39E93"
              fontFamily="DM Sans, sans-serif"
              fontWeight="500"
              fontSize="14"
              letterSpacing="1.5"
            >
              PROCEDURAL SECTOR DEFENSE
            </text>
          </svg>
        </div>

        {/* Clean Segmented Operation Mode Bar */}
        <div className="mb-4">
          <div className="grid grid-cols-3 gap-1 rounded-sm border border-[#E2C896]/20 bg-[#10161D]/95 p-1">
            {MODE_ORDER.map((modeId) => {
              const m = GAME_MODES[modeId];
              const active = profile.selectedMode === modeId;
              return (
                <button
                  key={modeId}
                  type="button"
                  onClick={() => onSelectMode(modeId)}
                  className={`cursor-pointer rounded-sm px-3 py-2 text-center text-xs font-bold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-[#222E3B] text-[#E5A93C]'
                      : 'text-[#94A3B8] hover:text-[#EAE4D7]'
                  }`}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Clean Active Sector / Level Briefing Panel */}
        <div className="mb-6 rounded-sm border border-[#E2C896]/20 bg-[#10161D]/95 p-4 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Previous level"
                disabled={levelDef.level <= 1}
                onClick={() => onSelectLevel(levelDef.level - 1)}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm border border-[#E2C896]/20 bg-[#17202A] text-xs font-bold text-[#EAE4D7] hover:border-[#E5A93C] disabled:cursor-not-allowed disabled:opacity-35"
              >
                ‹
              </button>
              <div>
                <div className="font-mono-num text-[11px] font-bold text-[#E5A93C]">
                  LEVEL {levelDef.level} OF {MAX_LEVEL}
                </div>
                <div className="font-display text-base font-bold text-[#EAE4D7]">
                  {levelDef.name}
                </div>
              </div>
              <button
                type="button"
                aria-label="Next level"
                disabled={levelDef.level >= profile.highestUnlockedLevel}
                onClick={() => onSelectLevel(levelDef.level + 1)}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm border border-[#E2C896]/20 bg-[#17202A] text-xs font-bold text-[#EAE4D7] hover:border-[#E5A93C] disabled:cursor-not-allowed disabled:opacity-35"
              >
                ›
              </button>
            </div>

            <button
              type="button"
              data-testid="open-levels-btn"
              onClick={onOpenLevels}
              className="cursor-pointer rounded-sm border border-[#E2C896]/20 bg-[#17202A] px-3 py-1.5 text-xs font-semibold text-[#EAE4D7] hover:border-[#E5A93C] whitespace-nowrap"
            >
              All Levels
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[#E2C896]/10 pt-2.5 text-xs text-[#A39E93] tabular-nums">
            <span>{waveText}</span>
            <span aria-hidden="true">·</span>
            <span>{levelDef.enemyHpScale.toFixed(2)}x HP</span>
            <span aria-hidden="true">·</span>
            <span>{levelDef.enemySpeedScale.toFixed(2)}x Speed</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-[#34D399]">{rewardMult.toFixed(2)}x Shards</span>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <div className="truncate text-[#94A3B8]">
              Random Hazards:{' '}
              <span className={hazardNames.length > 0 ? 'text-[#EAE4D7]' : 'text-[#64748B]'}>
                {hazardNames.length > 0 ? hazardNames.join(', ') : 'None'}
              </span>
            </div>
            {levelDef.randomModifierCount > 0 && (
              <button
                type="button"
                onClick={() => onRerollLevelModifiers(levelDef.level)}
                className="shrink-0 cursor-pointer font-semibold text-[#38BDF8] hover:text-[#7DD3FC]"
              >
                Reroll
              </button>
            )}
          </div>
        </div>

        {/* Primary CTA + Compact Secondary Command Row */}
        <div className="flex flex-col items-start gap-3">
          <button
            type="button"
            data-start="true"
            onClick={onStartMission}
            className="font-display cursor-pointer rounded-sm border border-[#FCD34D]/60 bg-[#E5A93C] px-8 py-3 text-base font-bold text-[#11171D] shadow-lg transition-transform active:scale-[0.98] hover:bg-[#F0B94D] whitespace-nowrap"
          >
            Start Level {levelDef.level}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="open-loadout-btn"
              onClick={onOpenLoadout}
              className="cursor-pointer rounded-sm border border-[#E2C896]/20 bg-[#141B23] px-3.5 py-2 text-xs font-semibold text-[#EAE4D7] transition-colors hover:border-[#34D399]/70 hover:bg-[#1B2530] whitespace-nowrap"
            >
              Lineup{' '}
              <span className="font-mono-num text-[#34D399]">
                ({profile.equippedLoadout.length}/{MAX_EQUIPPED_TURRETS})
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenEvolutions}
              className="cursor-pointer rounded-sm border border-[#E2C896]/20 bg-[#141B23] px-3.5 py-2 text-xs font-semibold text-[#EAE4D7] transition-colors hover:border-[#E5A93C]/70 hover:bg-[#1B2530] whitespace-nowrap"
            >
              Evolutions{' '}
              <span className="font-mono-num text-[#E5A93C]">
                ({totalEvoTier}/{maxEvoTiers})
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenModifiers}
              className="cursor-pointer rounded-sm border border-[#E2C896]/20 bg-[#141B23] px-3.5 py-2 text-xs font-semibold text-[#EAE4D7] transition-colors hover:border-[#E5A93C]/70 hover:bg-[#1B2530] whitespace-nowrap"
            >
              Extra Modifiers{' '}
              {profile.activeModifiers.length > 0 && (
                <span className="font-mono-num text-[#E5A93C]">
                  ({profile.activeModifiers.length})
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Single Flat Borderless Control-Hint Line */}
      <div className="relative z-10 text-xs tracking-wide text-[#94A3B8]">
        Enter/Space Start · 1-6 Select Turret · Click Place/Inspect · Drag Pan · Right-Drag Orbit · Scroll Zoom · C Reset Cam
      </div>
    </div>
  );
}
