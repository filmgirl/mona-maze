import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game, MAPS, ENEMIES, ITEMS, CAPTURE_SECONDS, createMap, validateMap, enemyAppearance } from './engine.js';

test('held and releasing bugs never advertise themselves as catchable', () => {
  assert.deepEqual(enemyAppearance(0, 8, { captured: true }), { catchable: false, color: '--cp-text-soft', label: 'HELD' });
  assert.deepEqual(enemyAppearance(0, 8, { releaseGrace: 1 }), { catchable: false, color: '--cp-text-soft', label: 'RELEASING' });
});

function place(actor, [x, y]) {
  Object.assign(actor, { x, y, cell: [x, y], from: [x, y], to: null, progress: 0, previous: null });
}

function captureAll(game) {
  game.start();
  game.power = 8;
  for (const enemy of game.enemies) place(enemy, game.player.cell);
  game.tick(.001);
}

test('dangerous bugs never use collectible green or catchable blue', () => {
  for (let index = 0; index < ENEMIES.length; index++) {
    const appearance = enemyAppearance(index, 0);
    assert.equal(appearance.catchable, false);
    assert.ok(!['--cp-link', '--cp-success'].includes(appearance.color));
    assert.match(appearance.label, /^! /);
  }
});

test('every bug switches color and label exactly when power expires', () => {
  for (let index = 0; index < ENEMIES.length; index++) {
    assert.deepEqual(enemyAppearance(index, .001), { catchable: true, color: '--cp-link', label: '+ CATCH' });
    assert.equal(enemyAppearance(index, 0).catchable, false);
    assert.equal(enemyAppearance(index, -1).catchable, false);
  }
});

for (let index = 0; index < MAPS.length; index++) {
  test(`${MAPS[index].name}: all commits and enemy spawns are reachable`, () => {
    const game = new Game(index);
    const reachable = game.distances(...game.map.start);
    for (const key of game.pellets.keys()) assert.ok(reachable.has(key), key);
    for (const enemy of game.enemies) assert.ok(reachable.has(enemy.cell.join(',')));
    assert.equal([...game.pellets.values()].filter(p => p.power).length, 4);
    assert.ok(game.total > 140);
  });

  test(`${MAPS[index].name}: pen is solid, isolated from Mona, and surrounded by connected corridors`, () => {
    const game = new Game(index);
    const { pen, grid, exit, rooms } = game.map;
    const { x, y, width, height } = pen.bounds;
    assert.equal(pen.cells.length, ENEMIES.length);
    assert.equal(new Set(pen.cells.map(cell => cell.join(','))).size, ENEMIES.length);
    for (const [cx, cy] of pen.cells) {
      assert.ok(Number.isInteger(cx) && Number.isInteger(cy));
      assert.ok(cx >= x && cx < x + width && cy >= y && cy < y + height);
    }
    for (let cy = y; cy < y + height; cy++) {
      for (let cx = x; cx < x + width; cx++) {
        assert.equal(game.open(cx, cy), false);
        assert.equal(game.pellets.has(`${cx},${cy}`), false);
        assert.notDeepEqual([cx, cy], exit);
        assert.ok(rooms.every(room => cx < room.x || cx >= room.x + room.width ||
          cy < room.y || cy >= room.y + room.height));
      }
    }
    for (let cy = y - 1; cy <= y + height; cy++) {
      for (let cx = x - 1; cx <= x + width; cx++) {
        if (cx === x - 1 || cx === x + width || cy === y - 1 || cy === y + height) {
          assert.equal(game.open(cx, cy), true);
        }
      }
    }
    assert.equal(game.open(...pen.release), true);
    assert.ok(pen.cells.some(([cx, cy]) => Math.abs(cx - pen.release[0]) + Math.abs(cy - pen.release[1]) <= 2));
    place(game.player, pen.release);
    assert.equal(game.canMove(game.player, 0), false);
    game.exitReady = true;
    const reachable = game.distances(...game.map.start);
    for (let cy = 0; cy < grid.length; cy++) {
      for (let cx = 0; cx < grid[cy].length; cx++) {
        if (!grid[cy][cx]) assert.ok(reachable.has(`${cx},${cy}`), `${cx},${cy}`);
      }
    }
    assert.ok(reachable.has(exit.join(',')));
  });
}

