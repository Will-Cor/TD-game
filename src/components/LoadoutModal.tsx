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
      <div className="ui-modal-frame flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl">
        {/* Slanted Gold Header + Corner X Close */}
        <div className="flex items-start justify-between gap-4 border-b border-[#E2C896]/15 px-6 pb-4 pt-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="ui-header-ribbon px-5 py-1.5">
                <h2
                  id="loadout-modal-title"
                  className="font-display text-arcade-shadow text-xl font-black uppercase tracking-wider text-white"
                >
                  Turret Units ({equippedCount}/{MAX_EQUIPPED_TURRETS})
                </h2>
              </div>
              <div
                className="rounded-md border-2 border-[#34D399]/60 bg-[#11241E] px-3 py-1 text-xs font-extrabold uppercase tracking-wide"
                data-testid="loadout-count"
              >
                <span className="text-[#94A3B8]">Deck </span>
                <span className="font-mono-num text-[#34D399]">
                  {equippedCount}/{MAX_EQUIPPED_TURRETS}
                </span>
              </div>
            </div>
            <p className="mt-2.5 text-xs font-medium text-[#A39E93]">
              Equip up to {MAX_EQUIPPED_TURRETS} unlocked turrets. Fused Super Turrets preserve both parent caps within the {MAX_ACTIVE_TOWERS}-unit Grid cap.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close turret units"
            className="ui-close-x shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Active 6-Slot Deck Bar */}
        <div className="border-b border-[#E2C896]/15 bg-[#131A22] px-6 py-4">
          <div className="mb-2.5 flex items-center justify-between text-xs">
            <span className="font-extrabold uppercase tracking-wider text-[#FBBF24]">
              Deployed Hotkey Deck (1–6)
            </span>
            <span className="text-[#94A3B8]">Click X or equip cards below</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {slots.map((towerId, idx) => {
              if (!towerId) {
                return (
                  <div
                    key={`empty-slot-${idx}`}
                    className="flex h-16 flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#334155] bg-[#0B1016] text-xs text-[#64748B]"
                  >
                    <span className="font-mono-num font-bold">Slot {idx + 1}</span>
                    <span className="text-[11px]">Empty</span>
                  </div>
                );
              }
              const def = TOWER_DEFS[towerId];
              const cantRemoveLast = equippedCount <= 1;
              return (
                <div
                  key={towerId}
                  style={{ borderColor: def.accentColor }}
                  className="flex h-16 items-center justify-between gap-2 rounded-lg border-2 bg-[#1A232E] px-2.5 shadow-[0_3px_0_#070A0E]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <TowerIcon type={towerId} className="h-8 w-8 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-arcade-shadow truncate font-display text-xs font-extrabold text-white">
                        {def.name}
                      </div>
                      <div className="font-mono-num text-arcade-shadow text-[11px] font-bold text-[#FBBF24]">
                        [{idx + 1}] · {def.cost}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={cantRemoveLast}
                    onClick={() => onToggleEquip(towerId)}
                    title={cantRemoveLast ? 'Keep at least 1 turret equipped' : `Remove ${def.name}`}
                    className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-black transition-colors ${
                      cantRemoveLast
                        ? 'cursor-not-allowed text-[#475569]'
                        : 'cursor-pointer text-[#94A3B8] hover:bg-[#7F1D1D] hover:text-white'
                    }`}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Armory Roster Grid (All 8 Base Turrets) */}
        <div className="grid grid-cols-1 gap-3.5 overflow-y-auto p-6 sm:grid-cols-2">
          {TOWER_LIST.map((tower) => {
            const unlocked = profile.unlockedTowers.includes(tower.id);
            const equippedIdx = profile.equippedLoadout.indexOf(tower.id);
            const equipped = equippedIdx !== -1;
            const cantRemoveLast = equipped && equippedCount <= 1;
            const cantAddFull = !equipped && full;
            const evoTier = profile.evolutions[tower.id]?.tier ?? 0;
            const spa = (1 / Math.max(0.05, tower.fireRate)).toFixed(2);

            return (
              <div
                key={tower.id}
                style={unlocked && equipped ? { borderColor: tower.accentColor } : undefined}
                className={`flex flex-col justify-between rounded-lg border-2 p-4 transition-colors ${
                  !unlocked
                    ? 'border-[#334155]/45 bg-[#121820] opacity-70'
                    : equipped
                      ? 'bg-[#17222B] shadow-[0_4px_0_#070A0E]'
                      : 'border-[#E2C896]/25 bg-[#151D26]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      style={unlocked ? { borderColor: tower.accentColor } : undefined}
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2 border-[#334155] bg-[#0D1319]"
                    >
                      <TowerIcon type={tower.id} className="h-9 w-9" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-arcade-shadow text-base font-extrabold text-white">
                          {tower.name}
                        </h3>
                        {evoTier > 0 && (
                          <span className="font-mono-num rounded bg-[#F59E0B]/20 px-1.5 py-0.5 text-[10px] font-black text-[#FBBF24]">
                            EVO {evoTier}/3
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-[#A39E93]">{tower.role}</p>
                    </div>
                  </div>

                  <div className="text-right text-xs">
                    <div className="font-mono-num text-arcade-shadow text-sm font-black text-[#FBBF24]">
                      {tower.cost} Scrap
                    </div>
                    <div className="font-mono-num text-[11px] font-bold text-[#94A3B8]">
                      Cap {tower.maxCount}/match
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-[#E2C896]/15 pt-3">
                  <div className="flex flex-wrap gap-3 font-mono-num text-xs font-bold text-[#CBD5E1] tabular-nums">
                    <span>ATK {tower.damage}</span>
                    <span>RNG {tower.range}</span>
                    <span>SPA {spa}s</span>
                    <span>Pierce {Math.round(tower.armorPierce * 100)}%</span>
                  </div>

                  {!unlocked ? (
                    <span className="text-xs font-bold text-[#94A3B8]">
                      Win {tower.unlockOrder} Sector{tower.unlockOrder === 1 ? '' : 's'}
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-testid={`equip-toggle-${tower.id}`}
                      disabled={cantRemoveLast || cantAddFull}
                      onClick={() => onToggleEquip(tower.id)}
                      className={`arcade-btn rounded-md border-2 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide whitespace-nowrap ${
                        equipped
                          ? cantRemoveLast
                            ? 'cursor-not-allowed border-[#334155] border-b-[#090D12] bg-[#141A21] text-[#64748B]'
                            : 'cursor-pointer border-[#F59E0B]/70 border-b-[#92400E] bg-[#2B2012] text-[#FDE68A] hover:brightness-110'
                          : cantAddFull
                            ? 'cursor-not-allowed border-[#334155] border-b-[#090D12] bg-[#141A21] text-[#64748B]'
                            : 'cursor-pointer border-[#34D399]/75 border-b-[#065F46] bg-[#133027] text-[#34D399] hover:brightness-110'
                      }`}
                    >
                      {equipped
                        ? cantRemoveLast
                          ? 'Min 1 Required'
                          : `Unequip [${equippedIdx + 1}]`
                        : cantAddFull
                          ? 'Deck Full'
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
