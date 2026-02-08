# UI Sound Recipes

Complete, working implementations for common UI sounds. Each recipe is self-contained and uses the shared `getAudioContext()` singleton from `web-audio-api.md`.

All recipes assume this shared context setup:

```javascript
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
```

---

## Click {#click}

Short noise burst through a bandpass filter. The foundation of tactile UI feedback.

| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| `frequency` | 2000 | 800–6000 | Higher = sharper, lower = softer |
| `Q` | 2 | 0.5–10 | Higher = more tonal, lower = noisier |
| `duration` | 0.05 | 0.02–0.1 | Shorter = crisper |
| `volume` | 0.3 | 0.1–0.6 | Keep subtle for frequent interactions |

```javascript
function playClick({ frequency = 2000, Q = 2, duration = 0.05, volume = 0.3 } = {}) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  filter.Q.value = Q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
}
```

**Tuning guide:**
- "Softer" → lower frequency (1000), lower volume (0.15), longer duration (0.08)
- "Sharper/crisper" → higher frequency (4000), higher Q (5), shorter duration (0.03)
- "Mechanical/keyboard" → frequency 3000, Q 8, duration 0.03

**Variations:**
- **Soft click:** `{ frequency: 1200, Q: 1, duration: 0.06, volume: 0.15 }`
- **Hard click:** `{ frequency: 4000, Q: 6, duration: 0.03, volume: 0.4 }`
- **Keyboard click:** `{ frequency: 3500, Q: 8, duration: 0.025, volume: 0.25 }`

**Rules followed:** `context-singleton`, `gain-no-zero-target`, `gain-set-before-ramp`, `scheduling-capture-once`, `noise-for-percussion`, `volume-max-0.8`

---

## Toggle {#toggle}

Rising sine sweep for "on", falling for "off". Conveys binary state change through pitch direction.

| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| `startFreq` | 500/700 | 300–1200 | Starting pitch |
| `endFreq` | 700/500 | 300–1200 | Ending pitch |
| `duration` | 0.12 | 0.08–0.2 | Shorter = snappier |
| `volume` | 0.25 | 0.1–0.4 | Keep consistent on/off |

```javascript
function playToggle(isOn, { duration = 0.12, volume = 0.25 } = {}) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(isOn ? 500 : 700, now);
  osc.frequency.exponentialRampToValueAtTime(isOn ? 700 : 500, now + duration);

  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.01);
}
```

**Tuning guide:**
- "More obvious" → wider frequency range (300→900), longer duration (0.18)
- "Subtler" → narrower range (550→650), shorter duration (0.08)
- "More playful" → use triangle wave, add slight overshoot in frequency

**Variations:**
- **Minimal toggle:** Range 550–650, duration 0.08, volume 0.15
- **Retro toggle:** Square wave, range 400–800, duration 0.1
- **Smooth toggle:** Triangle wave, range 450–750, duration 0.15

**Rules followed:** `context-singleton`, `gain-no-zero-target`, `gain-set-before-ramp`, `scheduling-capture-once`, `stop-after-envelope`, `exponential-over-linear`, `oscillator-for-tonal`, `volume-max-0.8`

---

## Hover {#hover}

Gentle high-frequency sine, very fast fade. Should be almost subliminal.

| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| `frequency` | 2400 | 1800–4000 | Higher = airier |
| `duration` | 0.06 | 0.03–0.1 | Must be very short |
| `volume` | 0.08 | 0.03–0.15 | Keep very quiet |

```javascript
function playHover({ frequency = 2400, duration = 0.06, volume = 0.08 } = {}) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.01);
}
```

**Tuning guide:**
- "Warmer" → lower frequency (1800), use triangle wave
- "Brighter" → higher frequency (3500)
- "More presence" → increase volume to 0.12, add 2ms of attack

**Variations:**
- **Glass hover:** `{ frequency: 3200, duration: 0.08, volume: 0.06 }`
- **Warm hover:** Triangle wave, `{ frequency: 1800, duration: 0.07, volume: 0.1 }`

**Rules followed:** `context-singleton`, `gain-no-zero-target`, `gain-set-before-ramp`, `scheduling-capture-once`, `stop-after-envelope`, `exponential-over-linear`, `oscillator-for-tonal`, `volume-max-0.8`

---

## Success {#success}

Ascending two-tone major third. The interval creates a universally "positive" feeling.

| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| `baseFreq` | 523 | 400–800 | Base pitch (C5 default) |
| `interval` | 1.25 | 1.125–1.5 | Frequency ratio (1.25 = major third) |
| `noteDuration` | 0.12 | 0.08–0.2 | Length of each note |
| `gap` | 0.08 | 0.04–0.15 | Silence between notes |
| `volume` | 0.3 | 0.15–0.5 | |

```javascript
function playSuccess({ baseFreq = 523, interval = 1.25, noteDuration = 0.12, gap = 0.08, volume = 0.3 } = {}) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  [0, 1].forEach(i => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startTime = now + i * (noteDuration + gap);
    const freq = baseFreq * Math.pow(interval, i);

    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + noteDuration + 0.01);
  });
}
```

**Tuning guide:**
- "More triumphant" → wider interval (1.5 = perfect fifth), add third note at 2x baseFreq
- "Gentler" → triangle wave, lower volume (0.15), longer notes (0.18)
- "Brighter" → higher baseFreq (700), shorter gap (0.05)

**Variations:**
- **Triumphant:** Three notes ascending a major triad: baseFreq, ×1.25, ×1.5
- **Gentle ding:** Single triangle note at 880Hz, duration 0.3, volume 0.2
- **Sparkle:** Sine at 1047Hz, quick decay, add second oscillator detuned +7 cents

**Rules followed:** `context-singleton`, `gain-no-zero-target`, `gain-set-before-ramp`, `scheduling-capture-once`, `stop-after-envelope`, `exponential-over-linear`, `oscillator-for-tonal`, `volume-max-0.8`

---

## Error {#error}

Low buzzy descending tone. Sawtooth through lowpass creates urgency without being alarming.

| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| `startFreq` | 400 | 200–600 | Starting pitch |
| `endFreq` | 200 | 100–350 | Ending pitch (lower = more serious) |
| `filterFreq` | 1500 | 800–3000 | Lower = darker/muffled |
| `duration` | 0.25 | 0.15–0.4 | Longer = more noticeable |
| `volume` | 0.25 | 0.15–0.4 | |

```javascript
function playError({ startFreq = 400, endFreq = 200, filterFreq = 1500, duration = 0.25, volume = 0.25 } = {}) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  filter.Q.value = 1;

  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.01);
}
```

**Tuning guide:**
- "Less alarming" → sine wave instead of sawtooth, lower volume (0.15)
- "More urgent" → higher startFreq (500), wider sweep, shorter duration (0.15)
- "Buzzy/harsh" → keep sawtooth, raise filterFreq to 3000, increase volume

**Variations:**
- **Gentle error:** Sine wave, 350→250Hz, duration 0.2, volume 0.15
- **Critical error:** Sawtooth, 500→150Hz, filterFreq 2500, two pulses with 0.1s gap
- **Validation error:** Triangle, 300→220Hz, duration 0.15, very quiet (0.12)

**Rules followed:** `context-singleton`, `gain-no-zero-target`, `gain-set-before-ramp`, `scheduling-capture-once`, `stop-after-envelope`, `exponential-over-linear`, `oscillator-for-tonal`, `filter-for-character`, `volume-max-0.8`

---

## Warning {#warning}

Mid-range double pulse. The repetition signals "pay attention" without the negativity of an error.

| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| `frequency` | 600 | 400–900 | Mid-range feels advisory |
| `pulseDuration` | 0.08 | 0.05–0.12 | Each pulse length |
| `gap` | 0.08 | 0.05–0.12 | Between pulses |
| `volume` | 0.25 | 0.15–0.4 | |

```javascript
function playWarning({ frequency = 600, pulseDuration = 0.08, gap = 0.08, volume = 0.25 } = {}) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  [0, 1].forEach(i => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startTime = now + i * (pulseDuration + gap);

    osc.type = 'triangle';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + pulseDuration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + pulseDuration + 0.01);
  });
}
```

**Tuning guide:**
- "Softer" → lower frequency (450), sine wave, lower volume (0.15)
- "More urgent" → three pulses, shorter gap (0.05), higher frequency (750)
- "Friendlier" → sine wave, longer pulses (0.12), wider gap (0.12)

**Variations:**
- **Subtle warning:** Sine, 500Hz, single pulse, duration 0.15, volume 0.15
- **Urgent warning:** Triangle, 750Hz, three pulses, gap 0.05
- **Advisory tone:** Sine, 550Hz, two pulses, long gap (0.15)

