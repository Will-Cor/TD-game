import type { PowerUpId, TowerType } from './types';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private lastShotTime = 0;

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
  ) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const pitchJitter = 0.92 + Math.random() * 0.16;

    osc.type = type;
    osc.frequency.setValueAtTime(freq * pitchJitter, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq * pitchJitter), now + duration);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  playPlace() {
    this.playTone(220, 340, 0.09, 'triangle', 0.08);
  }

  playUpgrade() {
    this.playTone(360, 540, 0.12, 'triangle', 0.08);
    setTimeout(() => this.playTone(540, 720, 0.14, 'sine', 0.07), 55);
  }

  playCombine() {
    this.playTone(280, 560, 0.14, 'triangle', 0.09);
    setTimeout(() => this.playTone(440, 880, 0.2, 'sine', 0.08), 70);
  }

  playSell() {
    this.playTone(420, 220, 0.11, 'sine', 0.07);
  }

  playShoot(towerType?: TowerType) {
    const now = performance.now();
    if (now - this.lastShotTime < 45) return;
    this.lastShotTime = now;

    if (
      towerType === 'cannon' ||
      towerType === 'vulcan_behemoth' ||
      towerType === 'frost_vulcan'
    ) {
      this.playTone(190, 75, 0.06, 'square', 0.032);
    } else if (towerType === 'cryo' || towerType === 'absolute_zero') {
      this.playTone(320, 140, 0.12, 'sine', 0.045);
    } else if (towerType === 'pyro' || towerType === 'inferno_hydra') {
      this.playTone(150, 95, 0.07, 'sawtooth', 0.03);
    } else if (towerType === 'missile' || towerType === 'salvo_bastion') {
      this.playTone(250, 80, 0.15, 'triangle', 0.05);
    } else if (towerType === 'laser' || towerType === 'solar_obelisk') {
      this.playTone(940, 620, 0.09, 'sine', 0.038);
    } else if (
      towerType === 'tesla' ||
      towerType === 'tempest_prism' ||
      towerType === 'tesla_nexus' ||
      towerType === 'storm_gatling' ||
      towerType === 'chrono' ||
      towerType === 'singularity_core'
    ) {
      this.playTone(720, 260, 0.09, 'sawtooth', 0.035);
    } else if (towerType) {
      this.playTone(560, 95, 0.18, 'sawtooth', 0.06);
    }
  }

  playKill(heavy?: boolean) {
    if (heavy) {
      this.playTone(140, 42, 0.24, 'sawtooth', 0.085);
    } else {
      this.playTone(260, 90, 0.08, 'triangle', 0.04);
    }
  }

  playWaveStart() {
    this.playTone(220, 330, 0.18, 'triangle', 0.08);
  }

  playWaveClear() {
    this.playTone(392, 523, 0.14, 'triangle', 0.07);
    setTimeout(() => this.playTone(523, 659, 0.18, 'triangle', 0.07), 90);
  }

  playAbility(id?: PowerUpId) {
    if (id === 'orbital_lance') {
      this.playTone(420, 60, 0.35, 'sawtooth', 0.09);
    } else if (id === 'emp_field') {
      this.playTone(680, 110, 0.28, 'sine', 0.08);
    } else {
      this.playTone(330, 660, 0.24, 'triangle', 0.07);
    }
  }

  playLeak() {
    this.playTone(180, 75, 0.25, 'sawtooth', 0.09);
  }

  playVictory() {
    const notes = [392, 493.88, 587.33, 783.99];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, n, 0.22, 'triangle', 0.08), idx * 95);
    });
  }

  playDefeat() {
    const notes = [293.66, 261.63, 220, 164.81];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, n * 0.92, 0.25, 'sawtooth', 0.065), idx * 120);
    });
  }
}

export const soundEngine = new SoundEngine();
