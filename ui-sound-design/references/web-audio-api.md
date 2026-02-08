# Web Audio API — Core Building Blocks

Reference for programmatic UI sound synthesis. All examples use vanilla Web Audio API with no dependencies.

## AudioContext Setup

A single AudioContext should be shared across all sounds. Browsers require a user gesture before audio can play.

```javascript
// Singleton pattern — create once, reuse everywhere
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (happens after page load without interaction)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}
```

**User gesture requirement:** Call `getAudioContext()` inside a click/touch/keydown handler the first time. After that, it works anywhere.

## Oscillator Types

The oscillator is the primary sound source. Each waveform has a distinct character.

| Type | Character | Best For | Harmonics |
|------|-----------|----------|-----------|
| `sine` | Pure, clean, smooth | Subtle tones, hover sounds, gentle notifications | Fundamental only |
| `square` | Hollow, retro, buzzy | Toggle clicks, 8-bit style sounds, alerts | Odd harmonics |
| `sawtooth` | Bright, harsh, rich | Error sounds, warnings, aggressive feedback | All harmonics |
| `triangle` | Soft, mellow, muted | Soft clicks, gentle confirmations, background tones | Odd harmonics (weaker) |

```javascript
function playTone(frequency, type, duration) {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;        // 'sine', 'square', 'sawtooth', 'triangle'
  osc.frequency.value = frequency;  // Hz

  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}
```

## Gain Envelopes (ADSR)

The **envelope** shapes how a sound's volume changes over time. This is the single most important pattern for making sounds feel natural.

**ADSR** = Attack, Decay, Sustain, Release:
- **Attack**: Time to reach peak volume (0 = instant click, 0.01 = soft onset)
- **Decay**: Time to fall from peak to sustain level
- **Sustain**: Volume level held during the middle of the sound
- **Release**: Time to fade to silence after the sound ends

```javascript
function playWithEnvelope(frequency, { attack = 0.01, decay = 0.1, sustain = 0.3, release = 0.1, peak = 0.5 } = {}) {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;

  osc.frequency.value = frequency;
  osc.connect(gain);
  gain.connect(ctx.destination);

  // Attack: silence → peak
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + attack);

  // Decay: peak → sustain
  gain.gain.exponentialRampToValueAtTime(sustain, now + attack + decay);

  // Release: sustain → silence
  const releaseStart = now + attack + decay + 0.1;
  gain.gain.setValueAtTime(sustain, releaseStart);
  gain.gain.exponentialRampToValueAtTime(0.001, releaseStart + release);

  osc.start(now);
  osc.stop(releaseStart + release + 0.01);
}
```

**Critical:** `exponentialRampToValueAtTime` cannot ramp to 0 — it throws an error. Always ramp to `0.001` instead.

## White Noise Generation

White noise is essential for click, whoosh, and percussion sounds.

```javascript
function createNoiseBuffer(duration = 1) {
  const ctx = getAudioContext();
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function playNoise(duration = 0.1) {
  const ctx = getAudioContext();
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();

  source.buffer = createNoiseBuffer(duration);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(ctx.currentTime);
}
```

## Filter Types (BiquadFilterNode)

Filters shape the frequency content of a sound, making it brighter, darker, or more focused.

| Type | Effect | Frequency Range | Use Case |
|------|--------|----------------|----------|
| `lowpass` | Removes highs, keeps lows | 200-5000 Hz cutoff | Warm/muffled sounds, soft clicks |
| `highpass` | Removes lows, keeps highs | 200-2000 Hz cutoff | Thin/airy sounds, removing muddiness |
| `bandpass` | Keeps a frequency band | 500-4000 Hz center | Focused clicks, telephone-like quality |
| `notch` | Removes a frequency band | Any | Removing specific resonances |

```javascript
function playFilteredNoise(filterType, frequency, Q, duration) {
  const ctx = getAudioContext();
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  source.buffer = createNoiseBuffer(duration);
  filter.type = filterType;   // 'lowpass', 'highpass', 'bandpass'
  filter.frequency.value = frequency;
  filter.Q.value = Q;         // Resonance: 0.5 (gentle) to 15 (sharp)

  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(ctx.currentTime);
}
```

**Q factor guide:**
- 0.5–1: Gentle slope, natural sound
- 1–5: Noticeable filtering, focused
- 5–15: Sharp resonance, pronounced peak
- 15+: Ringing, almost self-oscillating