**Rules followed:** `context-singleton`, `gain-no-zero-target`, `gain-set-before-ramp`, `scheduling-capture-once`, `stop-after-envelope`, `exponential-over-linear`, `oscillator-for-tonal`, `volume-max-0.8`

---

## Notification {#notification}

Bell-like FM synthesis. Distinctive and attention-grabbing without being harsh.

| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| `frequency` | 880 | 600–1400 | Base pitch (A5 default) |
| `modRatio` | 1.4 | 1.2–3.0 | Higher = more metallic |
| `modDepth` | 1500 | 500–3000 | More = brighter/harsher |
| `duration` | 0.4 | 0.2–0.8 | Bell sustain length |
| `volume` | 0.25 | 0.15–0.4 | |

```javascript
function playNotification({ frequency = 880, modRatio = 1.4, modDepth = 1500, duration = 0.4, volume = 0.25 } = {}) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  const modulator = ctx.createOscillator();
  const modGain = ctx.createGain();
  modulator.frequency.value = frequency * modRatio;
  modGain.gain.setValueAtTime(modDepth, now);
  modGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.8);

  const carrier = ctx.createOscillator();
  const carrierGain = ctx.createGain();
  carrier.frequency.value = frequency;
  carrierGain.gain.setValueAtTime(volume, now);
  carrierGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  modulator.connect(modGain);
  modGain.connect(carrier.frequency);
  carrier.connect(carrierGain);
  carrierGain.connect(ctx.destination);

  modulator.start(now);
  carrier.start(now);
  modulator.stop(now + duration + 0.01);
  carrier.stop(now + duration + 0.01);
}
```

**Tuning guide:**
- "More bell-like" → modRatio 1.4, longer duration (0.6), lower modDepth (800)
- "More electronic" → modRatio 2.0, shorter duration (0.25), higher modDepth
- "Warmer/softer" → lower frequency (660), lower modDepth (500), longer duration

**Variations:**
- **Chime sequence:** Play two notifications, second at frequency × 1.5, staggered by 0.2s
- **Soft bell:** `{ frequency: 660, modRatio: 1.2, modDepth: 500, duration: 0.6, volume: 0.15 }`
- **Alert ping:** `{ frequency: 1100, modRatio: 2.0, modDepth: 2000, duration: 0.2, volume: 0.3 }`

**Rules followed:** `context-singleton`, `gain-no-zero-target`, `gain-set-before-ramp`, `scheduling-capture-once`, `stop-after-envelope`, `exponential-over-linear`, `oscillator-for-tonal`, `volume-max-0.8`

---

## Whoosh {#whoosh}

Filtered white noise with frequency sweep. Conveys movement and transition.

| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| `startFilterFreq` | 500 | 200–2000 | Filter sweep start |
| `endFilterFreq` | 4000 | 2000–8000 | Filter sweep end |
| `duration` | 0.2 | 0.1–0.4 | Total length |
| `Q` | 1 | 0.5–5 | Higher = more tonal |
| `volume` | 0.2 | 0.1–0.4 | |

```javascript
function playWhoosh({ startFilterFreq = 500, endFilterFreq = 4000, duration = 0.2, Q = 1, volume = 0.2 } = {}) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = Q;
  filter.frequency.setValueAtTime(startFilterFreq, now);
  filter.frequency.exponentialRampToValueAtTime(endFilterFreq, now + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + duration * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(now);
}
```

**Tuning guide:**
- "Faster/snappier" → shorter duration (0.1), wider frequency range
- "Swooshier" → higher Q (3), narrower frequency band
- "Reverse whoosh" → swap start/end filter frequencies (high→low)
- "Heavier" → lower frequency range (200→2000), longer duration

**Variations:**
- **Quick swipe:** duration 0.1, range 1000→6000, volume 0.15
- **Heavy swoosh:** duration 0.3, range 200→2000, Q 2
- **Reverse (slide in):** range 4000→500, duration 0.2

**Rules followed:** `context-singleton`, `gain-no-zero-target`, `gain-set-before-ramp`, `scheduling-capture-once`, `exponential-over-linear`, `noise-for-percussion`, `filter-for-character`, `volume-max-0.8`

---

## Pop {#pop}

Short sine with rapid pitch drop. Satisfying, percussive feel for discrete actions.

