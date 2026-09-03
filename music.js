const STEP_SECONDS = 60 / 130 / 4;
const LOOKAHEAD_SECONDS = 0.1;
const FADE_SECONDS = 0.015;
const LOOP_STEPS = 128;

// Original eight-bar phrase: two little questions, a lift, and a soft landing.
// Each entry is an eighth note; null leaves breathing room for game sounds.
const MELODY = [
  [76, null, 79, 74, 76, null, 72, 74],
  [76, 79, null, 81, 79, null, 76, null],
  [74, null, 77, 76, 74, 72, null, 69],
  [71, 74, null, 79, 77, null, 74, null],
  [76, 79, 84, null, 81, 79, null, 76],
  [77, null, 81, 79, 76, null, 72, 76],
  [74, 77, null, 81, 79, 77, 74, null],
  [71, null, 74, 76, 72, null, null, null],
];
const CHORDS = [
  [48, 4, 7, 11], [45, 3, 7, 10], [53, 4, 7, 11], [43, 4, 7, 10],
  [48, 4, 7, 11], [45, 3, 7, 10], [50, 3, 7, 10], [43, 4, 7, 10],
];
const TRANSPOSE = [0, 2, 5, 0];
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

/**
 * Quiet, original Web Audio accompaniment. The caller owns/resumes the context;
 * this module never suspends it or changes the gain of unrelated sound effects.
 */
export class ArcadeMusic {
  constructor(audioContext) {
    this.context = audioContext;
    this.enabled = true;
    this.playing = false;
    this.level = 0;
    this.powered = false;
    this.disposed = false;
    this._timer = null;
    this._step = 0;
    this._nextTime = 0;
    this._voices = new Set();
    this._output = audioContext.createGain();
    this._output.gain.value = 0.24;
    this._output.connect(audioContext.destination);
    this._noise = null;
    this._onStateChange = () => this._sync();
    audioContext.addEventListener('statechange', this._onStateChange);
  }

  setPlaying(playing) {
    if (this.disposed) return;
    this.playing = Boolean(playing);
    this._sync();
  }

  setEnabled(enabled) {
    if (this.disposed) return;
    this.enabled = Boolean(enabled);
    this._sync();
  }

  setLevel(level) {
    if (this.disposed) return;
    this.level = Number.isFinite(level) ? Math.max(0, Math.trunc(level)) : 0;
  }

  setPowered(powered) {
    if (!this.disposed) this.powered = Boolean(powered);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._stop();
    this._noise = null;
    if (!this._voices.size) this._finishDispose();
  }

  _sync() {
    if (this.disposed) {
      // A context suspended during the final fade will not deliver ended yet.
      if (this.context.state !== 'running') this._stop();
      return;
    }
    if (!this.enabled || !this.playing || this.context.state !== 'running') {
      this._stop();
      return;
    }
    if (this._timer !== null) return;
    this._nextTime = this.context.currentTime + 0.025;
    this._tick();
    this._timer = setInterval(() => this._tick(), 25);
  }

  _stop() {
    if (this._timer !== null) clearInterval(this._timer);
    this._timer = null;
    const now = this.context.currentTime;
    for (const voice of this._voices) {
      // Cancel future notes outright, including sources whose start is queued.
      if (this.context.state !== 'running' || voice.start >= now || voice.end <= now) {
        voice.source.stop(now);
        this._release(voice);
      } else if (!voice.retiring) {
        const gain = voice.envelope.gain;
        if (typeof gain.cancelAndHoldAtTime === 'function') {
          gain.cancelAndHoldAtTime(now);
        } else {
          gain.cancelScheduledValues(now);
          gain.setValueAtTime(this._envelopeValue(voice, now), now);
        }
        gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
        voice.end = now + FADE_SECONDS;
        voice.retiring = true;
        voice.source.stop(voice.end);
      }
    }
  }

  _tick() {
    if (this.context.state !== 'running') {
      this._stop();
      return;
    }
    const now = this.context.currentTime;
    // Also release expired nodes if delivery of their ended events was delayed.
    for (const voice of this._voices) {
      if (voice.end <= now) this._release(voice);
    }
    // A background-tab stall must never replay a backlog as a burst of notes.
    if (this._nextTime < now) {
      const skipped = Math.ceil((now + 0.025 - this._nextTime) / STEP_SECONDS);
      this._step = (this._step + skipped) % LOOP_STEPS;
      this._nextTime = now + 0.025;
    }
    while (this._nextTime < now + LOOKAHEAD_SECONDS) {
      this._scheduleStep(this._step, this._nextTime);
      this._step = (this._step + 1) % LOOP_STEPS;
      this._nextTime += STEP_SECONDS;
    }
  }

