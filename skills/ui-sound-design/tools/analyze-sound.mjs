#!/usr/bin/env node

/**
 * analyze-sound.mjs — Zero-dependency audio file analyzer for the ui-sound-design skill.
 *
 * Extracts a structured sound profile from .wav/.mp3 files that Claude can use
 * to drive Web Audio API synthesis. Run with:
 *
 *   node analyze-sound.mjs <path-to-audio-file>
 *
 * Supports .wav natively. Other formats (mp3, ogg, flac, aiff) require ffmpeg.
 */

import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { basename, extname } from "path";

// ─── CLI ────────────────────────────────────────────────────────────────────

const filePath = process.argv[2];
const jsonFlag = process.argv.includes("--json");

if (!filePath) {
  console.error("Usage: node analyze-sound.mjs <audio-file> [--json]");
  console.error("  Supports .wav natively. Other formats require ffmpeg.");
  process.exit(1);
}

if (!existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

// ─── Audio Decoding ─────────────────────────────────────────────────────────

/**
 * Decode audio file to mono Float32Array + sample rate.
 */
function decodeAudio(path) {
  const ext = extname(path).toLowerCase();

  if (ext === ".wav") {
    return decodeWav(path);
  }

  // For non-WAV formats, try ffmpeg
  return decodeWithFfmpeg(path);
}

/**
 * Parse WAV file natively. Handles PCM 16-bit, 24-bit, and 32-bit float.
 */
function decodeWav(path) {
  const buf = readFileSync(path);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // Verify RIFF header
  const riff = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  const wave = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Not a valid WAV file");
  }

  // Find fmt chunk
  let offset = 12;
  let fmtFound = false;
  let audioFormat, numChannels, sampleRate, bitsPerSample;

  while (offset < buf.length - 8) {
    const chunkId = String.fromCharCode(
      buf[offset],
      buf[offset + 1],
      buf[offset + 2],
      buf[offset + 3]
    );
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === "fmt ") {
      audioFormat = view.getUint16(offset + 8, true);
      numChannels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
      fmtFound = true;
    }

    if (chunkId === "data" && fmtFound) {
      const dataStart = offset + 8;
      const dataEnd = dataStart + chunkSize;
      const bytesPerSample = bitsPerSample / 8;
      const totalSamples = chunkSize / bytesPerSample;
      const samplesPerChannel = totalSamples / numChannels;

      // Decode to float samples, mix to mono
      const mono = new Float32Array(samplesPerChannel);

      for (let i = 0; i < samplesPerChannel; i++) {
        let sum = 0;
        for (let ch = 0; ch < numChannels; ch++) {
          const pos = dataStart + (i * numChannels + ch) * bytesPerSample;
          if (pos + bytesPerSample > dataEnd) break;

          if (audioFormat === 3 && bitsPerSample === 32) {
            // 32-bit float
            sum += view.getFloat32(pos, true);
          } else if (bitsPerSample === 16) {
            sum += view.getInt16(pos, true) / 32768;
          } else if (bitsPerSample === 24) {
            const b0 = buf[pos];
            const b1 = buf[pos + 1];
            const b2 = buf[pos + 2];
            let val = (b2 << 16) | (b1 << 8) | b0;
            if (val >= 0x800000) val -= 0x1000000;
            sum += val / 8388608;
          } else if (bitsPerSample === 8) {
            sum += (buf[pos] - 128) / 128;
          } else {
            throw new Error(`Unsupported bit depth: ${bitsPerSample}`);
          }
        }
        mono[i] = sum / numChannels;
      }

      return { samples: mono, sampleRate };
    }

    offset += 8 + chunkSize;
    // Chunks are word-aligned
    if (chunkSize % 2 !== 0) offset++;
  }

  throw new Error("Could not find data chunk in WAV file");
}

/**
 * Decode any audio format using ffmpeg → raw PCM float32 mono at 44100Hz.
 */
function decodeWithFfmpeg(path) {
  // Check if ffmpeg is available
  try {
    execSync("which ffmpeg", { stdio: "pipe" });
  } catch {
    const ext = extname(path).toLowerCase();
    if (ext === ".wav") {
      return decodeWav(path);
    }
    console.error(
      `ffmpeg not found. Install it to analyze ${ext} files.\n` +
        `  macOS: brew install ffmpeg\n` +
        `  .wav files work without ffmpeg.`
    );
    process.exit(1);
  }

  const sampleRate = 44100;
  const result = execSync(
    `ffmpeg -i "${path}" -f f32le -acodec pcm_f32le -ac 1 -ar ${sampleRate} pipe:1 2>/dev/null`,
    { maxBuffer: 100 * 1024 * 1024 }
  );

  const samples = new Float32Array(
    result.buffer,
    result.byteOffset,
    result.byteLength / 4
  );

  return { samples, sampleRate };
}

// ─── FFT (Radix-2 Cooley-Tukey) ────────────────────────────────────────────

/**
 * In-place radix-2 FFT. real and imag are same-length arrays (power of 2).
 */
function fft(real, imag) {
  const n = real.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  // Butterfly operations
  for (let len = 2; len <= n; len *= 2) {
    const halfLen = len / 2;
    const angle = (-2 * Math.PI) / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let curReal = 1;
      let curImag = 0;

      for (let j = 0; j < halfLen; j++) {
        const uReal = real[i + j];
        const uImag = imag[i + j];
        const vReal =
          real[i + j + halfLen] * curReal - imag[i + j + halfLen] * curImag;
        const vImag =
          real[i + j + halfLen] * curImag + imag[i + j + halfLen] * curReal;

        real[i + j] = uReal + vReal;
        imag[i + j] = uImag + vImag;
        real[i + j + halfLen] = uReal - vReal;
        imag[i + j + halfLen] = uImag - vImag;

        const newCurReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = newCurReal;
      }
    }
  }
}

