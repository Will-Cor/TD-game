import { GAME_MODES, TOWER_DEFS } from '../game/catalog';
import type { GameScreenState, RunOutcome } from '../game/types';
import { ShardIcon, TowerIcon } from './TowerIcon';

interface StatusModalProps {
  screen: GameScreenState;
  outcome: RunOutcome | null;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  onOpenSettings?: () => void;
}

export function StatusModal({
  screen,
  outcome,
  onResume,
  onRestart,
  onMainMenu,
  onOpenSettings,
}: StatusModalProps) {
  if (screen === 'paused') {
    return (
      <div
        className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
      >
        <div className="w-full max-w-sm border border-[#E2C896]/25 bg-[#141A21] p-6 shadow-2xl">
          <h2 id="pause-title" className="font-display text-2xl font-bold text-[#EAE4D7]">
            Mission Paused
          </h2>
          <p className="mt-1 text-sm text-[#A39E93]">
            Simulation halted. Resume defense or return to command.
          </p>

          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="font-display cursor-pointer border border-[#FCD34D]/60 bg-[#E5A93C] py-2.5 text-sm font-bold text-[#11171D] hover:bg-[#F0B94D]"
            >
              Resume Mission
            </button>
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="arcade-btn cursor-pointer rounded-lg border-2 border-[#E2C896]/40 border-b-[#090D12] bg-[#18212C] py-2.5 text-sm font-bold text-[#EAE4D7] hover:border-[#FBBF24]"
              >
                Settings
              </button>
            )}
            <button
              type="button"
              onClick={onRestart}
              className="cursor-pointer border border-[#E2C896]/25 bg-[#19222C] py-2.5 text-sm font-semibold text-[#EAE4D7] hover:border-[#E5A93C]"
            >
              Restart Sector
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="cursor-pointer border border-[#E2C896]/15 bg-[#141A21] py-2.5 text-sm font-semibold text-[#A39E93] hover:text-[#EAE4D7]"
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
        <div className="w-full max-w-md border border-[#E2C896]/25 bg-[#141A21] p-6 shadow-2xl">
          <div
            className={`text-xs font-semibold uppercase tracking-wider ${
              outcome.victory ? 'text-[#34D399]' : 'text-[#EF4444]'
            }`}
          >
            Level {outcome.level} · {GAME_MODES[outcome.mode].name} ·{' '}
            {outcome.victory ? 'Sector Secured' : 'Bastion Breached'}
          </div>
          <h2 id="outcome-title" className="font-display mt-1 text-3xl font-bold text-[#EAE4D7]">
            {outcome.victory ? 'Victory' : 'Defeat'}
          </h2>

          {/* Mastery / Progress Stat Tiles */}
          <div className="mt-5 grid grid-cols-3 gap-2.5">
            <div className="border border-[#E2C896]/15 bg-[#19222C] p-3">
              <div className="text-[11px] uppercase text-[#94A3B8]">Waves</div>
              <div className="font-mono-num mt-0.5 text-lg font-bold text-[#EAE4D7]">
                {outcome.wavesCleared}
              </div>
            </div>
            <div className="border border-[#E2C896]/15 bg-[#19222C] p-3">
              <div className="text-[11px] uppercase text-[#94A3B8]">Defeated</div>
              <div className="font-mono-num mt-0.5 text-lg font-bold text-[#EAE4D7]">
                {outcome.enemiesDefeated}
              </div>
            </div>
            <div className="border border-[#E2C896]/15 bg-[#19222C] p-3">
              <div className="text-[11px] uppercase text-[#94A3B8]">Score</div>
              <div className="font-mono-num mt-0.5 text-lg font-bold text-[#EAE4D7]">
                {outcome.score}
              </div>
            </div>
          </div>

          {/* Newly Unlocked Turret Reward on Sector Completion */}
          {unlockedDef && (
            <div
              className="mt-4 flex items-center justify-between border border-[#34D399]/45 bg-[#122922] px-4 py-3"
              data-testid="unlocked-turret-reward"
            >
              <div className="flex items-center gap-3">
                <TowerIcon type={unlockedDef.id} className="h-9 w-9 shrink-0" />
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#34D399]">
                    New Turret Unlocked
                  </div>
                  <div className="font-display text-sm font-bold text-[#EAE4D7]">
                    {unlockedDef.name}
                  </div>
                  <div className="text-[11px] text-[#A39E93]">{unlockedDef.role}</div>
                </div>
              </div>
              <span className="font-mono-num text-xs font-bold text-[#E5A93C]">
                {unlockedDef.cost} Scrap
              </span>
            </div>
          )}

          {outcome.unlockedNextLevel && (
            <div
              className="mt-3 flex items-center justify-between border border-[#38BDF8]/40 bg-[#132533] px-4 py-2.5 text-xs"
              data-testid="unlocked-next-level"
            >
              <span className="font-semibold text-[#BAE6FD]">New Sector Available</span>
              <span className="font-mono-num font-bold text-[#38BDF8]">
                Level {outcome.unlockedNextLevel} Unlocked
              </span>
            </div>
          )}

          {/* Core Shards Earned Breakdown */}
          <div className="mt-4 flex items-center justify-between border border-[#E5A93C]/30 bg-[#1B232C] px-4 py-3">
            <div>
              <div className="text-xs font-semibold text-[#EAE4D7]">Core Shards Awarded</div>
              <div className="text-[11px] text-[#94A3B8] tabular-nums">
                Modifier & Mode Multiplier: {outcome.modifierMultiplier.toFixed(2)}x
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ShardIcon className="h-5 w-5" />
              <span className="font-mono-num text-2xl font-bold text-[#E5A93C]">
                +{outcome.shardsEarned}
              </span>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              data-start="true"
              onClick={onRestart}
              className="font-display flex-1 cursor-pointer border border-[#FCD34D]/60 bg-[#E5A93C] py-2.5 text-sm font-bold text-[#11171D] hover:bg-[#F0B94D] whitespace-nowrap"
            >
              Play Again
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="flex-1 cursor-pointer border border-[#E2C896]/25 bg-[#19222C] py-2.5 text-sm font-semibold text-[#EAE4D7] hover:border-[#E5A93C] whitespace-nowrap"
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
