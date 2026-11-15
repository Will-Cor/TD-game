import type { GameMap, GridCoord, TileKind } from './types';

export const MAP_COLS = 16;
export const MAP_ROWS = 10;

export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function buildMonotonicSwitchback(
  rng: () => number,
  pivotCols: number[],
  minRow = 1,
  maxRow = MAP_ROWS - 2,
  minStep = 2,
): GridCoord[] {
  const pivotRows: number[] = [];
  const startRow = randInt(rng, Math.max(minRow + 1, 2), Math.min(maxRow - 1, MAP_ROWS - 3));
  pivotRows.push(startRow);

  let goHigh = rng() < 0.5;
  for (let i = 1; i < pivotCols.length - 1; i++) {
    const prev = pivotRows[i - 1];
    let nextRow: number;
    if (goHigh) {
      const highCap = Math.max(minRow, Math.min(minRow + 2, prev - minStep));
      nextRow = randInt(rng, minRow, highCap);
      if (nextRow === prev) nextRow = minRow;
    } else {
      const lowFloor = Math.min(maxRow, Math.max(maxRow - 2, prev + minStep));
      nextRow = randInt(rng, lowFloor, maxRow);
      if (nextRow === prev) nextRow = maxRow;
    }
    pivotRows.push(nextRow);
    goHigh = !goHigh;
  }

  const lastPivot = pivotRows[pivotRows.length - 1];
  const exitRow =
    lastPivot <= 4
      ? randInt(rng, Math.min(maxRow, lastPivot + 1), maxRow)
      : randInt(rng, minRow, Math.max(minRow, lastPivot - 1));
  pivotRows.push(exitRow);

  const path: GridCoord[] = [];
  const pushTile = (col: number, row: number) => {
    const last = path[path.length - 1];
    if (!last || last.col !== col || last.row !== row) {
      path.push({ col, row });
    }
  };

  let curCol = pivotCols[0];
  let curRow = pivotRows[0];
  pushTile(curCol, curRow);

  for (let i = 1; i < pivotCols.length; i++) {
    const targetCol = pivotCols[i];
    const targetRow = pivotRows[i];
    const turnCol = i === pivotCols.length - 1 ? targetCol - 1 : targetCol;
    while (curCol < turnCol) {
      curCol += 1;
      pushTile(curCol, curRow);
    }
    while (curRow !== targetRow) {
      curRow += curRow < targetRow ? 1 : -1;
      pushTile(curCol, curRow);
    }
    while (curCol < targetCol) {
      curCol += 1;
      pushTile(curCol, curRow);
    }
  }
  return path;
}

function traceWaypoints(waypoints: GridCoord[], mirrorY: boolean): GridCoord[] {
  const mapped = mirrorY
    ? waypoints.map((w) => ({ col: w.col, row: MAP_ROWS - 1 - w.row }))
    : waypoints;
  const path: GridCoord[] = [];
  const pushTile = (col: number, row: number) => {
    const last = path[path.length - 1];
    if (!last || last.col !== col || last.row !== row) {
      path.push({ col, row });
    }
  };

  let curCol = mapped[0].col;
  let curRow = mapped[0].row;
  pushTile(curCol, curRow);

  for (let i = 1; i < mapped.length; i++) {
    const wp = mapped[i];
    while (curCol !== wp.col) {
      curCol += curCol < wp.col ? 1 : -1;
      pushTile(curCol, curRow);
    }
    while (curRow !== wp.row) {
      curRow += curRow < wp.row ? 1 : -1;
      pushTile(curCol, curRow);
    }
  }
  return path;
}

/**
 * Distinct angular plaza canal trails inspired by Edge of Heaven:
 * curving around central stepped courtyard pockets between portal & beacon tower.
 */