/**
 * Compute magnitude spectrum from a signal segment using a Hann window.
 */
function computeSpectrum(samples, fftSize) {
  const real = new Float64Array(fftSize);
  const imag = new Float64Array(fftSize);

  // Apply Hann window
  for (let i = 0; i < fftSize && i < samples.length; i++) {
    const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
    real[i] = samples[i] * window;
  }

  fft(real, imag);

  // Compute magnitudes (only first half — Nyquist)
  const magnitudes = new Float64Array(fftSize / 2);
  for (let i = 0; i < fftSize / 2; i++) {
    magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
  }
  return magnitudes;
}

// ─── Analysis Functions ─────────────────────────────────────────────────────

/**
 * Compute RMS amplitude in time windows.
 */
function analyzeEnvelope(samples, sampleRate) {
  const numWindows = Math.min(50, Math.max(10, Math.floor(samples.length / 64)));
  const windowSize = Math.floor(samples.length / numWindows);
  const rms = [];

  for (let i = 0; i < numWindows; i++) {
    const start = i * windowSize;
    const end = Math.min(start + windowSize, samples.length);
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += samples[j] * samples[j];
    }
    rms.push(Math.sqrt(sum / (end - start)));
  }

  // Find peak
  const peakValue = Math.max(...rms);
  const peakIndex = rms.indexOf(peakValue);
  const peakTime = (peakIndex / numWindows) * (samples.length / sampleRate);

  // Attack time — time from start to peak
  const attackMs = peakTime * 1000;

  // Decay — time from peak to -20dB below peak (or 10% of peak)
  const decayThreshold = peakValue * 0.1;
  let decayEndIndex = peakIndex;
  for (let i = peakIndex; i < numWindows; i++) {
    if (rms[i] < decayThreshold) {
      decayEndIndex = i;
      break;
    }
    decayEndIndex = i;
  }
  const decayMs =
    ((decayEndIndex - peakIndex) / numWindows) *
    (samples.length / sampleRate) *
    1000;

  // Sustain — check if there's a plateau after initial decay
  // Look for a region where RMS stays within 3dB of a level
  let sustainLevel = 0;
  const midStart = Math.floor(numWindows * 0.3);
  const midEnd = Math.floor(numWindows * 0.7);
  if (midEnd > midStart) {
    const midRms = rms.slice(midStart, midEnd);
    const avgMid = midRms.reduce((a, b) => a + b, 0) / midRms.length;
    const variance =
      midRms.reduce((a, b) => a + (b - avgMid) ** 2, 0) / midRms.length;
    const cv = Math.sqrt(variance) / (avgMid || 1);
    if (cv < 0.3 && avgMid > peakValue * 0.15) {
      sustainLevel = avgMid / peakValue;
    }
  }

  // Release — time from sustain/decay end to silence
  const releaseThreshold = peakValue * 0.01;
  let releaseStartIndex = decayEndIndex;
  let releaseEndIndex = numWindows - 1;
  for (let i = numWindows - 1; i >= releaseStartIndex; i--) {
    if (rms[i] > releaseThreshold) {
      releaseEndIndex = i;
      break;
    }
  }
  const releaseMs =
    ((releaseEndIndex - releaseStartIndex) / numWindows) *
    (samples.length / sampleRate) *
    1000;

  // Classify envelope shape
  let shape;
  if (attackMs < 10 && decayMs < 100 && sustainLevel < 0.1) {
    shape = "percussive";
  } else if (sustainLevel > 0.3) {
    shape = "sustained";
  } else if (attackMs > 50) {
    shape = "pad-like";
  } else {
    shape = "decaying";
  }

  // Detect decay curve type (exponential vs linear)
  // Compare midpoint of decay to what exponential vs linear would predict
  let decayCurve = "exponential";
  if (peakIndex < decayEndIndex) {
    const midDecayIndex = Math.floor((peakIndex + decayEndIndex) / 2);
    const midDecayActual = rms[midDecayIndex] / peakValue;
    const linearMid = 0.5;
    const expMid = Math.exp(-1.5); // ~0.22
    if (Math.abs(midDecayActual - linearMid) < Math.abs(midDecayActual - expMid)) {
      decayCurve = "linear";
    }
  }

  return {
    rms,
    peakAmplitude: peakValue,
    attackMs: Math.round(attackMs * 10) / 10,
    decayMs: Math.round(decayMs * 10) / 10,
    sustainLevel: Math.round(sustainLevel * 100) / 100,
    releaseMs: Math.round(releaseMs * 10) / 10,
    shape,
    decayCurve,
  };
}

/**
 * Averaged spectral analysis over the whole signal.
 */
