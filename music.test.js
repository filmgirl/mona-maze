import test from 'node:test';
import assert from 'node:assert/strict';
import { ArcadeMusic } from './music.js';

class Param {
  value = 0;
  events = [];
  setValueAtTime(value, time) { this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value, time) { this.events.push(['linear', value, time]); }
  exponentialRampToValueAtTime(value, time) { this.events.push(['exponential', value, time]); }
  cancelScheduledValues(time) { this.events.push(['cancel', null, time]); }
  cancelAndHoldAtTime(time) { this.events.push(['hold', null, time]); }
}

class AudioNode {
  connected = false;
  gain = new Param();
  frequency = new Param();
  Q = new Param();
  connect() { this.connected = true; }
  disconnect() { this.connected = false; }
}

class Source extends AudioNode {
  constructor(context) { super(); this.context = context; this.stops = []; }
  start(time) {
    assert.ok(time >= this.context.currentTime, 'never schedule a source in the past');
    this.started = time;
  }
  stop(time) { this.stopped = time; this.stops.push(time); }
}

class AudioContext {
  currentTime = 0;
  sampleRate = 48000;
  state = 'running';
  destination = new AudioNode();
  sources = [];
  nodes = [];
  listeners = new Set();
  buffers = 0;
  createGain() { const node = new AudioNode(); this.nodes.push(node); return node; }
  createBiquadFilter() { return this.createGain(); }
  createOscillator() {
    const source = new Source(this);
    this.sources.push(source);
    return source;
  }
  createBufferSource() { return this.createOscillator(); }
  createBuffer(channels, length) {
    this.buffers++;
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  addEventListener(event, listener) { this.listeners.add(listener); }
  removeEventListener(event, listener) { this.listeners.delete(listener); }
  changeState(state) { this.state = state; for (const listener of this.listeners) listener(); }
  advance(time, deliverEnded = true) {
    this.currentTime = time;
    if (deliverEnded) {
      for (const source of this.sources) {
        if (source.stopped <= time) source.onended?.();
      }
    }
  }
}

function fixture(t) {
  const timers = new Map();
  let nextId = 0;
  t.mock.method(globalThis, 'setInterval', (callback, delay) => {
    assert.equal(delay, 25);
    timers.set(++nextId, callback);
    return nextId;
  });
  t.mock.method(globalThis, 'clearInterval', (id) => timers.delete(id));
  const context = new AudioContext();
  const music = new ArcadeMusic(context);
  const tick = (time, deliverEnded = true) => {
    context.advance(time, deliverEnded);
    for (const callback of timers.values()) callback();
  };
  t.after(() => {
    music.dispose();
    context.advance(context.currentTime + 1);
  });
  return { music, context, timers, tick };
}

test('starts only on play, is idempotent, and cancels queued notes on pause', (t) => {
  const { music, context, timers, tick } = fixture(t);
  assert.equal(music.enabled, true);
  assert.equal(music.playing, false);
  assert.equal(context.sources.length, 0);
  music.setPlaying(true);
  assert.equal(timers.size, 1);
  assert.equal(context.sources.length, 3);
  music.setPlaying(true);
  assert.equal(context.sources.length, 3);
  assert.ok(context.sources.every((source) => source.started === 0.025));
  music.setPlaying(false);
  assert.equal(timers.size, 0);
  assert.equal(music._voices.size, 0);
  assert.ok(context.sources.every((source) => source.stopped === 0 && !source.connected));
  music.setPlaying(true);
  tick(0.05);
  tick(0.15);
  const active = [...music._voices];
  assert.ok(active.length > 0);
  music.setPlaying(false);
  assert.ok(active.every((voice) => voice.retiring && voice.source.stopped <= 0.165));
  tick(0.17);
  assert.equal(music._voices.size, 0);
});

test('mute stays independent of play state and resumes without duplicate timers', (t) => {
  const { music, timers, tick, context } = fixture(t);
  music.setEnabled(false);
  music.setPlaying(true);
  assert.equal(timers.size, 0);
  music.setEnabled(true);
  tick(0.05);
  music.setEnabled(false);
  assert.equal(music.playing, true);
  assert.equal(timers.size, 0);
  tick(0.08);
  assert.equal(music._voices.size, 0);
  music.setEnabled(true);
  music.setEnabled(true);
  assert.equal(timers.size, 1);
  assert.ok(context.sources.some((source) => source.started > 0.08));
});

test('suspend cancels all audio and timers; running resumes only when desired', (t) => {
  const { music, context, timers, tick } = fixture(t);
  context.changeState('suspended');
  music.setPlaying(true);
  assert.equal(context.sources.length, 0);
  context.changeState('running');
  tick(0.05);
  context.changeState('suspended');
  assert.equal(timers.size, 0);
  assert.equal(music._voices.size, 0);
  assert.ok(context.sources.every((source) => !source.connected));
  context.changeState('running');
  assert.equal(timers.size, 1);
  music.setPlaying(false);
  context.changeState('suspended');
  context.changeState('running');
  assert.equal(timers.size, 0);
});

test('tab stalls skip missed notes instead of catching up in a burst', (t) => {
  const { music, context, tick } = fixture(t);
  music.setPlaying(true);
  const before = context.sources.length;
  tick(120, false);
  assert.ok(context.sources.length - before <= 4);
  assert.ok([...music._voices].every((voice) => voice.start >= 120.025));
  assert.ok(music._nextTime > 120.1);
});

test('many loops release sources/filters/envelopes and reuse one noise buffer', (t) => {
  const { music, context, tick } = fixture(t);
  music.setPowered(true);
  music.setPlaying(true);
  for (let i = 1; i <= 4800; i++) {
    tick(i * 0.025);
    assert.ok(music._voices.size < 16);
  }
  assert.equal(context.buffers, 1);
  assert.ok(context.sources.length > 1000);
  music.setPlaying(false);
  tick(121);
  assert.equal(music._voices.size, 0);
  assert.ok(context.sources.every((source) => !source.connected && source.onended === null));
  assert.ok(context.nodes.filter((node) => node.connected).length === 1);
});

test('level transposes the phrase and power adds quiet rhythmic detail', (t) => {
  const { music, context } = fixture(t);
  music._scheduleStep(0, 1);
  const first = context.sources[0].frequency.events[0][1];
  music.setLevel(1);
  const offset = context.sources.length;
  music._scheduleStep(0, 2);
  const second = context.sources[offset].frequency.events[0][1];
  assert.ok(Math.abs(second / first - 2 ** (2 / 12)) < 0.00001);
  const normalCount = context.sources.length;
  music._scheduleStep(1, 3);
  assert.equal(context.sources.length, normalCount);
  music.setPowered(true);
  music._scheduleStep(1, 4);
  assert.equal(context.sources.length, normalCount + 1);
  assert.ok([...music._voices].every((voice) => voice.peak <= 0.2));
  assert.equal(music._output.gain.value, 0.24);
  music.setLevel(-7);
  assert.equal(music.level, 0);
  music.setLevel(NaN);
  assert.equal(music.level, 0);
});

test('dispose is final, releases active and queued sources, and leaves context owned by caller', (t) => {
  const { music, context, timers, tick } = fixture(t);
  music.setPlaying(true);
  tick(0.05);
  music._scheduleStep(0, 1);
  music.dispose();
  music.dispose();
  assert.equal(timers.size, 0);
  tick(0.08);
  assert.equal(context.listeners.size, 0);
  assert.equal(music._voices.size, 0);
  assert.equal(music._output.connected, false);
  assert.equal(context.state, 'running');
  const count = context.sources.length;
  music.setPlaying(true);
  music.setEnabled(true);
  context.changeState('suspended');
  context.changeState('running');
  assert.equal(context.sources.length, count);
  assert.equal(timers.size, 0);
});

test('pause fallback computes envelope value without cancelAndHoldAtTime', (t) => {
  const { music, tick } = fixture(t);
  music.setPlaying(true);
  tick(0.05);
  for (const voice of music._voices) voice.envelope.gain.cancelAndHoldAtTime = undefined;
  music.setPlaying(false);
  for (const voice of music._voices) {
    const held = voice.envelope.gain.events.at(-2);
    assert.equal(held[0], 'set');
    assert.ok(held[1] > 0 && held[1] <= voice.peak);
  }
  tick(0.08);
  assert.equal(music._voices.size, 0);
});

test('suspension during disposal fade releases tails without waiting for ended', (t) => {
  const { music, context, timers, tick } = fixture(t);
  music.setPlaying(true);
  tick(0.05);
  music.dispose();
  assert.ok(music._voices.size > 0);
  context.changeState('suspended');
  assert.equal(music._voices.size, 0);
  assert.equal(context.listeners.size, 0);
  assert.equal(music._output.connected, false);
  assert.equal(timers.size, 0);
});
