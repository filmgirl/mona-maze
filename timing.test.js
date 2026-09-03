import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceSimulation, MAX_FRAME_SECONDS, SIMULATION_STEP } from './timing.js';
import { Game } from './engine.js';

for (const fps of [120, 60, 30, 20, 10]) {
  test(`simulation preserves elapsed time at ${fps} FPS`, () => {
    let time = 0, maxStep = 0;
    const game = { tick(dt) { time += dt; maxStep = Math.max(maxStep, dt); } };
    for (let i = 0; i < fps; i++) advanceSimulation(game, 1 / fps);
    assert.ok(Math.abs(time - 1) < 1e-9);
    assert.ok(maxStep <= SIMULATION_STEP);
  });
}
test('long stalls are bounded without using unsafe collision steps', () => {
  let time = 0;
  advanceSimulation({ tick(dt) { time += dt; assert.ok(dt <= SIMULATION_STEP); } }, 10);
  assert.ok(Math.abs(time - MAX_FRAME_SECONDS) < 1e-9);
});

for (const fps of [10, 30, 60, 120]) {
  test(`Mona travels the same distance at ${fps} FPS`, () => {
    const game = new Game();
    game.start();
    game.desired = 0;
    game.enemies.forEach(e => { e.cooldown = 1e6; });
    const start = game.player.y;
    for (let i = 0; i < fps; i++) advanceSimulation(game, 1 / fps);
    assert.ok(Math.abs(start - game.player.y - 4.4) < 1e-8);
    assert.ok(Math.abs(game.elapsed - 1) < 1e-8);
  });
}