function analyzeSpectrum(samples, sampleRate) {
  const fftSize = 4096;
  const hopSize = fftSize / 2;
  const numFrames = Math.max(
    1,
    Math.floor((samples.length - fftSize) / hopSize) + 1
  );

  // Average magnitude spectrum
  const avgMagnitudes = new Float64Array(fftSize / 2);

  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * hopSize;
    const segment = samples.slice(start, start + fftSize);
    const magnitudes = computeSpectrum(segment, fftSize);
    for (let i = 0; i < magnitudes.length; i++) {
      avgMagnitudes[i] += magnitudes[i] / numFrames;
    }
  }

  const freqResolution = sampleRate / fftSize;

  // Spectral centroid (brightness)
  let weightedSum = 0;
  let totalEnergy = 0;
  for (let i = 1; i < avgMagnitudes.length; i++) {
    const freq = i * freqResolution;
    const mag = avgMagnitudes[i];
    weightedSum += freq * mag;
    totalEnergy += mag;
  }
  const centroid = totalEnergy > 0 ? weightedSum / totalEnergy : 0;

  // Spectral rolloff (85% energy)
  let cumulativeEnergy = 0;
  const rolloffThreshold = totalEnergy * 0.85;
  let rolloff = sampleRate / 2;
  for (let i = 1; i < avgMagnitudes.length; i++) {
    cumulativeEnergy += avgMagnitudes[i];
    if (cumulativeEnergy >= rolloffThreshold) {
      rolloff = i * freqResolution;
      break;
    }
  }

  // Find peaks (local maxima above a threshold)
  const threshold = Math.max(...avgMagnitudes) * 0.05;
  const peaks = [];
  for (let i = 2; i < avgMagnitudes.length - 2; i++) {
    if (
      avgMagnitudes[i] > threshold &&
      avgMagnitudes[i] > avgMagnitudes[i - 1] &&
      avgMagnitudes[i] > avgMagnitudes[i + 1] &&
      avgMagnitudes[i] > avgMagnitudes[i - 2] &&
      avgMagnitudes[i] > avgMagnitudes[i + 2]
    ) {
      peaks.push({
        bin: i,
        hz: Math.round(i * freqResolution),
        amplitude: avgMagnitudes[i],
      });
    }
  }

  // Sort by amplitude descending, take top 10
  peaks.sort((a, b) => b.amplitude - a.amplitude);
  const topPeaks = peaks.slice(0, 10);

  // Normalize amplitudes relative to max peak
  const maxPeakAmp = topPeaks.length > 0 ? topPeaks[0].amplitude : 1;
  for (const p of topPeaks) {
    p.relativeAmplitude = Math.round((p.amplitude / maxPeakAmp) * 100) / 100;
  }

  return {
    centroid: Math.round(centroid),
    rolloff: Math.round(rolloff),
    peaks: topPeaks,
    avgMagnitudes,
    freqResolution,
    totalEnergy,
  };
}

/**
 * Detect fundamental frequency using autocorrelation.
 */
function detectPitch(samples, sampleRate) {
  // Use a segment from the loudest part of the signal
  const segmentSize = Math.min(4096, samples.length);

  // Find loudest region
  const windowSize = segmentSize;
  let maxRms = 0;
  let bestStart = 0;
  const step = Math.max(1, Math.floor(samples.length / 20));
  for (let start = 0; start + windowSize <= samples.length; start += step) {
    let sum = 0;
    for (let i = start; i < start + windowSize; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / windowSize);
    if (rms > maxRms) {
      maxRms = rms;
      bestStart = start;
    }
  }

  const segment = samples.slice(bestStart, bestStart + segmentSize);

  // Autocorrelation
  const minLag = Math.floor(sampleRate / 8000); // Max freq ~8000Hz
  const maxLag = Math.floor(sampleRate / 50); // Min freq ~50Hz
  let bestCorrelation = 0;
  let bestLag = 0;

  // Compute signal energy for normalization
  let energy = 0;
  for (let i = 0; i < segment.length; i++) {
    energy += segment[i] * segment[i];
  }

  for (let lag = minLag; lag < Math.min(maxLag, segment.length / 2); lag++) {
    let correlation = 0;
    let energyLag = 0;
    for (let i = 0; i < segment.length - lag; i++) {
      correlation += segment[i] * segment[i + lag];
      energyLag += segment[i + lag] * segment[i + lag];
    }

    // Normalized correlation
    const normCorr =
      energy > 0 && energyLag > 0
        ? correlation / Math.sqrt(energy * energyLag)
        : 0;

    if (normCorr > bestCorrelation) {
      bestCorrelation = normCorr;
      bestLag = lag;
    }
  }

  const fundamentalHz =
    bestLag > 0 ? Math.round(sampleRate / bestLag) : null;
  const confidence = Math.round(bestCorrelation * 100) / 100;

  return { fundamentalHz, confidence };
}

/**
 * Analyze harmonic content relative to fundamental.
 */
function analyzeHarmonics(spectralPeaks, fundamental) {
  if (!fundamental || spectralPeaks.length < 2) {
    return { pattern: "unknown", ratios: [] };
  }

  const ratios = [];
  for (const peak of spectralPeaks.slice(1)) {
    const ratio = peak.hz / fundamental;
    const nearestInt = Math.round(ratio);
    const deviation = Math.abs(ratio - nearestInt);
    ratios.push({
      hz: peak.hz,
      ratio: Math.round(ratio * 100) / 100,
      nearestHarmonic: nearestInt,
      deviation: Math.round(deviation * 100) / 100,
      amplitude: peak.relativeAmplitude,
    });
  }

  // Classify: harmonic (most ratios near integers) vs inharmonic
  const harmonicCount = ratios.filter((r) => r.deviation < 0.08).length;
  const totalRatios = ratios.length;
  const harmonicity =
    totalRatios > 0 ? Math.round((harmonicCount / totalRatios) * 100) : 0;

  let pattern;
  if (harmonicity > 70) {
    pattern = "harmonic";
  } else if (harmonicity > 30) {
    pattern = "partially-inharmonic";
  } else {
    pattern = "inharmonic";
  }

  return { pattern, harmonicity, ratios };
}

