# Audio File References

When a user provides a **sound profile** from the `analyze-sound.mjs` CLI tool, use this guide to interpret the analysis and drive synthesis.

## What Is a Sound Profile?

The user ran `node tools/analyze-sound.mjs reference.wav` on an audio file they want to match. The output contains:

1. **SUMMARY** — plain-English description of the sound
2. **CLOSEST CATEGORY** — which of the 9 sound categories best matches
3. **VOCABULARY MATCH** — adjectives mapped to analysis metrics (same terms as the vocabulary bridge)
4. **DETAILED PROFILE** — structured analysis data
5. **synthesis_suggestion** — concrete recipe parameters ready to apply

## How to Use a Sound Profile

1. Read the `synthesis_suggestion` block first — it maps directly to recipe parameters
2. Load the recipe matching `recipe_starting_point` from `sound-recipes.md`
3. Override the recipe's defaults with the suggestion's values
4. Use the VOCABULARY MATCH terms to guide any further adjustments
5. Generate code and proceed to Listen → Refine as normal

The goal is to synthesize something that **feels similar** to the reference, not to reproduce it exactly. Web Audio synthesis has different characteristics than recorded audio — the profile gives you the right ballpark, and the user refines from there.

## Field Reference

### envelope

| Field | What It Means | Synthesis Mapping |
|-------|--------------|-------------------|
| `attack_ms` | Time from silence to peak amplitude | `setValueAtTime` → `linearRampToValueAtTime` over this duration |
| `decay_ms` | Time from peak to sustain level (or silence) | `exponentialRampToValueAtTime` over this duration |
| `sustain_level` | Steady-state amplitude relative to peak (0–1) | Gain level during sustain phase |
| `release_ms` | Time from sustain end to silence | Final `exponentialRampToValueAtTime(0.001, ...)` |
| `shape` | `percussive` / `sustained` / `pad-like` / `decaying` | Determines overall envelope strategy |
| `decay_curve` | `exponential` or `linear` | Use `exponentialRamp` or `linearRamp` accordingly |
| `peak_amplitude` | Loudest point (0–1 scale) | Map to gain value (cap at 0.8) |

### pitch

| Field | What It Means | Synthesis Mapping |
|-------|--------------|-------------------|
| `fundamental_hz` | Detected pitch | Oscillator frequency |
| `confidence` | How reliable the pitch detection is (0–1) | Below 0.4: likely noise-based, don't trust the frequency |
| `pitch_change` | `stable` / `rising` / `falling` | Whether to use a frequency ramp |

### spectrum

| Field | What It Means | Synthesis Mapping |
|-------|--------------|-------------------|
| `centroid_hz` | Center of spectral mass (brightness) | See brightness mapping below |
| `rolloff_85_hz` | Where 85% of energy sits below | Guides lowpass filter cutoff |
| `brightness` | `high` / `medium` / `low` | Vocabulary bridge: bright/neutral/warm |
| `dominant_frequencies` | Strongest frequency peaks | Primary oscillator + overtone frequencies |
| `harmonic_pattern` | `harmonic` / `partially-inharmonic` / `inharmonic` | See harmonic mapping below |

### tonality

| Field | What It Means | Synthesis Mapping |
|-------|--------------|-------------------|
| `tonal_percent` | How much energy is in pitched content | > 70%: oscillator-based. < 30%: noise-based |
| `noise_percent` | How much energy is broadband noise | High values → use BufferSource with noise |
| `classification` | `tonal` / `mixed` / `noise-based` | Primary synthesis approach |

### filter_estimate

| Field | What It Means | Synthesis Mapping |
|-------|--------------|-------------------|
| `type` | `lowpass` / `highpass` / `bandpass` / `none detected` | BiquadFilterNode type |
| `cutoff_hz` | Estimated filter cutoff frequency | BiquadFilterNode frequency |
| `q_estimate` | Estimated resonance/Q | BiquadFilterNode Q parameter |

Note: For pure tones, the filter estimate may show `bandpass` at the fundamental frequency. This is an artifact of concentrated spectral energy — ignore it and use the oscillator frequency directly.

### spectral_evolution

| Field | What It Means | Synthesis Mapping |
|-------|--------------|-------------------|
| `trend` | `stable` / `brightening` / `darkening` | Whether to sweep filter cutoff over time |
| `pitchTrend` | `stable` / `rising` / `falling` | Whether to sweep oscillator frequency |

### synthesis_suggestion

