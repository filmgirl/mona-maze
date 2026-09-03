import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { watchHealth } from './helpers.js';

function fixture({ navigation = true, error = 'net::ERR_ABORTED', main = false } = {}) {
  let detached = false;
  const page = new EventEmitter();
  const top = { isDetached: () => detached };
  const child = { isDetached: () => detached };
  page.mainFrame = () => top;
  const health = watchHealth(page, ['http://127.0.0.1:4261']);
  page.emit('requestfailed', {
    url: () => 'http://127.0.0.1:4261/mona-maze/',
    failure: () => ({ errorText: error }),
    isNavigationRequest: () => navigation,
    frame: () => main ? top : child,
  });
  return { health, detach: () => { detached = true; } };
}

test('aborted navigation is exempt only after its child frame detaches', () => {
  const { health, detach } = fixture();
  assert.throws(health, /net::ERR_ABORTED/);
  detach();
  assert.doesNotThrow(health);
});

test('aborted top-level navigation is never exempt', () => {
  const { health, detach } = fixture({ main: true });
  assert.throws(health, /net::ERR_ABORTED/);
  detach();
  assert.throws(health, /net::ERR_ABORTED/);
});

test('aborted required assets in detached frames still fail', () => {
  const { health, detach } = fixture({ navigation: false });
  detach();
  assert.throws(health, /net::ERR_ABORTED/);
});

test('other navigation errors in detached frames still fail', () => {
  const { health, detach } = fixture({ error: 'net::ERR_CONNECTION_REFUSED' });
  detach();
  assert.throws(health, /net::ERR_CONNECTION_REFUSED/);
});