function buildLevelPath(rng: () => number, level: number): GridCoord[] {
  const clamped = Math.max(1, Math.min(8, Math.round(level)));
  const mirrorY = rng() < 0.5;

  // Level 1 (Plaza Promenades): Crisp Edge-of-Heaven courtyard wrap around central terrace
  if (clamped === 1) {
    const cLeft = randInt(rng, 2, 3);
    const cMid = randInt(rng, 6, 7);
    const cRight = randInt(rng, 10, 12);
    const rTop = randInt(rng, 1, 2);
    const rBot = randInt(rng, 7, 8);
    return traceWaypoints(
      [
        { col: 0, row: 2 },
        { col: cLeft, row: 2 },
        { col: cLeft, row: rBot },
        { col: cMid, row: rBot },
        { col: cMid, row: rTop },
        { col: cRight, row: rTop },
        { col: cRight, row: 6 },
        { col: MAP_COLS - 1, row: 6 },
      ],
      mirrorY,
    );
  }

  // Level 2 (Foundry Canal): Wide sweeping ironworks S-canal
  if (clamped === 2) {
    const cRight = randInt(rng, 11, 13);
    const cLeft = randInt(rng, 2, 4);
    const rTop = randInt(rng, 1, 2);
    const rMid = randInt(rng, 4, 5);
    const rBot = randInt(rng, 7, 8);
    return traceWaypoints(
      [
        { col: 0, row: rTop },
        { col: cRight, row: rTop },
        { col: cRight, row: rMid },
        { col: cLeft, row: rMid },
        { col: cLeft, row: rBot },
        { col: MAP_COLS - 1, row: rBot },
      ],
      mirrorY,
    );
  }

  // Level 3 (Jade Causeway): Stepped garden terrace zig-zag around lush central islands
  if (clamped === 3) {
    const c1 = randInt(rng, 2, 3);
    const c2 = randInt(rng, 5, 6);
    const c3 = randInt(rng, 8, 9);
    const c4 = randInt(rng, 11, 13);
    return traceWaypoints(
      [
        { col: 0, row: 1 },
        { col: c1, row: 1 },
        { col: c1, row: 3 },
        { col: c2, row: 3 },
        { col: c2, row: 5 },
        { col: c3, row: 5 },
        { col: c3, row: 7 },
        { col: c4, row: 7 },
        { col: c4, row: 8 },
        { col: MAP_COLS - 1, row: 8 },
      ],
      mirrorY,
    );
  }

  // Level 4 (Glacial Conduit): Tall amphitheater flank drops
  if (clamped === 4) {
    const c1 = randInt(rng, 2, 3);
    const c2 = randInt(rng, 5, 6);
    const c3 = randInt(rng, 8, 9);
    const c4 = randInt(rng, 11, 12);
    return traceWaypoints(
      [
        { col: 0, row: 5 },
        { col: c1, row: 5 },
        { col: c1, row: 1 },
        { col: c2, row: 1 },
        { col: c2, row: 8 },
        { col: c3, row: 8 },
        { col: c3, row: 1 },
        { col: c4, row: 1 },
        { col: c4, row: 7 },
        { col: MAP_COLS - 1, row: 7 },
      ],
      mirrorY,
    );
  }

  // Level 5 (Caldera Cloister): Deep twin-moat citadel loop
  if (clamped === 5) {
    const x1 = randInt(rng, 2, 3);
    const x2 = randInt(rng, 6, 7);
    const x3 = randInt(rng, 11, 13);
    return traceWaypoints(
      [
        { col: 0, row: 4 },
        { col: x1, row: 4 },
        { col: x1, row: 1 },
        { col: x2, row: 1 },
        { col: x2, row: 8 },
        { col: x3, row: 8 },
        { col: x3, row: 2 },
        { col: MAP_COLS - 1, row: 2 },
      ],
      mirrorY,
    );
  }

  // Level 6 (Sunstone Courtyard): Multi-chicane promenade with balanced pockets
  if (clamped === 6) {
    return buildMonotonicSwitchback(rng, [0, 2, 4, 6, 8, 10, 12, MAP_COLS - 1], 2, MAP_ROWS - 3, 2);
  }

  // Level 7 (Amethyst Sanctum): High approach trench dropping into central bastion lock
  if (clamped === 7) {
    const cGate = randInt(rng, 5, 7);
    const cMid = randInt(rng, 9, 10);
    const cEnd = randInt(rng, 12, 13);
    return traceWaypoints(
      [
        { col: 0, row: 2 },
        { col: cGate, row: 2 },
        { col: cGate, row: 8 },
        { col: cMid, row: 8 },
        { col: cMid, row: 1 },
        { col: cEnd, row: 1 },
        { col: cEnd, row: 5 },
        { col: MAP_COLS - 1, row: 5 },
      ],
      mirrorY,
    );
  }

  // Level 8 (Omega Plaza): Grand serpentine courtyard canal + exit sanctum hook
  const cTop = randInt(rng, 12, 13);
  const cBack = randInt(rng, 2, 3);
  const cHook = randInt(rng, 9, 11);
  return traceWaypoints(
    [
      { col: 0, row: 1 },
      { col: cTop, row: 1 },
      { col: cTop, row: 4 },
      { col: cBack, row: 4 },
      { col: cBack, row: 8 },
      { col: cHook, row: 8 },
      { col: cHook, row: 6 },
      { col: MAP_COLS - 1, row: 6 },
    ],
    mirrorY,
  );
}