| Parameter | Default | Range | Effect |
|-----------|---------|-------|--------|
| `startFreq` | 1200 | 600–2400 | Initial pitch (higher = lighter) |
| `endFreq` | 300 | 100–600 | Final pitch |
| `duration` | 0.06 | 0.03–0.1 | Very short |
| `volume` | 0.3 | 0.15–0.5 | |

```javascript
function playPop({ startFreq = 1200, endFreq = 300, duration = 0.06, volume = 0.3 } = {}) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.01);
}
```

**Tuning guide:**
- "Bubblier" → higher startFreq (2000), sine wave, slightly longer (0.08)
- "Heavier/thunkier" → lower startFreq (600), lower endFreq (100), longer (0.1)
- "Snappier" → shorter duration (0.03), wider frequency range

**Variations:**
- **Bubble pop:** `{ startFreq: 2000, endFreq: 400, duration: 0.08, volume: 0.25 }`
- **Deep pop:** `{ startFreq: 600, endFreq: 100, duration: 0.1, volume: 0.35 }`
- **Light tap:** `{ startFreq: 1500, endFreq: 500, duration: 0.04, volume: 0.2 }`

**Rules followed:** `context-singleton`, `gain-no-zero-target`, `gain-set-before-ramp`, `scheduling-capture-once`, `stop-after-envelope`, `exponential-over-linear`, `oscillator-for-tonal`, `volume-max-0.8`

---

## Complete Sound Library

Bundle all sounds into a single class for easy integration.

```javascript
class UISoundLibrary {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.masterVolume = 0.3;
  }

  getContext() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  play(soundFn, options = {}) {
    if (!this.enabled) return;
    const volume = (options.volume || 0.3) * (this.masterVolume / 0.3);
    soundFn.call(this, { ...options, volume: Math.min(volume, 0.8) });
  }

  click(options = {}) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const { frequency = 2000, Q = 2, duration = 0.05, volume = 0.3 } = options;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = Q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);
  }

  toggle(isOn, options = {}) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const { duration = 0.12, volume = 0.25 } = options;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isOn ? 500 : 700, now);
    osc.frequency.exponentialRampToValueAtTime(isOn ? 700 : 500, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  hover(options = {}) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const { frequency = 2400, duration = 0.06, volume = 0.08 } = options;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  success(options = {}) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const { baseFreq = 523, interval = 1.25, noteDuration = 0.12, gap = 0.08, volume = 0.3 } = options;
    [0, 1].forEach(i => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * (noteDuration + gap);
      osc.type = 'sine';
      osc.frequency.value = baseFreq * Math.pow(interval, i);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + noteDuration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + noteDuration + 0.01);
    });
  }

  error(options = {}) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const { startFreq = 400, endFreq = 200, filterFreq = 1500, duration = 0.25, volume = 0.25 } = options;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  warning(options = {}) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const { frequency = 600, pulseDuration = 0.08, gap = 0.08, volume = 0.25 } = options;
    [0, 1].forEach(i => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + i * (pulseDuration + gap);
      osc.type = 'triangle';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + pulseDuration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + pulseDuration + 0.01);
    });
  }

  notification(options = {}) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const { frequency = 880, modRatio = 1.4, modDepth = 1500, duration = 0.4, volume = 0.25 } = options;
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    mod.frequency.value = frequency * modRatio;
    modGain.gain.setValueAtTime(modDepth, now);
    modGain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.8);
    const carrier = ctx.createOscillator();
    const cGain = ctx.createGain();
    carrier.frequency.value = frequency;
    cGain.gain.setValueAtTime(volume, now);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(cGain);
    cGain.connect(ctx.destination);
    mod.start(now);
    carrier.start(now);
    mod.stop(now + duration + 0.01);
    carrier.stop(now + duration + 0.01);
  }

  whoosh(options = {}) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const { startFilterFreq = 500, endFilterFreq = 4000, duration = 0.2, Q = 1, volume = 0.2 } = options;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = Q;
    filter.frequency.setValueAtTime(startFilterFreq, now);
    filter.frequency.exponentialRampToValueAtTime(endFilterFreq, now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + duration * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);
  }

  pop(options = {}) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const { startFreq = 1200, endFreq = 300, duration = 0.06, volume = 0.3 } = options;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  mute() { this.enabled = false; }
  unmute() { this.enabled = true; }
  setVolume(v) { this.masterVolume = Math.min(Math.max(v, 0), 0.8); }
}

// Usage:
// const sounds = new UISoundLibrary();
// sounds.click();
// sounds.toggle(true);
// sounds.success();
// sounds.notification();
```
