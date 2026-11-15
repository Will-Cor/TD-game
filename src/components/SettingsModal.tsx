export interface GameSettings {
  disableDamageIndicators: boolean;
  showEnemyHpNumbers: boolean;
}

interface SettingsModalProps {
  settings: GameSettings;
  muted: boolean;
  onUpdateSettings: (patch: Partial<GameSettings>) => void;
  onToggleMute: () => void;
  onClose: () => void;
}

export function SettingsModal({
  settings,
  muted,
  onUpdateSettings,
  onToggleMute,
  onClose,
}: SettingsModalProps) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="ui-modal-frame w-full max-w-md rounded-xl p-6">
        <div className="flex items-start justify-between gap-3 border-b border-[#E2C896]/15 pb-4">
          <div className="ui-header-ribbon px-5 py-1.5">
            <h2
              id="settings-modal-title"
              className="font-display text-arcade-shadow text-xl font-black uppercase tracking-wider text-white"
            >
              Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="ui-close-x shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {/* Disable Damage Indicator */}
          <button
            type="button"
            role="switch"
            aria-checked={settings.disableDamageIndicators}
            data-testid="setting-disable-damage-indicators"
            onClick={() =>
              onUpdateSettings({
                disableDamageIndicators: !settings.disableDamageIndicators,
              })
            }
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border-2 border-[#E2C896]/25 bg-[#151D26] px-4 py-3 text-left transition-colors hover:border-[#FBBF24]/60"
          >
            <div>
              <div className="text-sm font-extrabold text-white">Disable Damage Indicator</div>
              <div className="mt-0.5 text-xs font-medium text-[#94A3B8]">
                Hide floating damage and bounty numbers above enemies during combat.
              </div>
            </div>
            <span
              className={`font-mono-num shrink-0 rounded-md border px-2.5 py-1 text-xs font-black uppercase ${
                settings.disableDamageIndicators
                  ? 'border-[#FBBF24] bg-[#F59E0B]/20 text-[#FBBF24]'
                  : 'border-[#334155] bg-[#0D1319] text-[#94A3B8]'
              }`}
            >
              {settings.disableDamageIndicators ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* See Enemy Health Numbers */}
          <button
            type="button"
            role="switch"
            aria-checked={settings.showEnemyHpNumbers}
            data-testid="setting-show-enemy-hp-numbers"
            onClick={() =>
              onUpdateSettings({
                showEnemyHpNumbers: !settings.showEnemyHpNumbers,
              })
            }
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border-2 border-[#E2C896]/25 bg-[#151D26] px-4 py-3 text-left transition-colors hover:border-[#FBBF24]/60"
          >
            <div>
              <div className="text-sm font-extrabold text-white">See Enemy Health Numbers</div>
              <div className="mt-0.5 text-xs font-medium text-[#94A3B8]">
                Show numeric HP values on enemy health bars (health bars remain visible).
              </div>
            </div>
            <span
              className={`font-mono-num shrink-0 rounded-md border px-2.5 py-1 text-xs font-black uppercase ${
                settings.showEnemyHpNumbers
                  ? 'border-[#34D399] bg-[#10B981]/20 text-[#34D399]'
                  : 'border-[#334155] bg-[#0D1319] text-[#94A3B8]'
              }`}
            >
              {settings.showEnemyHpNumbers ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Sound Toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={!muted}
            data-testid="setting-audio-toggle"
            onClick={onToggleMute}
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border-2 border-[#E2C896]/25 bg-[#151D26] px-4 py-3 text-left transition-colors hover:border-[#FBBF24]/60"
          >
            <div>
              <div className="text-sm font-extrabold text-white">Combat Audio</div>
              <div className="mt-0.5 text-xs font-medium text-[#94A3B8]">
                Synthesized turret fire, fusion chimes, and wave alerts.
              </div>
            </div>
            <span
              className={`font-mono-num shrink-0 rounded-md border px-2.5 py-1 text-xs font-black uppercase ${
                !muted
                  ? 'border-[#38BDF8] bg-[#0284C7]/20 text-[#38BDF8]'
                  : 'border-[#334155] bg-[#0D1319] text-[#94A3B8]'
              }`}
            >
              {!muted ? 'ON' : 'MUTED'}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="font-display arcade-btn text-arcade-shadow mt-5 w-full cursor-pointer rounded-lg border-2 border-[#FEF08A]/70 border-b-[#92400E] bg-gradient-to-b from-[#FBBF24] to-[#D97706] py-2.5 text-sm font-black uppercase text-white hover:brightness-105"
        >
          Done
        </button>
      </div>
    </div>
  );
}
