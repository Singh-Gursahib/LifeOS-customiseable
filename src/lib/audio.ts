"use client";

/**
 * Client-side audio conditioning for transcription. Before an audio clip is
 * sent to Gemini we:
 *   1. get it to mono 16 kHz Float32 PCM,
 *   2. trim dead air (leading/trailing + collapse long internal pauses),
 *   3. time-compress it ~2x while preserving pitch (WSOLA),
 *   4. encode a clean 16-bit WAV.
 * Result: far fewer bytes and far less audio-seconds for the model to chew on,
 * so transcription is faster and cheaper — and the output is always a known-good
 * WAV regardless of what the device's recorder produced.
 *
 * All functions here are pure DSP on Float32Array except decodeToPcm (Web Audio).
 */

export const TARGET_RATE = 16000;
export const DEFAULT_SPEED = 2; // time-compression factor; pitch preserved

export interface ProcessStats {
  inSec: number;
  outSec: number;
  outBytes: number;
  speed: number;
}

/** Decode any browser-supported audio file to mono Float32 PCM at its native rate. */
export async function decodeToPcm(file: Blob): Promise<{ pcm: Float32Array; rate: number }> {
  const buf = await file.arrayBuffer();
  const Ctx: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buf);
    return { pcm: downmix(audio), rate: audio.sampleRate };
  } finally {
    ctx.close().catch(() => {});
  }
}

function downmix(audio: AudioBuffer): Float32Array {
  const n = audio.length;
  const out = new Float32Array(n);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const ch = audio.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += ch[i];
  }
  const g = 1 / Math.max(1, audio.numberOfChannels);
  for (let i = 0; i < n; i++) out[i] *= g;
  return out;
}

/** Average-decimation resampler (fine for speech → 16 kHz). */
export function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let s = 0;
    for (let j = start; j < end; j++) s += input[j];
    out[i] = end > start ? s / (end - start) : 0;
  }
  return out;
}

/**
 * Remove dead air. Speech frames are kept (with a little padding so word edges
 * aren't clipped); silence longer than maxGap is collapsed to a short natural
 * pause; leading/trailing silence is dropped entirely.
 */
export function trimSilence(
  pcm: Float32Array,
  rate: number,
  opts: { frameMs?: number; padMs?: number; keepPauseMs?: number; threshRatio?: number; floor?: number } = {}
): Float32Array {
  const frame = Math.max(1, Math.floor((rate * (opts.frameMs ?? 20)) / 1000));
  const padFrames = Math.ceil(((opts.padMs ?? 80) / 1000) * rate / frame);
  const keepPause = Math.floor(((opts.keepPauseMs ?? 140) / 1000) * rate);
  const threshRatio = opts.threshRatio ?? 0.06;
  const floor = opts.floor ?? 0.006;

  const nFrames = Math.floor(pcm.length / frame);
  if (nFrames < 4) return pcm;

  const energy = new Float32Array(nFrames);
  let peak = 1e-6;
  for (let i = 0; i < nFrames; i++) {
    let s = 0;
    const base = i * frame;
    for (let j = 0; j < frame; j++) {
      const v = pcm[base + j];
      s += v * v;
    }
    const e = Math.sqrt(s / frame);
    energy[i] = e;
    if (e > peak) peak = e;
  }
  const thresh = Math.max(floor, peak * threshRatio);

  // mark keep-frames (speech ± padding)
  const keep = new Uint8Array(nFrames);
  for (let i = 0; i < nFrames; i++) {
    if (energy[i] >= thresh) {
      for (let k = -padFrames; k <= padFrames; k++) {
        const idx = i + k;
        if (idx >= 0 && idx < nFrames) keep[idx] = 1;
      }
    }
  }

  // build output: concatenate kept runs; between them insert a short pause
  const chunks: Float32Array[] = [];
  const pause = new Float32Array(keepPause); // silence
  let i = 0;
  let sawSpeech = false;
  while (i < nFrames) {
    if (keep[i]) {
      let j = i;
      while (j < nFrames && keep[j]) j++;
      if (sawSpeech) chunks.push(pause);
      chunks.push(pcm.subarray(i * frame, Math.min(j * frame, pcm.length)));
      sawSpeech = true;
      i = j;
    } else {
      i++;
    }
  }
  if (!chunks.length) return pcm; // all silence? keep original, let the model decide
  return concat(chunks);
}

/**
 * WSOLA time-compression with pitch preservation. For factor 2 the output is
 * ~half the duration but voices keep their natural pitch (unlike naive
 * resampling, which chipmunks them). Overlap-add of windowed grains, with a
 * small similarity search so overlaps stay phase-coherent.
 */
