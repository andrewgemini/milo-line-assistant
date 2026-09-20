import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, ''); }
function write(path, text) { fs.writeFileSync(path, text.replace(/\r\n/g, '\n').replace(/\s+$/,'') + '\n', 'utf8'); }
function mustReplace(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`missing marker: ${label}`);
  return text.replace(before, after);
}

// 1) Voice: prefer remote provider in production, validate every transcript,
// and keep local Whisper as a final fallback instead of accepting hallucinations.
{
  const p = 'server/_core/voiceTranscription.ts';
  let s = read(p);
  s = mustReplace(
    s,
    'import { localVoiceRuntimeStatus, transcribeAudioLocal } from "./localVoiceTranscription";',
    'import { localVoiceRuntimeStatus, transcriptQualityIssue, transcribeAudioLocal } from "./localVoiceTranscription";',
    'voice import',
  );

  s = s.replace(/export function voiceTranscriptionRuntimeStatus\(requestToken\?: string\) \{[\s\S]*?\n\}\r?\n\r?\nfunction getFileExtension/, `export function voiceTranscriptionRuntimeStatus(requestToken?: string) {
  const forge = Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
  const openai = Boolean((process.env.OPENAI_API_KEY || "").trim());
  const gatewayAvailable = gatewayAuthAvailable(process.env, requestToken);
  const local = localVoiceRuntimeStatus();
  return {
    configured: local.enabled || forge || openai || gatewayAvailable,
    mode: gatewayAvailable
      ? (local.enabled ? "vercel-ai-gateway-stt+local-fallback" : "vercel-ai-gateway-stt")
      : forge
        ? (local.enabled ? "forge-whisper+local-fallback" : "forge-whisper")
        : openai
          ? (local.enabled ? "openai-whisper+local-fallback" : "openai-whisper")
          : local.enabled
            ? "local-whisper-onnx"
            : "unconfigured",
    local,
  } as const;
}

function getFileExtension`);

  s = mustReplace(
    s,
    '  return whisperResponse;\n}\n\nasync function transcribeWithGateway(',
    `  const issue = transcriptQualityIssue(whisperResponse.text, whisperResponse.duration || 0);
  if (issue) {
    return {
      error: "Low-quality transcription response",
      code: "TRANSCRIPTION_FAILED",
      details: \`${'${provider}'} rejected transcript: ${'${issue}'}\`,
    };
  }
  return whisperResponse;
}

async function transcribeWithGateway(`,
    'provider quality gate',
  );

  s = mustReplace(
    s,
    '  return {\n    task: "transcribe",\n    language: result.language || options.language || "th",\n    duration: result.durationInSeconds || 0,\n    text: result.text,\n    segments: (result.segments ?? []).map((segment, index) => ({',
    `  const response: TranscriptionResponse = {
    task: "transcribe",
    language: result.language || options.language || "th",
    duration: result.durationInSeconds || 0,
    text: result.text,
    segments: (result.segments ?? []).map((segment, index) => ({`,
    'gateway response start',
  );
  s = mustReplace(
    s,
    '    })),\n  };\n}\n\nexport async function transcribeAudio',
    `    })),
  };
  const issue = transcriptQualityIssue(response.text, response.duration || 0);
  if (issue) throw new Error(\`AI Gateway rejected low-quality transcript: ${'${issue}'}\`);
  return response;
}

export async function transcribeAudio`,
    'gateway response end',
  );

  const fnStart = s.indexOf('export async function transcribeAudio(options: TranscribeOptions)');
  if (fnStart < 0) throw new Error('missing transcribeAudio');
  s = s.slice(0, fnStart) + `export async function transcribeAudio(options: TranscribeOptions): Promise<TranscriptionResponse | TranscriptionError> {
  try {
    const forgeConfigured = Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
    const openAIKey = (process.env.OPENAI_API_KEY || "").trim();
    const gatewayConfigured = gatewayAuthAvailable(process.env, options.gatewayToken);
    const localConfigured = localVoiceRuntimeStatus().enabled;

    if (!localConfigured && !forgeConfigured && !openAIKey && !gatewayConfigured) {
      return {
        error: "Voice transcription service is not configured",
        code: "SERVICE_ERROR",
        details: "Enable local STT or use Vercel AI Gateway/OIDC, AI_GATEWAY_API_KEY, Forge credentials, or OPENAI_API_KEY",
      };
    }

    let audioBuffer: Buffer;
    let mimeType: string;
    if (options.audioBuffer) {
      audioBuffer = Buffer.from(options.audioBuffer);
      mimeType = options.mimeType || "audio/m4a";
    } else if (options.audioUrl) {
      try {
        const response = await fetchWithTimeout(options.audioUrl, {}, 45_000);
        if (!response.ok) {
          return { error: "Failed to download audio file", code: "INVALID_FORMAT", details: \`HTTP ${'${response.status}'}: ${'${response.statusText}'}\` };
        }
        audioBuffer = Buffer.from(await response.arrayBuffer());
        mimeType = response.headers.get("content-type") || options.mimeType || "audio/mpeg";
      } catch (error) {
        return { error: "Failed to fetch audio file", code: "SERVICE_ERROR", details: error instanceof Error ? error.message : "Unknown error" };
      }
    } else {
      return { error: "Audio input is missing", code: "INVALID_FORMAT", details: "Provide audioBuffer or audioUrl" };
    }

    const sizeMB = audioBuffer.length / (1024 * 1024);
    if (sizeMB > 16) {
      return { error: "Audio file exceeds maximum size limit", code: "FILE_TOO_LARGE", details: \`File size is ${'${sizeMB.toFixed(2)}'}MB, maximum allowed is 16MB\` };
    }

    const failures: string[] = [];

    // Production first: the remote provider is materially more accurate for short Thai clips.
    // Local Whisper stays as an offline fallback and is protected by the same quality gate.
    if (gatewayConfigured) {
      try {
        const result = await transcribeWithGateway(audioBuffer, options);
        console.info("[Milo Voice] transcription provider", { provider: "vercel-ai-gateway", chars: result.text.length });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI Gateway transcription failed";
        failures.push(\`gateway: ${'${message}'}\`);
        console.warn("[Milo Voice] AI Gateway transcription failed; trying fallback", { error: message });
      }
    }

    if (forgeConfigured) {
      const baseUrl = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : \`${'${ENV.forgeApiUrl}'}/\`;
      const fullUrl = new URL("v1/audio/transcriptions", baseUrl).toString();
      try {
        const response = await callTranscriptionProvider(fullUrl, ENV.forgeApiKey, audioBuffer, mimeType, options);
        const parsed = await parseProviderResponse(response, "forge");
        if (!("error" in parsed)) {
          console.info("[Milo Voice] transcription provider", { provider: "forge", chars: parsed.text.length });
          return parsed;
        }
        failures.push(\`forge: ${'${parsed.details || parsed.error}'}\`);
      } catch (error) {
        failures.push(\`forge: ${'${error instanceof Error ? error.message : "failed"}'}\`);
      }
    }

    if (openAIKey) {
      try {
        const response = await callTranscriptionProvider("https://api.openai.com/v1/audio/transcriptions", openAIKey, audioBuffer, mimeType, options);
        const parsed = await parseProviderResponse(response, "openai");
        if (!("error" in parsed)) {
          console.info("[Milo Voice] transcription provider", { provider: "openai", chars: parsed.text.length });
          return parsed;
        }
        failures.push(\`openai: ${'${parsed.details || parsed.error}'}\`);
      } catch (error) {
        failures.push(\`openai: ${'${error instanceof Error ? error.message : "failed"}'}\`);
      }
    }

    if (localConfigured) {
      try {
        const result = await transcribeAudioLocal({ audioBuffer, language: options.language || "th" });
        const issue = transcriptQualityIssue(result.text, result.duration || 0);
        if (issue) throw new Error(\`Local Whisper rejected low-quality transcript: ${'${issue}'}\`);
        console.info("[Milo Voice] transcription provider", { provider: "local-whisper-onnx", chars: result.text.length });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Local Whisper failed";
        failures.push(\`local: ${'${message}'}\`);
        console.warn("[Milo Voice] Local transcription failed", { error: message });
      }
    }

    return {
      error: "Transcription service request failed",
      code: "TRANSCRIPTION_FAILED",
      details: failures.join(" | ").slice(0, 1800) || "No transcription provider returned a usable transcript",
    };
  } catch (error) {
    return {
      error: "Voice transcription failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}
`;
  write(p, s);
}

