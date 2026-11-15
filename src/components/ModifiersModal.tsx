import { GAME_MODES, MODIFIERS } from '../game/catalog';
import {
  computeHazardRating,
  computeModifierRewardMultiplier,
  computeTotalRewardMultiplier,
} from '../game/progression';
import type { ModifierId, PlayerProfile } from '../game/types';

interface ModifiersModalProps {
  profile: PlayerProfile;
  onToggleModifier: (id: ModifierId) => void;
  onClearAll: () => void;
  onClose: () => void;
}

export function ModifiersModal({
  profile,
  onToggleModifier,
  onClearAll,
  onClose,
}: ModifiersModalProps) {
  const hazard = computeHazardRating(profile.activeModifiers);
  const modMult = computeModifierRewardMultiplier(profile.activeModifiers);
  const totalMult = computeTotalRewardMultiplier(
    profile.selectedMode,
    profile.activeModifiers,
  );

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mod-modal-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-sm border border-[#E2C896]/25 bg-[#10161D] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E2C896]/15 px-6 py-4">
          <div>
            <h2 id="mod-modal-title" className="font-display text-xl font-bold text-[#EAE4D7]">
              End-Game Challenge Modifiers
            </h2>
            <p className="mt-0.5 text-xs text-[#A39E93]">
              Activate tactical protocols to escalate wave difficulty and multiply Core Shard rewards.
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

        {/* Summary Strip */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2C896]/15 bg-[#141B23] px-6 py-3.5 text-sm">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <span className="text-xs text-[#94A3B8]">Hazard Level</span>
              <div className="font-mono-num text-lg font-bold text-[#EF4444]">
                Level {hazard}
              </div>
            </div>
            <div>
              <span className="text-xs text-[#94A3B8]">Modifier Bonus</span>
              <div className="font-mono-num text-lg font-bold text-[#EAE4D7]">
                {modMult.toFixed(2)}x
              </div>
            </div>
            <div>
              <span className="text-xs text-[#94A3B8]">
                Total ({GAME_MODES[profile.selectedMode].name})
              </span>
              <div className="font-mono-num text-lg font-bold text-[#E5A93C]">
                {totalMult.toFixed(2)}x Shards
              </div>
            </div>
          </div>
          {profile.activeModifiers.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="cursor-pointer rounded-sm border border-[#E2C896]/20 bg-[#17202A] px-3.5 py-1.5 text-xs font-semibold text-[#A39E93] transition-colors hover:border-[#E5A93C]/50 hover:text-[#EAE4D7]"
            >
              Reset Modifiers
            </button>
          )}
        </div>

        {/* Modifiers Grid */}
        <div className="grid grid-cols-1 gap-3 overflow-y-auto p-6 sm:grid-cols-2">
          {MODIFIERS.map((mod) => {
            const active = profile.activeModifiers.includes(mod.id);
            return (
              <button
                key={mod.id}
                type="button"
                aria-pressed={active}
                onClick={() => onToggleModifier(mod.id)}
                className={`flex cursor-pointer flex-col justify-between rounded-sm border p-4 text-left transition-colors ${
                  active
                    ? 'border-[#E5A93C] bg-[#1D2733] text-[#EAE4D7]'
                    : 'border-[#E2C896]/15 bg-[#151D26] text-[#A39E93] hover:border-[#E2C896]/40 hover:text-[#EAE4D7]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-display text-base font-bold">{mod.name}</span>
                  <span className="font-mono-num shrink-0 text-xs font-bold text-[#E5A93C]">
                    +{Math.round(mod.rewardBonus * 100)}% Shards
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed opacity-90">{mod.desc}</p>
                <div className="mt-3 flex items-center justify-between border-t border-[#E2C896]/10 pt-2.5 text-xs">
                  <span className="text-[#94A3B8]">Hazard +{mod.hazardPoints}</span>
                  <span className={active ? 'font-bold text-[#34D399]' : 'text-[#64748B]'}>
                    {active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
