import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, MAPS, ENEMIES, CAPTURE_SECONDS, enemyAppearance } from './engine.js';

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