/**
 * Estimate noise vs tonal content ratio.
 */
function analyzeTonality(avgMagnitudes, peaks, freqResolution) {
  // Sum energy around peaks (±3 bins) as "tonal"
  const peakBins = new Set();
  for (const peak of peaks) {
    for (let offset = -3; offset <= 3; offset++) {
      peakBins.add(peak.bin + offset);
    }
  }

  let tonalEnergy = 0;
  let totalEnergy = 0;
  for (let i = 1; i < avgMagnitudes.length; i++) {
    const e = avgMagnitudes[i] * avgMagnitudes[i];
    totalEnergy += e;
    if (peakBins.has(i)) {
      tonalEnergy += e;
    }
  }

  const tonalPercent =
    totalEnergy > 0 ? Math.round((tonalEnergy / totalEnergy) * 100) : 0;
  const noisePercent = 100 - tonalPercent;

  // Spectral flatness (Wiener entropy): geometric mean / arithmetic mean of power spectrum.
  // White noise ≈ 1.0, pure tone ≈ 0.0, FM sounds ≈ 0.1–0.5.
  // Computed in log domain for numerical stability.
  const powerValues = [];
  for (let i = 1; i < avgMagnitudes.length; i++) {
    const power = avgMagnitudes[i] * avgMagnitudes[i];
    if (power > 0) powerValues.push(power);
  }
  let spectralFlatness = 1;
  if (powerValues.length > 0) {
    const logSum = powerValues.reduce((sum, p) => sum + Math.log(p), 0);
    const arithmeticMean = powerValues.reduce((sum, p) => sum + p, 0) / powerValues.length;
    const geometricMean = Math.exp(logSum / powerValues.length);
    spectralFlatness = arithmeticMean > 0 ? geometricMean / arithmeticMean : 1;
  }

  let classification;
  if (tonalPercent > 70) classification = "tonal";
  else if (tonalPercent > 30) classification = "mixed";
  // Low spectral flatness = structured spectrum (FM sidebands, not random noise)
  else if (spectralFlatness < 0.3 && peaks.length >= 3) classification = "complex-tonal";
  else classification = "noise-based";

  return { tonalPercent, noisePercent, classification, spectralFlatness };
}

/**
 * Analyze how the spectrum changes over time (3 windows).
 */
function analyzeSpectralEvolution(samples, sampleRate) {
  const fftSize = 4096;
  const thirdLen = Math.floor(samples.length / 3);

  if (thirdLen < fftSize) {
    // Too short for meaningful evolution analysis
    return { trend: "too-short-to-analyze" };
  }

  const segments = [
    samples.slice(0, thirdLen),
    samples.slice(thirdLen, thirdLen * 2),
    samples.slice(thirdLen * 2, thirdLen * 3),
  ];

  const centroids = segments.map((seg) => {
    const mags = computeSpectrum(seg.slice(0, fftSize), fftSize);
    const freqRes = sampleRate / fftSize;
    let wSum = 0;
    let tEnergy = 0;
    for (let i = 1; i < mags.length; i++) {
      wSum += i * freqRes * mags[i];
      tEnergy += mags[i];
    }
    return tEnergy > 0 ? Math.round(wSum / tEnergy) : 0;
  });

  // Detect pitch change in each third
  const pitches = segments.map((seg) => detectPitch(seg, sampleRate));

  // Classify spectral trend
  const centroidDelta = centroids[2] - centroids[0];
  const centroidRange = Math.max(...centroids) - Math.min(...centroids);
  const avgCentroid = centroids.reduce((a, b) => a + b, 0) / 3;
  const relativeChange = avgCentroid > 0 ? centroidRange / avgCentroid : 0;

  let trend;
  if (relativeChange < 0.15) {
    trend = "stable";
  } else if (centroidDelta > 0) {
    trend = "brightening";
  } else {
    trend = "darkening";
  }

  // Pitch trend
  const startPitch = pitches[0].fundamentalHz;
  const endPitch = pitches[2].fundamentalHz;
  let pitchTrend = "stable";
  if (startPitch && endPitch) {
    const pitchRatio = endPitch / startPitch;
    if (pitchRatio > 1.15) pitchTrend = "rising";
    else if (pitchRatio < 0.85) pitchTrend = "falling";
  }

  return {
    startCentroid: centroids[0],
    midCentroid: centroids[1],
    endCentroid: centroids[2],
    trend,
    pitchTrend,
    startPitchHz: startPitch,
    endPitchHz: endPitch,
  };
}

/**
 * Estimate filter characteristics from spectral shape.
 */
