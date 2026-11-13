import type { PowerUpDef, PowerUpId } from '../game/types';

interface PowerUpModalProps {
  waveCleared: number;
  choices: PowerUpDef[];
  onPick: (id: PowerUpId) => void;
}

export function PowerUpModal({ waveCleared, choices, onPick }: PowerUpModalProps) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="powerup-title"
    >
      <div className="w-full max-w-3xl border border-[#E2C896]/25 bg-[#141A21] p-6 shadow-2xl">
        <div className="mb-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#E5A93C]">
            Wave {waveCleared} Cleared
          </div>
          <h2 id="powerup-title" className="font-display mt-1 text-2xl font-bold text-[#EAE4D7]">
            Select Tactical Power-Up
          </h2>
          <p className="mt-1 text-sm text-[#A39E93]">
            Choose one permanent run upgrade or active battlefield ability.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => onPick(choice.id)}
              className="flex cursor-pointer flex-col justify-between border border-[#E2C896]/20 bg-[#19222C] p-4 text-left transition-colors hover:border-[#E5A93C] hover:bg-[#222E3B]"
            >
              <div>
                <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider">
                  <span style={{ color: choice.accentColor }}>
                    {choice.category === 'active'
                      ? `Active Ability [${choice.hotkey}]`
                      : 'Passive Doctrine'}
                  </span>
                </div>
                <h3 className="font-display text-base font-bold text-[#EAE4D7]">
                  {choice.name}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-[#A39E93]">
                  {choice.desc}
                </p>
              </div>
              <div className="mt-4 border-t border-[#E2C896]/10 pt-2.5 text-xs font-bold text-[#E5A93C]">
                Deploy Upgrade
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
