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

export function generateRandomMap(seedInput?: number): GameMap {
  const seed = seedInput ?? (Math.floor(Math.random() * 900000) + 100000);
  const rng = createRng(seed);

  const tiles: TileKind[][] = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, () => 'buildable' as TileKind),
  );

  // Pick pivot columns spaced 3 apart so switchbacks never touch or self-intersect
  const pivotCols = [0, 3, 6, 9, 12, MAP_COLS - 1];
  const pivotRows: number[] = [];

  // Choose initial row cleanly inside 1..MAP_ROWS-2
  const startRow = randInt(rng, 2, MAP_ROWS - 3);
  pivotRows.push(startRow);

  // Alternate high/low excursions with at least 3 rows of vertical travel on bends
  let goHigh = rng() < 0.5;
  for (let i = 1; i < pivotCols.length - 1; i++) {
    const prev = pivotRows[i - 1];
    let nextRow: number;
    if (goHigh) {
      nextRow = randInt(rng, 1, Math.max(1, Math.min(3, prev - 2)));
      if (nextRow === prev) nextRow = 1;
    } else {
      nextRow = randInt(rng, Math.min(MAP_ROWS - 2, Math.max(MAP_ROWS - 4, prev + 2)), MAP_ROWS - 2);
      if (nextRow === prev) nextRow = MAP_ROWS - 2;
    }
    pivotRows.push(nextRow);
    goHigh = !goHigh;
  }

  // Exit row differs slightly from penultimate pivot or flows cleanly to edge
  const lastPivot = pivotRows[pivotRows.length - 1];
  const exitRow =
    lastPivot <= 4
      ? randInt(rng, Math.min(MAP_ROWS - 2, lastPivot + 1), MAP_ROWS - 2)
      : randInt(rng, 1, Math.max(1, lastPivot - 1));
  pivotRows.push(exitRow);

  // Trace path through pivots: horizontal first, then vertical at pivot column
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

    // Step horizontally to targetCol (or targetCol - 1 on final segment before vertical alignment)
    const turnCol = i === pivotCols.length - 1 ? targetCol - 1 : targetCol;
    while (curCol < turnCol) {
      curCol += 1;
      pushTile(curCol, curRow);
    }

    // Step vertically to targetRow
    while (curRow !== targetRow) {
      curRow += curRow < targetRow ? 1 : -1;
      pushTile(curCol, curRow);
    }

    // Finish horizontal into exit column if needed
    while (curCol < targetCol) {
      curCol += 1;
      pushTile(curCol, curRow);
    }
  }

  for (const coord of path) {
    tiles[coord.row][coord.col] = 'path';
  }

  const spawn = path[0];
  const exit = path[path.length - 1];
  tiles[spawn.row][spawn.col] = 'spawn';
  tiles[exit.row][exit.col] = 'exit';

  // Find candidate buildable tiles adjacent (Manhattan <= 2) to the path for Vantage points
  const nearPath: GridCoord[] = [];
  const farFromPath: GridCoord[] = [];
  for (let r = 0; r < MAP_ROWS; r++) {
    for (let c = 0; c < MAP_COLS; c++) {
      if (tiles[r][c] !== 'buildable') continue;
      let minDist = Infinity;
      for (const p of path) {
        const d = Math.abs(p.col - c) + Math.abs(p.row - r);
        if (d < minDist) minDist = d;
      }
      if (minDist === 1 || minDist === 2) {
        nearPath.push({ col: c, row: r });
      } else {
        farFromPath.push({ col: c, row: r });
      }
    }
  }

  // Shuffle helper
  const shuffle = <T,>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const vantageCandidates = shuffle(nearPath);
  const vantageCount = 3;
  for (let i = 0; i < Math.min(vantageCount, vantageCandidates.length); i++) {
    const { col, row } = vantageCandidates[i];
    tiles[row][col] = 'vantage';
  }

  // Place granite obstacles mostly away from prime choke points, with a couple tactical blockers
  const obstaclePool = shuffle([
    ...farFromPath,
    ...vantageCandidates.slice(vantageCount + 4),
  ]);
  const obstacleCount = randInt(rng, 5, 8);
  for (let i = 0; i < Math.min(obstacleCount, obstaclePool.length); i++) {
    const { col, row } = obstaclePool[i];
    if (tiles[row][col] === 'buildable') {
      tiles[row][col] = 'obstacle';
    }
  }

  return {
    seed,
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