function estimateFilter(avgMagnitudes, freqResolution, sampleRate) {
  // Look for a sharp rolloff in the spectrum
  const nyquist = sampleRate / 2;

  // Smooth the spectrum for filter detection
  const smoothed = new Float64Array(avgMagnitudes.length);
  const smoothWindow = 5;
  for (let i = smoothWindow; i < avgMagnitudes.length - smoothWindow; i++) {
    let sum = 0;
    for (let j = -smoothWindow; j <= smoothWindow; j++) {
      sum += avgMagnitudes[i + j];
    }
    smoothed[i] = sum / (smoothWindow * 2 + 1);
  }

  // Find the steepest drop in the smoothed spectrum
  let maxDrop = 0;
  let dropBin = 0;
  for (let i = 10; i < smoothed.length - 10; i++) {
    // Compare energy in 5 bins before vs after
    let before = 0;
    let after = 0;
    for (let j = 1; j <= 5; j++) {
      before += smoothed[i - j];
      after += smoothed[i + j];
    }
    const drop = before > 0 ? (before - after) / before : 0;
    if (drop > maxDrop) {
      maxDrop = drop;
      dropBin = i;
    }
  }

  // Check if there's a clear bandpass shape (energy concentrated in a range)
  const totalBins = avgMagnitudes.length;
  const threshold = Math.max(...avgMagnitudes) * 0.1;
  let lowBin = 0;
  let highBin = totalBins - 1;

  for (let i = 0; i < totalBins; i++) {
    if (avgMagnitudes[i] > threshold) {
      lowBin = i;
      break;
    }
  }
  for (let i = totalBins - 1; i >= 0; i--) {
    if (avgMagnitudes[i] > threshold) {
      highBin = i;
      break;
    }
  }

  const lowFreq = Math.round(lowBin * freqResolution);
  const highFreq = Math.round(highBin * freqResolution);
  const bandwidth = highFreq - lowFreq;
  const centerFreq = Math.round((lowFreq + highFreq) / 2);

  let type = "none detected";
  let cutoffHz = null;
  let qEstimate = null;

  if (maxDrop > 0.6 && dropBin * freqResolution < nyquist * 0.8) {
    type = "lowpass";
    cutoffHz = Math.round(dropBin * freqResolution);
  }

  if (lowFreq > 200 && highFreq < nyquist * 0.7) {
    type = "bandpass";
    cutoffHz = centerFreq;
    qEstimate =
      bandwidth > 0
        ? Math.round((centerFreq / bandwidth) * 10) / 10
        : null;
  } else if (lowFreq > 200) {
    type = "highpass";
    cutoffHz = lowFreq;
  }

  return { type, cutoffHz, qEstimate };
}

/**
 * Map analysis results to a synthesis suggestion using recipe parameter names.
 */
function generateSynthesisSuggestion(
  durationMs,
  envelope,
  pitch,
  spectrum,
  harmonics,
  tonality,
  evolution,
  filter
) {
  // Determine approach
  // Check harmonics BEFORE tonality — FM synthesis creates complex spectra
  // that the tonality detector misclassifies as noise-based
  let approach, waveform, recipeStartingPoint;

  if (
    (harmonics.pattern === "inharmonic" ||
      harmonics.pattern === "partially-inharmonic") &&
    spectrum.peaks.length >= 3 &&
    (tonality.tonalPercent > 15 ||
      tonality.classification === "complex-tonal" ||
      // Longer sounds (>100ms) with multiple inharmonic peaks are likely FM, not noise
      (durationMs > 100 && spectrum.peaks.length >= 5))
  ) {
    approach = "fm_synthesis";
    waveform = "sine";
    recipeStartingPoint = "notification";
  } else if (tonality.classification === "noise-based") {
    approach = "noise_burst";
    waveform = "noise";
    if (durationMs < 80) {
      recipeStartingPoint = "click";
    } else {
      recipeStartingPoint = "whoosh";
    }
  } else if (evolution.pitchTrend === "rising") {
    approach = "oscillator_sweep";
    waveform = "sine";
    if (durationMs < 200) {
      recipeStartingPoint = "toggle";
    } else {
      recipeStartingPoint = "success";
    }
  } else if (evolution.pitchTrend === "falling") {
    approach = "oscillator_sweep";
    waveform = "sine";
    if (durationMs < 100) {
      recipeStartingPoint = "pop";
    } else {
      recipeStartingPoint = "error";
    }
  } else if (durationMs < 80 && envelope.shape === "percussive") {
    if (tonality.tonalPercent > 50) {
      approach = "oscillator_pitch_drop";
      waveform = "sine";
      recipeStartingPoint = "pop";
    } else {
      approach = "noise_burst";
      waveform = "noise";
      recipeStartingPoint = "click";
    }
  } else if (durationMs < 80) {
    approach = "gentle_oscillator";
    waveform = "sine";
    recipeStartingPoint = "hover";
  } else if (envelope.shape === "sustained") {
    approach = "oscillator_sustained";
    waveform = "sine";
    recipeStartingPoint = "warning";
  } else {
    approach = "oscillator_envelope";
    waveform = "sine";
    recipeStartingPoint = "notification";
  }

  // Infer waveform from harmonic content
  if (tonality.classification !== "noise-based" && harmonics.ratios.length > 0) {
    const hasOddHarmonics = harmonics.ratios.some(
      (r) => r.nearestHarmonic % 2 === 1 && r.deviation < 0.08
    );
    const hasEvenHarmonics = harmonics.ratios.some(
      (r) => r.nearestHarmonic % 2 === 0 && r.deviation < 0.08
    );

    if (hasOddHarmonics && !hasEvenHarmonics) {
      waveform = "square"; // Square/triangle have odd harmonics
    } else if (hasOddHarmonics && hasEvenHarmonics) {
      waveform = "sawtooth"; // Sawtooth has all harmonics
    }
  }

  // Build suggestion
  const suggestion = {
    approach,
    waveform,
    recipe_starting_point: recipeStartingPoint,
    base_frequency: pitch.fundamentalHz || spectrum.centroid,
    duration: Math.round(durationMs) / 1000,
    volume: Math.min(0.8, Math.round(envelope.peakAmplitude * 100) / 100),
    envelope: {
      attack: Math.round(envelope.attackMs) / 1000,
      decay: Math.round(envelope.decayMs) / 1000,
      sustain: envelope.sustainLevel,
      release: Math.round(envelope.releaseMs) / 1000,
    },
  };

  // Add FM params if applicable
  if (approach === "fm_synthesis" && harmonics.ratios.length > 0) {
    const strongestOvertone = harmonics.ratios[0];
    suggestion.mod_ratio = strongestOvertone.ratio;
    suggestion.mod_depth = Math.round(
      strongestOvertone.amplitude * (pitch.fundamentalHz || 440) * 2
    );
  }

  // Add filter if detected
  if (filter.type !== "none detected") {
    suggestion.filter = {
      type: filter.type,
      cutoff_hz: filter.cutoffHz,
      q: filter.qEstimate || 1,
    };
  }

  // Add sweep params if applicable
  if (
    approach === "oscillator_sweep" &&
    evolution.startPitchHz &&
    evolution.endPitchHz
  ) {
    suggestion.start_frequency = evolution.startPitchHz;
    suggestion.end_frequency = evolution.endPitchHz;
  }

  return suggestion;
}

