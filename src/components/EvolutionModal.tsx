import { useState } from 'react';
import { TOWER_DEFS, TOWER_EVOLUTIONS, TOWER_LIST } from '../game/catalog';
import { getNextEvolutionCost } from '../game/progression';
import { computeTowerEffectiveStats } from '../game/simulation';
import type { ApexBranch, BaseTowerType, PlayerProfile } from '../game/types';
import { ShardIcon, TowerIcon } from './TowerIcon';

interface EvolutionModalProps {
  profile: PlayerProfile;
  onEvolve: (towerId: BaseTowerType) => void;
  onSelectApex: (towerId: BaseTowerType, branch: ApexBranch) => void;
  onClose: () => void;
}

export function EvolutionModal({
  profile,
  onEvolve,
  onSelectApex,
  onClose,
}: EvolutionModalProps) {
  const [selectedId, setSelectedId] = useState<BaseTowerType>(
    profile.equippedLoadout[0] ?? 'cannon',
  );

  const tower = TOWER_DEFS[selectedId];
  const unlocked = profile.unlockedTowers.includes(selectedId);
  const evoDef = TOWER_EVOLUTIONS[selectedId];
  const prog = profile.evolutions[selectedId] ?? { tier: 0, apexChoice: 'a' };
  const nextCost = getNextEvolutionCost(selectedId, prog.tier);
  const canAfford = unlocked && nextCost !== null && profile.shards >= nextCost;

  const dummyTower = {
    type: selectedId,
    level: 1 as const,
    onVantage: false,
    totalSpent: tower.cost,
  };
  const curStats = computeTowerEffectiveStats(dummyTower, {
    evolutionsSnapshot: profile.evolutions,
    passivePowerUps: [],
    overdriveTimer: 0,
  });
  const nextStats =
    prog.tier < 3
      ? computeTowerEffectiveStats(dummyTower, {
          evolutionsSnapshot: {
            ...profile.evolutions,
            [selectedId]: { ...prog, tier: (prog.tier + 1) as 1 | 2 | 3 },
          },
          passivePowerUps: [],
          overdriveTimer: 0,
        })
      : null;

  const dmgDelta = nextStats ? nextStats.damage - curStats.damage : 0;
  const rngDelta = nextStats ? Number((nextStats.range - curStats.range).toFixed(2)) : 0;
  const curSpa = Number((1 / Math.max(0.05, curStats.fireRate)).toFixed(2));
  const nextSpa = nextStats
    ? Number((1 / Math.max(0.05, nextStats.fireRate)).toFixed(2))
    : curSpa;
  const spaDelta = nextStats ? Number((nextSpa - curSpa).toFixed(2)) : 0;
  const piercePct = Math.round(curStats.armorPierce * 100);
  const nextPiercePct = nextStats ? Math.round(nextStats.armorPierce * 100) : piercePct;
  const pierceDelta = nextPiercePct - piercePct;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="evo-modal-title"
    >
      <div className="ui-modal-frame flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#E2C896]/15 px-6 pb-4 pt-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="ui-header-ribbon px-5 py-1.5">
                <h2
                  id="evo-modal-title"
                  className="font-display text-arcade-shadow text-xl font-black uppercase tracking-wider text-white"
                >
                  Evolution Hangar
                </h2>
              </div>
              <div className="flex items-center gap-2 rounded-md border-2 border-[#FBBF24]/60 bg-[#1B1710] px-3 py-1 text-sm">
                <ShardIcon className="h-4 w-4" />
                <span className="text-xs font-bold uppercase text-[#A39E93]">Shards</span>
                <span className="font-mono-num text-arcade-shadow font-black text-[#FBBF24]">
                  {profile.shards}
                </span>
              </div>
            </div>
            <p className="mt-2.5 text-xs font-medium text-[#A39E93]">
              Upgrade permanent turret tiers and pick Tier III Apex specializations.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close evolution hangar"
            className="ui-close-x shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Master-Detail Hangar Layout */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          {/* Left Turret Selector List */}
          <div className="flex w-full shrink-0 gap-1.5 overflow-x-auto border-b border-[#E2C896]/15 bg-[#121820] p-3 md:w-72 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
            {TOWER_LIST.map((t) => {
              const tUnlocked = profile.unlockedTowers.includes(t.id);
              const tProg = profile.evolutions[t.id] ?? { tier: 0, apexChoice: 'a' };
              const isSelected = selectedId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  data-testid={`evo-select-${t.id}`}
                  onClick={() => setSelectedId(t.id)}
                  className={`flex shrink-0 cursor-pointer items-center justify-between gap-3 rounded-lg border-2 px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? 'border-[#FBBF24] bg-[#1E2834] text-white'
                      : 'border-transparent bg-transparent text-[#A39E93] hover:border-[#E2C896]/25 hover:bg-[#18212B] hover:text-[#EAE4D7]'
                  } ${!tUnlocked ? 'opacity-60' : ''}`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <TowerIcon type={t.id} className="h-7 w-7 shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate font-display text-sm font-extrabold">{t.name}</div>
                      <div className="text-[11px] font-semibold text-[#94A3B8]">
                        {tUnlocked ? `Tier ${tProg.tier}/3` : `Locked · Win ${t.unlockOrder}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1" aria-hidden="true">
                    {[1, 2, 3].map((step) => (
                      <span
                        key={step}
                        className={`h-2.5 w-2.5 rounded-sm border border-black/50 ${
                          tProg.tier >= step ? 'bg-[#FBBF24]' : 'bg-[#283340]'
                        }`}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Focused Workstation Bench */}
          <div className="flex flex-1 flex-col justify-between overflow-y-auto p-6">
            <div>
              {/* Selected Chassis Header & Live Metrics */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E2C896]/15 pb-4">
                <div className="flex items-center gap-4">
                  <div
                    style={{ borderColor: tower.accentColor }}
                    className="flex h-14 w-14 items-center justify-center rounded-lg border-2 bg-[#17202A]"
                  >
                    <TowerIcon type={selectedId} className="h-10 w-10" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="font-display text-arcade-shadow text-2xl font-black text-white">
                        {tower.name}
                      </h3>
                      {!unlocked && (
                        <span className="text-xs font-bold text-[#F97316]">
                          Locked · Win {tower.unlockOrder} Sector{tower.unlockOrder === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-[#A39E93]">
                      {tower.role} · Cost {tower.cost} Scrap · Max {tower.maxCount}/match
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-bold uppercase text-[#94A3B8]">Evolution</div>
                  <div className="font-mono-num text-arcade-shadow text-xl font-black text-[#FBBF24]">
                    Tier {prog.tier} / 3
                  </div>
                </div>
              </div>

              {/* 4-Metric Chassis Telemetry (ATK / RNG / SPA / Pierce) */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border-2 border-[#E2C896]/20 bg-[#151D26] px-3.5 py-2.5">
                  <div className="text-[11px] font-bold uppercase text-[#94A3B8]">Attack</div>
                  <div className="font-mono-num mt-0.5 flex items-baseline gap-1.5 text-base font-black text-white">
                    <span>{curStats.damage}</span>
                    {dmgDelta > 0 && <span className="text-xs text-[#34D399]">+{dmgDelta}</span>}
                  </div>
                </div>
                <div className="rounded-lg border-2 border-[#E2C896]/20 bg-[#151D26] px-3.5 py-2.5">
                  <div className="text-[11px] font-bold uppercase text-[#94A3B8]">Range</div>
                  <div className="font-mono-num mt-0.5 flex items-baseline gap-1.5 text-base font-black text-white">
                    <span>{curStats.range}</span>
                    {rngDelta > 0 && <span className="text-xs text-[#34D399]">+{rngDelta}</span>}
                  </div>
                </div>
                <div className="rounded-lg border-2 border-[#E2C896]/20 bg-[#151D26] px-3.5 py-2.5">
                  <div className="text-[11px] font-bold uppercase text-[#94A3B8]">SPA</div>
                  <div className="font-mono-num mt-0.5 flex items-baseline gap-1.5 text-base font-black text-white">
                    <span>{curSpa.toFixed(2)}s</span>
                    {spaDelta < 0 && <span className="text-xs text-[#34D399]">{spaDelta}s</span>}
                  </div>
                </div>
                <div className="rounded-lg border-2 border-[#E2C896]/20 bg-[#151D26] px-3.5 py-2.5">
                  <div className="text-[11px] font-bold uppercase text-[#94A3B8]">Pierce</div>
                  <div className="font-mono-num mt-0.5 flex items-baseline gap-1.5 text-base font-black text-white">
                    <span>{piercePct}%</span>
                    {pierceDelta > 0 && (
                      <span className="text-xs text-[#34D399]">+{pierceDelta}%</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 3-Stage Evolution Path */}
              <div className="mt-5 space-y-3">
                {/* Tier 1 */}
                <div
                  className={`flex items-start justify-between gap-4 rounded-lg border-2 p-3.5 ${
                    prog.tier >= 1
                      ? 'border-[#34D399]/60 bg-[#122420]'
                      : prog.tier === 0 && unlocked
                        ? 'border-[#FBBF24]/60 bg-[#1B222B]'
                        : 'border-[#E2C896]/15 bg-[#141A21] opacity-70'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num text-xs font-black text-[#FBBF24]">TIER I</span>
                      <span className="font-display text-sm font-extrabold text-white">
                        {evoDef.tier1Name}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#A39E93]">{evoDef.tier1Desc}</p>
                  </div>
                  <span
                    className={`font-mono-num shrink-0 text-xs font-black ${
                      prog.tier >= 1 ? 'text-[#34D399]' : 'text-[#FBBF24]'
                    }`}
                  >
                    {prog.tier >= 1 ? 'Active' : `${evoDef.tier1Cost} Shards`}
                  </span>
                </div>

                {/* Tier 2 */}
                <div
                  className={`flex items-start justify-between gap-4 rounded-lg border-2 p-3.5 ${
                    prog.tier >= 2
                      ? 'border-[#34D399]/60 bg-[#122420]'
                      : prog.tier === 1 && unlocked
                        ? 'border-[#FBBF24]/60 bg-[#1B222B]'
                        : 'border-[#E2C896]/15 bg-[#141A21] opacity-70'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num text-xs font-black text-[#FBBF24]">TIER II</span>
                      <span className="font-display text-sm font-extrabold text-white">
                        {evoDef.tier2Name}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#A39E93]">{evoDef.tier2Desc}</p>
                  </div>
                  <span
                    className={`font-mono-num shrink-0 text-xs font-black ${
                      prog.tier >= 2 ? 'text-[#34D399]' : 'text-[#FBBF24]'
                    }`}
                  >
                    {prog.tier >= 2 ? 'Active' : `${evoDef.tier2Cost} Shards`}
                  </span>
                </div>

                {/* Tier 3 Apex Branches */}
                <div
                  className={`rounded-lg border-2 p-3.5 ${
                    prog.tier >= 3
                      ? 'border-[#FBBF24]/65 bg-[#1B222B]'
                      : prog.tier === 2 && unlocked
                        ? 'border-[#FBBF24]/50 bg-[#182028]'
                        : 'border-[#E2C896]/15 bg-[#141A21] opacity-75'
                  }`}
                >
                  <div className="mb-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num font-black text-[#FBBF24]">TIER III</span>
                      <span className="font-display text-sm font-extrabold text-white">
                        Apex Specialization (Choose Active Branch)
                      </span>
                    </div>
                    <span
                      className={`font-mono-num font-black ${
                        prog.tier >= 3 ? 'text-[#34D399]' : 'text-[#FBBF24]'
                      }`}
                    >
                      {prog.tier >= 3 ? 'Unlocked' : `${evoDef.apexCost} Shards`}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {(['a', 'b'] as const).map((branch) => {
                      const info = branch === 'a' ? evoDef.apexA : evoDef.apexB;
                      const active = prog.apexChoice === branch;
                      return (
                        <button
                          key={branch}
                          type="button"
                          disabled={prog.tier < 3}
                          onClick={() => onSelectApex(selectedId, branch)}
                          className={`rounded-lg border-2 p-3 text-left transition-colors ${
                            prog.tier < 3
                              ? 'border-[#E2C896]/10 bg-[#121820] text-[#64748B]'
                              : active
                                ? 'cursor-pointer border-[#FBBF24] bg-[#242F3D] text-white'
                                : 'cursor-pointer border-[#E2C896]/20 bg-[#141C24] text-[#A39E93] hover:border-[#E2C896]/45'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display text-sm font-extrabold">{info.name}</span>
                            {prog.tier >= 3 && active && (
                              <span className="text-xs font-black text-[#FBBF24]">Selected</span>
                            )}
                          </div>
                          <p className="mt-1 text-xs leading-relaxed opacity-90">{info.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Evolution Action */}
            <div className="mt-5 border-t border-[#E2C896]/15 pt-4">
              {!unlocked ? (
                <div className="rounded-lg border-2 border-[#334155] bg-[#151D26] py-3 text-center text-sm font-bold text-[#94A3B8]">
                  Win {tower.unlockOrder} Sector{tower.unlockOrder === 1 ? '' : 's'} to unlock {tower.name} evolutions
                </div>
              ) : nextCost !== null ? (
                <button
                  type="button"
                  data-testid="evolve-selected-btn"
                  disabled={!canAfford}
                  onClick={() => onEvolve(selectedId)}
                  className={`font-display arcade-btn w-full rounded-lg border-2 py-3 text-sm font-black uppercase tracking-wide ${
                    canAfford
                      ? 'text-arcade-shadow cursor-pointer border-[#FEF08A]/70 border-b-[#92400E] bg-gradient-to-b from-[#FBBF24] to-[#D97706] text-white hover:brightness-105'
                      : 'cursor-not-allowed border-[#334155] border-b-[#090D12] bg-[#161E27] text-[#64748B]'
                  }`}
                >
                  {profile.shards >= nextCost
                    ? `Evolve ${tower.name} to Tier ${prog.tier + 1} · ${nextCost} Shards`
                    : `Need ${nextCost} Shards to Evolve ${tower.name} (Have ${profile.shards})`}
                </button>
              ) : (
                <div className="rounded-lg border-2 border-[#34D399]/50 bg-[#122922] py-3 text-center text-sm font-extrabold text-[#34D399]">
                  Maximum Evolution Unlocked — Switch Apex Branch Anytime
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
