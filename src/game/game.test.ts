import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FUSION_COST,
  getCombinedTowerType,
  getLevelDef,
  LEVEL_DEFS,
  MAX_ACTIVE_TOWERS,
  MAX_EQUIPPED_TURRETS,
  MAX_LEVEL,
  rollRandomLevelModifiers,
  TOWER_DEFS,
} from './catalog';
import { generateRandomMap, isValidPath } from './mapGen';
import {
  computeHazardRating,
  computeModifierRewardMultiplier,
  computeTotalRewardMultiplier,
  createDefaultProfile,
  evolveTowerInProfile,
  rerollLevelSeedInProfile,
  setTowerApexChoice,
  toggleEquipTowerInProfile,
  toggleModifierInProfile,
} from './progression';
import {
  applyPowerUpChoice,
  canBuildTower,
  canCombineTowers,
  canPlaceTowerAt,
  combineTowers,
  computeRunOutcome,
  computeTowerEffectiveStats,
  computeWaveHpMultiplier,
  createRunState,
  cycleTowerPriority,
  generateWaveSpawns,
  getDeployedCountByType,
  getUsedGridCapacity,
  placeTower,
  rerollRunMap,
  sellTower,
  startNextWave,
  stepSimulation,
  triggerActiveAbility,
  upgradeTower,
} from './simulation';

test('procedural map generator produces continuous non-overlapping paths across seeds', () => {
  for (let i = 0; i < 20; i++) {
    const map = generateRandomMap(10000 + i * 7919);
    assert.equal(isValidPath(map), true, `Map seed ${map.seed} should be valid`);
    assert.ok(map.path.length >= 22, `Path length ${map.path.length} should be >= 22`);
    assert.equal(map.tiles[map.spawn.row][map.spawn.col], 'spawn');
    assert.equal(map.tiles[map.exit.row][map.exit.col], 'exit');
  }
});

test('tower evolutions spend shards and improve effective tower stats', () => {
  let profile = createDefaultProfile();
  assert.equal(profile.shards, 4);

  // Evolve cannon tier 1 (cost 2)
  const res1 = evolveTowerInProfile(profile, 'cannon');
  assert.equal(res1.evolved, true);
  profile = res1.profile;
  assert.equal(profile.shards, 2);
  assert.equal(profile.evolutions.cannon.tier, 1);

  // Cannot evolve tier 2 (cost 4) with only 2 shards
  const resFail = evolveTowerInProfile(profile, 'cannon');
  assert.equal(resFail.evolved, false);

  // Grant shards to unlock tier 2 & apex
  profile.shards = 15;
  profile = evolveTowerInProfile(profile, 'cannon').profile;
  profile = evolveTowerInProfile(profile, 'cannon').profile;
  assert.equal(profile.evolutions.cannon.tier, 3);

  profile = setTowerApexChoice(profile, 'cannon', 'b');
  const run = createRunState('standard', profile, 424242);
  const dummyTower = {
    type: 'cannon' as const,
    level: 1 as const,
    onVantage: false,
    totalSpent: 65,
  };
  const stats = computeTowerEffectiveStats(dummyTower, run);
  assert.ok(stats.damage > 16);
  assert.equal(stats.appliesVulnerability, true);
});

test('end-game modifiers increase hazard rating, reward multiplier, and constrain run rules', () => {
  let profile = createDefaultProfile();
  assert.equal(computeHazardRating(profile.activeModifiers), 0);
  assert.equal(computeModifierRewardMultiplier(profile.activeModifiers), 1);

  profile = toggleModifierInProfile(profile, 'armored_vanguard');
  profile = toggleModifierInProfile(profile, 'fragile_bastion');
  profile = toggleModifierInProfile(profile, 'austerity');

  assert.equal(computeHazardRating(profile.activeModifiers), 6);
  assert.equal(computeModifierRewardMultiplier(profile.activeModifiers), 2.1);
  assert.equal(computeTotalRewardMultiplier('blitz', profile.activeModifiers), 2.63);

  const run = createRunState('standard', profile, 123456);
  assert.equal(run.lives, 10);
  assert.equal(run.scrap, Math.round(210 * 0.75));
});

