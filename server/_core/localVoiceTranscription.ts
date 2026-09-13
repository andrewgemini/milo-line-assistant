import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import type { TranscriptionResponse } from "./voiceTranscription";

const DEFAULT_MODEL = "onnx-community/whisper-tiny";
const DEFAULT_DTYPE = "q8";
let transcriberPromise: Promise<any> | undefined;

function cacheDirPath() {
  return path.resolve(process.env.MILO_LOCAL_STT_CACHE_DIR || path.join(process.cwd(), "models", "transformers-cache"));
}

function modelName() {
  return (process.env.MILO_LOCAL_STT_MODEL || DEFAULT_MODEL).trim();
}

function bundledModelReady(cacheDir = cacheDirPath(), model = modelName()) {
  const modelRoot = path.join(cacheDir, ...model.split("/"));
  return [
    "config.json",
    "tokenizer.json",
    path.join("onnx", "encoder_model_quantized.onnx"),
    path.join("onnx", "decoder_model_merged_quantized.onnx"),
  ].every(file => fs.existsSync(path.join(modelRoot, file)));
}

function enabledFlag() {
  const raw = (process.env.MILO_LOCAL_STT_ENABLED || "").trim();
  if (raw) return /^(1|true|yes|on)$/i.test(raw);
  return bundledModelReady();
}

export function localVoiceRuntimeStatus() {
  const cacheDir = cacheDirPath();
  const model = modelName();
  const bundled = bundledModelReady(cacheDir, model);
  return {
    enabled: enabledFlag(),
    bundled,
    model,
    dtype: (process.env.MILO_LOCAL_STT_DTYPE || DEFAULT_DTYPE).trim(),
    cacheDir,
    ffmpegAvailable: typeof ffmpegPath === "string" && ffmpegPath.length > 0 && fs.existsSync(ffmpegPath),
  } as const;
}

async function decodeToFloat32Mono16k(audioBuffer: Buffer): Promise<Float32Array> {
  const executable = typeof ffmpegPath === "string" ? ffmpegPath : "";
  if (!executable || !fs.existsSync(executable)) throw new Error("ffmpeg-static binary is unavailable");
  const args = [
    "-hide_banner",
    "-loglevel", "error",
    "-i", "pipe:0",
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-f", "f32le",
    "-acodec", "pcm_f32le",
    "pipe:1",
  ];

  return await new Promise<Float32Array>((resolve, reject) => {
    const child = spawn(executable, args);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
    child.once("error", reject);
    child.once("close", (code: number | null) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg decode failed (${code}): ${Buffer.concat(stderr).toString("utf8").slice(0, 1000)}`));
        return;
      }
      const pcm = Buffer.concat(stdout);
      if (!pcm.length || pcm.length % 4 !== 0) {
        reject(new Error("ffmpeg returned empty or invalid PCM audio"));
        return;
      }
      const copied = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);
      resolve(new Float32Array(copied));
    });
    child.stdin.end(audioBuffer);
  });
}

async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      const status = localVoiceRuntimeStatus();
      env.cacheDir = status.cacheDir;
      env.allowLocalModels = true;
      // Vercel's deployment filesystem is read-only. When the ONNX model is
      // bundled, keep inference fully local and never try to mutate the cache.
      env.allowRemoteModels = !status.bundled;
      console.info("[Milo Voice Local] loading model", {
        model: status.model,
        dtype: status.dtype,
        cacheDir: status.cacheDir,
        bundled: status.bundled,
      });
      return await pipeline("automatic-speech-recognition", status.model, {
        dtype: status.dtype as any,
      } as any);
    })().catch(error => {
      transcriberPromise = undefined;
      throw error;
    });
  }
  return transcriberPromise;
}

export async function transcribeAudioLocal(input: {
  audioBuffer: Buffer | Uint8Array;
  language?: string;
}): Promise<TranscriptionResponse> {
  const status = localVoiceRuntimeStatus();
  if (!status.enabled) throw new Error("Local STT is disabled");
  if (!status.ffmpegAvailable) throw new Error("Local STT requires ffmpeg-static");

  const started = Date.now();
  const samples = await decodeToFloat32Mono16k(Buffer.from(input.audioBuffer));
  console.info("[Milo Voice Local] decoded audio", {
    samples: samples.length,
    seconds: Number((samples.length / 16000).toFixed(2)),
    decodeMs: Date.now() - started,
  });

  const transcriber = await getTranscriber();
  const language = (input.language || "th").trim();
  const result = await transcriber(samples, {
    language,
    task: "transcribe",
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  } as any);

  const text = String(result?.text || "").trim();
  if (!text) throw new Error("Local Whisper returned empty text");
  const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
  const segments = chunks.map((chunk: any, index: number) => ({
    id: index,
    seek: 0,
    start: Number(chunk?.timestamp?.[0] || 0),
    end: Number(chunk?.timestamp?.[1] || 0),
    text: String(chunk?.text || "").trim(),
    tokens: [],
    temperature: 0,
    avg_logprob: 0,
    compression_ratio: 0,
    no_speech_prob: 0,
  }));

  return {
    task: "transcribe",
    language,
    duration: samples.length / 16000,
    text,
    segments,
  };
}

export function resetLocalVoiceModelForTests() {
  transcriberPromise = undefined;
}