test('Mona cannot move through walls; ready and paused states do not advance', () => {
  const game = new Game();
  game.desired = 3;
  game.tick(.05);
  assert.equal(game.elapsed, 0);
  game.start();
  game.player.direction = 3;
  for (let i = 0; i < 10; i++) game.tick(.05);
  assert.equal(game.player.x, 1);
  game.pause();
  const elapsed = game.elapsed;
  game.tick(.05);
  assert.equal(game.elapsed, elapsed);
  game.pause();
  assert.equal(game.status, 'playing');
});

test('collecting a pull request powers Mona for eight seconds', () => {
  const game = new Game();
  game.start();
  game.player.cell = [1, game.map.height - 3];
  game.collect();
  assert.equal(game.score, 50);
  assert.equal(game.power, 8);
  assert.equal(game.pellets.size, game.total - 1);
  game.collect();
  assert.equal(game.score, 50);
});

test('the last commit unlocks the portal without ending the level', () => {
  const game = new Game();
  game.start();
  const regular = [...game.pellets.values()].find(p => !p.power);
  game.pellets = new Map([[`${regular.x},${regular.y}`, regular]]);
  game.player.cell = [regular.x, regular.y];
  game.collect();
  assert.equal(game.score, 10);
  assert.equal(game.status, 'playing');
  assert.equal(game.exitReady, true);
  assert.equal(game.open(...game.map.exit), true);
});

test('enemy collision costs a life, grants a shield, and eventually ends the run', () => {
  const game = new Game();
  game.start();
  for (let life = 2; life >= 0; life--) {
    game.invulnerable = 0;
    const enemy = game.enemies[0];
    Object.assign(enemy, { x: game.player.x, y: game.player.y, cell: [...game.player.cell], to: null, cooldown: 0 });
    game.tick(.001);
    assert.equal(game.lives, life);
    if (life) assert.equal(game.invulnerable, 3);
  }
  assert.equal(game.status, 'over');
});

test('powered Mona captures a bug in its pen slot and clears movement state', () => {
  const game = new Game();
  game.start();
  game.power = 8;
  const enemy = game.enemies[0];
  Object.assign(enemy, { x: game.player.x, y: game.player.y, cell: [...game.player.cell], to: null });
  game.tick(.001);
  assert.equal(game.lives, 3);
  assert.equal(game.score, 200);
  assert.equal(enemy.cooldown, CAPTURE_SECONDS);
  assert.equal(enemy.captured, true);
  assert.equal(enemy.releaseGrace, 0);
  assert.deepEqual(enemy.cell, game.map.pen.cells[0]);
  assert.deepEqual([enemy.x, enemy.y], game.map.pen.cells[0]);
  assert.deepEqual(enemy.from, game.map.pen.cells[0]);
  assert.equal(enemy.to, null);
  assert.equal(enemy.previous, null);
  assert.equal(enemy.progress, 0);
});

test('all four bugs stay in distinct pen slots, cannot collide, and keep combo scoring', () => {
  const events = [];
  const game = new Game(0, event => events.push(event));
  captureAll(game);
  assert.equal(game.score, 3000);
  assert.equal(game.combo, 4);
  assert.equal(events.filter(event => event.type === 'enemy').length, 4);
  game.power = 0;
  game.invulnerable = 0;
  place(game.player, game.map.pen.cells[0]);
  for (let i = 0; i < 20; i++) game.tick(.05);
  for (const enemy of game.enemies) {
    assert.equal(enemy.captured, true);
    assert.deepEqual(enemy.cell, game.map.pen.cells[enemy.id]);
    assert.deepEqual([enemy.x, enemy.y], game.map.pen.cells[enemy.id]);
    assert.equal(enemy.to, null);
    assert.ok(Math.abs(enemy.cooldown - (CAPTURE_SECONDS - 1)) < 1e-9);
  }
  assert.equal(game.lives, 3);
  assert.equal(game.score, 3000);
});

