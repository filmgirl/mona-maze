export const MAX_FRAME_SECONDS = 0.25;
export const SIMULATION_STEP = 1 / 60;

export function advanceSimulation(game, elapsed) {
  let remaining = Math.min(Math.max(elapsed, 0), MAX_FRAME_SECONDS);
  while (remaining > 1e-9) {
    const step = Math.min(remaining, SIMULATION_STEP);
    game.tick(step);
    remaining -= step;
  }
}