This block contains ready-to-use parameters in the same format as `sound-recipes.md`:

| Field | Maps To |
|-------|---------|
| `approach` | Which synthesis technique to use |
| `waveform` | OscillatorNode type or `noise` for BufferSource |
| `recipe_starting_point` | Which recipe to load as a base |
| `base_frequency` | Oscillator frequency parameter |
| `duration` | Total sound duration in seconds |
| `volume` | Gain node value (already capped at 0.8) |
| `envelope` | Attack/decay/sustain/release in seconds |
| `mod_ratio` | FM synthesis modulator ratio (if applicable) |
| `mod_depth` | FM synthesis modulation depth (if applicable) |
| `filter` | Filter type, cutoff, and Q (if applicable) |
| `start_frequency` / `end_frequency` | Frequency sweep range (if applicable) |

## Analysis-to-Category Mapping

Use this table when the `synthesis_suggestion` doesn't feel right or when manually interpreting a profile:

| Analysis Finding | Best Category | Recipe |
|-----------------|---------------|--------|
| < 80ms, percussive, noise-based | **Click** | Noise burst through bandpass |
| < 80ms, tonal, falling pitch | **Pop** | Sine with rapid pitch drop |
| 80–200ms, pitch sweep | **Toggle** | Oscillator with frequency ramp |
| 200–800ms, inharmonic overtones | **Notification** | FM synthesis |
| Noise-based, spectral sweep | **Whoosh** | Filtered noise with frequency sweep |
| < 80ms, very quiet, tonal | **Hover** | Gentle sine |
| Rising pitch, tonal, 200–500ms | **Success** | Ascending interval |
| Falling pitch, harmonics, 150–400ms | **Error** | Descending sweep through lowpass |
| Double/triple pulse pattern, mid-range | **Warning** | Multi-pulse oscillator |

## Brightness Mapping (Spectral Centroid → Vocabulary Bridge)

| Centroid Range | Vocabulary Term | Typical Synthesis |
|---------------|-----------------|-------------------|
| > 4000 Hz | Very bright | High filter cutoff, sawtooth/square, or high-frequency content |
| 2000–4000 Hz | Bright | Moderate filter cutoff, some harmonics |
| 1000–2000 Hz | Neutral | Default filter settings |
| 500–1000 Hz | Warm | Low filter cutoff, sine/triangle |
| < 500 Hz | Dark | Heavy lowpass filtering, sine wave |

## Envelope → Vocabulary Bridge

| Envelope Characteristic | Vocabulary Term | Typical Parameter |
|------------------------|-----------------|-------------------|
| Attack < 5ms | Snappy, Crisp | Near-zero attack time |
| Attack 5–20ms | Quick | Short attack |
| Attack > 50ms | Soft, Gentle | Gradual fade-in |
| Decay < 50ms | Percussive | Very fast decay |
| Decay 50–200ms | Punchy | Medium decay |
| Decay > 200ms | Sustained, Resonant | Long decay or sustain phase |
| Sustain > 0.3 | Full, Held | Add sustain phase to envelope |
| Sustain ≈ 0 | Transient, Plucky | No sustain, just attack → decay |

## Harmonic Content → Synthesis Approach

| Pattern | What It Means | Synthesis |
|---------|--------------|-----------|
| Harmonic (integer ratios) | Musical, pitched | Single oscillator (sine/saw/square) + filter |
| Partially inharmonic | Bell-like, metallic | FM synthesis with non-integer mod ratio |
| Inharmonic | Metallic, percussive | FM with high inharmonicity, or noise + filter |
| Minimal harmonics | Pure, thin | Single sine oscillator |
| Many harmonics | Rich, full | Sawtooth or layered oscillators with detune |

## Limitations

- **Short files (< 20ms):** Spectral analysis has limited frequency resolution. Envelope detection may be inaccurate. Trust the tonality classification more than specific frequencies.
- **Stereo files:** The analyzer mixes to mono before analysis. Stereo-specific characteristics (panning, width) are lost.
- **Compressed audio (MP3):** Compression artifacts can affect spectral analysis, especially at low bitrates. WAV files give the most accurate profiles.
- **Complex/layered sounds:** The analyzer works best on single UI sounds. Multi-layered sounds may produce confusing harmonic analysis — focus on the overall spectral character (centroid, brightness) rather than individual peaks.
- **The profile is a starting point.** The Listen → Refine loop is where the sound gets dialed in. Don't try to match every parameter exactly — match the character and feel.