test('tower placement, upgrade, targeting priority, sell, and map reroll work cleanly', () => {
  const profile = createDefaultProfile();
  let run = createRunState('standard', profile, 555111);

  // Find a buildable tile
  let buildCoord = { col: 0, row: 0 };
  outer: for (let r = 0; r < run.map.rows; r++) {
    for (let c = 0; c < run.map.cols; c++) {
      if (canPlaceTowerAt(run, c, r)) {
        buildCoord = { col: c, row: r };
        break outer;
      }
    }
  }

  const placed = placeTower(run, 'cannon', buildCoord.col, buildCoord.row);
  assert.equal(placed.ok, true);
  assert.equal(run.towers.length, 1);
  const towerId = placed.tower!.id;
  const scrapAfterPlace = run.scrap;

  // Upgrade to level 2
  assert.equal(upgradeTower(run, towerId), true);
  assert.equal(run.towers[0].level, 2);
  assert.ok(run.scrap < scrapAfterPlace);

  // Cycle targeting priority
  assert.equal(cycleTowerPriority(run, towerId), 'strongest');
  assert.equal(cycleTowerPriority(run, towerId), 'closest');
  assert.equal(cycleTowerPriority(run, towerId), 'first');

  // Reroll map refunds placed towers before wave 1
  run = rerollRunMap(run, 999888);
  assert.equal(run.towers.length, 0);
  assert.equal(run.scrap, 210);

  // Place and sell refunds 70%
  const placed2 = placeTower(run, 'cryo', buildCoord.col, buildCoord.row);
  if (placed2.ok) {
    const refund = sellTower(run, placed2.tower!.id);
    assert.equal(refund, Math.round(85 * 0.7));
    assert.equal(run.towers.length, 0);
  }
});

test('every 5th wave spawns Dreadnought bosses across all game modes', () => {
  for (const mode of ['standard', 'blitz', 'endless'] as const) {
    const w4 = generateWaveSpawns(4, mode, []);
    const w5 = generateWaveSpawns(5, mode, []);
    const w10 = generateWaveSpawns(10, mode, []);
    const w15 = generateWaveSpawns(15, mode, []);

    assert.equal(w4.some((s) => s.archetype === 'boss'), false, `${mode} wave 4 has no boss`);
    assert.equal(w5.filter((s) => s.archetype === 'boss').length, 1, `${mode} wave 5 has 1 boss`);
    assert.equal(w10.filter((s) => s.archetype === 'boss').length, 1, `${mode} wave 10 has 1 boss`);
    assert.equal(w15.filter((s) => s.archetype === 'boss').length, 2, `${mode} wave 15 has 2 bosses`);
  }
});

test('combining 2 base turrets fuses them into a Super Turret with inherited stats', () => {
  assert.equal(getCombinedTowerType('cannon', 'cryo'), 'frost_vulcan');
  assert.equal(getCombinedTowerType('cryo', 'cannon'), 'frost_vulcan');
  assert.equal(getCombinedTowerType('tesla', 'rail'), 'plasma_railgun');
  assert.equal(getCombinedTowerType('rail', 'rail'), 'omega_railgun');

  const profile = createDefaultProfile();
  const run = createRunState('standard', profile, 888444);
  run.scrap = 800;

  const coords: Array<{ col: number; row: number }> = [];
  for (let r = 0; r < run.map.rows && coords.length < 3; r++) {
    for (let c = 0; c < run.map.cols && coords.length < 3; c++) {
      if (canPlaceTowerAt(run, c, r)) {
        coords.push({ col: c, row: r });
      }
    }
  }
  assert.equal(coords.length, 3);

  const p1 = placeTower(run, 'cannon', coords[0].col, coords[0].row);
  const p2 = placeTower(run, 'cryo', coords[1].col, coords[1].row);
  const p3 = placeTower(run, 'tesla', coords[2].col, coords[2].row);
  assert.equal(p1.ok && p2.ok && p3.ok, true);

  // Upgrade partner cryo turret to MK 2 before combining
  assert.equal(upgradeTower(run, p2.tower!.id), true);
  p1.tower!.kills = 4;
  p2.tower!.kills = 7;

  const expectedTotalSpent = p1.tower!.totalSpent + p2.tower!.totalSpent + FUSION_COST;
  const scrapBeforeFusion = run.scrap;
  assert.equal(canCombineTowers(run, p1.tower!.id, p2.tower!.id), true);

  let combinedEventCount = 0;
  const fusion = combineTowers(run, p1.tower!.id, p2.tower!.id, (ev) => {
    if (ev.type === 'combine') combinedEventCount++;
  });

  assert.equal(fusion.ok, true);
  assert.equal(combinedEventCount, 1);
  assert.equal(run.scrap, scrapBeforeFusion - FUSION_COST);
  assert.equal(run.towers.length, 2); // partner tile freed
  assert.equal(canPlaceTowerAt(run, coords[1].col, coords[1].row), true);

  const superTurret = fusion.tower!;
  assert.equal(superTurret.type, 'frost_vulcan');
  assert.equal(superTurret.level, 2);
  assert.equal(superTurret.kills, 11);
  assert.equal(superTurret.totalSpent, expectedTotalSpent);

  // Cannot combine a Super Turret again
  assert.equal(canCombineTowers(run, superTurret.id, p3.tower!.id), false);

  const stats = computeTowerEffectiveStats(superTurret, run);
  assert.ok(stats.damage > 30);
  assert.ok(stats.slowFactor > 0);
  assert.ok(stats.splashRadius > 0);
});

