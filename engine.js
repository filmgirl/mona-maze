export const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const CAPTURE_SECONDS = 5;
export const ITEMS = {
  chip: { name: 'Computer chip', points: 250, color: '--cp-warning', symbol: 'C' },
  overclock: { name: 'Overclock', seconds: 6, multiplier: 1.3, color: '--cp-accent', symbol: '+' },
  firewall: { name: 'Firewall', seconds: 8, grace: 1, color: '--cp-link', symbol: 'F' },
};
export const MAPS = [
  { name: 'Contribution garden', branch: 'main', seed: 42, width: 19, height: 17, subtitle: 'Every commit counts.' },
  { name: 'The call stack', branch: 'feature/recursion', seed: 137, width: 21, height: 17, subtitle: 'Find your way out of the function.' },
];
export const ENEMIES = [
  { name: 'Merge conflict', tag: 'CONFLICT', symbol: '≠', color: '--cp-accent' },
  { name: 'Runtime bug', tag: 'BUG', symbol: '{}', color: '--cp-danger' },
  { name: 'Failed build', tag: 'BUILD FAILED', symbol: '×', color: '--cp-warning' },
  { name: 'Null pointer', tag: 'NULL', symbol: 'ø', color: '--cp-text-muted' },
];

export function enemyAppearance(index, power, { captured = false, releaseGrace = 0 } = {}) {
  const unavailable = captured || releaseGrace > 0;
  const catchable = power > 0 && !unavailable;
  return {
    catchable,
    color: unavailable ? '--cp-text-soft' : catchable ? '--cp-link' : ENEMIES[index].color,
    label: captured ? 'HELD' : releaseGrace > 0 ? 'RELEASING' : catchable ? '+ CATCH' : `! ${ENEMIES[index].tag}`,
  };
}

function random(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function normalizeSeed(seed) {
  if (!Number.isSafeInteger(seed)) throw new Error('Run seed must be a safe integer.');
  return seed >>> 0;
}

function levelSeed(seed, level, themeSeed) {
  let value = (seed ^ Math.imul(level, 0x9e3779b9) ^ themeSeed) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

function reachableCells(map) {
  const { grid, start, exit } = map;
  const visited = new Set();
  if (grid[start[1]]?.[start[0]] !== 0) return visited;
  const queue = [start];
  visited.add(start.join(','));
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of DIRECTIONS) {
      const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
      if (grid[ny]?.[nx] !== 0 || (nx === exit[0] && ny === exit[1]) || visited.has(key)) continue;
      visited.add(key);
      queue.push([nx, ny]);
    }
  }
  return visited;
}

export function validateMap(map) {
  const reachable = reachableCells(map);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (x === map.exit[0] && y === map.exit[1]) continue;
      if (map.grid[y][x] === 0 && !reachable.has(`${x},${y}`)) {
        throw new Error(`Invalid maze: unreachable cell ${x},${y} with portal locked.`);
      }
    }
  }
  if (!reachable.has(map.start.join(',')) || !reachable.has(map.pen.release.join(',')) ||
      !reachable.has(`${map.exit[0]},1`)) {
    throw new Error('Invalid maze: start, pen release, or exit approach is unreachable.');
  }
  return true;
}

function repairConnectivity(map) {
  const { grid, width, height, pen } = map;
  let reachable = reachableCells(map);
  if (!reachable.size) throw new Error('Cannot repair maze: start is blocked.');
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (grid[y][x] || reachable.has(`${x},${y}`)) continue;
      // Join disconnected components through interior walls, never through the pen or portal.
      const queue = [[x, y]];
      const previous = new Map([[`${x},${y}`, null]]);
      let joined = null;
      for (let i = 0; i < queue.length && !joined; i++) {
        const cell = queue[i];
        for (const [dx, dy] of DIRECTIONS) {
          const nx = cell[0] + dx, ny = cell[1] + dy, key = `${nx},${ny}`;
          if (nx < 1 || nx >= width - 1 || ny < 1 || ny >= height - 1 ||
              (nx >= pen.bounds.x && nx < pen.bounds.x + pen.bounds.width &&
               ny >= pen.bounds.y && ny < pen.bounds.y + pen.bounds.height) || previous.has(key)) continue;
          previous.set(key, cell);
          if (reachable.has(key)) { joined = [nx, ny]; break; }
          queue.push([nx, ny]);
        }
      }
      if (!joined) throw new Error(`Cannot repair maze component at ${x},${y}.`);
      while (joined) {
        grid[joined[1]][joined[0]] = 0;
        joined = previous.get(joined.join(','));
      }
      reachable = reachableCells(map);
    }
  }
  validateMap(map);
}