test('pause freezes captured cooldowns and release grace', () => {
  const game = new Game();
  captureAll(game);
  game.enemies[0].captured = false;
  game.enemies[0].releaseGrace = 1;
  game.pause();
  const before = structuredClone(game.enemies);
  for (let i = 0; i < 120; i++) game.tick(.05);
  assert.deepEqual(game.enemies, before);
  game.pause();
  game.tick(.05);
  assert.equal(game.enemies[1].cooldown, CAPTURE_SECONDS - .05);
  assert.equal(game.enemies[0].releaseGrace, .95);
});

test('captured bugs release after five playing seconds with clean movement and overlap protection', () => {
  const game = new Game();
  captureAll(game);
  game.power = 0;
  game.invulnerable = 0;
  place(game.player, game.map.pen.release);
  for (let i = 0; i < 99; i++) game.tick(.05);
  assert.ok(game.enemies.every(enemy => enemy.captured));
  game.tick(.05);
  for (const enemy of game.enemies) {
    assert.equal(enemy.captured, false);
    assert.equal(enemy.cooldown, 0);
    assert.equal(enemy.releaseGrace, 1);
    assert.deepEqual(enemy.cell, game.map.pen.release);
    assert.deepEqual([enemy.x, enemy.y], game.map.pen.release);
    assert.deepEqual(enemy.from, game.map.pen.release);
    assert.equal(enemy.to, null);
    assert.equal(enemy.previous, null);
    assert.equal(enemy.progress, 0);
  }
  assert.equal(game.lives, 3, 'Release onto Mona must not cost a life');
  game.tick(.05);
  assert.equal(game.lives, 3, 'Grace protects subsequent overlap');
  assert.ok(game.enemies.every(enemy => enemy.releaseGrace === .95));
  assert.ok(game.enemies.every(enemy => enemy.to !== null), 'Released bugs resume chasing');
  for (let i = 0; i < 19; i++) game.tick(.05);
  assert.ok(game.enemies.every(enemy => enemy.releaseGrace === 0));
  place(game.enemies[0], game.player.cell);
  game.tick(.001);
  assert.equal(game.lives, 2, 'Normal collisions resume after grace');
});

test('death resets captured bugs and release grace to corner spawns', () => {
  const game = new Game();
  captureAll(game);
  game.power = 0;
  game.invulnerable = 0;
  game.enemies[1].releaseGrace = .5;
  const attacker = game.enemies[0];
  Object.assign(attacker, { captured: false, cooldown: 0 });
  place(attacker, game.player.cell);
  game.tick(.001);
  assert.equal(game.lives, 2);
  for (const enemy of game.enemies) {
    assert.equal(enemy.captured, false);
    assert.equal(enemy.releaseGrace, 0);
    assert.equal(enemy.cooldown, 1);
    assert.deepEqual(enemy.cell, game.spawns[enemy.id]);
    assert.equal(enemy.to, null);
  }
});

test('unlocking deployment keeps captured bugs frozen in the pen', () => {
  const game = new Game();
  captureAll(game);
  game.exitReady = true;
  const before = structuredClone(game.enemies);
  for (let i = 0; i < 120; i++) game.tick(.05);
  assert.deepEqual(game.enemies, before);
});

test('reset restores lives, score, all pellets, and map selection', () => {
  const game = new Game();
  game.start();
  game.score = 900;
  game.lives = 1;
  game.pellets.clear();
  game.reset(1);
  assert.equal(game.index, 1);
  assert.equal(game.status, 'ready');
  assert.equal(game.lives, 3);
  assert.equal(game.score, 0);
  assert.equal(game.pellets.size, game.total);
});

test('first-person movement stops at a blocked direction instead of drifting sideways', () => {
  const game = new Game();
  game.start();
  game.movementMode = 'first';
  game.desired = 3;
  game.player.direction = 0;
  const start = [...game.player.cell];
  game.tick(.05);
  assert.deepEqual(game.player.cell, start);
  assert.equal(game.player.to, null);
  game.reset(1);
  assert.equal(game.movementMode, 'first');
});

