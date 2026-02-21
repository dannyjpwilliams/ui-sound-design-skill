# Tone.js — Simplified UI Sound Patterns

Tone.js wraps the Web Audio API with higher-level abstractions. Use it for faster prototyping when vanilla Web Audio feels verbose. Convert to vanilla Web Audio for production if bundle size matters.

## Setup

### CDN (quick prototyping)
```html
<script src="https://unpkg.com/tone"></script>
```

### npm (production)
```bash
npm install tone
```

### User gesture requirement

Same as vanilla Web Audio — must start audio from a user interaction:

```javascript
document.addEventListener('click', async () => {
  await Tone.start();
  console.log('Audio ready');
}, { once: true });
```

## Synth Types

| Synth | Character | Best For | Key Parameters |
|-------|-----------|----------|----------------|
| `Tone.Synth` | Clean, general purpose | Toggles, success/error tones | `oscillator.type`, `envelope` |
| `Tone.MembraneSynth` | Punchy, drum-like | Pops, deep clicks, tactile feedback | `pitchDecay`, `octaves` |
| `Tone.MetalSynth` | Metallic, inharmonic | Notifications, alerts, bells | `modulationIndex`, `harmonicity` |
| `Tone.NoiseSynth` | Noise-based, percussive | Clicks, whooshes, transitions | `noise.type`, `envelope` |
| `Tone.PluckSynth` | String-pluck, natural | Gentle feedback, organic sounds | `attackNoise`, `resonance` |

## Recipes

### Click

```javascript
const clickSynth = new Tone.NoiseSynth({
  noise: { type: 'white' },
  envelope: { attack: 0.001, decay: 0.05, sustain: 0 }
}).toDestination();
clickSynth.volume.value = -20;  // dB

function playClick() {
  clickSynth.triggerAttackRelease('16n');
}
```

**Variations:**
- Softer: `volume: -26`, `decay: 0.08`
- Sharper: `noise.type: 'pink'`, `decay: 0.03`, add highpass filter at 2000Hz

### Toggle

```javascript
const toggleSynth = new Tone.Synth({
  oscillator: { type: 'sine' },
  envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.05 }
}).toDestination();
toggleSynth.volume.value = -18;

function playToggle(isOn) {
  toggleSynth.triggerAttackRelease(isOn ? 'C5' : 'G4', '16n');
}
```

### Success

```javascript
const successSynth = new Tone.Synth({
  oscillator: { type: 'sine' },
  envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.1 }
}).toDestination();
successSynth.volume.value = -16;

function playSuccess() {
  const now = Tone.now();
  successSynth.triggerAttackRelease('C5', '16n', now);
  successSynth.triggerAttackRelease('E5', '16n', now + 0.15);
}
```

**Variation — triumphant:**
```javascript
function playTriumph() {
  const now = Tone.now();
  successSynth.triggerAttackRelease('C5', '16n', now);
  successSynth.triggerAttackRelease('E5', '16n', now + 0.12);
  successSynth.triggerAttackRelease('G5', '8n', now + 0.24);
}
```

### Error

```javascript
const errorSynth = new Tone.Synth({
  oscillator: { type: 'sawtooth' },
  envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.1 }
}).toDestination();

const errorFilter = new Tone.Filter(1500, 'lowpass').toDestination();
errorSynth.disconnect();
errorSynth.connect(errorFilter);
errorSynth.volume.value = -18;

function playError() {
  errorSynth.triggerAttackRelease('E3', '8n');
}
```

### Notification (Bell)

```javascript
const bellSynth = new Tone.MetalSynth({
  frequency: 880,
  envelope: { attack: 0.001, decay: 0.4, release: 0.1 },
  harmonicity: 1.4,
  modulationIndex: 8,
  resonance: 3000,
  octaves: 0.5
}).toDestination();
bellSynth.volume.value = -22;

function playNotification() {
  bellSynth.triggerAttackRelease('16n');
}
```

**Variation — chime sequence:**
```javascript
function playChime() {
  const now = Tone.now();
  bellSynth.triggerAttackRelease('16n', now);
  bellSynth.frequency = 1320;  // Higher pitch
  bellSynth.triggerAttackRelease('16n', now + 0.2);
  bellSynth.frequency = 880;   // Reset
}
```