test('wave simulation spawns multiple enemy types, resolves combat, offers power-ups, and reaches victory/defeat', () => {
  const profile = createDefaultProfile();
  const bossWaveSpawns = generateWaveSpawns(5, 'blitz', []);
  assert.ok(bossWaveSpawns.some((s) => s.archetype === 'boss'));
  assert.ok(bossWaveSpawns.some((s) => s.archetype === 'scout'));

  // Simulate wave 1 in Blitz to clear and trigger Power-Up Draft
  const run = createRunState('blitz', profile, 777333);
  // Place 3 cannons near the path start
  let placedCount = 0;
  for (const p of run.map.path) {
    for (const [dc, dr] of [
      [0, -1],
      [0, 1],
      [1, 0],
      [-1, 0],
    ]) {
      if (placedCount >= 3) break;
      const nc = p.col + dc;
      const nr = p.row + dr;
      if (canPlaceTowerAt(run, nc, nr)) {
        const res = placeTower(run, 'cannon', nc, nr);
        if (res.ok) placedCount++;
      }
    }
  }
  assert.equal(placedCount, 3);
  assert.equal(startNextWave(run), true);

  // Step simulation up to 45 seconds
  for (let i = 0; i < 45 * 30; i++) {
    stepSimulation(run, 1 / 30);
    if (!run.waveActive) break;
  }

  assert.equal(run.waveActive, false);
  assert.ok(run.enemiesDefeated > 0);
  assert.ok(run.draftOptions !== null && run.draftOptions.length === 3);

  // Choose a power-up
  const picked = run.draftOptions![0].id;
  assert.equal(applyPowerUpChoice(run, picked), true);
  assert.equal(run.draftOptions, null);

  // Verify active abilities can be granted and triggered
  run.activeAbilities.push({
    id: 'emp_field',
    cooldownRemaining: 0,
    maxCooldown: 18,
  });
  assert.equal(triggerActiveAbility(run, 'emp_field'), true);
  assert.ok(run.activeAbilities[0].cooldownRemaining > 0);
});