test('both mazes can be cleared and exited by traversing actual movement paths', () => {
  for (let index = 0; index < MAPS.length; index++) {
    const game = new Game(index);
    game.start();
    game.enemies.forEach(enemy => { enemy.cooldown = 1e6; });
    let steps = 0;
    while (game.pellets.size && steps++ < 3000) {
      const target = [...game.pellets.values()][0];
      const distances = game.distances(target.x, target.y);
      const next = game.neighbors(...game.player.cell).sort((a, b) => distances.get(`${a.x},${a.y}`) - distances.get(`${b.x},${b.y}`))[0];
      game.desired = next.d;
      game.move(game.player, 1, () => game.desired, () => game.collect());
    }
    assert.equal(game.status, 'playing', 'Collecting alone must not advance the level');
    assert.equal(game.exitReady, true);
    assert.equal(game.pellets.size, 0);
    while (game.status === 'playing' && steps++ < 4000) {
      const distances = game.distances(...game.map.exit);
      const next = game.neighbors(...game.player.cell).sort((a, b) => distances.get(`${a.x},${a.y}`) - distances.get(`${b.x},${b.y}`))[0];
      game.move(game.player, 1, () => next.d, () => game.collect());
    }
    assert.equal(game.status, 'won', `Map ${index} must be completable through its exit`);
    assert.deepEqual(game.player.cell, game.map.exit);
  }
});

test('deployment plazas are open, exits are locked, and no commit is behind a gate', () => {
  for (let index = 0; index < MAPS.length; index++) {
    const game = new Game(index);
    assert.equal(game.open(...game.map.exit), false);
    assert.equal(game.pellets.has(game.map.exit.join(',')), false);
    for (const room of game.map.rooms) {
      for (let y = room.y; y < room.y + room.height; y++) {
        for (let x = room.x; x < room.x + room.width; x++) assert.equal(game.open(x, y), true);
      }
    }
    game.start();
    game.player.cell = [game.map.exit[0], 1];
    assert.equal(game.canMove(game.player, 0), false);
    assert.throws(() => game.nextLevel(), /portal/);
  }
});

test('clearing commits disarms enemies while Mona walks to the portal', () => {
  const game = new Game();
  game.start();
  game.exitReady = true;
  game.invulnerable = 0;
  Object.assign(game.enemies[0], { x: game.player.x, y: game.player.y, cell: [...game.player.cell], to: null });
  game.tick(.05);
  assert.equal(game.lives, 3);
  assert.equal(game.status, 'playing');
});

test('portal progression carries score and lives and cycles repositories', () => {
  const game = new Game(1);
  captureAll(game);
  game.enemies[0].releaseGrace = 1;
  game.score = 2700;
  game.lives = 2;
  game.exitReady = true;
  game.player.cell = [...game.map.exit];
  game.collect();
  assert.equal(game.status, 'won');
  game.nextLevel();
  assert.equal(game.index, 0);
  assert.equal(game.level, 3);
  assert.equal(game.score, 2700);
  assert.equal(game.lives, 2);
  assert.equal(game.status, 'playing');
  assert.equal(game.exitReady, false);
  assert.equal(game.pellets.size, game.total);
  for (const enemy of game.enemies) {
    assert.equal(enemy.captured, false);
    assert.equal(enemy.releaseGrace, 0);
    assert.equal(enemy.cooldown, 0);
    assert.deepEqual(enemy.cell, game.spawns[enemy.id]);
  }
});

function advance(game) {
  game.exitReady = true;
  place(game.player, game.map.exit);
  game.collect();
  game.nextLevel();
}

function pickup(game, kind) {
  const [key, item] = [...game.items].find(([, item]) => item.kind === kind);
  place(game.player, [item.x, item.y]);
  game.collect();
  return key;
}

function collide(game, count = 1) {
  for (const enemy of game.enemies.slice(0, count)) {
    Object.assign(enemy, { cooldown: 0, captured: false, releaseGrace: 0 });
    place(enemy, game.player.cell);
  }
  game.tick(.001);
}

test('the two introduction layouts remain byte-for-byte unchanged for every run seed', () => {
  const hashes = [
    '2df8772fb9a8489f981cb55b79a36b5bb7ce27da0961793eb2276bed2645b164',
    '93d2ebe7561497daffa9b9bbdbefbed2306dea09f6a3fe70547ecfb686eafbfa',
  ];
  for (const seed of [0, 1, 42, -1, 0xffffffff]) {
    for (let index = 0; index < MAPS.length; index++) {
      const map = createMap(index, { seed });
      assert.equal(createHash('sha256').update(JSON.stringify(map.grid)).digest('hex'), hashes[index]);
      assert.equal(map.seed, MAPS[index].seed);
    }
  }
});

