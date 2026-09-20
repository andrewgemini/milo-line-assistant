import fs from 'node:fs';
function rw(p, fn) {
  let s = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
  s = fn(s);
  fs.writeFileSync(p, s.replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n', 'utf8');
}
rw('server/_core/localVoiceTranscription.ts', s => {
  const before = '    stride_length_s: 5,\n  } as any);';
  const after = '    stride_length_s: 5,\n    condition_on_prev_tokens: false,\n    temperature: 0,\n    repetition_penalty: 1.15,\n    no_repeat_ngram_size: 3,\n  } as any);';
  if (!s.includes(before)) throw new Error('local voice marker missing');
  return s.replace(before, after);
});
rw('server/api.ts', s => s.replace(/media-v4-quality-fallback-2026-09-14/g, 'media-v5-remote-stt-upscaled-ocr-2026-09-14'));
rw('server/milo/line.ts', s => {
  const a = s.indexOf('export async function replyGreetingHome(');
  const b = s.indexOf('\nexport type VoiceTransactionProposal', a);
  if (a < 0 || b < 0) throw new Error('greeting markers missing');
  const r = `export async function replyGreetingHome(replyToken: string, credentials = lineCredentials()) {
  const base = process.env.MILO_PUBLIC_URL || "https://milo-line-assistant.onrender.com";
  const imageUrl = new URL("/richmenu/greeting-home.jpg", base).href;
  return callLine("/v2/bot/message/reply", credentials, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ replyToken, messages: [{ type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl }] }),
  });
}
`;
  return s.slice(0, a) + r + s.slice(b);
});
console.log('patched local voice, release, greeting');