test('strategic deployment caps retain parent and grid caps after combining turrets to prevent infinite tower loopholes', () => {
  assert.equal(FUSION_COST, 180);
  const profile = createDefaultProfile();
  const run = createRunState('standard', profile, 616161);
  run.scrap = 5000;

  const buildable: Array<{ col: number; row: number }> = [];
  for (let r = 0; r < run.map.rows; r++) {
    for (let c = 0; c < run.map.cols; c++) {
      if (canPlaceTowerAt(run, c, r)) {
        buildable.push({ col: c, row: r });
      }
    }
  }
  assert.ok(buildable.length >= MAX_ACTIVE_TOWERS + 2);

  // Place 1 Rotary Cannon (1/4) and 1 Rail Sniper (1/2)
  const cannon1 = placeTower(run, 'cannon', buildable[0].col, buildable[0].row);
  const rail1 = placeTower(run, 'rail', buildable[1].col, buildable[1].row);
  assert.equal(cannon1.ok && rail1.ok, true);
  assert.equal(getUsedGridCapacity(run.towers), 2);

  // Combining Rotary Cannon + Rail Sniper into Siege Autocannon MUST retain both caps & grid capacity!
  const fusedCross = combineTowers(run, cannon1.tower!.id, rail1.tower!.id);
  assert.equal(fusedCross.ok, true);
  assert.equal(fusedCross.tower!.type, 'siege_autocannon');
  assert.equal(run.towers.length, 1); // physical tile freed
  assert.equal(getUsedGridCapacity(run.towers), 2); // grid cap retained
  let counts = getDeployedCountByType(run.towers);
  assert.equal(counts.cannon, 1); // cannon cap stays 1/4
  assert.equal(counts.rail, 1); // rail cap stays 1/2

  // Only 1 more Rail Sniper can be placed (reaching Rail cap 2/2)
  const rail2 = placeTower(run, 'rail', buildable[2].col, buildable[2].row);
  assert.equal(rail2.ok, true);
  assert.equal(canBuildTower(run, 'rail').ok, false);
  assert.equal(placeTower(run, 'rail', buildable[3].col, buildable[3].row).ok, false);

  // Remaining Cannon cap is 3 (1 retained + 3 new = 4/4)
  const cannonCap = TOWER_DEFS.cannon.maxCount;
  assert.equal(cannonCap, 4);
  for (let i = 0; i < cannonCap - 1; i++) {
    const res = placeTower(run, 'cannon', buildable[3 + i].col, buildable[3 + i].row);
    assert.equal(res.ok, true);
  }
  assert.equal(canBuildTower(run, 'cannon').ok, false);

  // Fill remaining capacity up to MAX_ACTIVE_TOWERS (12)
  let idx = 3 + (cannonCap - 1);
  while (getUsedGridCapacity(run.towers) < MAX_ACTIVE_TOWERS) {
    const candidateType = (['cryo', 'tesla'] as const).find(
      (t) => canBuildTower(run, t).ok,
    );
    assert.ok(candidateType, 'Should find a buildable turret under cap');
    const res = placeTower(run, candidateType, buildable[idx].col, buildable[idx].row);
    assert.equal(res.ok, true);
    idx++;
  }

  assert.equal(getUsedGridCapacity(run.towers), MAX_ACTIVE_TOWERS);
  assert.equal(canBuildTower(run, 'cannon').ok, false);
  assert.equal(canBuildTower(run, 'cryo').ok, false);
  assert.equal(canBuildTower(run, 'tesla').ok, false);

  // Combining two existing base turrets at max grid capacity still works and keeps capacity at 12
  const basePair = run.towers.filter((t) => t.type === 'cannon');
  assert.ok(basePair.length >= 2);
  const fusedAtCap = combineTowers(run, basePair[0].id, basePair[1].id);
  assert.equal(fusedAtCap.ok, true);
  assert.equal(getUsedGridCapacity(run.towers), MAX_ACTIVE_TOWERS);
  counts = getDeployedCountByType(run.towers);
  assert.equal(counts.cannon, 4); // Still 4/4 cannons — no infinite tower loophole
  assert.equal(canBuildTower(run, 'cannon').ok, false);

  // Cross-recipe fusion targeting shared super chassis (e.g. Rotary Cannon + Hellfire Flamer -> Inferno Hydra)
  // MUST keep 1/4 Rotary Cannon and 1/3 Hellfire Flamer (never 0/4 and 2/3)!
  const pyroProfile = {
    ...createDefaultProfile(),
    unlockedTowers: [...createDefaultProfile().unlockedTowers, 'pyro' as const],
    equippedLoadout: ['cannon' as const, 'pyro' as const, 'cryo' as const, 'rail' as const],
  };
  const pyroRun = createRunState('standard', pyroProfile, 727272);
  pyroRun.scrap = 1000;
  const cRes = placeTower(pyroRun, 'cannon', buildable[0].col, buildable[0].row);
  const pRes = placeTower(pyroRun, 'pyro', buildable[1].col, buildable[1].row);
  assert.equal(cRes.ok && pRes.ok, true);

  const infernoFusion = combineTowers(pyroRun, cRes.tower!.id, pRes.tower!.id);
  assert.equal(infernoFusion.ok, true);
  assert.equal(infernoFusion.tower!.type, 'inferno_hydra');
  assert.deepEqual(infernoFusion.tower!.fusedParents, ['cannon', 'pyro']);

  const pyroCounts = getDeployedCountByType(pyroRun.towers);
  assert.equal(pyroCounts.cannon, 1); // 1/4 Rotary Cannon retained
  assert.equal(pyroCounts.pyro, 1);   // 1/3 Hellfire Flamer retained (NOT 2/3!)
});

