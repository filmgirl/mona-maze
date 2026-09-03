import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

// Retry only published URLs for bounded Pages propagation, never the PR gate.
if (process.env.EXPECTED_GAME_SHA256 === undefined) console.log('Live baseline only: no expected deployment digest supplied.');
else if (!/^[a-f0-9]{64}$/.test(process.env.EXPECTED_GAME_SHA256)) throw new Error('Invalid EXPECTED_GAME_SHA256');
for (let attempt = 1; attempt <= 3; attempt++) {
  console.log(`Published smoke attempt ${attempt}/3`);
  const result = spawnSync(process.execPath, [
    'node_modules/@playwright/test/cli.js', 'test', '--config=playwright.live.config.js',
  ], { stdio: 'inherit', env: { ...process.env, SMOKE_ATTEMPT: String(attempt) } });
  if (result.error) throw result.error;
  if (result.status === 0) process.exit(0);
  if (attempt < 3) await setTimeout(attempt * 10_000);
}
process.exit(1);
