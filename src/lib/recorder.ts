"use client";

/**
 * Voice recorder that captures raw PCM via Web Audio. On stop it hands the raw
 * samples to the audio pipeline (src/lib/audio.ts) which trims silence,
 * time-compresses ~2x with pitch preserved, and encodes a clean mono 16 kHz
 * WAV — a format Gemini officially supports on every platform.
 * Exposes a smoothed level + rolling waveform history for the live UI.
 */
import { processToWavs } from "./audio";

export type RecorderState = "idle" | "recording" | "stopping";

const WAVE_BARS = 48;

export class WavRecorder {
  state: RecorderState = "idle";
  level = 0; // 0..1 smoothed RMS
  elapsedSec = 0;
  wave: number[] = new Array(WAVE_BARS).fill(0); // rolling bar heights 0..1
  onTick: (() => void) | null = null;

  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private chunks: Float32Array[] = [];
  private sampleRate = 48000;
  private startedAt = 0;
  private raf: number | null = null;

  async start(): Promise<void> {
    if (this.state !== "idle") throw new Error("Recorder busy");
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    this.ctx = new AudioContext();
    await this.ctx.resume(); // iOS: must resume inside the user gesture
    this.sampleRate = this.ctx.sampleRate;
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.chunks = [];

    let workletOk = false;
    try {
      const moduleSrc = `
        class PcmTap extends AudioWorkletProcessor {
          process(inputs) {
            const ch = inputs[0] && inputs[0][0];
            if (ch && ch.length) this.port.postMessage(ch.slice(0));
            return true;
          }
        }
        registerProcessor('pcm-tap', PcmTap);
      `;
      const url = URL.createObjectURL(new Blob([moduleSrc], { type: "application/javascript" }));
      await this.ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(this.ctx, "pcm-tap", { numberOfOutputs: 0 });
      node.port.onmessage = (e) => this.ingest(e.data as Float32Array);
      this.source.connect(node);
      this.node = node;
      workletOk = true;
    } catch {
      /* fall through to ScriptProcessor */
    }

    if (!workletOk) {
      const sp = this.ctx.createScriptProcessor(4096, 1, 1);
      sp.onaudioprocess = (e) => this.ingest(new Float32Array(e.inputBuffer.getChannelData(0)));
      this.source.connect(sp);
      sp.connect(this.ctx.destination); // required for Safari to fire events
      this.node = sp;
    }

    this.startedAt = performance.now();
    this.state = "recording";
    const tick = () => {
      this.elapsedSec = (performance.now() - this.startedAt) / 1000;
      this.onTick?.();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private ingest(samples: Float32Array) {
    if (this.state !== "recording") return;
    this.chunks.push(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);
    this.level = this.level * 0.7 + Math.min(1, rms * 3.5) * 0.3;
    this.wave.push(this.level);
    if (this.wave.length > WAVE_BARS) this.wave.shift();
  }

  /** Stop and return a mono 16kHz WAV blob. */
  /**
   * Returns { blobs, durationSec }. durationSec is the real speaking time.
   * blobs are conditioned for transcription (mono 16 kHz, silence trimmed,
   * ~2x time-compressed, pitch preserved) and auto-chunked so each stays under
   * the upload limit — usually one blob, more for long recordings.
   */
  async stop(): Promise<{ blobs: Blob[]; durationSec: number }> {
    if (this.state !== "recording") throw new Error("Not recording");
    this.state = "stopping";
    await new Promise((r) => setTimeout(r, 120)); // let the last buffers flush
    const durationSec = Math.round((performance.now() - this.startedAt) / 100) / 10;

    const total = this.chunks.reduce((s, c) => s + c.length, 0);
    if (total === 0) {
      this.cleanup();
      throw new Error("No audio was captured — check the microphone permission and try again.");
    }
    const pcm = new Float32Array(total);
    let off = 0;
    for (const c of this.chunks) {
      pcm.set(c, off);
      off += c.length;
    }
    const { blobs } = processToWavs(pcm, this.sampleRate);
    this.cleanup();
    return { blobs, durationSec };
  }

  cancel(): void {
    this.cleanup();
  }

  private cleanup(): void {
    if (this.raf != null) cancelAnimationFrame(this.raf);
    this.raf = null;
    try {
      if (this.node && "port" in this.node) (this.node as AudioWorkletNode).port.onmessage = null;
      this.node?.disconnect();
      this.source?.disconnect();
    } catch {}
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.stream = null;
    this.ctx = null;
    this.node = null;
    this.source = null;
    this.chunks = [];
    this.level = 0;
    this.elapsedSec = 0;
    this.wave = new Array(WAVE_BARS).fill(0);
    this.state = "idle";
  }
}
