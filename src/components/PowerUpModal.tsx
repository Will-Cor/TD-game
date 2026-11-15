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
      <div className="ui-modal-frame w-full max-w-3xl rounded-xl p-6">
        <div className="mb-5">
          <div className="ui-header-ribbon px-5 py-1.5">
            <h2
              id="powerup-title"
              className="font-display text-arcade-shadow text-lg font-black uppercase tracking-wider text-white"
            >
              Wave {waveCleared} Cleared · Select Upgrade
            </h2>
          </div>
          <p className="mt-2.5 text-sm font-medium text-[#A39E93]">
            Choose one permanent run doctrine or active battlefield ability.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => onPick(choice.id)}
              style={{ borderColor: choice.accentColor }}
              className="arcade-btn flex cursor-pointer flex-col justify-between rounded-lg border-2 border-b-[4px] bg-[#161E28] p-4 text-left hover:bg-[#1E2A38]"
            >
              <div>
                <div className="mb-2 flex items-center justify-between text-[11px] font-black uppercase tracking-wider">
                  <span style={{ color: choice.accentColor }}>
                    {choice.category === 'active'
                      ? `Ability [${choice.hotkey}]`
                      : 'Passive Doctrine'}
                  </span>
                </div>
                <h3 className="font-display text-arcade-shadow text-base font-extrabold text-white">
                  {choice.name}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-[#CBD5E1]">{choice.desc}</p>
              </div>
              <div className="mt-4 border-t border-[#E2C896]/15 pt-2.5 text-xs font-extrabold uppercase tracking-wide text-[#FBBF24]">
                Deploy Upgrade
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