  _scheduleStep(step, time) {
    const bar = Math.floor(step / 16);
    const beat = step % 16;
    const transpose = TRANSPOSE[this.level % TRANSPOSE.length];
    const [root, third, fifth, seventh] = CHORDS[bar];
    if (beat % 2 === 0) {
      const note = MELODY[bar][beat / 2];
      if (note !== null) {
        this._tone(note + transpose, 'square', time, STEP_SECONDS * 1.45, 0.085, 2400);
      }
    }
    if (beat % 4 === 0) {
      const bass = root + transpose + (beat === 8 ? fifth : 0);
      this._tone(bass, 'triangle', time, STEP_SECONDS * 2.6, 0.16, 950);
    }
    const arpeggio = [0, fifth, third, seventh, third, fifth, seventh, fifth];
    if ((this.powered && beat % 2 === 1) || (!this.powered && beat % 4 === 2)) {
      const index = (Math.floor(beat / 2) + this.level % 2) % arpeggio.length;
      this._tone(root + 24 + transpose + arpeggio[index], 'triangle', time,
        STEP_SECONDS * 0.7, this.powered ? 0.07 : 0.05, 3200);
    }
    if (beat === 0 || beat === 8 || (this.powered && beat === 14)) this._kick(time);
    if (beat === 4 || beat === 12) this._percussion(time, false);
    if (this.powered ? beat % 2 === 0 : beat % 4 === 2) {
      this._percussion(time, true);
    }
  }

  _tone(midi, type, time, duration, volume, cutoff) {
    const source = this.context.createOscillator();
    source.type = type;
    source.frequency.setValueAtTime(frequency(midi), time);
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(cutoff, this.context.sampleRate * 0.45);
    filter.Q.value = 0.5;
    this._voice(source, filter, time, duration, volume, 0.008);
  }

  _kick(time) {
    const source = this.context.createOscillator();
    source.type = 'sine';
    source.frequency.setValueAtTime(115, time);
    source.frequency.exponentialRampToValueAtTime(46, time + 0.09);
    this._voice(source, null, time, 0.13, 0.19, 0.004);
  }

  _percussion(time, hat) {
    if (!this._noise) {
      this._noise = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * 0.2),
        this.context.sampleRate);
      const data = this._noise.getChannelData(0);
      let seed = 0x4d4f4e41;
      for (let i = 0; i < data.length; i++) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        data[i] = (seed >>> 0) / 0x80000000 - 1;
      }
    }
    const source = this.context.createBufferSource();
    source.buffer = this._noise;
    const filter = this.context.createBiquadFilter();
    filter.type = hat ? 'highpass' : 'bandpass';
    filter.frequency.value = Math.min(hat ? 6200 : 1700, this.context.sampleRate * 0.45);
    filter.Q.value = hat ? 0.4 : 0.7;
    this._voice(source, filter, time, hat ? 0.045 : 0.12, hat ? 0.035 : 0.085, 0.003);
  }

  _voice(source, filter, start, duration, volume, attack) {
    const envelope = this.context.createGain();
    const peak = Math.max(0, Math.min(volume, 0.2));
    const decayEnd = start + duration - 0.012;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(peak, start + attack);
    envelope.gain.exponentialRampToValueAtTime(Math.max(peak * 0.08, 0.0001), decayEnd);
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(filter || envelope);
    if (filter) filter.connect(envelope);
    envelope.connect(this._output);
    const voice = { source, filter, envelope, start, end: start + duration,
      attack, peak, decayEnd, retiring: false };
    this._voices.add(voice);
    source.onended = () => this._release(voice);
    source.start(start);
    source.stop(voice.end);
  }

  _envelopeValue(voice, time) {
    const { start, attack, peak, decayEnd, end } = voice;
    if (time < start + attack) return peak * Math.max(0, (time - start) / attack);
    if (time < decayEnd) return peak * 0.08 ** ((time - start - attack) / (decayEnd - start - attack));
    return peak * 0.08 * Math.max(0, (end - time) / (end - decayEnd));
  }

  _release(voice) {
    if (!this._voices.delete(voice)) return;
    voice.source.onended = null;
    voice.source.disconnect();
    voice.filter?.disconnect();
    voice.envelope.disconnect();
    if (this.disposed && !this._voices.size) this._finishDispose();
  }

  _finishDispose() {
    this.context.removeEventListener('statechange', this._onStateChange);
    this._output.disconnect();
  }
}