/**
 * Map analysis to vocabulary bridge terms.
 */
function generateVocabularyMatch(spectrum, envelope, harmonics, tonality) {
  const terms = [];

  // Brightness
  if (spectrum.centroid > 3000) {
    terms.push(`Bright (spectral centroid ${spectrum.centroid}Hz)`);
  } else if (spectrum.centroid > 1500) {
    terms.push(`Neutral brightness (spectral centroid ${spectrum.centroid}Hz)`);
  } else {
    terms.push(`Warm/Dark (spectral centroid ${spectrum.centroid}Hz)`);
  }

  // Attack character
  if (envelope.attackMs < 5) {
    terms.push(`Snappy (attack ${envelope.attackMs}ms)`);
  } else if (envelope.attackMs < 20) {
    terms.push(`Crisp (attack ${envelope.attackMs}ms)`);
  } else if (envelope.attackMs > 50) {
    terms.push(`Soft/Gentle (attack ${envelope.attackMs}ms)`);
  }

  // Harmonic character
  if (
    harmonics.pattern === "inharmonic" ||
    harmonics.pattern === "partially-inharmonic"
  ) {
    const ratioStr = harmonics.ratios
      .slice(0, 3)
      .map((r) => `${r.ratio}x`)
      .join(", ");
    terms.push(`Metallic/Bell-like (inharmonic overtones: ${ratioStr})`);
  } else if (harmonics.ratios.length > 3) {
    terms.push(`Rich/Full (${harmonics.ratios.length} harmonics)`);
  } else if (harmonics.ratios.length <= 1) {
    terms.push("Thin/Pure (minimal harmonics)");
  }

  // Noise character
  if (tonality.noisePercent > 60) {
    terms.push(`Noisy/Textured (${tonality.noisePercent}% noise)`);
  } else if (tonality.noisePercent < 10) {
    terms.push(`Clean (${tonality.tonalPercent}% tonal)`);
  }

  // Duration character
  const durationMs = envelope.attackMs + envelope.decayMs + envelope.releaseMs;
  if (durationMs < 80) {
    terms.push("Very short/Crisp");
  } else if (durationMs > 500) {
    terms.push("Sustained/Resonant");
  }

  return terms;
}

/**
 * Map analysis to the closest sound category.
 */
function classifySound(
  durationMs,
  envelope,
  tonality,
  harmonics,
  evolution,
  spectrum
) {
  // Scoring system — each category gets points based on how well it matches
  const scores = {
    click: 0,
    toggle: 0,
    hover: 0,
    success: 0,
    error: 0,
    warning: 0,
    notification: 0,
    whoosh: 0,
    pop: 0,
  };

  // Duration-based scoring
  if (durationMs <= 80) {
    scores.click += 3;
    scores.hover += 3;
    scores.pop += 3;
  } else if (durationMs <= 200) {
    scores.toggle += 3;
    scores.warning += 2;
  } else if (durationMs <= 500) {
    scores.success += 3;
    scores.error += 3;
    scores.warning += 2;
    scores.notification += 2;
    scores.whoosh += 2;
  } else {
    scores.notification += 3;
  }

  // Tonality
  if (tonality.classification === "noise-based") {
    scores.click += 3;
    scores.whoosh += 3;
  } else if (tonality.classification === "tonal") {
    scores.toggle += 2;
    scores.success += 2;
    scores.notification += 2;
    scores.pop += 2;
  }

  // Envelope shape
  if (envelope.shape === "percussive") {
    scores.click += 2;
    scores.pop += 2;
  }

  // Harmonic content — inharmonic overtones strongly suggest bell/notification
  if (
    harmonics.pattern === "inharmonic" ||
    harmonics.pattern === "partially-inharmonic"
  ) {
    scores.notification += 5;
  }

  // Pitch evolution
  if (evolution.pitchTrend === "rising") {
    scores.toggle += 2;
    scores.success += 3;
  } else if (evolution.pitchTrend === "falling") {
    scores.pop += 3;
    scores.error += 2;
  }

  // Amplitude — very quiet suggests hover
  if (envelope.peakAmplitude < 0.1) {
    scores.hover += 3;
  }

  // Spectral evolution suggesting movement
  if (evolution.trend === "brightening" || evolution.trend === "darkening") {
    scores.whoosh += 2;
  }

  // Find best match
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];

  const descriptions = {
    click: "percussive noise burst",
    toggle: "pitch sweep for state change",
    hover: "gentle, nearly subliminal tone",
    success: "ascending tonal interval",
    error: "descending, buzzy tone",
    warning: "double pulse, mid-range",
    notification: "bell-like FM synthesis",
    whoosh: "filtered noise sweep",
    pop: "sine with rapid pitch drop",
  };

  return {
    category: best[0].charAt(0).toUpperCase() + best[0].slice(1),
    description: descriptions[best[0]],
    confidence: best[1],
  };
}