export function createMap(index, { level = index + 1, seed = 0 } = {}) {
  if (!Number.isInteger(index) || !MAPS[index]) throw new Error('Invalid map theme index.');
  if (!Number.isSafeInteger(level) || level < 1) throw new Error('Level must be a positive safe integer.');
  const config = MAPS[index];
  const { width: w, height: h } = config;
  const runSeed = normalizeSeed(seed);
  const mapSeed = level <= 2 ? config.seed : levelSeed(runSeed, level, config.seed);
  const rand = random(mapSeed);
  const grid = Array.from({ length: h }, () => Array(w).fill(1));
  const stack = [[1, 1]];
  grid[1][1] = 0;
  while (stack.length) {
    const [x, y] = stack.at(-1);
    const choices = DIRECTIONS.map(([dx, dy]) => [x + dx * 2, y + dy * 2])
      .filter(([nx, ny]) => nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && grid[ny][nx]);
    if (!choices.length) { stack.pop(); continue; }
    const [nx, ny] = choices[Math.floor(rand() * choices.length)];
    grid[(y + ny) / 2][(x + nx) / 2] = 0;
    grid[ny][nx] = 0;
    stack.push([nx, ny]);
  }
  // Open a perimeter circuit and extra links so enemies never trap a dead-end maze.
  for (let x = 1; x < w - 1; x++) grid[1][x] = grid[h - 2][x] = 0;
  for (let y = 1; y < h - 1; y++) grid[y][1] = grid[y][w - 2] = 0;
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      if (grid[y][x] && rand() < 0.22 &&
          ((!grid[y][x - 1] && !grid[y][x + 1]) || (!grid[y - 1][x] && !grid[y + 1][x]))) grid[y][x] = 0;
    }
  }
  const exit = [Math.floor(w / 2), 0];
  const rooms = [
    { x: exit[0] - 2, y: 1, width: 5, height: 3, name: 'Deployment plaza' },
    { x: w - 7, y: h - 6, width: 3, height: 3, name: 'Code review lounge' },
  ];
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) grid[y][x] = 0;
    }
  }
  const px = Math.floor(w / 2) - 1;
  const py = Math.floor(h / 2) - 1;
  const pen = {
    cells: [[px, py], [px + 2, py], [px, py + 2], [px + 2, py + 2]],
    release: [px + 1, py + 3],
    bounds: { x: px, y: py, width: 3, height: 3 },
  };
  // The open ring reconnects every corridor interrupted by the solid holding pen.
  for (let y = py - 1; y <= py + 3; y++) {
    for (let x = px - 1; x <= px + 3; x++) {
      grid[y][x] = x >= px && x <= px + 2 && y >= py && y <= py + 2 ? 1 : 0;
    }
  }
  grid[exit[1]][exit[0]] = 0;
  const map = { ...config, seed: mapSeed, level, grid, rooms, pen, exit, start: [1, h - 2] };
  repairConnectivity(map);
  return map;
}

function actor(x, y, direction = 0) {
  return { cell: [x, y], from: [x, y], to: null, progress: 0, x, y, direction, previous: null };
}