test('hundreds of generated levels are repeatable, varied, and fully reachable with a locked portal', () => {
  const signatures = new Set();
  const seeds = [0, 1, 2, 3, 42, 137, 65535, 123456, 987654, 0x7fffffff, 0xffffffff, -1, -42, 500, 777, 999];
  let generated = 0;
  // -1 and 0xffffffff deliberately describe the same normalized 32-bit seed.
  for (const seed of seeds) {
    const game = new Game(0, () => {}, { seed });
    for (let level = 1; level <= 32; level++) {
      assert.equal(game.level, level);
      assert.equal(game.map.level, level);
      assert.equal(game.index, (level - 1) % MAPS.length);
      assert.equal(game.map.name, MAPS[game.index].name);
      assert.deepEqual(game.map, createMap(game.index, { level, seed }));
      assert.equal(validateMap(game.map), true);
      const reachable = game.distances(...game.map.start);
      assert.equal(reachable.has(game.map.exit.join(',')), false);
      for (let y = 0; y < game.map.height; y++) {
        for (let x = 0; x < game.map.width; x++) {
          if (!game.map.grid[y][x] && (x !== game.map.exit[0] || y !== game.map.exit[1])) {
            assert.ok(reachable.has(`${x},${y}`), `seed ${seed}, level ${level}, cell ${x},${y}`);
          }
        }
      }
      for (const key of game.pellets.keys()) assert.ok(reachable.has(key));
      for (const enemy of game.enemies) assert.ok(reachable.has(enemy.cell.join(',')));
      assert.ok(reachable.has(game.map.pen.release.join(',')));
      assert.ok(reachable.has(`${game.map.exit[0]},1`));
      assert.equal(game.items.size, 3);
      assert.deepEqual([...game.items.values()].map(item => item.kind).sort(), Object.keys(ITEMS).sort());
      for (const [key, item] of game.items) {
        assert.ok(reachable.has(key));
        assert.equal(key, `${item.x},${item.y}`);
        assert.equal(game.pellets.has(key), false);
        assert.notEqual(key, game.map.start.join(','));
        assert.notEqual(key, game.map.exit.join(','));
        assert.notEqual(key, game.map.pen.release.join(','));
        assert.notEqual(key, `${game.map.exit[0]},1`);
        assert.ok(game.spawns.every(cell => cell.join(',') !== key));
      }
      assert.equal([...game.pellets.values()].filter(p => p.power).length, 4);
      if (level >= 3) {
        generated++;
        signatures.add(JSON.stringify(game.map.grid));
      }
      advance(game);
    }
  }
  assert.equal(generated, 480);
  assert.equal(signatures.size, 450, 'Every distinct normalized seed/level pair should have its own maze');
});

test('invalid generation inputs and disconnected maps fail explicitly', () => {
  assert.throws(() => createMap(99), /theme/);
  assert.throws(() => createMap(0, { level: 0 }), /Level/);
  assert.throws(() => createMap(0, { level: 3, seed: NaN }), /seed/);
  assert.throws(() => new Game(0, () => {}, { seed: '42' }), /seed/);
  const map = createMap(0);
  map.grid[map.start[1] - 1][1] = 1;
  map.grid[map.start[1]][2] = 1;
  assert.throws(() => validateMap(map), /unreachable/);
});

test('reset events observe coherent level, map, score, and lives throughout progression', () => {
  const snapshots = [];
  let game;
  game = new Game(0, event => {
    if (event.type === 'reset' && game) snapshots.push({
      level: game.level, mapLevel: game.map.level, index: game.index, score: game.score, lives: game.lives,
    });
  }, { seed: 314159 });
  const replay = new Game(0, () => {}, { seed: 314159 });
  game.score = 725;
  game.lives = 2;
  for (let i = 0; i < 12; i++) {
    advance(game);
    advance(replay);
    assert.deepEqual(game.map, replay.map);
    assert.deepEqual(game.items, replay.items);
    assert.equal(game.score, 725);
    assert.equal(game.lives, 2);
  }
  for (const snapshot of snapshots) {
    assert.equal(snapshot.level, snapshot.mapLevel);
    assert.equal(snapshot.index, (snapshot.level - 1) % MAPS.length);
    assert.equal(snapshot.score, 725);
    assert.equal(snapshot.lives, 2);
  }
  game.reset(0);
  assert.equal(game.runSeed, 314159);
  assert.equal(game.level, 1);
  advance(game);
  advance(game);
  assert.deepEqual(game.map, createMap(0, { level: 3, seed: 314159 }));
  game.reset(1);
  assert.equal(game.level, 2);
  assert.equal(game.map.level, 2);
  assert.equal(game.map.seed, MAPS[1].seed);
  assert.equal(game.score, 0);
  assert.equal(game.lives, 3);
});