// ─── Output Formatting ──────────────────────────────────────────────────────

function formatOutput(fileName, analysis) {
  const {
    durationMs,
    sampleRate,
    envelope,
    pitch,
    spectrum,
    harmonics,
    tonality,
    evolution,
    filter,
    classification,
    vocabularyMatch,
    synthesisSuggestion,
  } = analysis;

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(analysis, null, 2));
    return;
  }

  const line = "═".repeat(55);
  const thinLine = "─".repeat(55);

  console.log(`\n${line}`);
  console.log(`  SOUND PROFILE: ${fileName}`);
  console.log(`${line}\n`);

  // Summary
  console.log("SUMMARY");
  const summaryParts = [];
  summaryParts.push(
    `  A ${Math.round(durationMs)}ms`
  );
  if (spectrum.centroid > 3000) summaryParts[0] += ", bright";
  else if (spectrum.centroid < 1000) summaryParts[0] += ", warm";

  if (tonality.classification === "tonal") summaryParts[0] += ", tonal";
  else if (tonality.classification === "noise-based")
    summaryParts[0] += ", noise-based";
  else summaryParts[0] += ", mixed tonal/noise";

  summaryParts[0] += ` sound with ${envelope.shape} envelope.`;

  if (pitch.fundamentalHz && pitch.confidence > 0.5) {
    summaryParts.push(
      `  Fundamental at ${pitch.fundamentalHz}Hz${
        harmonics.pattern !== "unknown"
          ? ` with ${harmonics.pattern} overtones`
          : ""
      }.`
    );
  }

  summaryParts.push(
    `  ${envelope.decayCurve.charAt(0).toUpperCase() + envelope.decayCurve.slice(1)} ${envelope.shape === "percussive" ? "decay" : "envelope"}, attack ${envelope.attackMs}ms, decay ${envelope.decayMs}ms.`
  );

  if (filter.type !== "none detected") {
    summaryParts.push(
      `  Apparent ${filter.type} filter around ${filter.cutoffHz}Hz${
        filter.qEstimate ? ` (Q ≈ ${filter.qEstimate})` : ""
      }.`
    );
  }

  console.log(summaryParts.join("\n"));

  console.log(
    `\nCLOSEST CATEGORY: ${classification.category} (${classification.description})`
  );

  console.log("\nVOCABULARY MATCH");
  for (const term of vocabularyMatch) {
    console.log(`  ${term}`);
  }

  console.log(`\n${thinLine}`);
  console.log("DETAILED PROFILE");
  console.log(`${thinLine}\n`);

  // Structured data
  console.log(`duration_ms: ${Math.round(durationMs)}`);
  console.log(`sample_rate: ${sampleRate}`);

  console.log("\nenvelope:");
  console.log(`  attack_ms: ${envelope.attackMs}`);
  console.log(`  decay_ms: ${envelope.decayMs}`);
  console.log(`  sustain_level: ${envelope.sustainLevel}`);
  console.log(`  release_ms: ${envelope.releaseMs}`);
  console.log(
    `  shape: ${envelope.shape} (${envelope.decayCurve} decay curve)`
  );
  console.log(`  peak_amplitude: ${Math.round(envelope.peakAmplitude * 100) / 100}`);

  console.log("\npitch:");
  console.log(`  fundamental_hz: ${pitch.fundamentalHz || "not detected"}`);
  console.log(
    `  confidence: ${pitch.confidence}`
  );
  if (evolution.pitchTrend !== "stable") {
    console.log(`  pitch_change: ${evolution.pitchTrend}`);
    if (evolution.startPitchHz && evolution.endPitchHz) {
      console.log(
        `  start_hz: ${evolution.startPitchHz} → end_hz: ${evolution.endPitchHz}`
      );
    }
  } else {
    console.log("  pitch_change: stable");
  }

  console.log("\nspectrum:");
  console.log(`  centroid_hz: ${spectrum.centroid}`);
  console.log(`  rolloff_85_hz: ${spectrum.rolloff}`);
  console.log(
    `  brightness: ${
      spectrum.centroid > 3000
        ? "high"
        : spectrum.centroid > 1500
        ? "medium"
        : "low"
    }`
  );
  console.log("  dominant_frequencies:");
  const displayPeaks = spectrum.peaks.slice(0, 5);
  for (let i = 0; i < displayPeaks.length; i++) {
    const p = displayPeaks[i];
    const role = i === 0 ? "strongest" : "overtone";
    console.log(
      `    - { hz: ${p.hz}, amplitude: ${p.relativeAmplitude}, role: ${role} }`
    );
  }
  if (harmonics.pattern !== "unknown") {
    console.log(`  harmonic_pattern: ${harmonics.pattern}`);
    if (harmonics.ratios.length > 0) {
      console.log("  harmonic_ratios:");
      for (const r of harmonics.ratios.slice(0, 5)) {
        console.log(
          `    - { ratio: ${r.ratio}, hz: ${r.hz}, amplitude: ${r.amplitude} }`
        );
      }
    }
  }

  console.log("\ntonality:");
  console.log(`  tonal_percent: ${tonality.tonalPercent}`);
  console.log(`  noise_percent: ${tonality.noisePercent}`);
  console.log(`  classification: ${tonality.classification}`);

  console.log("\nfilter_estimate:");
  console.log(`  type: ${filter.type}`);
  console.log(`  cutoff_hz: ${filter.cutoffHz || "null"}`);
  console.log(`  q_estimate: ${filter.qEstimate || "null"}`);

  if (evolution.trend !== "too-short-to-analyze") {
    console.log("\nspectral_evolution:");
    console.log(`  start_centroid_hz: ${evolution.startCentroid}`);
    console.log(`  mid_centroid_hz: ${evolution.midCentroid}`);
    console.log(`  end_centroid_hz: ${evolution.endCentroid}`);
    console.log(`  trend: ${evolution.trend}`);
  }

  console.log("\nsynthesis_suggestion:");
  console.log(`  approach: ${synthesisSuggestion.approach}`);
  console.log(`  waveform: ${synthesisSuggestion.waveform}`);
  console.log(
    `  recipe_starting_point: ${synthesisSuggestion.recipe_starting_point}`
  );
  console.log(`  base_frequency: ${synthesisSuggestion.base_frequency}`);
  console.log(`  duration: ${synthesisSuggestion.duration}`);
  console.log(`  volume: ${synthesisSuggestion.volume}`);
  console.log(
    `  envelope: { attack: ${synthesisSuggestion.envelope.attack}, decay: ${synthesisSuggestion.envelope.decay}, sustain: ${synthesisSuggestion.envelope.sustain}, release: ${synthesisSuggestion.envelope.release} }`
  );
  if (synthesisSuggestion.mod_ratio) {
    console.log(`  mod_ratio: ${synthesisSuggestion.mod_ratio}`);
    console.log(`  mod_depth: ${synthesisSuggestion.mod_depth}`);
  }
  if (synthesisSuggestion.filter) {
    console.log(
      `  filter: { type: ${synthesisSuggestion.filter.type}, cutoff_hz: ${synthesisSuggestion.filter.cutoff_hz}, q: ${synthesisSuggestion.filter.q} }`
    );
  }
  if (synthesisSuggestion.start_frequency) {
    console.log(`  start_frequency: ${synthesisSuggestion.start_frequency}`);
    console.log(`  end_frequency: ${synthesisSuggestion.end_frequency}`);
  }

  console.log("");
}

