import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export const cabinetDirectory = '.playwright-cabinet';
export const pin = JSON.parse(readFileSync(new URL('./pin.json', import.meta.url), 'utf8'));

export function verifyCabinet() {
  if (!existsSync(`${cabinetDirectory}/.git`)) {
    throw new Error('Missing cabinet checkout. Run npm run cabinet:setup first.');
  }
  const git = (...args) => execFileSync('git', ['-C', cabinetDirectory, ...args], { encoding: 'utf8' }).trim();
  if (git('rev-parse', 'HEAD') !== pin.revision || git('status', '--porcelain')) {
    throw new Error('Cabinet checkout must be clean and match tests/cabinet/pin.json. Remove only .playwright-cabinet and rerun npm run cabinet:setup.');
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  if (!existsSync(cabinetDirectory)) {
    execFileSync('git', ['clone', '--no-checkout', pin.repository, cabinetDirectory], { stdio: 'inherit' });
    execFileSync('git', ['-C', cabinetDirectory, 'checkout', '--detach', pin.revision], { stdio: 'inherit' });
  }
  verifyCabinet();
  console.log(`Cabinet ready at ${pin.revision}`);
}