test('reset with an explicit level replays the current generated board and item placement', () => {
  const game = new Game(0, () => {}, { seed: 7654321 });
  for (let i = 0; i < 6; i++) advance(game);
  const map = structuredClone(game.map);
  const items = structuredClone(game.items);
  const pellets = structuredClone(game.pellets);
  const { index, level, runSeed } = game;
  pickup(game, 'overclock');
  game.score = 1234;
  game.lives = 1;
  game.reset(game.index, game.level);
  assert.equal(game.index, index);
  assert.equal(game.level, level);
  assert.equal(game.runSeed, runSeed);
  assert.deepEqual(game.map, map);
  assert.deepEqual(game.items, items);
  assert.deepEqual(game.pellets, pellets);
  assert.equal(game.overclock, 0);
  assert.equal(game.score, 0);
  assert.equal(game.lives, 3);
  assert.equal(game.status, 'ready');
  advance(game);
  assert.equal(game.level, level + 1);
  assert.deepEqual(game.map, createMap(game.index, { level: level + 1, seed: runSeed }));
});

test('items award their own effects once and emit kind and key without collecting a commit', () => {
  const events = [];
  const game = new Game(0, event => events.push(event));
  const total = game.total;
  for (const kind of Object.keys(ITEMS)) {
    assert.ok(ITEMS[kind].name && ITEMS[kind].color && ITEMS[kind].symbol);
    const key = pickup(game, kind);
    assert.deepEqual(events.at(-1), { type: 'item', kind, key });
    const eventCount = events.length;
    game.collect();
    assert.equal(events.length, eventCount);
    assert.equal(game.items.has(key), false);
    assert.equal(game.pellets.size, total);
  }
  assert.equal(game.score, 250);
  assert.equal(game.overclock, 6);
  assert.equal(game.firewall, 8);
  assert.equal(game.power, 0);
  assert.equal(game.exitReady, false);
});

test('all items may be skipped while commits alone unlock the portal', () => {
  const game = new Game();
  game.start();
  for (const pellet of [...game.pellets.values()]) {
    place(game.player, [pellet.x, pellet.y]);
    game.collect();
  }
  assert.equal(game.exitReady, true);
  assert.equal(game.items.size, 3);
  assert.equal(game.status, 'playing');
  place(game.player, game.map.exit);
  game.collect();
  assert.equal(game.status, 'won');
  assert.equal(game.items.size, 3);
});

test('overclock speeds only Mona by 1.3x, including a partial expiry frame', () => {
  const game = new Game();
  game.start();
  game.enemies.forEach(enemy => { enemy.cooldown = 1e6; });
  game.desired = 1;
  game.overclock = ITEMS.overclock.seconds;
  game.tick(.05);
  assert.ok(Math.abs(game.player.x - (1 + .05 * 4.4 * 1.3)) < 1e-9);
  assert.equal(game.overclock, 5.95);
  place(game.player, game.map.start);
  game.overclock = .02;
  game.tick(.05);
  assert.equal(game.overclock, 0);
  assert.ok(Math.abs(game.player.x - (1 + 4.4 * (.05 + .02 * .3))) < 1e-9);
  place(game.player, game.map.start);
  game.tick(.05);
  assert.ok(Math.abs(game.player.x - (1 + .05 * 4.4)) < 1e-9);
});