// ─── Main ───────────────────────────────────────────────────────────────────

try {
  const { samples, sampleRate } = decodeAudio(filePath);

  if (samples.length === 0) {
    console.error("Audio file appears to be empty (no samples).");
    process.exit(1);
  }

  // Check for silence
  const maxAmp = Math.max(...Array.from(samples.slice(0, Math.min(samples.length, 10000))).map(Math.abs));
  if (maxAmp < 0.001) {
    console.error("Audio file appears to be silent.");
    process.exit(1);
  }

  const durationMs = (samples.length / sampleRate) * 1000;

  // Run analysis pipeline
  const envelope = analyzeEnvelope(samples, sampleRate);
  const spectrum = analyzeSpectrum(samples, sampleRate);
  const pitch = detectPitch(samples, sampleRate);
  const harmonics = analyzeHarmonics(spectrum.peaks, pitch.fundamentalHz);
  const tonality = analyzeTonality(
    spectrum.avgMagnitudes,
    spectrum.peaks,
    spectrum.freqResolution
  );
  const evolution = analyzeSpectralEvolution(samples, sampleRate);
  const filter = estimateFilter(
    spectrum.avgMagnitudes,
    spectrum.freqResolution,
    sampleRate
  );

  const classification = classifySound(
    durationMs,
    envelope,
    tonality,
    harmonics,
    evolution,
    spectrum
  );

  const vocabularyMatch = generateVocabularyMatch(
    spectrum,
    envelope,
    harmonics,
    tonality
  );

  const synthesisSuggestion = generateSynthesisSuggestion(
    durationMs,
    envelope,
    pitch,
    spectrum,
    harmonics,
    tonality,
    evolution,
    filter
  );

  // Clean up spectrum data before output (remove large arrays)
  const cleanSpectrum = {
    centroid: spectrum.centroid,
    rolloff: spectrum.rolloff,
    peaks: spectrum.peaks,
  };

  formatOutput(basename(filePath), {
    durationMs,
    sampleRate,
    envelope: {
      attackMs: envelope.attackMs,
      decayMs: envelope.decayMs,
      sustainLevel: envelope.sustainLevel,
      releaseMs: envelope.releaseMs,
      shape: envelope.shape,
      decayCurve: envelope.decayCurve,
      peakAmplitude: envelope.peakAmplitude,
    },
    pitch,
    spectrum: cleanSpectrum,
    harmonics,
    tonality,
    evolution,
    filter,
    classification,
    vocabularyMatch,
    synthesisSuggestion,
  });
} catch (err) {
  console.error(`Error analyzing audio: ${err.message}`);
  process.exit(1);
}
