import { useCallback, useEffect, useRef, useState } from 'react';
import { EvolutionModal } from './components/EvolutionModal';
import { extractHudSnapshot, GameHud, type HudSnapshot } from './components/GameHud';
import { LevelSelectModal } from './components/LevelSelectModal';
import { LoadoutModal } from './components/LoadoutModal';
import { PowerUpModal } from './components/PowerUpModal';
import { StatusModal } from './components/StatusModal';
import { TitleScreen } from './components/TitleScreen';
import { soundEngine } from './game/audio';
import { MAX_EQUIPPED_TURRETS, MAX_LEVEL, TOWER_DEFS } from './game/catalog';
import { generateRandomMap } from './game/mapGen';
import {
  evolveTowerInProfile,
  loadProfile,
  rerollLevelSeedInProfile,
  saveProfile,
  setTowerApexChoice,
  toggleEquipTowerInProfile,
} from './game/progression';
import { BastionScene3D, type BoardClickEvent, type PanKeysState } from './game/scene3d';
import {
  addTacticalPing,
  applyPowerUpChoice,
  canCombineTowers,
  combineTowers,
  createRunState,
  cycleTowerPriority,
  getTowerCoords,
  placeTower,
  rerollRunMap,
  sellTower,
  type SimEvent,
  startNextWave,
  stepSimulation,
  triggerActiveAbility,
  upgradeTower,
} from './game/simulation';
import type {
  ApexBranch,
  GameModeId,
  GameScreenState,
  PlayerProfile,
  PowerUpDef,
  PowerUpId,
  RunOutcome,
  RunState,
} from './game/types';