test('firewall absorbs one hit, protects simultaneous overlaps, then restores normal danger', () => {
  const events = [];
  const game = new Game(0, event => events.push(event));
  game.start();
  game.invulnerable = 0;
  game.firewall = 8;
  collide(game, 4);
  assert.equal(game.lives, 3);
  assert.equal(game.firewall, 0);
  assert.equal(game.invulnerable, ITEMS.firewall.grace);
  assert.equal(game.score, 0);
  assert.ok(game.enemies.every(enemy => !enemy.captured));
  assert.deepEqual(events.filter(event => event.type === 'shield-hit'), [{ type: 'shield-hit', id: 0 }]);
  collide(game, 4);
  assert.equal(game.lives, 3);
  game.enemies.forEach(enemy => { enemy.cooldown = 1e6; });
  for (let i = 0; i < 20; i++) game.tick(.05);
  assert.equal(game.invulnerable, 0);
  collide(game);
  assert.equal(game.lives, 2);
  assert.equal(events.filter(event => event.type === 'shield-hit').length, 1);
});

test('power captures take priority over firewall, overclock, and invulnerability', () => {
  const game = new Game();
  game.firewall = 8;
  game.overclock = 6;
  captureAll(game);
  assert.equal(game.score, 3000);
  assert.ok(game.enemies.every(enemy => enemy.captured));
  assert.equal(game.firewall, 7.999);
  assert.equal(game.overclock, 5.999);
  assert.equal(game.lives, 3);
});

test('ordinary invulnerability preserves a firewall charge and expired firewall does not protect', () => {
  const game = new Game();
  game.start();
  game.firewall = 8;
  collide(game);
  assert.equal(game.firewall, 7.999);
  assert.equal(game.lives, 3);
  game.invulnerable = 0;
  game.firewall = .0001;
  collide(game);
  assert.equal(game.lives, 2);
  assert.equal(game.firewall, 0);
});

test('overclock cannot capture, and death clears effects even on the final life', () => {
  for (const lives of [1, 2]) {
    const game = new Game();
    game.start();
    game.lives = lives;
    game.invulnerable = 0;
    game.overclock = 6;
    game.firewall = .0001;
    game.power = .0001;
    game.combo = 3;
    collide(game);
    assert.equal(game.lives, lives - 1);
    assert.equal(game.status, lives === 1 ? 'over' : 'playing');
    assert.equal(game.power, 0);
    assert.equal(game.firewall, 0);
    assert.equal(game.overclock, 0);
    assert.equal(game.combo, 0);
    assert.equal(game.invulnerable, lives === 1 ? 0 : 3);
    assert.ok(game.enemies.every(enemy => !enemy.captured));
  }
});

test('pause freezes all effects, movement, pickups, and elapsed time', () => {
  const game = new Game();
  game.start();
  game.overclock = 6;
  game.firewall = 8;
  game.power = 4;
  game.desired = 1;
  game.pause();
  const before = structuredClone({
    player: game.player, enemies: game.enemies, pellets: game.pellets, items: game.items,
    elapsed: game.elapsed, invulnerable: game.invulnerable,
  });
  for (let i = 0; i < 200; i++) game.tick(.05);
  assert.equal(game.overclock, 6);
  assert.equal(game.firewall, 8);
  assert.equal(game.power, 4);
  for (const [key, value] of Object.entries(before)) assert.deepEqual(game[key], value);
  game.pause();
  game.tick(.05);
  assert.equal(game.overclock, 5.95);
  assert.equal(game.firewall, 7.95);
  assert.equal(game.power, 3.95);
});

test('reset and nextLevel clear effects and replenish independent item maps', () => {
  const game = new Game();
  for (const reset of [() => game.reset(1), () => advance(game)]) {
    for (const kind of Object.keys(ITEMS)) pickup(game, kind);
    game.power = 7;
    game.combo = 3;
    const previousItems = game.items;
    reset();
    assert.equal(game.overclock, 0);
    assert.equal(game.firewall, 0);
    assert.equal(game.power, 0);
    assert.equal(game.combo, 0);
    assert.equal(game.items.size, 3);
    assert.notEqual(game.items, previousItems);
  }
});

test('chase distance caching still recomputes only when Mona changes cells', () => {
  const game = new Game();
  const distances = game.distances.bind(game);
  let calls = 0;
  game.distances = (...args) => { calls++; return distances(...args); };
  game.start();
  for (let i = 0; i < 5; i++) game.tick(.01);
  assert.equal(calls, 1);
  place(game.player, [2, game.map.start[1]]);
  game.tick(.01);
  assert.equal(calls, 2);
});
