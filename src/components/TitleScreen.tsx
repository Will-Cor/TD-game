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
}: TitleScreenProps) {
  const modeDef = GAME_MODES[profile.selectedMode];
  const levelDef = getLevelDef(profile.selectedLevel);
  const levelSeed = profile.levelSeeds?.[levelDef.level] ?? levelDef.level * 1337 + 42;
  const levelRandomMods = rollRandomLevelModifiers(levelDef.level, levelSeed);

  const rewardMult = computeTotalRewardMultiplier(
    profile.selectedMode,
    levelRandomMods,
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

      {/* Top Right Resource Readout */}
      <div className="relative z-10 flex items-center justify-end">
        <div className="ui-frame pointer-events-auto flex items-center gap-4 rounded-lg px-4 py-2 text-sm">
          <div className="flex items-center gap-2">
            <ShardIcon className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-wide text-[#A39E93]">Shards</span>
            <span className="font-mono-num text-arcade-shadow text-base font-extrabold text-[#FBBF24]">
              {profile.shards}
            </span>
          </div>
          <span className="text-[#475569]" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-semibold text-[#A39E93] tabular-nums">
            Sector{' '}
            <strong className="font-mono-num text-arcade-shadow font-bold text-[#EAE4D7]">
              {profile.highestUnlockedLevel}/{MAX_LEVEL}
            </strong>
          </span>
          <span className="text-[#475569]" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-semibold text-[#A39E93] tabular-nums">
            Turrets{' '}
            <strong className="font-mono-num text-arcade-shadow font-bold text-[#EAE4D7]">
              {profile.unlockedTowers.length}/{BASE_TOWER_TYPES.length}
            </strong>
          </span>
          <span className="text-[#475569]" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-semibold text-[#A39E93] tabular-nums">
            Wins{' '}
            <strong className="font-mono-num text-arcade-shadow font-bold text-[#34D399]">
              {profile.runsWon}
            </strong>
          </span>
        </div>
      </div>

      {/* Main Left Command Column */}
      <div className="pointer-events-auto relative z-10 my-auto max-w-lg">
        {/* Bespoke SVG Title Lockup */}
        <div className="mb-6">
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
                stroke="#FBBF24"
                strokeWidth="3"
              />
              <polygon
                points="28,22 42,30 42,50 28,58 14,50 14,30"
                fill="none"
                stroke="#34D399"
                strokeWidth="1.8"
              />
              <circle cx="28" cy="40" r="5" fill="#FBBF24" />
            </g>
            <text
              x="72"
              y="48"
              fill="#FFFFFF"
              stroke="#070B10"
              strokeWidth="4"
              paintOrder="stroke"
              fontFamily="Outfit, sans-serif"
              fontWeight="900"
              fontSize="40"
              letterSpacing="2"
            >
              BASTION GRID
            </text>
            <text
              x="74"
              y="72"
              fill="#FBBF24"
              fontFamily="DM Sans, sans-serif"
              fontWeight="700"
              fontSize="13"
              letterSpacing="1.8"
            >
              TACTICAL 3D TOWER DEFENSE
            </text>
          </svg>
        </div>

        {/* Segmented Operation Mode Bar */}
        <div className="mb-3.5">
          <div className="ui-frame grid grid-cols-3 gap-1.5 rounded-lg p-1.5">
            {MODE_ORDER.map((modeId) => {
              const m = GAME_MODES[modeId];
              const active = profile.selectedMode === modeId;
              return (
                <button
                  key={modeId}
                  type="button"
                  onClick={() => onSelectMode(modeId)}
                  className={`arcade-btn cursor-pointer rounded-md border px-3 py-2 text-center text-xs font-extrabold uppercase tracking-wide whitespace-nowrap ${
                    active
                      ? 'border-[#FBBF24] border-b-[#B45309] bg-[#F59E0B] text-[#090D12]'
                      : 'border-[#253241] border-b-[#0B1016] bg-[#161F2A] text-[#94A3B8] hover:text-[#EAE4D7]'
                  }`}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Sector / Level Briefing Panel */}
        <div className="ui-frame mb-5 rounded-lg p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                aria-label="Previous level"
                disabled={levelDef.level <= 1}
                onClick={() => onSelectLevel(levelDef.level - 1)}
                className="arcade-btn flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[#334155] border-b-[#090D12] bg-[#17202A] text-sm font-black text-[#EAE4D7] hover:border-[#FBBF24] disabled:cursor-not-allowed disabled:opacity-35"
              >
                ‹
              </button>
              <div>
                <div className="font-mono-num text-[11px] font-extrabold text-[#FBBF24]">
                  LEVEL {levelDef.level} OF {MAX_LEVEL} · {levelDef.biome.toUpperCase()}
                </div>
                <div className="font-display text-arcade-shadow text-lg font-extrabold text-white">
                  {levelDef.name}
                </div>
              </div>
              <button
                type="button"
                aria-label="Next level"
                disabled={levelDef.level >= profile.highestUnlockedLevel}
                onClick={() => onSelectLevel(levelDef.level + 1)}
                className="arcade-btn flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-[#334155] border-b-[#090D12] bg-[#17202A] text-sm font-black text-[#EAE4D7] hover:border-[#FBBF24] disabled:cursor-not-allowed disabled:opacity-35"
              >
                ›
              </button>
            </div>

            <button
              type="button"
              data-testid="open-levels-btn"
              onClick={onOpenLevels}
              className="arcade-btn cursor-pointer rounded-md border border-[#38BDF8]/65 border-b-[#0369A1] bg-[#0F293A] px-3.5 py-1.5 text-xs font-extrabold text-[#BAE6FD] hover:brightness-110 whitespace-nowrap"
            >
              All Levels
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[#E2C896]/15 pt-2.5 text-xs font-semibold text-[#A39E93] tabular-nums">
            <span>{waveText}</span>
            <span aria-hidden="true">·</span>
            <span>{levelDef.enemyHpScale.toFixed(2)}x HP</span>
            <span aria-hidden="true">·</span>
            <span>{levelDef.enemySpeedScale.toFixed(2)}x Speed</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num text-arcade-shadow font-extrabold text-[#34D399]">
              {rewardMult.toFixed(2)}x Shards
            </span>
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2 rounded-md border border-[#F97316]/35 bg-[#161B22] px-3 py-1.5 text-xs">
            <div className="truncate font-semibold text-[#94A3B8]">
              Level Hazards:{' '}
              <span className="font-bold text-[#FDBA74]">
                {hazardNames.length > 0 ? hazardNames.join(', ') : 'Standard'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onRerollLevelModifiers(levelDef.level)}
              className="shrink-0 cursor-pointer font-extrabold text-[#38BDF8] hover:text-[#7DD3FC]"
            >
              Reroll
            </button>
          </div>
        </div>

        {/* Primary CTA + Secondary Command Row */}
        <div className="flex flex-col items-start gap-3">
          <button
            type="button"
            data-start="true"
            onClick={onStartMission}
            className="font-display arcade-btn text-arcade-shadow cursor-pointer rounded-lg border-2 border-[#FEF08A]/70 border-b-[4px] border-b-[#92400E] bg-gradient-to-b from-[#FBBF24] to-[#D97706] px-9 py-3 text-lg font-black uppercase tracking-wide text-white shadow-xl hover:brightness-105 whitespace-nowrap"
          >
            Start Level {levelDef.level}
          </button>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              data-testid="open-loadout-btn"
              onClick={onOpenLoadout}
              className="arcade-btn cursor-pointer rounded-lg border-2 border-[#34D399]/70 border-b-[#065F46] bg-[#122620] px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-[#EAE4D7] hover:brightness-110 whitespace-nowrap"
            >
              Lineup{' '}
              <span className="font-mono-num text-[#34D399]">
                ({profile.equippedLoadout.length}/{MAX_EQUIPPED_TURRETS})
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenEvolutions}
              className="arcade-btn cursor-pointer rounded-lg border-2 border-[#F59E0B]/70 border-b-[#92400E] bg-[#241B10] px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-[#EAE4D7] hover:brightness-110 whitespace-nowrap"
            >
              Evolutions{' '}
              <span className="font-mono-num text-[#FBBF24]">
                ({totalEvoTier}/{maxEvoTiers})
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Single Crisp Control-Hint Strip */}
      <div className="ui-frame relative z-10 inline-block self-start rounded-md px-3 py-1 text-xs font-semibold tracking-wide text-[#CBD5E1]">
        Enter/Space Start · 1-6 Select Turret · T Ping · V Path · Click Place/Inspect · Right-Drag Orbit · Scroll Zoom · C Reset Cam
      </div>
    </div>
  );
}