### Whoosh

```javascript
const whooshSynth = new Tone.NoiseSynth({
  noise: { type: 'white' },
  envelope: { attack: 0.05, decay: 0.15, sustain: 0, release: 0.05 }
}).toDestination();

const whooshFilter = new Tone.AutoFilter({
  frequency: 8,
  baseFrequency: 500,
  octaves: 4
}).toDestination().start();

whooshSynth.disconnect();
whooshSynth.connect(whooshFilter);
whooshSynth.volume.value = -20;

function playWhoosh() {
  whooshSynth.triggerAttackRelease('8n');
}
```

### Pop

```javascript
const popSynth = new Tone.MembraneSynth({
  pitchDecay: 0.03,
  octaves: 4,
  oscillator: { type: 'sine' },
  envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.01 }
}).toDestination();
popSynth.volume.value = -16;

function playPop() {
  popSynth.triggerAttackRelease('C4', '32n');
}
```

**Variations:**
- Bubble: `octaves: 6`, `pitchDecay: 0.05`, trigger at `C5`
- Deep thunk: `octaves: 2`, `pitchDecay: 0.08`, trigger at `C2`

## Effects

Keep effects subtle for UI sounds — they should enhance, not dominate.

### Reverb (adds space/depth)

```javascript
const reverb = new Tone.Reverb({ decay: 0.5, wet: 0.15 }).toDestination();
synth.connect(reverb);
```

- `decay`: 0.3–1.0 for UI sounds (longer = more ambient)
- `wet`: 0.1–0.25 (keep low — UI sounds should feel immediate)

### Delay (adds rhythm/echo)

```javascript
const delay = new Tone.FeedbackDelay({
  delayTime: '16n',
  feedback: 0.1,
  wet: 0.1
}).toDestination();
synth.connect(delay);
```

Use sparingly — delay on frequent interactions (clicks, hovers) becomes distracting.

### Filter (shapes tone)

```javascript
const filter = new Tone.Filter({
  frequency: 2000,
  type: 'lowpass',
  rolloff: -12
}).toDestination();
synth.connect(filter);
```

## Volume in Tone.js

Tone.js uses **decibels** (dB), not 0–1 linear values:

| dB | Perceived | Use For |
|----|-----------|---------|
| -30 | Very quiet | Hover sounds |
| -24 | Quiet | Subtle feedback |
| -18 | Moderate | Standard interactions |
| -12 | Present | Notifications, alerts |
| -6 | Loud | Important alerts (use sparingly) |

```javascript
synth.volume.value = -18;  // Set volume in dB
```

## Converting Tone.js to Vanilla Web Audio

When you need to remove the Tone.js dependency for production:

| Tone.js | Vanilla Equivalent |
|---------|-------------------|
| `new Tone.Synth()` | `createOscillator()` + `createGain()` with envelope |
| `new Tone.NoiseSynth()` | `createBufferSource()` with noise buffer + `createGain()` |
| `new Tone.MembraneSynth()` | Oscillator with `frequency.exponentialRampToValueAtTime()` |
| `new Tone.MetalSynth()` | FM synthesis (modulator → carrier) |
| `new Tone.Filter()` | `createBiquadFilter()` |
| `new Tone.Reverb()` | `createConvolver()` with impulse response |
| `triggerAttackRelease(note, duration)` | Manual `start()`/`stop()` with gain envelope |
| `Tone.now()` | `audioCtx.currentTime` |
| Volume in dB | `Math.pow(10, dB / 20)` for linear gain |

**Conversion strategy:**
1. Prototype with Tone.js for speed
2. Get the sound right with the user
3. Convert to vanilla Web Audio using `references/web-audio-api.md` patterns
4. The `UISoundLibrary` class in `references/sound-recipes.md` is already vanilla

## When to Use Tone.js vs Vanilla

| Scenario | Recommendation |
|----------|---------------|
| Quick prototype / hearing the concept | Tone.js |
| Production app, bundle size matters | Vanilla Web Audio |
| Complex synthesis (FM, AM, granular) | Tone.js |
| Simple UI sounds (clicks, toggles) | Vanilla Web Audio |
| User wants to tweak interactively | Tone.js (faster iteration) |
| Final sound library for shipping | Vanilla Web Audio |