## Frequency Sweeps

Sweeping frequency over time creates movement — rising for positive actions, falling for negative.

```javascript
function frequencySweep(startFreq, endFreq, duration, type = 'sine') {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;

  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, now);

  // Exponential sweep sounds more natural
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

  gain.gain.setValueAtTime(0.3, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.01);
}

// Rising = positive (success, toggle on)
// frequencySweep(400, 800, 0.15);

// Falling = negative (error, toggle off, dismiss)
// frequencySweep(800, 400, 0.15);
```

**Linear vs exponential ramps:**
- `linearRampToValueAtTime`: Even change per second. Sounds mechanical.
- `exponentialRampToValueAtTime`: Proportional change. Sounds natural. **Use this by default.**
- Linear is only better for very short sweeps (<50ms) where the difference is inaudible.

## Layering Oscillators

Combining multiple oscillators creates richer, more complex sounds.

```javascript
function playRichTone(frequency, duration = 0.3) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.3, now);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  masterGain.connect(ctx.destination);

  // Layer 1: Fundamental
  const osc1 = ctx.createOscillator();
  osc1.frequency.value = frequency;
  osc1.connect(masterGain);

  // Layer 2: Slightly detuned for warmth
  const osc2 = ctx.createOscillator();
  osc2.frequency.value = frequency;
  osc2.detune.value = 7;  // cents (1/100th of a semitone)
  osc2.connect(masterGain);

  // Layer 3: Octave above for brightness
  const osc3 = ctx.createOscillator();
  osc3.frequency.value = frequency * 2;
  const osc3Gain = ctx.createGain();
  osc3Gain.gain.value = 0.3;  // Quieter than fundamental
  osc3.connect(osc3Gain);
  osc3Gain.connect(masterGain);

  [osc1, osc2, osc3].forEach(osc => {
    osc.start(now);
    osc.stop(now + duration + 0.01);
  });
}
```

**Detune values:**
- 3-7 cents: Subtle warmth (chorus-like)
- 10-25 cents: Noticeable thickening
- 50+ cents: Dissonant, unsettling (use for error sounds)

## FM Synthesis (Bell/Metallic Tones)

Frequency Modulation creates complex, inharmonic tones — perfect for bells, chimes, and notification sounds.

```javascript
function playBellTone(frequency = 880, duration = 0.6) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Modulator oscillator (not heard directly)
  const modulator = ctx.createOscillator();
  const modGain = ctx.createGain();
  modulator.frequency.value = frequency * 1.4;  // Non-integer ratio = inharmonic (bell-like)
  modGain.gain.setValueAtTime(frequency * 2, now);
  modGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  // Carrier oscillator (the sound you hear)
  const carrier = ctx.createOscillator();
  const carrierGain = ctx.createGain();
  carrier.frequency.value = frequency;
  carrierGain.gain.setValueAtTime(0.3, now);
  carrierGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  // Connect modulator → carrier frequency
  modulator.connect(modGain);
  modGain.connect(carrier.frequency);

  // Connect carrier → output
  carrier.connect(carrierGain);
  carrierGain.connect(ctx.destination);

  modulator.start(now);
  carrier.start(now);
  modulator.stop(now + duration + 0.01);
  carrier.stop(now + duration + 0.01);
}
```

**Modulator ratio guide:**
- Integer ratios (1, 2, 3): Harmonic, musical
- Non-integer ratios (1.4, 2.76): Inharmonic, metallic, bell-like
- Higher modulation depth: More overtones, brighter/harsher
- Decaying modulation: Sound starts bright, becomes pure

## Reusable Factory Pattern

Wrap sound generation in a factory that returns a play function.

```javascript
function createSound(setup) {
  return function play(options = {}) {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    setup(ctx, now, options);
  };
}

// Usage
const click = createSound((ctx, now, { volume = 0.3 } = {}) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(1800, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.06);
});

click();             // Play with defaults
click({ volume: 0.5 }); // Louder
```

## Common Mistakes

### Gain click/pop artifacts
**Problem:** Abrupt gain changes cause audible clicks.
**Fix:** Always ramp gain values. Never assign `gain.value` directly during playback. Use `setValueAtTime` followed by a ramp.

