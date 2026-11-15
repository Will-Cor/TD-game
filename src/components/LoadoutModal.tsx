import {
  MAX_ACTIVE_TOWERS,
  MAX_EQUIPPED_TURRETS,
  TOWER_DEFS,
  TOWER_LIST,
} from '../game/catalog';
import type { BaseTowerType, PlayerProfile } from '../game/types';
import { TowerIcon } from './TowerIcon';

interface LoadoutModalProps {
  profile: PlayerProfile;
  onToggleEquip: (towerId: BaseTowerType) => void;
  onClose: () => void;
}

export function LoadoutModal({ profile, onToggleEquip, onClose }: LoadoutModalProps) {
  const equippedCount = profile.equippedLoadout.length;
  const full = equippedCount >= MAX_EQUIPPED_TURRETS;
  const slots = Array.from(
    { length: MAX_EQUIPPED_TURRETS },
    (_, i) => profile.equippedLoadout[i] ?? null,
  );

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loadout-modal-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-sm border border-[#E2C896]/25 bg-[#10161D] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E2C896]/15 px-6 py-4">
          <div>
            <h2 id="loadout-modal-title" className="font-display text-xl font-bold text-[#EAE4D7]">
              Active Turret Lineup
            </h2>
            <p className="mt-0.5 text-xs text-[#A39E93]">
              Equip up to {MAX_EQUIPPED_TURRETS} unlocked turrets. Combined Super Turrets retain both parent caps within the {MAX_ACTIVE_TOWERS}-unit Grid limit.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="rounded-sm border border-[#E2C896]/20 bg-[#17202A] px-3.5 py-1.5 text-sm"
              data-testid="loadout-count"
            >
              <span className="text-[#A39E93]">Equipped </span>
              <span className="font-mono-num font-bold text-[#34D399]">
                {equippedCount}/{MAX_EQUIPPED_TURRETS}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-sm border border-[#E2C896]/20 bg-[#17202A] px-4 py-1.5 text-sm font-semibold text-[#EAE4D7] transition-colors hover:border-[#E5A93C]"
            >
              Close
            </button>
          </div>
        </div>

        {/* Active 6-Slot Bar */}
        <div className="border-b border-[#E2C896]/15 bg-[#141B23] px-6 py-4">
          <div className="mb-2.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-[#EAE4D7]">Deployed Hotkey Slots (1–6)</span>
            <span className="text-[#94A3B8]">Click Remove or toggle any turret below</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {slots.map((towerId, idx) => {
              if (!towerId) {
                return (
                  <div
                    key={`empty-slot-${idx}`}
                    className="flex h-16 flex-col items-center justify-center rounded-sm border border-dashed border-[#E2C896]/15 bg-[#10161D]/60 text-xs text-[#64748B]"
                  >
                    <span className="font-mono-num font-semibold">Slot {idx + 1}</span>
                    <span className="text-[11px]">Empty</span>
                  </div>
                );
              }
              const def = TOWER_DEFS[towerId];
              const cantRemoveLast = equippedCount <= 1;
              return (
                <div
                  key={towerId}
                  className="flex h-16 items-center justify-between gap-2 rounded-sm border border-[#E5A93C]/45 bg-[#1A232E] px-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <TowerIcon type={towerId} className="h-7 w-7 shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate font-display text-xs font-bold text-[#EAE4D7]">
                        {def.name}
                      </div>
                      <div className="font-mono-num text-[11px] text-[#E5A93C]">
                        [{idx + 1}] · {def.cost}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={cantRemoveLast}
                    onClick={() => onToggleEquip(towerId)}
                    title={cantRemoveLast ? 'Keep at least 1 turret equipped' : `Remove ${def.name}`}
                    className={`shrink-0 rounded-sm px-1.5 py-1 text-xs font-bold transition-colors ${
                      cantRemoveLast
                        ? 'cursor-not-allowed text-[#475569]'
                        : 'cursor-pointer text-[#94A3B8] hover:bg-[#2C181C] hover:text-[#FCA5A5]'
                    }`}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Armory Roster (All 8 Base Turrets) */}
        <div className="grid grid-cols-1 gap-3 overflow-y-auto p-6 sm:grid-cols-2">
          {TOWER_LIST.map((tower) => {
            const unlocked = profile.unlockedTowers.includes(tower.id);
            const equippedIdx = profile.equippedLoadout.indexOf(tower.id);
            const equipped = equippedIdx !== -1;
            const cantRemoveLast = equipped && equippedCount <= 1;
            const cantAddFull = !equipped && full;
            const evoTier = profile.evolutions[tower.id]?.tier ?? 0;

            return (
              <div
                key={tower.id}
                className={`flex flex-col justify-between rounded-sm border p-4 transition-colors ${
                  !unlocked
                    ? 'border-[#E2C896]/10 bg-[#121820] opacity-70'
                    : equipped
                      ? 'border-[#34D399]/50 bg-[#152028]'
                      : 'border-[#E2C896]/15 bg-[#161E27]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <TowerIcon type={tower.id} className="h-9 w-9 shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-base font-bold text-[#EAE4D7]">
                          {tower.name}
                        </h3>
                        {evoTier > 0 && (
                          <span className="font-mono-num text-[11px] font-bold text-[#E5A93C]">
                            Evo {evoTier}/3
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#A39E93]">{tower.role}</p>
                    </div>
                  </div>

                  <div className="text-right text-xs">
                    <div className="font-mono-num font-bold text-[#E5A93C]">
                      {tower.cost} Scrap
                    </div>
                    <div className="font-mono-num text-[11px] text-[#94A3B8]">
                      Max {tower.maxCount}/match
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#E2C896]/10 pt-3">
                  <div className="flex flex-wrap gap-3 text-xs text-[#94A3B8] tabular-nums">
                    <span>DMG {tower.damage}</span>
                    <span>RNG {tower.range}</span>
                    <span>ROF {tower.fireRate}/s</span>
                    <span>Pierce {Math.round(tower.armorPierce * 100)}%</span>
                  </div>

                  {!unlocked ? (
                    <span className="text-xs font-semibold text-[#64748B]">
                      Win {tower.unlockOrder} Sector{tower.unlockOrder === 1 ? '' : 's'} to Unlock
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-testid={`equip-toggle-${tower.id}`}
                      disabled={cantRemoveLast || cantAddFull}
                      onClick={() => onToggleEquip(tower.id)}
                      className={`rounded-sm border px-3.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                        equipped
                          ? cantRemoveLast
                            ? 'cursor-not-allowed border-[#E2C896]/15 bg-[#141A21] text-[#64748B]'
                            : 'cursor-pointer border-[#E5A93C]/50 bg-[#252017] text-[#FCD34D] hover:bg-[#352C1D]'
                          : cantAddFull
                            ? 'cursor-not-allowed border-[#E2C896]/10 bg-[#141A21] text-[#64748B]'
                            : 'cursor-pointer border-[#34D399]/60 bg-[#152D25] text-[#34D399] hover:bg-[#1C3D32]'
                      }`}
                    >
                      {equipped
                        ? cantRemoveLast
                          ? 'Required (Min 1)'
                          : `Unequip (Slot ${equippedIdx + 1})`
                        : cantAddFull
                          ? 'Lineup Full'
                          : 'Equip Turret'}
                    </button>
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