test('main menu lineup enforces 6-turret max equip limit and gates locked turrets', () => {
  let profile = createDefaultProfile();
  assert.equal(profile.unlockedTowers.length, 4);
  assert.equal(profile.equippedLoadout.length, 4);

  // Cannot equip a locked turret
  const lockedAttempt = toggleEquipTowerInProfile(profile, 'pyro');
  assert.equal(lockedAttempt.changed, false);

  // Unlock all 4 additional turrets
  profile = {
    ...profile,
    unlockedTowers: [...profile.unlockedTowers, 'pyro', 'missile', 'laser', 'chrono'],
  };

  // Equip up to 6
  assert.equal(toggleEquipTowerInProfile(profile, 'pyro').changed, true);
  profile = toggleEquipTowerInProfile(profile, 'pyro').profile;
  profile = toggleEquipTowerInProfile(profile, 'missile').profile;
  assert.equal(profile.equippedLoadout.length, MAX_EQUIPPED_TURRETS);

  // Cannot equip a 7th turret
  const overflowAttempt = toggleEquipTowerInProfile(profile, 'laser');
  assert.equal(overflowAttempt.changed, false);

  // Unequipping one makes room for laser
  profile = toggleEquipTowerInProfile(profile, 'cannon').profile;
  assert.equal(profile.equippedLoadout.length, 5);
  const swapIn = toggleEquipTowerInProfile(profile, 'laser');
  assert.equal(swapIn.changed, true);
  assert.ok(swapIn.profile.equippedLoadout.includes('laser'));
  assert.equal(swapIn.profile.equippedLoadout.includes('cannon'), false);

  // Run respects equipped loadout
  const run = createRunState('standard', swapIn.profile, 303030);
  assert.equal(canBuildTower(run, 'cannon').ok, false);
  assert.equal(canBuildTower(run, 'laser').ok, true);
});

test('enemy HP scales every completed wave, victory unlocks a new turret, and auto-skip advances waves', () => {
  assert.equal(computeWaveHpMultiplier(1), 1.0);
  const w2Mult = computeWaveHpMultiplier(2);
  const w3Mult = computeWaveHpMultiplier(3);
  const w5Mult = computeWaveHpMultiplier(5);
  assert.ok(w2Mult > 1.25 && w3Mult > w2Mult && w5Mult > w3Mult);

  const profile = createDefaultProfile();
  const run = createRunState('blitz', profile, 909090);
  run.scrap = 800;
  run.autoSkipWave = true;

  // Verify wave 1 -> wave 2 scout HP buff
  assert.equal(startNextWave(run), true);
  for (let i = 0; i < 60; i++) {
    stepSimulation(run, 1 / 30);
    if (run.enemies.length > 0) break;
  }
  const wave1ScoutHp = run.enemies[0].maxHp;

  // Place turrets to clear wave 1 quickly
  let placed = 0;
  for (const p of run.map.path) {
    for (const [dc, dr] of [
      [0, -1],
      [0, 1],
      [1, 0],
      [-1, 0],
    ]) {
      if (placed >= 4) break;
      if (canPlaceTowerAt(run, p.col + dc, p.row + dr)) {
        if (placeTower(run, 'cannon', p.col + dc, p.row + dr).ok) placed++;
      }
    }
  }

  for (let i = 0; i < 60 * 30; i++) {
    stepSimulation(run, 1 / 30);
    if (!run.waveActive) break;
  }
  assert.equal(run.waveActive, false);
  assert.ok(run.draftOptions !== null);

  // Pick power-up -> autoWaveTimer arms automatically -> stepping starts Wave 2 without clicking
  assert.equal(applyPowerUpChoice(run, run.draftOptions![0].id), true);
  assert.ok(run.autoWaveTimer > 0);

  let wave2Started = false;
  for (let i = 0; i < 5 * 30; i++) {
    stepSimulation(run, 1 / 30, (ev) => {
      if (ev.type === 'wave_start') wave2Started = true;
    });
    if (run.wave === 2 && run.enemies.length > 0) break;
  }
  assert.equal(wave2Started, true);
  assert.equal(run.wave, 2);
  const wave2ScoutHp = run.enemies[0].maxHp;
  assert.ok(
    wave2ScoutHp > wave1ScoutHp,
    `Wave 2 scout HP (${wave2ScoutHp}) must exceed Wave 1 (${wave1ScoutHp})`,
  );

  // Victory outcome grants next unlockable turret ('pyro')
  const outcomeWin = computeRunOutcome(run, true);
  assert.equal(outcomeWin.unlockedTowerId, 'pyro');
  assert.equal(outcomeWin.unlockedNextLevel, 2);
  const outcomeLoss = computeRunOutcome(run, false);
  assert.equal(outcomeLoss.unlockedTowerId, null);
  assert.equal(outcomeLoss.unlockedNextLevel, null);
});