export class Game {
  constructor(index = 0, onEvent = () => {}, { seed = 0 } = {}) {
    this.onEvent = onEvent;
    this.runSeed = normalizeSeed(seed);
    this.movementMode = 'arcade';
    this.reset(index);
  }
  reset(index = this.index, level = index + 1) {
    this.initializeLevel(index, level);
  }
  initializeLevel(index, level, score = 0, lives = 3) {
    this.index = index;
    this.level = level;
    this.map = createMap(index, { level: this.level, seed: this.runSeed });
    this.random = random(this.map.seed + 11);
    this.status = 'ready';
    this.score = score;
    this.lives = lives;
    this.elapsed = 0;
    this.power = 0;
    this.overclock = 0;
    this.firewall = 0;
    this.combo = 0;
    this.invulnerable = 0;
    this.desired = null;
    this.exitReady = false;
    this.chaseCell = '';
    this.chaseDistances = null;
    this.pellets = new Map();
    const { grid, width: w, height: h, start, exit } = this.map;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!grid[y][x] && (x !== start[0] || y !== start[1]) && (x !== exit[0] || y !== exit[1])) {
        const power = (x === 1 || x === w - 2) && (y === 1 || y === h - 2);
        this.pellets.set(`${x},${y}`, { x, y, power });
      }
    }
    // The fourth power-up sits just above Mona's starting tile.
    this.pellets.set(`1,${h - 3}`, { x: 1, y: h - 3, power: true });
    this.items = new Map();
    this.spawns = [[w - 2, 1], [w - 2, h - 2], [1, 1], [w - 4, 1]];
    const reserved = new Set([...this.spawns, this.map.pen.release, [exit[0], 1]].map(cell => cell.join(',')));
    const candidates = [...this.pellets.values()].filter(p => !p.power && !reserved.has(`${p.x},${p.y}`));
    const itemRandom = random(this.map.seed ^ 0xa5a5a5a5);
    for (const kind of Object.keys(ITEMS)) {
      const [cell] = candidates.splice(Math.floor(itemRandom() * candidates.length), 1);
      if (!cell) throw new Error('Invalid maze: not enough cells for optional items.');
      const key = `${cell.x},${cell.y}`;
      this.items.set(key, { x: cell.x, y: cell.y, kind });
      this.pellets.delete(key);
    }
    this.total = this.pellets.size;
    this.player = actor(...start);
    this.enemies = this.spawns.map(([x, y], i) => ({
      ...actor(x, y), id: i, cooldown: 0, captured: false, releaseGrace: 0,
    }));
    this.onEvent({ type: 'reset' });
  }
  start() {
    if (this.status === 'ready') { this.status = 'playing'; this.invulnerable = 2; }
  }
  nextLevel() {
    if (this.status !== 'won') throw new Error('Enter the unlocked deployment portal before advancing.');
    this.initializeLevel((this.index + 1) % MAPS.length, this.level + 1, this.score, this.lives);
    this.start();
  }
  pause() {
    if (this.status === 'playing') this.status = 'paused';
    else if (this.status === 'paused') this.status = 'playing';
  }
  open(x, y) {
    if (x === this.map.exit[0] && y === this.map.exit[1] && !this.exitReady) return false;
    return this.map.grid[y]?.[x] === 0;
  }
  canMove(a, direction) {
    if (direction === null) return false;
    const [dx, dy] = DIRECTIONS[direction];
    return this.open(a.cell[0] + dx, a.cell[1] + dy);
  }
  neighbors(x, y) {
    return DIRECTIONS.map(([dx, dy], d) => ({ x: x + dx, y: y + dy, d }))
      .filter(p => this.open(p.x, p.y));
  }
  distances(x, y) {
    const distances = new Map([[`${x},${y}`, 0]]);
    const queue = [[x, y]];
    for (let i = 0; i < queue.length; i++) {
      const [cx, cy] = queue[i];
      for (const p of this.neighbors(cx, cy)) {
        const key = `${p.x},${p.y}`;
        if (!distances.has(key)) {
          distances.set(key, distances.get(`${cx},${cy}`) + 1);
          queue.push([p.x, p.y]);
        }
      }
    }
    return distances;
  }
  move(a, distance, choose, arrive) {
    while (distance > 0) {
      if (!a.to) {
        const direction = choose();
        if (!this.canMove(a, direction)) return;
        a.direction = direction;
        a.from = [...a.cell];
        const [dx, dy] = DIRECTIONS[direction];
        a.to = [a.cell[0] + dx, a.cell[1] + dy];
        a.progress = 0;
      }
      const step = Math.min(distance, 1 - a.progress);
      a.progress += step;
      distance -= step;
      a.x = a.from[0] + (a.to[0] - a.from[0]) * a.progress;
      a.y = a.from[1] + (a.to[1] - a.from[1]) * a.progress;
      if (a.progress >= 1 - 1e-9) {
        a.previous = a.from;
        a.cell = a.to;
        a.to = null;
        a.progress = 0;
        arrive?.();
        if (this.status !== 'playing') return;
      }
    }
  }
  collect() {
    const key = this.player.cell.join(',');
    if (this.exitReady && key === this.map.exit.join(',')) {
      this.status = 'won';
      this.onEvent({ type: 'won' });
      return;
    }
    const item = this.items.get(key);
    if (item) {
      this.items.delete(key);
      const definition = ITEMS[item.kind];
      if (item.kind === 'chip') this.score += definition.points;
      else this[item.kind] = definition.seconds;
      this.onEvent({ type: 'item', kind: item.kind, key });
    }
    const pellet = this.pellets.get(key);
    if (!pellet) return;
    this.pellets.delete(key);
    this.score += pellet.power ? 50 : 10;
    if (pellet.power) { this.power = 8; this.combo = 0; }
    this.onEvent({ type: pellet.power ? 'power' : 'pellet', key });
    if (!this.pellets.size) {
      this.exitReady = true;
      this.onEvent({ type: 'exit-ready' });
    }
  }
  tick(dt) {
    if (this.status !== 'playing') return;
    // Bound the simulation step so tab stalls cannot tunnel through enemies.
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    this.power = Math.max(0, this.power - dt);
    const boostedSeconds = Math.min(dt, this.overclock);
    this.overclock = Math.max(0, this.overclock - dt);
    this.firewall = Math.max(0, this.firewall - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.move(this.player, 4.4 * (dt + (ITEMS.overclock.multiplier - 1) * boostedSeconds), () => {
      if (this.canMove(this.player, this.desired)) return this.desired;
      return this.desired === null || this.movementMode === 'first' ? null : this.player.direction;
    }, () => this.collect());
    if (this.status !== 'playing' || this.exitReady) return;
    const chaseCell = this.player.cell.join(',');
    if (this.chaseCell !== chaseCell) {
      this.chaseCell = chaseCell;
      this.chaseDistances = this.distances(...this.player.cell);
    }
    const distances = this.chaseDistances;
    for (const enemy of this.enemies) {
      if (enemy.captured) {
        enemy.cooldown = Math.max(0, enemy.cooldown - dt);
        if (enemy.cooldown < 1e-9) {
          Object.assign(enemy, actor(...this.map.pen.release), { captured: false, cooldown: 0, releaseGrace: 1 });
        }
        continue;
      }
      enemy.releaseGrace = Math.max(0, enemy.releaseGrace - dt);
      if (enemy.cooldown > 0) { enemy.cooldown -= dt; continue; }
      this.move(enemy, dt * (this.power ? 1.6 : 2.2 + this.index * 0.2), () => {
        let choices = this.neighbors(...enemy.cell);
        const forward = choices.filter(p => !enemy.previous || p.x !== enemy.previous[0] || p.y !== enemy.previous[1]);
        if (forward.length) choices = forward;
        if (this.random() < (enemy.id === 1 ? 0.5 : 0.2)) return choices[Math.floor(this.random() * choices.length)].d;
        choices.sort((a, b) => (distances.get(`${a.x},${a.y}`) - distances.get(`${b.x},${b.y}`)) * (this.power ? -1 : 1));
        return choices[0].d;
      });
      if (!enemy.releaseGrace && Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) < 0.62) {
        if (this.power > 0) {
          this.score += 200 * 2 ** Math.min(this.combo++, 3);
          Object.assign(enemy, actor(...this.map.pen.cells[enemy.id]), {
            captured: true, cooldown: CAPTURE_SECONDS, releaseGrace: 0,
          });
          this.onEvent({ type: 'enemy', id: enemy.id });
        } else if (!this.invulnerable) {
          if (this.firewall > 0) {
            this.firewall = 0;
            this.invulnerable = ITEMS.firewall.grace;
            this.onEvent({ type: 'shield-hit', id: enemy.id });
            continue;
          }
          this.lives--;
          this.power = 0;
          this.overclock = 0;
          this.firewall = 0;
          this.combo = 0;
          this.invulnerable = 0;
          if (!this.lives) {
            this.status = 'over';
            this.onEvent({ type: 'over' });
          } else {
            this.player = actor(...this.map.start);
            this.enemies.forEach((e, i) => Object.assign(e, actor(...this.spawns[i]), {
              cooldown: 1, captured: false, releaseGrace: 0,
            }));
            this.invulnerable = 3;
            this.desired = null;
            this.onEvent({ type: 'hit' });
          }
          break;
        }
      }
    }
  }
}