export function speedUp(pcm: Float32Array, rate: number, factor: number): Float32Array {
  if (factor <= 1.01 || pcm.length < rate * 0.25) return pcm;
  const W = Math.floor(rate * 0.03); // 30 ms grain
  const Hs = Math.floor(W / 2); // synthesis hop (50% overlap)
  const Ha = Math.floor(Hs * factor); // analysis hop
  const delta = Math.floor(rate * 0.01); // ±10 ms search
  const win = hann(W);

  const outLen = Math.ceil(pcm.length / factor) + W;
  const out = new Float32Array(outLen);
  const norm = new Float32Array(outLen);

  let sPos = 0;
  let expected = 0; // input index of the "natural continuation" of the last grain
  let target = 0; // ideal analysis position
  let lastEnd = 0;

  while (target + W < pcm.length && sPos + W < outLen) {
    // find grain near `target` whose head best matches the expected continuation
    let best = 0;
    if (expected > 0) {
      let bestCorr = -Infinity;
      for (let d = -delta; d <= delta; d++) {
        const p = target + d;
        if (p < 0 || p + W >= pcm.length || expected + W >= pcm.length) continue;
        let corr = 0;
        for (let j = 0; j < W; j += 4) corr += pcm[p + j] * pcm[expected + j];
        if (corr > bestCorr) {
          bestCorr = corr;
          best = d;
        }
      }
    }
    const g = Math.max(0, target + best);
    for (let j = 0; j < W; j++) {
      if (g + j < pcm.length && sPos + j < outLen) {
        out[sPos + j] += pcm[g + j] * win[j];
        norm[sPos + j] += win[j];
      }
    }
    lastEnd = sPos + W;
    expected = g + Hs;
    sPos += Hs;
    target += Ha;
  }

  for (let i = 0; i < lastEnd; i++) if (norm[i] > 1e-6) out[i] /= norm[i];
  return out.subarray(0, lastEnd);
}

// A processed chunk stays under the platform's 4.5 MB request cap. 16 kHz mono
// 16-bit = 32 KB/s, so 120 s ≈ 3.84 MB — comfortably below 4.4 MB.
export const MAX_CHUNK_SEC = 120;

/** Condition raw PCM → processed mono/16k samples (resample → trim silence → 2x). */
export function conditionPcm(pcm: Float32Array, rate: number, speed = DEFAULT_SPEED): Float32Array {
  const mono16 = resample(pcm, rate, TARGET_RATE);
  try {
    const processed = speedUp(trimSilence(mono16, TARGET_RATE), TARGET_RATE, speed);
    return processed.length ? processed : mono16;
  } catch {
    return mono16; // never let conditioning break capture
  }
}

/** Split processed PCM into ≤maxSec chunks, cutting at the quietest point near each boundary. */
export function chunkPcm(pcm: Float32Array, maxSec = MAX_CHUNK_SEC): Float32Array[] {
  const maxLen = Math.floor(maxSec * TARGET_RATE);
  if (pcm.length <= maxLen) return [pcm];
  const chunks: Float32Array[] = [];
  let start = 0;
  while (start < pcm.length) {
    let end = Math.min(start + maxLen, pcm.length);
    if (end < pcm.length) end = quietestCut(pcm, end, Math.floor(TARGET_RATE * 4)); // search back up to 4s
    if (end <= start) end = Math.min(start + maxLen, pcm.length); // safety
    chunks.push(pcm.subarray(start, end));
    start = end;
  }
  return chunks;
}

/** Within [target-window, target], return the sample index of the lowest-energy 20ms frame. */
function quietestCut(pcm: Float32Array, target: number, window: number): number {
  const frame = Math.floor(TARGET_RATE * 0.02);
  const from = Math.max(0, target - window);
  let best = target;
  let bestE = Infinity;
  for (let i = from; i + frame < target; i += frame) {
    let s = 0;
    for (let j = 0; j < frame; j++) s += pcm[i + j] * pcm[i + j];
    if (s < bestE) {
      bestE = s;
      best = i + (frame >> 1);
    }
  }
  return best;
}

/**
 * Full pipeline → one or more 16-bit WAV blobs, each under the upload limit.
 * Short clips return a single blob; long ones are auto-chunked at quiet points.
 */
export function processToWavs(
  pcm: Float32Array,
  rate: number,
  opts: { speed?: number } = {}
): { blobs: Blob[]; stats: ProcessStats } {
  const inSec = resampleLen(pcm.length, rate, TARGET_RATE) / TARGET_RATE;
  const processed = conditionPcm(pcm, rate, opts.speed ?? DEFAULT_SPEED);
  const pieces = chunkPcm(processed);
  const blobs = pieces.map((p) => encodeWav(p, TARGET_RATE));
  return {
    blobs,
    stats: { inSec, outSec: processed.length / TARGET_RATE, outBytes: blobs.reduce((s, b) => s + b.size, 0), speed: opts.speed ?? DEFAULT_SPEED },
  };
}

function resampleLen(len: number, from: number, to: number): number {
  return from === to ? len : Math.floor(len / (from / to));
}

/** Back-compat single-blob helper (first chunk only). */
export function processForTranscription(
  pcm: Float32Array,
  rate: number,
  opts: { speed?: number } = {}
): { blob: Blob; stats: ProcessStats } {
  const { blobs, stats } = processToWavs(pcm, rate, opts);
  return { blob: blobs[0], stats };
}

export function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

function concat(chunks: Float32Array[]): Float32Array {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Float32Array(len);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