export default function App() {
  const initialAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [profile, setProfile] = useState<PlayerProfile>(() => {
    const p = loadProfile();
    soundEngine.setMuted(p.muted);
    return p;
  });

  const [screen, setScreen] = useState<GameScreenState>(
    initialAutostart ? 'playing' : 'title',
  );
  const [titleModal, setTitleModal] = useState<'none' | 'levels' | 'loadout' | 'evolutions'>(
    'none',
  );
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [draftChoices, setDraftChoices] = useState<{ wave: number; choices: PowerUpDef[] } | null>(
    null,
  );
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<BastionScene3D | null>(null);
  const titleMapRef = useRef(generateRandomMap(undefined, profile.selectedLevel));
  const runRef = useRef<RunState | null>(null);
  const screenRef = useRef<GameScreenState>(screen);
  const profileRef = useRef<PlayerProfile>(profile);
  const hoverPointRef = useRef<{ col: number; row: number; simX: number; simY: number } | null>(
    null,
  );
  const titleModalRef = useRef(titleModal);
  const panKeysRef = useRef<PanKeysState>({
    up: false,
    down: false,
    left: false,
    right: false,
  });

  useEffect(() => {
    profileRef.current = profile;
    saveProfile(profile);
  }, [profile]);

  useEffect(() => {
    screenRef.current = screen;
    document.body.dataset.state = screen;
  }, [screen]);

  useEffect(() => {
    titleModalRef.current = titleModal;
  }, [titleModal]);

  const syncHudFromRun = useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    setHud(extractHudSnapshot(run));
    setDraftChoices(run.draftOptions ? { wave: run.wave, choices: run.draftOptions } : null);
  }, []);

  const handleSimEvent = useCallback((ev: SimEvent) => {
    const scene3d = sceneRef.current;
    const run = runRef.current;

    if (ev.type === 'shoot') {
      soundEngine.playShoot(ev.towerType);
    } else if (ev.type === 'combine') {
      soundEngine.playCombine();
    } else if (ev.type === 'kill') {
      soundEngine.playKill(ev.heavy);
    } else if (ev.type === 'leak') {
      soundEngine.playLeak();
    } else if (ev.type === 'wave_start') {
      soundEngine.playWaveStart();
    } else if (ev.type === 'wave_clear') {
      soundEngine.playWaveClear();
    } else if (ev.type === 'ability') {
      soundEngine.playAbility(ev.abilityId);
      if (run && scene3d && ev.abilityId === 'orbital_lance') {
        const lastRing = run.rings[run.rings.length - 1];
        if (lastRing) scene3d.spawnBurst(lastRing.x, lastRing.y, '#EF4444', 28, 4.6);
      }
    } else if (ev.type === 'victory' || ev.type === 'defeat') {
      if (ev.type === 'victory') soundEngine.playVictory();
      else soundEngine.playDefeat();
    }
  }, []);

  const finalizeRunOutcome = useCallback((runOutcome: RunOutcome) => {
    setOutcome(runOutcome);
    setScreen('gameover');
    screenRef.current = 'gameover';
    document.body.dataset.state = 'gameover';

    setProfile((prev) => {
      const mode = runOutcome.mode;
      const unlockedTowerId = runOutcome.unlockedTowerId;
      const nextUnlockedTowers =
        unlockedTowerId && !prev.unlockedTowers.includes(unlockedTowerId)
          ? [...prev.unlockedTowers, unlockedTowerId]
          : prev.unlockedTowers;
      const nextEquippedLoadout =
        unlockedTowerId &&
        !prev.equippedLoadout.includes(unlockedTowerId) &&
        prev.equippedLoadout.length < MAX_EQUIPPED_TURRETS
          ? [...prev.equippedLoadout, unlockedTowerId]
          : prev.equippedLoadout;

      const unlockedNext = runOutcome.unlockedNextLevel;
      const nextHighestLevel = unlockedNext
        ? Math.max(prev.highestUnlockedLevel, Math.min(MAX_LEVEL, unlockedNext))
        : prev.highestUnlockedLevel;
      const nextSelectedLevel =
        unlockedNext && prev.selectedLevel < unlockedNext
          ? Math.min(MAX_LEVEL, unlockedNext)
          : prev.selectedLevel;

      const baseProfile: PlayerProfile = {
        ...prev,
        shards: prev.shards + runOutcome.shardsEarned,
        totalShardsEarned: prev.totalShardsEarned + runOutcome.shardsEarned,
        runsCompleted: prev.runsCompleted + 1,
        runsWon: prev.runsWon + (runOutcome.victory ? 1 : 0),
        unlockedTowers: nextUnlockedTowers,
        equippedLoadout: nextEquippedLoadout,
        highestUnlockedLevel: nextHighestLevel,
        selectedLevel: nextSelectedLevel,
        bestWaveByMode: {
          ...prev.bestWaveByMode,
          [mode]: Math.max(prev.bestWaveByMode[mode] ?? 0, runOutcome.wavesCleared),
        },
        bestScoreByMode: {
          ...prev.bestScoreByMode,
          [mode]: Math.max(prev.bestScoreByMode[mode] ?? 0, runOutcome.score),
        },
      };

      return runOutcome.victory
        ? rerollLevelSeedInProfile(baseProfile, runOutcome.level)
        : baseProfile;
    });
  }, []);

  const startMission = useCallback((modeOverride?: GameModeId) => {
    const activeMode = modeOverride ?? profileRef.current.selectedMode;
    const newRun = createRunState(activeMode, profileRef.current);
    runRef.current = newRun;
    hoverPointRef.current = null;
    setOutcome(null);
    setTitleModal('none');
    titleModalRef.current = 'none';
    setDraftChoices(null);
    setHud(extractHudSnapshot(newRun));
    setScreen('playing');
    screenRef.current = 'playing';
    document.body.dataset.state = 'playing';

    sceneRef.current?.resetCamera();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  // Initialize autostart run on mount if requested
  useEffect(() => {
    if (initialAutostart && !runRef.current) {
      startMission();
    }
  }, [initialAutostart, startMission]);

  // Ref-bridged click handler for 3D board interactions
  const handleBoardClickRef = useRef<(ev: BoardClickEvent) => void>(() => {});
  handleBoardClickRef.current = (ev: BoardClickEvent) => {
    const run = runRef.current;
    if (!run || screenRef.current !== 'playing') return;
    if (run.draftOptions || run.outcome) return;

    if (!ev.inside) {
      run.selectedTowerId = null;
      run.pendingCombineTowerId = null;
      run.pendingTacticalPing = false;
      syncHudFromRun();
      return;
    }

    // 0. Place Tactical Ping when Ping Mode is armed, Shift+Click, or Middle-Click
    if (ev.button === 1 || ev.shiftKey || run.pendingTacticalPing) {
      const ping = addTacticalPing(run, ev.simX, ev.simY);
      if (ping) {
        soundEngine.playPing();
        sceneRef.current?.spawnBurst(ping.x, ping.y, ping.color, 12, 2.5);
        syncHudFromRun();
      }
      return;
    }

    // 1. Execute Orbital Lance if primed
    if (run.pendingTargetingAbility === 'orbital_lance') {
      const ok = triggerActiveAbility(
        run,
        'orbital_lance',
        ev.simX,
        ev.simY,
        handleSimEvent,
      );
      if (ok) syncHudFromRun();
      return;
    }

    const existing = run.towers.find((t) => {
      const tc = getTowerCoords(t);
      return Math.hypot(tc.x - ev.simX, tc.y - ev.simY) <= 0.55;
    });

    // 1b. Resolve Super Turret Fusion if Fusion Mode is active
    if (run.pendingCombineTowerId !== null) {
      if (existing) {
        const res = combineTowers(
          run,
          run.pendingCombineTowerId,
          existing.id,
          handleSimEvent,
        );
        if (res.ok && res.tower) {
          const tc = getTowerCoords(res.tower);
          sceneRef.current?.spawnBurst(
            tc.x,
            tc.y,
            TOWER_DEFS[res.tower.type].accentColor,
            22,
            3.6,
          );
          syncHudFromRun();
          return;
        }
      }
      run.pendingCombineTowerId = null;
      syncHudFromRun();
      return;
    }

    // 2. Select existing placed turret for inspection/upgrades
    if (existing) {
      run.selectedTowerId = existing.id;
      syncHudFromRun();
      return;
    }

    // 3. Place selected buildable turret smoothly at exact cursor coordinates
    if (run.selectedBuildType) {
      const res = placeTower(run, run.selectedBuildType, ev.simX, ev.simY);
      if (res.ok && res.tower) {
        soundEngine.playPlace();
        const tc = getTowerCoords(res.tower);
        sceneRef.current?.spawnBurst(
          tc.x,
          tc.y,
          TOWER_DEFS[res.tower.type].accentColor,
          10,
          2.2,
        );
        syncHudFromRun();
      } else {
        run.selectedTowerId = null;
        syncHudFromRun();
      }
    } else {
      run.selectedTowerId = null;
      syncHudFromRun();
    }
  };

  // Mount Three.js 3D scene once + run adaptive simulation/render loop
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene3d = new BastionScene3D(container, {
      onHover: (ev) => {
        if (screenRef.current !== 'playing') {
          hoverPointRef.current = null;
          return;
        }
        hoverPointRef.current = ev.inside
          ? { col: ev.col, row: ev.row, simX: ev.simX, simY: ev.simY }
          : null;
      },
      onClick: (ev) => handleBoardClickRef.current(ev),
    });
    sceneRef.current = scene3d;

    let stopped = false;
    let lastTime = performance.now();

    const tick = (now: number) => {
      if (stopped) return;

      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0), 0.05);
      const timeSec = now / 1000;
      const curScreen = screenRef.current;
      const run = runRef.current;

      const modalBlocking =
        (curScreen === 'title' && titleModalRef.current !== 'none') ||
        curScreen === 'paused' ||
        curScreen === 'gameover' ||
        Boolean(run && (run.draftOptions || run.outcome));

      if (curScreen === 'title' || !run) {
        scene3d.syncTitle(titleMapRef.current, dt, timeSec);
      } else {
        const isActivelyPlaying = curScreen === 'playing' && !run.draftOptions && !run.outcome;

        if (isActivelyPlaying) {
          const prevKills = run.enemiesDefeated;
          const prevWave = run.wave;
          const prevScrap = run.scrap;
          const prevLives = run.lives;
          const prevWaveActive = run.waveActive;
          const prevEnemiesRem =
            run.spawnQueue.length +
            run.enemies.filter((e) => !e.dead && !e.reachedExit).length;
          const prevAbilityTick = run.activeAbilities
            .map((a) => Math.ceil(a.cooldownRemaining * 2))
            .join(',');
          const prevAutoWaveTick = Math.ceil(run.autoWaveTimer * 2);
          const prevPingCount = run.tacticalPings.length;

          stepSimulation(run, dt, (ev) => {
            handleSimEvent(ev);
            if (ev.type === 'kill') {
              for (const e of run.enemies) {
                if (e.dead && e.koTimer >= 0.25) {
                  scene3d.spawnBurst(e.x, e.y, e.color, e.archetype === 'boss' ? 28 : 12, 3.2);
                }
              }
            }
          });

          if (run.outcome) {
            finalizeRunOutcome(run.outcome);
            syncHudFromRun();
          } else {
            const curEnemiesRem =
              run.spawnQueue.length +
              run.enemies.filter((e) => !e.dead && !e.reachedExit).length;
            const curAbilityTick = run.activeAbilities
              .map((a) => Math.ceil(a.cooldownRemaining * 2))
              .join(',');
            const curAutoWaveTick = Math.ceil(run.autoWaveTimer * 2);

            const discreteChanged =
              prevKills !== run.enemiesDefeated ||
              prevWave !== run.wave ||
              prevScrap !== run.scrap ||
              prevLives !== run.lives ||
              prevWaveActive !== run.waveActive ||
              prevEnemiesRem !== curEnemiesRem ||
              prevAbilityTick !== curAbilityTick ||
              prevAutoWaveTick !== curAutoWaveTick ||
              prevPingCount !== run.tacticalPings.length ||
              Boolean(run.draftOptions);

            if (discreteChanged) {
              syncHudFromRun();
            }
          }
        }

        scene3d.syncRun(run, hoverPointRef.current, dt, timeSec);
      }

      if (!modalBlocking) {
        scene3d.scheduleNextTick(tick);
      }
    };

    const resumeLoop = () => {
      if (stopped) return;
      lastTime = performance.now();
      scene3d.scheduleNextTick(tick);
    };
    (scene3d as unknown as { __resumeLoop?: () => void }).__resumeLoop = resumeLoop;

    tick(performance.now());

    return () => {
      stopped = true;
      scene3d.dispose();
      sceneRef.current = null;
    };
  }, [finalizeRunOutcome, handleSimEvent, syncHudFromRun]);

  // Resume / sync scene whenever modal or screen state transitions
  useEffect(() => {
    const scene3d = sceneRef.current as
      | (BastionScene3D & { __resumeLoop?: () => void })
      | null;
    if (!scene3d) return;

    const modalBlocking =
      (screen === 'title' && titleModal !== 'none') ||
      screen === 'paused' ||
      screen === 'gameover' ||
      Boolean(draftChoices) ||
      Boolean(outcome);

    if (modalBlocking) {
      scene3d.cancelScheduledFrame();
      scene3d.renderOnce();
    } else {
      scene3d.__resumeLoop?.();
    }
  }, [screen, titleModal, draftChoices, outcome]);

  const handleSendWave = useCallback(() => {
    const run = runRef.current;
    if (!run || screenRef.current !== 'playing') return;
    if (startNextWave(run)) {
      soundEngine.playWaveStart();
      syncHudFromRun();
    }
  }, [syncHudFromRun]);

  const handleRerollMap = useCallback(() => {
    const run = runRef.current;
    if (!run || screenRef.current !== 'playing') return;
    const nextRun = rerollRunMap(run);
    runRef.current = nextRun;
    soundEngine.playPlace();
    syncHudFromRun();
  }, [syncHudFromRun]);

  const handleToggleAutoWave = useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    run.autoSkipWave = !run.autoSkipWave;
    if (
      run.autoSkipWave &&
      !run.waveActive &&
      !run.draftOptions &&
      !run.outcome &&
      run.wave > 0 &&
      (run.totalWaves === null || run.wave < run.totalWaves)
    ) {
      run.autoWaveTimer = 1.4;
    } else {
      run.autoWaveTimer = 0;
    }
    syncHudFromRun();
  }, [syncHudFromRun]);

  const handleTogglePingMode = useCallback(() => {
    const run = runRef.current;
    if (!run || screenRef.current !== 'playing') return;
    run.pendingTacticalPing = !run.pendingTacticalPing;
    if (run.pendingTacticalPing) {
      run.pendingTargetingAbility = null;
      run.pendingCombineTowerId = null;
    }
    syncHudFromRun();
  }, [syncHudFromRun]);

  const handleToggleEnemyPath = useCallback(() => {
    const run = runRef.current;
    if (!run || screenRef.current !== 'playing') return;
    run.showEnemyPath = !run.showEnemyPath;
    syncHudFromRun();
  }, [syncHudFromRun]);

  const handleToggleSpeed = useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    run.speedMultiplier = run.speedMultiplier === 1 ? 2 : 1;
    syncHudFromRun();
  }, [syncHudFromRun]);

  const handleToggleMute = useCallback(() => {
    setProfile((prev) => {
      const nextMuted = !prev.muted;
      soundEngine.setMuted(nextMuted);
      return { ...prev, muted: nextMuted };
    });
  }, []);

  const handlePauseToggle = useCallback(() => {
    if (screenRef.current === 'playing') {
      setScreen('paused');
    } else if (screenRef.current === 'paused') {
      setScreen('playing');
    }
  }, []);

  const handleUpgradeTower = useCallback(
    (id: number) => {
      const run = runRef.current;
      if (!run) return;
      if (upgradeTower(run, id)) {
        soundEngine.playUpgrade();
        const t = run.towers.find((tower) => tower.id === id);
        if (t) {
          const tc = getTowerCoords(t);
          sceneRef.current?.spawnBurst(
            tc.x,
            tc.y,
            TOWER_DEFS[t.type].accentColor,
            14,
            2.8,
          );
        }
        syncHudFromRun();
      }
    },
    [syncHudFromRun],
  );

  const handleStartCombine = useCallback(
    (id: number) => {
      const run = runRef.current;
      if (!run) return;
      const hasPartner = run.towers.some((t) => canCombineTowers(run, id, t.id));
      if (!hasPartner) return;
      run.pendingCombineTowerId = id;
      run.selectedTowerId = id;
      run.pendingTargetingAbility = null;
      run.pendingTacticalPing = false;
      syncHudFromRun();
    },
    [syncHudFromRun],
  );

  const handleCancelCombine = useCallback(() => {
    const run = runRef.current;
    if (!run) return;
    run.pendingCombineTowerId = null;
    syncHudFromRun();
  }, [syncHudFromRun]);

  const handleSellTower = useCallback(
    (id: number) => {
      const run = runRef.current;
      if (!run) return;
      if (sellTower(run, id) > 0) {
        soundEngine.playSell();
        syncHudFromRun();
      }
    },
    [syncHudFromRun],
  );

  const handleCyclePriority = useCallback(
    (id: number) => {
      const run = runRef.current;
      if (!run) return;
      cycleTowerPriority(run, id);
      syncHudFromRun();
    },
    [syncHudFromRun],
  );

  const handleActivateAbility = useCallback(
    (id: PowerUpId, autoTarget = false) => {
      const run = runRef.current;
      if (!run || screenRef.current !== 'playing') return;
      if (id === 'orbital_lance' && !autoTarget) {
        run.pendingTargetingAbility =
          run.pendingTargetingAbility === 'orbital_lance' ? null : 'orbital_lance';
        run.pendingTacticalPing = false;
        syncHudFromRun();
        return;
      }
      if (triggerActiveAbility(run, id, undefined, undefined, handleSimEvent)) {
        syncHudFromRun();
      }
    },
    [handleSimEvent, syncHudFromRun],
  );

  const handlePickPowerUp = useCallback(
    (id: PowerUpId) => {
      const run = runRef.current;
      if (!run) return;
      if (applyPowerUpChoice(run, id)) {
        soundEngine.playUpgrade();
        syncHudFromRun();
      }
    },
    [syncHudFromRun],
  );

  const handleResetCamera = useCallback(() => {
    sceneRef.current?.resetCamera();
  }, []);

  // Unified Global Keyboard & Camera Pan Controls
  useEffect(() => {
    const updatePanKey = (key: string, pressed: boolean): boolean => {
      const k = key.toLowerCase();
      if (k === 'w' || key === 'arrowup') {
        panKeysRef.current.up = pressed;
        sceneRef.current?.setPanKeys({ ...panKeysRef.current });
        return true;
      }
      if (k === 's' || key === 'arrowdown') {
        panKeysRef.current.down = pressed;
        sceneRef.current?.setPanKeys({ ...panKeysRef.current });
        return true;
      }
      if (k === 'a' || key === 'arrowleft') {
        panKeysRef.current.left = pressed;
        sceneRef.current?.setPanKeys({ ...panKeysRef.current });
        return true;
      }
      if (k === 'd' || key === 'arrowright') {
        panKeysRef.current.right = pressed;
        sceneRef.current?.setPanKeys({ ...panKeysRef.current });
        return true;
      }
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (screenRef.current === 'playing' && updatePanKey(e.key, true)) {
        return;
      }

      if (e.repeat) return;
      const curScreen = screenRef.current;

      if (curScreen === 'title') {
        if (titleModal === 'none' && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          startMission();
        } else if (e.key === 'Escape' && titleModal !== 'none') {
          setTitleModal('none');
        }
        return;
      }

      if (e.key === 'm' || e.key === 'M') {
        handleToggleMute();
        return;
      }

      if (curScreen === 'paused') {
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          setScreen('playing');
        }
        return;
      }

      if (curScreen === 'gameover') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startMission();
        }
        return;
      }

      const run = runRef.current;
      if (!run) return;

      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleResetCamera();
        return;
      }

      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        handleTogglePingMode();
        return;
      }

      if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        handleToggleEnemyPath();
        return;
      }

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handlePauseToggle();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (run.pendingTacticalPing) {
          run.pendingTacticalPing = false;
          syncHudFromRun();
        } else if (run.pendingTargetingAbility) {
          run.pendingTargetingAbility = null;
          syncHudFromRun();
        } else if (run.pendingCombineTowerId !== null) {
          run.pendingCombineTowerId = null;
          syncHudFromRun();
        } else if (run.selectedTowerId !== null) {
          run.selectedTowerId = null;
          syncHudFromRun();
        } else {
          handlePauseToggle();
        }
        return;
      }

      if (e.key >= '1' && e.key <= '6') {
        const towerType = run.equippedLoadout[Number(e.key) - 1];
        if (towerType) {
          run.selectedBuildType = towerType;
          run.pendingTargetingAbility = null;
          run.pendingCombineTowerId = null;
          run.pendingTacticalPing = false;
          syncHudFromRun();
          return;
        }
      }

      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        handleToggleAutoWave();
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        handleSendWave();
        return;
      }

      if ((e.key === 'r' || e.key === 'R') && run.wave === 0 && !run.waveActive) {
        handleRerollMap();
        return;
      }

      if ((e.key === 'u' || e.key === 'U') && run.selectedTowerId !== null) {
        handleUpgradeTower(run.selectedTowerId);
        return;
      }

      if ((e.key === 'b' || e.key === 'B') && run.selectedTowerId !== null) {
        if (run.pendingCombineTowerId === run.selectedTowerId) {
          handleCancelCombine();
        } else {
          handleStartCombine(run.selectedTowerId);
        }
        return;
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        run.selectedTowerId !== null
      ) {
        handleSellTower(run.selectedTowerId);
        return;
      }

      if (e.key === 'q' || e.key === 'Q') {
        handleActivateAbility('orbital_lance', true);
      } else if (e.key === 'e' || e.key === 'E') {
        handleActivateAbility('emp_field');
      } else if (e.key === 'f' || e.key === 'F') {
        handleActivateAbility('overdrive_beacon');
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      updatePanKey(e.key, false);
    };

    const onBlur = () => {
      hoverPointRef.current = null;
      panKeysRef.current = { up: false, down: false, left: false, right: false };
      sceneRef.current?.setPanKeys({ ...panKeysRef.current });
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [
    handleActivateAbility,
    handleCancelCombine,
    handlePauseToggle,
    handleRerollMap,
    handleResetCamera,
    handleSellTower,
    handleSendWave,
    handleStartCombine,
    handleToggleAutoWave,
    handleToggleEnemyPath,
    handleToggleMute,
    handleTogglePingMode,
    handleUpgradeTower,
    startMission,
    syncHudFromRun,
    titleModal,
  ]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0F151B]">
      {/* Isolated 3D WebGL Mount (never unmounted on React HUD updates) */}
      <div ref={containerRef} className="fixed inset-0 cursor-crosshair" />

      {/* Title Screen & Main Menu Drawers */}
      {screen === 'title' && (
        <TitleScreen
          profile={profile}
          onSelectMode={(mode) => setProfile((p) => ({ ...p, selectedMode: mode }))}
          onSelectLevel={(level) => {
            const clamped = Math.max(1, Math.min(profileRef.current.highestUnlockedLevel, level));
            titleMapRef.current = generateRandomMap(undefined, clamped);
            setProfile((p) => ({
              ...p,
              selectedLevel: clamped,
            }));
          }}
          onRerollLevelModifiers={(level) =>
            setProfile((p) => rerollLevelSeedInProfile(p, level))
          }
          onStartMission={() => startMission()}
          onOpenLevels={() => setTitleModal('levels')}
          onOpenLoadout={() => setTitleModal('loadout')}
          onOpenEvolutions={() => setTitleModal('evolutions')}
        />
      )}

      {screen === 'title' && titleModal === 'levels' && (
        <LevelSelectModal
          profile={profile}
          onSelectLevel={(level) => {
            const clamped = Math.max(1, Math.min(profileRef.current.highestUnlockedLevel, level));
            titleMapRef.current = generateRandomMap(undefined, clamped);
            setProfile((p) => ({
              ...p,
              selectedLevel: clamped,
            }));
          }}
          onRerollLevelModifiers={(level) =>
            setProfile((p) => rerollLevelSeedInProfile(p, level))
          }
          onClose={() => setTitleModal('none')}
        />
      )}

      {screen === 'title' && titleModal === 'loadout' && (
        <LoadoutModal
          profile={profile}
          onToggleEquip={(towerId) =>
            setProfile((prev) => toggleEquipTowerInProfile(prev, towerId).profile)
          }
          onClose={() => setTitleModal('none')}
        />
      )}

      {screen === 'title' && titleModal === 'evolutions' && (
        <EvolutionModal
          profile={profile}
          onEvolve={(towerId) =>
            setProfile((prev) => evolveTowerInProfile(prev, towerId).profile)
          }
          onSelectApex={(towerId, branch: ApexBranch) =>
            setProfile((prev) => setTowerApexChoice(prev, towerId, branch))
          }
          onClose={() => setTitleModal('none')}
        />
      )}

      {/* Active Gameplay HUD */}
      {screen !== 'title' && hud && (
        <GameHud
          hud={hud}
          muted={profile.muted}
          onSelectBuild={(type) => {
            const run = runRef.current;
            if (!run) return;
            run.selectedBuildType = type;
            run.pendingTargetingAbility = null;
            run.pendingCombineTowerId = null;
            run.pendingTacticalPing = false;
            syncHudFromRun();
          }}
          onStartWave={handleSendWave}
          onToggleAutoWave={handleToggleAutoWave}
          onTogglePingMode={handleTogglePingMode}
          onToggleEnemyPath={handleToggleEnemyPath}
          onRerollMap={handleRerollMap}
          onToggleSpeed={handleToggleSpeed}
          onToggleMute={handleToggleMute}
          onPause={handlePauseToggle}
          onUpgradeTower={handleUpgradeTower}
          onStartCombine={handleStartCombine}
          onCancelCombine={handleCancelCombine}
          onSellTower={handleSellTower}
          onCyclePriority={handleCyclePriority}
          onDeselectTower={() => {
            if (runRef.current) {
              runRef.current.selectedTowerId = null;
              runRef.current.pendingCombineTowerId = null;
              syncHudFromRun();
            }
          }}
          onActivateAbility={(id) => handleActivateAbility(id)}
          onResetCamera={handleResetCamera}
        />
      )}

      {/* Between-Wave Power-Up Draft */}
      {screen === 'playing' && draftChoices && (
        <PowerUpModal
          waveCleared={draftChoices.wave}
          choices={draftChoices.choices}
          onPick={handlePickPowerUp}
        />
      )}

      {/* Pause, Victory, or Game Over Modal */}
      {(screen === 'paused' || screen === 'gameover') && (
        <StatusModal
          screen={screen}
          outcome={outcome}
          onResume={() => setScreen('playing')}
          onRestart={() => startMission()}
          onMainMenu={() => {
            runRef.current = null;
            titleMapRef.current = generateRandomMap(undefined, profileRef.current.selectedLevel);
            setOutcome(null);
            setDraftChoices(null);
            setHud(null);
            setScreen('title');
          }}
        />
      )}
    </main>
  );
}