```javascript
// BAD — causes clicks
gain.gain.value = 0;

// GOOD — smooth fade
gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);
```

### Creating AudioContext per sound
**Problem:** Each `new AudioContext()` allocates system resources. Browsers limit the count.
**Fix:** Use the singleton pattern above. One context for the entire app.

### Memory leaks from node accumulation
**Problem:** Audio nodes are not garbage collected while connected.
**Fix:** Oscillators auto-disconnect after `stop()`. For long-lived nodes, call `disconnect()` when done. BufferSource nodes are one-shot — create a new one each time.

### BufferSource cleanup with `onended`

BufferSourceNodes (used for noise-based sounds like clicks and whooshes) do not auto-disconnect their downstream nodes. Use the `onended` callback to clean up the entire signal chain:

```javascript
const source = ctx.createBufferSource();
const filter = ctx.createBiquadFilter();
const gain = ctx.createGain();

source.connect(filter);
filter.connect(gain);
gain.connect(ctx.destination);
source.start(now);

source.onended = () => {
  source.disconnect();
  filter.disconnect();
  gain.disconnect();
};
```

This prevents filter and gain nodes from accumulating in memory across repeated plays. See rule `node-cleanup` in `audio-rules.md`.

### exponentialRamp to zero
**Problem:** `exponentialRampToValueAtTime(0, ...)` throws because you can't exponentially approach 0.
**Fix:** Always ramp to `0.001` instead. It's inaudible but mathematically valid.

### linearRamp vs exponentialRamp
**Problem:** `linearRampToValueAtTime` sounds unnatural for volume and frequency changes.
**Fix:** Use `exponentialRampToValueAtTime` by default. Linear is only appropriate for very short transitions (<50ms) or special effects.

### Scheduling in the past
**Problem:** Using `ctx.currentTime` across multiple lines — time advances between reads.
**Fix:** Capture `const now = ctx.currentTime;` once at the start and derive all times from `now`.

## Per-Sound-Type Parameter Bounds

Quick reference for safe parameter ranges across all 9 UI sound categories. Values outside these ranges are almost always wrong. See `audio-rules.md` for the full rule definitions.

| Category | Duration | Volume | Filter Q | Attack | Key Constraint |
|----------|----------|--------|----------|--------|----------------|
| Click | 10–80ms | 0.1–0.6 | 0.5–10 | 0ms | Noise source, not oscillator |
| Toggle | 80–200ms | 0.1–0.4 | — | 0ms | Sweep direction = state |
| Hover | 30–80ms | 0.03–0.08 | — | 5–15ms | Must be subliminal |
| Success | 200–500ms | 0.15–0.5 | — | 0ms | Ascending interval |
| Error | 150–400ms | 0.15–0.4 | 0.5–3 | 0ms | Descending, dark timbre |
| Warning | 150–350ms | 0.15–0.4 | — | 0ms | Double pulse |
| Notification | 200–800ms | 0.15–0.4 | — | 0ms | FM synthesis |
| Whoosh | 100–400ms | 0.1–0.4 | 0.5–5 | — | Noise + filter sweep |
| Pop | 30–80ms | 0.15–0.5 | — | 0ms | Rapid pitch drop |

## Validation Checklist

Self-check for generated Web Audio code. Every item should pass before shipping.

- [ ] **Singleton context** — Uses shared `getAudioContext()`, never `new AudioContext()` per sound
- [ ] **Suspended check** — Calls `resume()` if context state is `'suspended'`
- [ ] **`setValueAtTime` before ramp** — Every `exponentialRampToValueAtTime` / `linearRampToValueAtTime` has a preceding `setValueAtTime`
- [ ] **No ramp to zero** — All exponential ramps target `0.001`, never `0`
- [ ] **Single `currentTime` capture** — `const now = ctx.currentTime` captured once, all scheduling derived from `now`
- [ ] **Oscillator stop padding** — `osc.stop(now + duration + 0.01)` — at least 0.01s after envelope ends
- [ ] **Volume ceiling** — No gain value exceeds `0.8`
- [ ] **Exponential ramps** — Using `exponentialRampToValueAtTime` for durations > 50ms
- [ ] **BufferSource cleanup** — Noise-based sounds use `source.onended` to disconnect filter/gain nodes
- [ ] **Duration in range** — Sound duration falls within the bounds for its category (see table above)
