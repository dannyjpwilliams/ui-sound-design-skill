# Audio Rules — Formal Validation Rulebook

Rules for validating and reviewing Web Audio API UI sound code. Each rule has an ID, priority, description, and pass/fail examples. Use during code review or as a checklist when generating sounds.

## Priority Levels

| Priority | Meaning |
|----------|---------|
| **Critical** | Violations cause runtime errors, audio glitches, or resource leaks. Must fix. |
| **High** | Violations produce audibly wrong or wasteful output. Should fix. |
| **Medium** | Violations break best practices or produce suboptimal results. Fix when possible. |

---

## Critical — Context Management

### `context-singleton`

**Use a single AudioContext for the entire application.**

Browsers limit the number of AudioContexts. Creating one per sound leaks resources and eventually fails silently.

```javascript
// ✅ PASS
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// ❌ FAIL
function playSound() {
  const ctx = new AudioContext(); // new context every call
  // ...
}
```

### `context-resume-suspended`

**Always check for and resume a suspended AudioContext.**

After page load (before user gesture), the context starts suspended. Calling `resume()` is a no-op if already running, so always call it.

```javascript
// ✅ PASS
const ctx = getAudioContext();
if (ctx.state === 'suspended') ctx.resume();

// ❌ FAIL
const ctx = getAudioContext();
// assumes context is running — silent on first interaction
```

### `node-cleanup`

**Disconnect nodes after playback ends.**

OscillatorNodes auto-disconnect after `stop()`. BufferSourceNodes do not — use the `onended` callback to disconnect the entire signal chain.

```javascript
// ✅ PASS — BufferSource with cleanup
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

// ✅ PASS — Oscillator (auto-disconnects after stop)
osc.start(now);
osc.stop(now + duration + 0.01);

// ❌ FAIL — BufferSource without cleanup
source.connect(filter);
filter.connect(gain);
gain.connect(ctx.destination);
source.start(now);
// filter and gain nodes leak
```

---

## Critical — Envelope Safety

### `gain-no-zero-target`

**Never use `exponentialRampToValueAtTime(0, ...)`.**

Exponential ramps cannot target zero — it throws a runtime error. Always ramp to `0.001` (inaudible).

```javascript
// ✅ PASS
gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

// ❌ FAIL
gain.gain.exponentialRampToValueAtTime(0, now + duration);
```

### `gain-set-before-ramp`

**Always call `setValueAtTime()` before any ramp.**

A ramp without a preceding `setValueAtTime()` has no defined start point. The browser may ramp from an unexpected value or ignore the ramp entirely.

```javascript
// ✅ PASS
gain.gain.setValueAtTime(volume, now);
gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

// ❌ FAIL
gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
// no setValueAtTime — ramp start is undefined
```

---

## High — Envelope & Scheduling

### `exponential-over-linear`

**Use `exponentialRampToValueAtTime` by default.**

Exponential ramps sound natural for both volume and frequency. Linear ramps sound mechanical. Only use `linearRampToValueAtTime` for sub-50ms transitions where the difference is inaudible.

```javascript
// ✅ PASS — natural decay
gain.gain.setValueAtTime(0.3, now);
gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

// ⚠️ ACCEPTABLE — only for very short transitions
gain.gain.setValueAtTime(0.3, now);
gain.gain.linearRampToValueAtTime(0.001, now + 0.03);

// ❌ FAIL — linear for perceptible durations
gain.gain.setValueAtTime(0.3, now);
gain.gain.linearRampToValueAtTime(0.001, now + 0.2);
```

### `scheduling-capture-once`

**Capture `ctx.currentTime` once per sound function.**

Reading `currentTime` multiple times introduces drift between scheduled events because time advances between reads.

```javascript
// ✅ PASS
const now = ctx.currentTime;
gain.gain.setValueAtTime(volume, now);
gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
osc.start(now);
osc.stop(now + duration + 0.01);

// ❌ FAIL
gain.gain.setValueAtTime(volume, ctx.currentTime);
gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
osc.start(ctx.currentTime); // different time than above
```

### `stop-after-envelope`

**Schedule `osc.stop()` slightly after the gain envelope ends.**

Add at least 0.01s padding after the final gain ramp target. Stopping the oscillator before the envelope completes causes an audible click.

```javascript
// ✅ PASS — 0.01s padding
gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
osc.stop(now + duration + 0.01);

// ❌ FAIL — stop at same time as envelope end
gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
osc.stop(now + duration);
```

---

## High — Sound Design

### `noise-for-percussion`

**Use white noise (BufferSource) for percussive, atonal sounds.**

Clicks, whooshes, and snare-like sounds should use filtered noise, not oscillators. Oscillators produce pitched tones that sound musical rather than tactile.