export function generateRandomMap(seedInput?: number, level = 1): GameMap {
  const clampedLevel = Math.max(1, Math.min(8, Math.round(level)));
  const seed = seedInput ?? (Math.floor(Math.random() * 900000) + 100000);
  const rng = createRng((seed ^ Math.imul(clampedLevel, 0x9e3779b1)) >>> 0);

  const tiles: TileKind[][] = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, () => 'buildable' as TileKind),
  );

  const path = buildLevelPath(rng, clampedLevel);

  for (const coord of path) {
    tiles[coord.row][coord.col] = 'path';
  }

  const spawn = path[0];
  const exit = path[path.length - 1];
  tiles[spawn.row][spawn.col] = 'spawn';
  tiles[exit.row][exit.col] = 'exit';

  // Scenic obstacle pockets (courtyard planters/rocks/structures) away from spawn/exit mouths
  const farFromPath: GridCoord[] = [];
  const nearCorners: GridCoord[] = [];
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    for (let c = 1; c < MAP_COLS - 1; c++) {
      if (tiles[r][c] !== 'buildable') continue;
      const distToSpawn = Math.abs(c - spawn.col) + Math.abs(r - spawn.row);
      const distToExit = Math.abs(c - exit.col) + Math.abs(r - exit.row);
      if (distToSpawn <= 2 || distToExit <= 2) continue;

      let minDist = Infinity;
      for (const p of path) {
        const d = Math.abs(p.col - c) + Math.abs(p.row - r);
        if (d < minDist) minDist = d;
      }
      if (minDist >= 2) {
        farFromPath.push({ col: c, row: r });
      } else if (minDist === 1 && (c + r) % 3 === 0) {
        nearCorners.push({ col: c, row: r });
      }
    }
  }

  const shuffle = <T,>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  // No elevated platforms ('vantage') — smooth continuous plaza everywhere buildable
  const obstaclePool = shuffle([...farFromPath, ...nearCorners]);
  const obstacleCount = randInt(rng, 5, 7);
  for (let i = 0; i < Math.min(obstacleCount, obstaclePool.length); i++) {
    const { col, row } = obstaclePool[i];
    if (tiles[row][col] === 'buildable') {
      tiles[row][col] = 'obstacle';
    }
  }

  return {
    seed,
    level: clampedLevel,
    cols: MAP_COLS,
    rows: MAP_ROWS,
    tiles,
    path,
    spawn,
    exit,
  };
}

export function isValidPath(map: GameMap): boolean {
  if (map.path.length < 16) return false;
  if (map.path[0].col !== 0 || map.path[map.path.length - 1].col !== map.cols - 1) {
    return false;
  }
  const seen = new Set<string>();
  for (let i = 0; i < map.path.length; i++) {
    const cur = map.path[i];
    const key = `${cur.col},${cur.row}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (i > 0) {
      const prev = map.path[i - 1];
      const manhattan = Math.abs(cur.col - prev.col) + Math.abs(cur.row - prev.row);
      if (manhattan !== 1) return false;
    }
  }
  return true;
}
