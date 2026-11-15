import { GAME_MODES, TOWER_DEFS } from '../game/catalog';
import type { GameScreenState, RunOutcome } from '../game/types';
import { ShardIcon, TowerIcon } from './TowerIcon';

interface StatusModalProps {
  screen: GameScreenState;
  outcome: RunOutcome | null;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
}

export function StatusModal({
  screen,
  outcome,
  onResume,
  onRestart,
  onMainMenu,
}: StatusModalProps) {
  if (screen === 'paused') {
    return (
      <div
        className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
      >
        <div className="ui-modal-frame w-full max-w-sm rounded-xl p-6">
          <div className="ui-header-ribbon px-5 py-1.5">
            <h2
              id="pause-title"
              className="font-display text-arcade-shadow text-xl font-black uppercase tracking-wider text-white"
            >
              Mission Paused
            </h2>
          </div>
          <p className="mt-3 text-sm font-medium text-[#A39E93]">
            Simulation halted. Resume defense or return to command.
          </p>

          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="font-display arcade-btn text-arcade-shadow cursor-pointer rounded-lg border-2 border-[#FEF08A]/70 border-b-[#92400E] bg-gradient-to-b from-[#FBBF24] to-[#D97706] py-2.5 text-sm font-black uppercase text-white hover:brightness-105"
            >
              Resume Mission
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="arcade-btn cursor-pointer rounded-lg border-2 border-[#38BDF8]/50 border-b-[#0369A1] bg-[#142533] py-2.5 text-sm font-bold text-[#EAE4D7] hover:brightness-110"
            >
              Restart Sector
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="arcade-btn cursor-pointer rounded-lg border-2 border-[#334155] border-b-[#090D12] bg-[#141A21] py-2.5 text-sm font-bold text-[#94A3B8] hover:text-white"
            >
              Main Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'gameover' && outcome) {
    const unlockedDef = outcome.unlockedTowerId ? TOWER_DEFS[outcome.unlockedTowerId] : null;
    return (
      <div
        className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="outcome-title"
      >
        <div className="ui-modal-frame w-full max-w-md rounded-xl p-6">
          <div className="ui-header-ribbon px-5 py-1.5">
            <h2
              id="outcome-title"
              className="font-display text-arcade-shadow text-2xl font-black uppercase tracking-wider text-white"
            >
              {outcome.victory ? 'Sector Victory' : 'Bastion Breached'}
            </h2>
          </div>

          <div
            className={`mt-3 text-xs font-extrabold uppercase tracking-wider ${
              outcome.victory ? 'text-[#34D399]' : 'text-[#F87171]'
            }`}
          >
            Level {outcome.level} · {GAME_MODES[outcome.mode].name} ·{' '}
            {outcome.victory ? 'Sector Secured' : 'Defeat'}
          </div>

          {/* Mastery / Progress Stat Tiles */}
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <div className="rounded-lg border-2 border-[#E2C896]/20 bg-[#151D26] p-3">
              <div className="text-[11px] font-bold uppercase text-[#94A3B8]">Waves</div>
              <div className="font-mono-num text-arcade-shadow mt-0.5 text-lg font-black text-white">
                {outcome.wavesCleared}
              </div>
            </div>
            <div className="rounded-lg border-2 border-[#E2C896]/20 bg-[#151D26] p-3">
              <div className="text-[11px] font-bold uppercase text-[#94A3B8]">Defeated</div>
              <div className="font-mono-num text-arcade-shadow mt-0.5 text-lg font-black text-white">
                {outcome.enemiesDefeated}
              </div>
            </div>
            <div className="rounded-lg border-2 border-[#E2C896]/20 bg-[#151D26] p-3">
              <div className="text-[11px] font-bold uppercase text-[#94A3B8]">Score</div>
              <div className="font-mono-num text-arcade-shadow mt-0.5 text-lg font-black text-white">
                {outcome.score}
              </div>
            </div>
          </div>

          {/* Newly Unlocked Turret Reward */}
          {unlockedDef && (
            <div
              className="mt-4 flex items-center justify-between rounded-lg border-2 border-[#34D399]/60 bg-[#122922] px-4 py-3"
              data-testid="unlocked-turret-reward"
            >
              <div className="flex items-center gap-3">
                <TowerIcon type={unlockedDef.id} className="h-9 w-9 shrink-0" />
                <div>
                  <div className="text-[11px] font-black uppercase tracking-wider text-[#34D399]">
                    New Turret Unlocked
                  </div>
                  <div className="font-display text-sm font-extrabold text-white">
                    {unlockedDef.name}
                  </div>
                  <div className="text-[11px] text-[#A39E93]">{unlockedDef.role}</div>
                </div>
              </div>
              <span className="font-mono-num text-arcade-shadow text-xs font-black text-[#FBBF24]">
                {unlockedDef.cost} Scrap
              </span>
            </div>
          )}

          {outcome.unlockedNextLevel && (
            <div
              className="mt-3 flex items-center justify-between rounded-lg border-2 border-[#38BDF8]/50 bg-[#132533] px-4 py-2.5 text-xs"
              data-testid="unlocked-next-level"
            >
              <span className="font-bold text-[#BAE6FD]">New Sector Available</span>
              <span className="font-mono-num font-black text-[#38BDF8]">
                Level {outcome.unlockedNextLevel} Unlocked
              </span>
            </div>
          )}

          {/* Core Shards Earned Breakdown */}
          <div className="mt-4 flex items-center justify-between rounded-lg border-2 border-[#FBBF24]/50 bg-[#1B232C] px-4 py-3">
            <div>
              <div className="text-xs font-bold text-white">Core Shards Awarded</div>
              <div className="text-[11px] text-[#94A3B8] tabular-nums">
                Reward Multiplier: {outcome.modifierMultiplier.toFixed(2)}x
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ShardIcon className="h-5 w-5" />
              <span className="font-mono-num text-arcade-shadow text-2xl font-black text-[#FBBF24]">
                +{outcome.shardsEarned}
              </span>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              data-start="true"
              onClick={onRestart}
              className="font-display arcade-btn text-arcade-shadow flex-1 cursor-pointer rounded-lg border-2 border-[#FEF08A]/70 border-b-[#92400E] bg-gradient-to-b from-[#FBBF24] to-[#D97706] py-2.5 text-sm font-black uppercase text-white hover:brightness-105 whitespace-nowrap"
            >
              Play Again
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="arcade-btn flex-1 cursor-pointer rounded-lg border-2 border-[#334155] border-b-[#090D12] bg-[#19222C] py-2.5 text-sm font-bold text-[#EAE4D7] hover:border-[#FBBF24] whitespace-nowrap"
            >
              Main Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
