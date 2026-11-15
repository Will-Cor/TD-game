import {
  GAME_MODES,
  LEVEL_DEFS,
  MAX_LEVEL,
  MODIFIERS,
  rollRandomLevelModifiers,
} from '../game/catalog';
import { computeTotalRewardMultiplier } from '../game/progression';
import type { PlayerProfile } from '../game/types';

interface LevelSelectModalProps {
  profile: PlayerProfile;
  onSelectLevel: (level: number) => void;
  onRerollLevelModifiers: (level: number) => void;
  onClose: () => void;
}

export function LevelSelectModal({
  profile,
  onSelectLevel,
  onRerollLevelModifiers,
  onClose,
}: LevelSelectModalProps) {
  const modeDef = GAME_MODES[profile.selectedMode];

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="level-modal-title"
    >
      <div className="ui-modal-frame flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl">
        {/* Slanted Gold Header Banner + Corner X Close */}
        <div className="flex items-start justify-between border-b border-[#E2C896]/15 px-6 pb-4 pt-4">
          <div>
            <div className="ui-header-ribbon px-5 py-1.5">
              <h2
                id="level-modal-title"
                className="font-display text-arcade-shadow text-xl font-black uppercase tracking-wider text-white"
              >
                Campaign Sectors (1–{MAX_LEVEL})
              </h2>
            </div>
            <p className="mt-2.5 text-xs font-medium text-[#A39E93]">
              Every sector rolls unique random battlefield hazards and distinct terrain trails. Clear a sector to unlock the next level.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close campaign sectors"
            className="ui-close-x shrink-0"
          >
            ✕
          </button>
        </div>

        {/* 8-Level Grid */}
        <div className="grid grid-cols-1 gap-3.5 overflow-y-auto p-6 sm:grid-cols-2">
          {LEVEL_DEFS.map((lvl) => {
            const unlocked = lvl.level <= profile.highestUnlockedLevel;
            const selected = profile.selectedLevel === lvl.level;
            const seed = profile.levelSeeds?.[lvl.level] ?? lvl.level * 1337 + 42;
            const randomMods = rollRandomLevelModifiers(lvl.level, seed);
            const modNames = randomMods
              .map((id) => MODIFIERS.find((m) => m.id === id)?.name ?? id)
              .filter(Boolean);
            const totalMult = computeTotalRewardMultiplier(
              profile.selectedMode,
              randomMods,
              lvl.level,
            );
            const waveCount =
              modeDef.totalWaves !== null ? `${modeDef.totalWaves + lvl.wavesBonus} Waves` : 'Endless';

            return (
              <div
                key={lvl.level}
                data-testid={`level-card-${lvl.level}`}
                className={`flex flex-col justify-between rounded-lg border-2 p-4 transition-colors ${
                  !unlocked
                    ? 'border-[#334155]/45 bg-[#121820] opacity-60'
                    : selected
                      ? 'border-[#FBBF24] bg-[#1C2632] shadow-[0_4px_0_#92400E]'
                      : 'border-[#E2C896]/25 bg-[#151D26]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono-num rounded bg-[#F59E0B]/20 px-1.5 py-0.5 text-xs font-black text-[#FBBF24]">
                          LV.{lvl.level}
                        </span>
                        <h3 className="font-display text-arcade-shadow text-base font-extrabold text-white">
                          {lvl.name}
                        </h3>
                      </div>
                      <p className="mt-1 text-xs font-medium text-[#94A3B8]">
                        {lvl.biome} · {waveCount} · {lvl.enemyHpScale.toFixed(2)}x HP ·{' '}
                        {lvl.enemySpeedScale.toFixed(2)}x Speed
                      </p>
                    </div>
                    <span className="font-mono-num text-arcade-shadow shrink-0 text-xs font-extrabold text-[#34D399]">
                      {totalMult.toFixed(2)}x Shards
                    </span>
                  </div>

                  {/* Random Level Modifiers Readout */}
                  <div className="mt-3 rounded-md border border-[#F97316]/25 bg-[#10161D] px-3 py-2 text-xs">
                    <span className="font-semibold text-[#94A3B8]">Random Hazards: </span>
                    <span className="font-bold text-[#FDBA74]">
                      {modNames.length > 0 ? modNames.join(' · ') : 'Standard'}
                    </span>
                  </div>
                </div>

                <div className="mt-3.5 flex items-center justify-between gap-2 pt-0.5">
                  {!unlocked ? (
                    <span className="text-xs font-semibold text-[#64748B]">
                      Locked · Clear Level {lvl.level - 1} to Unlock
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        data-testid={`select-level-${lvl.level}`}
                        onClick={() => {
                          onSelectLevel(lvl.level);
                          onClose();
                        }}
                        className={`arcade-btn cursor-pointer rounded-md border-2 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide ${
                          selected
                            ? 'border-[#FEF08A]/70 border-b-[#92400E] bg-[#F59E0B] text-[#090D12]'
                            : 'border-[#34D399]/60 border-b-[#065F46] bg-[#132C24] text-[#34D399] hover:brightness-110'
                        }`}
                      >
                        {selected ? 'Selected' : `Deploy Lv.${lvl.level}`}
                      </button>

                      <button
                        type="button"
                        data-testid={`reroll-level-mods-${lvl.level}`}
                        onClick={() => onRerollLevelModifiers(lvl.level)}
                        className="arcade-btn cursor-pointer rounded-md border-2 border-[#38BDF8]/40 border-b-[#0C4A6E] bg-[#13202C] px-3 py-1.5 text-xs font-bold text-[#7DD3FC] hover:brightness-110"
                      >
                        Reroll Hazards
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