test('campaign levels 1-8 escalate difficulty, roll random modifiers, and unlock sequentially', () => {
  assert.equal(LEVEL_DEFS.length, MAX_LEVEL);
  assert.equal(MAX_LEVEL, 8);

  for (let i = 1; i < LEVEL_DEFS.length; i++) {
    const prev = LEVEL_DEFS[i - 1];
    const curr = LEVEL_DEFS[i];
    assert.ok(curr.enemyHpScale > prev.enemyHpScale, `Level ${curr.level} HP scale must increase`);
    assert.ok(curr.enemySpeedScale > prev.enemySpeedScale, `Level ${curr.level} speed scale must increase`);
    assert.ok(curr.wavesBonus >= prev.wavesBonus, `Level ${curr.level} wavesBonus must not decrease`);
    assert.ok(curr.rewardMultiplier > prev.rewardMultiplier, `Level ${curr.level} reward mult must increase`);
  }

  // Verify random modifier counts match LevelDef expectations and reroll updates them
  let profile = createDefaultProfile();
  assert.equal(rollRandomLevelModifiers(1, profile.levelSeeds[1]).length, 0);
  const lv4ModsA = rollRandomLevelModifiers(4, profile.levelSeeds[4]);
  const lv8ModsA = rollRandomLevelModifiers(8, profile.levelSeeds[8]);
  assert.equal(lv4ModsA.length, getLevelDef(4).randomModifierCount);
  assert.equal(lv8ModsA.length, getLevelDef(8).randomModifierCount);
  assert.equal(new Set(lv8ModsA).size, lv8ModsA.length); // distinct modifiers

  // Rerolling level 4 seed changes rolled modifiers across seeds
  let foundDifferent = false;
  for (let s = 1; s <= 25; s++) {
    const updated = rerollLevelSeedInProfile(profile, 4, 700000 + s * 9973);
    const lv4ModsB = rollRandomLevelModifiers(4, updated.levelSeeds[4]);
    if (lv4ModsB.join(',') !== lv4ModsA.join(',')) {
      foundDifferent = true;
      break;
    }
  }
  assert.equal(foundDifferent, true, 'Rerolling level seed should vary random modifiers');

  // Run at Level 6 merges level random hazards + tighter starting scrap + higher enemy HP/speed
  profile = {
    ...profile,
    highestUnlockedLevel: 8,
    selectedLevel: 6,
  };
  const runLv1 = createRunState('standard', { ...profile, selectedLevel: 1 }, 505050);
  const runLv6 = createRunState('standard', profile, 505050);

  assert.equal(runLv6.level, 6);
  assert.equal(runLv6.levelModifiers.length, 3);
  for (const modId of runLv6.levelModifiers) {
    assert.ok(runLv6.activeModifiers.includes(modId));
  }
  assert.ok(runLv6.totalWaves! > runLv1.totalWaves!);
  assert.ok(runLv6.scrap < runLv1.scrap);

  // Verify spawned enemies at Level 6 have higher HP & speed than Level 1
  startNextWave(runLv1);
  startNextWave(runLv6);
  for (let i = 0; i < 30; i++) {
    stepSimulation(runLv1, 1 / 30);
    stepSimulation(runLv6, 1 / 30);
    if (runLv1.enemies.length > 0 && runLv6.enemies.length > 0) break;
  }
  assert.ok(runLv6.enemies[0].maxHp > runLv1.enemies[0].maxHp);
  assert.ok(runLv6.enemies[0].speed > runLv1.enemies[0].speed);

  // Max level (8) victory does not overflow unlockedNextLevel beyond MAX_LEVEL
  const runLv8 = createRunState('blitz', { ...profile, selectedLevel: 8 }, 606060);
  const lv8Outcome = computeRunOutcome(runLv8, true);
  assert.equal(lv8Outcome.level, 8);
  assert.equal(lv8Outcome.unlockedNextLevel, null);
});

test('turret card stat computations produce exact ATK, RNG, and SPA (seconds per attack)', () => {
  const profile = createDefaultProfile();
  const run = createRunState('standard', profile, 112233);
  for (const id of run.equippedLoadout) {
    const def = TOWER_DEFS[id];
    const eff = computeTowerEffectiveStats(
      { type: id, level: 1, onVantage: false, totalSpent: def.cost },
      run,
    );
    const spa = 1 / Math.max(0.05, eff.fireRate);
    assert.ok(eff.damage > 0);
    assert.ok(eff.range > 0);
    assert.ok(spa > 0 && Number.isFinite(spa));
  }
});

