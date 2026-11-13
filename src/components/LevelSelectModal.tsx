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
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-sm border border-[#E2C896]/25 bg-[#10161D] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E2C896]/15 px-6 py-4">
          <div>
            <h2 id="level-modal-title" className="font-display text-xl font-bold text-[#EAE4D7]">
              Campaign Sectors (Levels 1–{MAX_LEVEL})
            </h2>
            <p className="mt-0.5 text-xs text-[#A39E93]">
              Each sector escalates enemy hull HP, speed, and wave count while rolling random battlefield hazards. Win a sector to unlock the next level.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-sm border border-[#E2C896]/20 bg-[#17202A] px-4 py-1.5 text-sm font-semibold text-[#EAE4D7] transition-colors hover:border-[#E5A93C]"
          >
            Done
          </button>
        </div>

        {/* 8-Level Grid */}
        <div className="grid grid-cols-1 gap-3 overflow-y-auto p-6 sm:grid-cols-2">
          {LEVEL_DEFS.map((lvl) => {
            const unlocked = lvl.level <= profile.highestUnlockedLevel;
            const selected = profile.selectedLevel === lvl.level;
            const seed = profile.levelSeeds?.[lvl.level] ?? lvl.level * 1337 + 42;
            const randomMods = rollRandomLevelModifiers(lvl.level, seed);
            const modNames = randomMods
              .map((id) => MODIFIERS.find((m) => m.id === id)?.name ?? id)
              .filter(Boolean);
            const combinedMods = Array.from(new Set([...randomMods, ...profile.activeModifiers]));
            const totalMult = computeTotalRewardMultiplier(
              profile.selectedMode,
              combinedMods,
              lvl.level,
            );
            const waveCount =
              modeDef.totalWaves !== null ? `${modeDef.totalWaves + lvl.wavesBonus} Waves` : 'Endless';

            return (
              <div
                key={lvl.level}
                data-testid={`level-card-${lvl.level}`}
                className={`flex flex-col justify-between rounded-sm border p-4 transition-colors ${
                  !unlocked
                    ? 'border-[#E2C896]/10 bg-[#121820] opacity-60'
                    : selected
                      ? 'border-[#E5A93C] bg-[#1C2632]'
                      : 'border-[#E2C896]/15 bg-[#151D26]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono-num text-xs font-bold text-[#E5A93C]">
                          LEVEL {lvl.level}
                        </span>
                        <h3 className="font-display text-base font-bold text-[#EAE4D7]">
                          {lvl.name}
                        </h3>
                      </div>
                      <p className="mt-0.5 text-xs text-[#94A3B8]">
                        {waveCount} · {lvl.enemyHpScale.toFixed(2)}x HP ·{' '}
                        {lvl.enemySpeedScale.toFixed(2)}x Speed
                      </p>
                    </div>
                    <span className="font-mono-num shrink-0 text-xs font-bold text-[#34D399]">
                      {totalMult.toFixed(2)}x Shards
                    </span>
                  </div>

                  {/* Random Level Modifiers Readout */}
                  <div className="mt-3 border-t border-[#E2C896]/10 pt-2.5 text-xs">
                    <span className="text-[#94A3B8]">Random Hazards: </span>
                    <span className={modNames.length > 0 ? 'font-medium text-[#EAE4D7]' : 'text-[#64748B]'}>
                      {modNames.length > 0 ? modNames.join(' · ') : 'None (Entry Sector)'}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 pt-1">
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
                        className={`cursor-pointer rounded-sm border px-3.5 py-1.5 text-xs font-bold transition-colors ${
                          selected
                            ? 'border-[#FCD34D]/60 bg-[#E5A93C] text-[#11171D]'
                            : 'border-[#E2C896]/25 bg-[#1B2530] text-[#EAE4D7] hover:border-[#E5A93C]'
                        }`}
                      >
                        {selected ? 'Selected' : `Deploy Level ${lvl.level}`}
                      </button>

                      {lvl.randomModifierCount > 0 && (
                        <button
                          type="button"
                          data-testid={`reroll-level-mods-${lvl.level}`}
                          onClick={() => onRerollLevelModifiers(lvl.level)}
                          className="cursor-pointer rounded-sm border border-[#E2C896]/20 bg-[#141A21] px-3 py-1.5 text-xs font-semibold text-[#A39E93] transition-colors hover:border-[#38BDF8]/60 hover:text-[#EAE4D7]"
                        >
                          Reroll Hazards
                        </button>
                      )}
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