```javascript
// ✅ PASS — click using filtered noise
const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
const data = buffer.getChannelData(0);
for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
const source = ctx.createBufferSource();
source.buffer = buffer;
// ... bandpass filter → gain → destination

// ❌ FAIL — click using oscillator
const osc = ctx.createOscillator();
osc.frequency.value = 2000;
// sounds like a tone, not a click
```

### `oscillator-for-tonal`

**Use oscillators for pitched, melodic sounds.**

Success chimes, toggles, notifications, and any sound that conveys pitch information should use oscillators (possibly with FM synthesis), not noise.

### `filter-for-character`

**Apply filters to shape the frequency character of a sound.**

Raw oscillators and raw noise both benefit from filtering. A bandpass on noise creates focused clicks. A lowpass on sawtooth tames harshness. Always consider whether a filter would improve the sound.

---

## Medium — Parameters

### `volume-max-0.8`

**Never set gain above 0.8.**

UI sounds should complement the interface, not dominate it. Peak gain of 0.8 leaves headroom for the user's other audio. Default to 0.3.

```javascript
// ✅ PASS
gain.gain.setValueAtTime(0.3, now);      // default
gain.gain.setValueAtTime(0.6, now);      // prominent
gain.gain.setValueAtTime(0.8, now);      // maximum

// ❌ FAIL
gain.gain.setValueAtTime(1.0, now);      // too loud
gain.gain.setValueAtTime(0.95, now);     // exceeds ceiling
```

### `filter-Q-per-type`

**Use appropriate Q values for each sound category.**

| Category | Q Range | Rationale |
|----------|---------|-----------|
| Click | 0.5–10 | Low Q = soft, high Q = focused/tonal |
| Whoosh | 0.5–5 | Low Q for broad sweep, moderate for tonal character |
| Error | 0.5–3 | Gentle filtering to tame sawtooth |
| Notification | — | FM synthesis handles character; filter rarely needed |
| Others | 0.5–5 | Safe general range |

Q above 15 causes audible ringing and self-oscillation — never appropriate for UI sounds.

### `duration-per-type`

**Keep durations within bounds for each sound category.**

Sounds that overstay their welcome annoy users. Sounds that are too short lose their character.

---

## Per-Sound-Type Parameter Bounds

Reference table for all 9 categories. Values outside these ranges are almost always wrong for UI contexts.

| Category | Duration | Volume | Filter Q | Attack | Key Constraint |
|----------|----------|--------|----------|--------|----------------|
| Click | 10–80ms | 0.1–0.6 | 0.5–10 | 0ms (instant) | Noise source, not oscillator |
| Toggle | 80–200ms | 0.1–0.4 | — | 0ms | Frequency sweep direction = state |
| Hover | 30–80ms | 0.03–0.08 | — | 5–15ms | Must be subliminal |
| Success | 200–500ms | 0.15–0.5 | — | 0ms | Ascending pitch interval |
| Error | 150–400ms | 0.15–0.4 | 0.5–3 | 0ms | Descending pitch, dark timbre |
| Warning | 150–350ms | 0.15–0.4 | — | 0ms | Double pulse pattern |
| Notification | 200–800ms | 0.15–0.4 | — | 0ms | FM synthesis for bell character |
| Whoosh | 100–400ms | 0.1–0.4 | 0.5–5 | — | Noise + filter frequency sweep |
| Pop | 30–80ms | 0.15–0.5 | — | 0ms | Rapid pitch drop, sine wave |

---

## Review Mode — Output Format

When auditing existing Web Audio code, report findings in this format:

### Per-Finding

```
file:line — [rule-id] Description of the violation
```

**Example:**
```
sounds.js:42 — [gain-no-zero-target] exponentialRampToValueAtTime targets 0; use 0.001
sounds.js:15 — [context-singleton] new AudioContext() called inside playClick(); use singleton
sounds.js:78 — [volume-max-0.8] gain set to 0.95; maximum is 0.8
```

### Summary Table

After all findings, provide a summary:

```
| Priority | Pass | Fail | Rules Checked |
|----------|------|------|---------------|
| Critical | 3    | 2    | context-singleton, context-resume-suspended, node-cleanup, gain-no-zero-target, gain-set-before-ramp |
| High     | 4    | 1    | exponential-over-linear, scheduling-capture-once, stop-after-envelope, noise-for-percussion, oscillator-for-tonal, filter-for-character |
| Medium   | 2    | 1    | volume-max-0.8, filter-Q-per-type, duration-per-type |
```

### Suggested Fixes

For each failing rule, provide the corrected code inline. Group fixes by file when reviewing multiple files.