// 2) Local decoder: make tiny Whisper less repetition-prone before the quality gate.
{
  const p = 'server/_core/localVoiceTranscription.ts';
  let s = read(p);
  s = mustReplace(
    s,
    '    stride_length_s: 5,\n  } as any);',
    '    stride_length_s: 5,\n    condition_on_prev_tokens: false,\n    temperature: 0,\n    repetition_penalty: 1.15,\n    no_repeat_ngram_size: 3,\n  } as any);',
    'local decoding controls',
  );
  write(p, s);
}

// 3) OCR: upscale compressed LINE images and accept amounts even when OCR splits labels and values.
{
  const p = 'server/milo/ocrImageAnalysis.ts';
  let s = read(p);
  const amountStart = s.indexOf('function extractAmount(text: string) {');
  const amountEnd = s.indexOf('\nfunction normalizeYear', amountStart);
  if (amountStart < 0 || amountEnd < 0) throw new Error('missing extractAmount');
  s = s.slice(0, amountStart) + `function extractAmount(text: string) {
  const lines = text.split(/\\n+/).map(line => line.trim()).filter(Boolean);
  const flat = text.replace(/\\s+/g, " ");
  const preferred = /(จำนวน(?:เงิน)?|ยอด(?:โอน|ชำระ|สุทธิ|รวม)|amount|total)/i;
  const fee = /(ค่าธรรมเนียม|fee)/i;
  const currency = /(บาท|thb|฿)/i;
  const amountToken = '([0-9]{1,3}(?:,[0-9]{3})*(?:\\.\\d{1,2})|[0-9]+(?:\\.\\d{1,2})?)';
  const candidates: Array<{ amount: number; score: number }> = [];
  const push = (raw: string, score: number) => {
    const amount = parseMoney(raw);
    if (amount <= 0 || amount > 100_000_000) return;
    candidates.push({ amount, score });
  };

  // OCR often inserts a newline between "จำนวน" and "140.00 บาท" on Thai slips.
  const keyed = new RegExp('(?:จำนวน(?:เงิน)?|ยอด(?:โอน|ชำระ|สุทธิ|รวม)|amount|total)\\\\s*[:：=-]?\\\\s*(?:฿|THB)?\\\\s*' + amountToken, 'ig');
  let keyedMatch: RegExpExecArray | null;
  while ((keyedMatch = keyed.exec(flat)) !== null) push(keyedMatch[1], 20);

  const baht = new RegExp(amountToken + '\\\\s*(?:บาท|THB|฿)', 'ig');
  let bahtMatch: RegExpExecArray | null;
  while ((bahtMatch = baht.exec(flat)) !== null) {
    const context = flat.slice(Math.max(0, bahtMatch.index - 35), Math.min(flat.length, baht.lastIndex + 20));
    if (!fee.test(context)) push(bahtMatch[1], preferred.test(context) ? 16 : 8);
  }

  const numberRe = /(?:฿|THB)?\\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\\.\\d{1,2})|[0-9]+(?:\\.\\d{1,2})?)\\s*(?:บาท|THB|฿)?/ig;
  for (const line of lines) {
    if (fee.test(line)) continue;
    const contextScore = preferred.test(line) ? 12 : currency.test(line) ? 5 : 0;
    if (!contextScore) continue;
    numberRe.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = numberRe.exec(line)) !== null) {
      push(match[1], contextScore + (currency.test(line) ? 2 : 0));
      if (match.index === numberRe.lastIndex) numberRe.lastIndex += 1;
    }
  }
  candidates.sort((a, b) => b.score - a.score || b.amount - a.amount);
  return candidates.length ? candidates[0].amount : 0;
}
` + s.slice(amountEnd + 1);

  s = s.replace(/export async function analyzeImageWithOcr\(dataUrl: string\): Promise<ImageAnalysis> \{[\s\S]*?\n\}\s*$/m, `export async function analyzeImageWithOcr(dataUrl: string): Promise<ImageAnalysis> {
  if (!ocrAssetsReady()) throw new Error(\`OCR language data is unavailable at ${'${DATA_DIR}'}\`);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const input = decodeDataUrl(dataUrl);

  // LINE compresses images aggressively. Upscale small slips before OCR instead of
  // preserving their tiny source resolution, then try complementary contrast passes.
  const base = sharp(input)
    .rotate()
    .resize({ width: 2000, fit: "inside", withoutEnlargement: false, kernel: sharp.kernel.lanczos3 })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.1 });
  const prepared = await base.clone().png().toBuffer();
  const mediumContrast = await base.clone().linear(1.22, -18).png().toBuffer();
  const highContrast = await base.clone().threshold(175).png().toBuffer();

  const worker = await createWorker(["tha", "eng"], undefined, {
    langPath: DATA_DIR,
    cachePath: CACHE_DIR,
    gzip: true,
    logger: () => undefined,
  });
  try {
    await worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: "6" } as any);
    const texts: string[] = [];
    const run = async (buffer: Buffer, label: string) => {
      const result = await worker.recognize(buffer);
      const text = result.data.text || "";
      texts.push(text);
      const analysis = analyzeOcrText(texts.join("\\n"));
      console.info("[Milo OCR] pass", {
        label,
        chars: text.length,
        confidence: analysis.confidence,
        documentType: analysis.proposals[0]?.documentType,
        amount: analysis.proposals[0]?.amount,
        dateText: analysis.proposals[0]?.dateText,
      });
      return analysis;
    };

    let best = await run(prepared, "normalized-upscaled");
    const p1 = best.proposals[0];
    if (p1?.kind === "expense" && p1.amount > 0 && p1.dateText && p1.documentType !== "unknown") return best;

    const second = await run(mediumContrast, "medium-contrast");
    if (second.confidence >= best.confidence || (second.proposals[0]?.amount ?? 0) > 0) best = second;
    const p2 = best.proposals[0];
    if (p2?.kind === "expense" && p2.amount > 0 && p2.dateText && p2.documentType !== "unknown") return best;

    const third = await run(highContrast, "threshold-175");
    if (third.confidence >= best.confidence || (third.proposals[0]?.amount ?? 0) > 0) best = third;
    return best;
  } finally {
    await worker.terminate();
  }
}
`);
  write(p, s);
}

// 4) Greeting: use a dedicated image asset, not the old overview artwork.
{
  const p = 'server/milo/line.ts';
  let s = read(p);
  const start = s.indexOf('export async function replyGreetingHome(');
  const end = s.indexOf('\nexport type VoiceTransactionProposal', start);
  if (start < 0 || end < 0) throw new Error('missing replyGreetingHome');
  const replacement = `export async function replyGreetingHome(replyToken: string, credentials = lineCredentials()) {
  const base = process.env.MILO_PUBLIC_URL || "https://milo-line-assistant.onrender.com";
  const imageUrl = new URL("/richmenu/greeting-home.jpg", base).href;
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl }],
    }),
  });
}
`;
  s = s.slice(0, start) + replacement + s.slice(end);
  write(p, s);
}

// 5) Release marker for deployment verification.
{
  const p = 'server/api.ts';
  let s = read(p);
  s = s.replace(/media-v4-quality-fallback-2026-09-14/g, 'media-v5-remote-stt-upscaled-ocr-2026-09-14');
  write(p, s);
}

console.log('patched media v5 + greeting route');
