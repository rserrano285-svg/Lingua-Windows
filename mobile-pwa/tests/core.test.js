import test from "node:test";
import assert from "node:assert/strict";
import {
  formatSrtTime,
  makeAss,
  makeSrt,
  validateVideo,
  MAX_FILE_BYTES,
  whisperLanguageCode,
} from "../src/core.js";
import { detectWhisperLanguage } from "../src/whisper.js";

test("enforces the 2 GB target and the smaller Safari pilot limit", () => {
  assert.match(validateVideo({ name: "clip.mp4", size: MAX_FILE_BYTES + 1 }, 10), /2 GB/);
  assert.match(validateVideo({ name: "clip.mp4", size: 101 * 1024 * 1024 }, 10), /100 MB/);
  assert.equal(validateVideo({ name: "clip.mp4", size: 1_000_000 }, 480), "");
  assert.match(validateVideo({ name: "clip.mp4", size: 1_000_000 }, 481), /8 minutos/);
});

test("accepts a short MP4 or MOV and rejects unsupported files", () => {
  assert.equal(validateVideo({ name: "clip.MOV", size: 10 }, 10), "");
  assert.equal(validateVideo({ name: "clip.avi", size: 10 }, 10), "La prueba acepta videos MP4 y MOV.");
});

test("reads supported Whisper language tokens for automatic audio language selection", () => {
  assert.equal(whisperLanguageCode("<|es|>"), "es");
  assert.equal(whisperLanguageCode("<|en|>"), "en");
  assert.equal(whisperLanguageCode("<|fr|>"), "fr");
  assert.equal(whisperLanguageCode("<|notimestamps|>"), null);
});

test("detects the initial Whisper language token and restores the model prompt", async () => {
  const originalRetrieveTokens = () => [99];
  const sample = new Float32Array(16000 * 40);
  let receivedSamples = 0;
  const asr = {
    processor: async (audio) => {
      receivedSamples = audio.length;
      return { input_features: "audio-features" };
    },
    model: {
      _retrieve_init_tokens: originalRetrieveTokens,
      async generate({ inputs, max_new_tokens }) {
        assert.equal(inputs, "audio-features");
        assert.equal(max_new_tokens, 1);
        assert.deepEqual(this._retrieve_init_tokens({ decoder_start_token_id: 7 }), [7]);
        return [{ tolist: () => [7, 42] }];
      },
    },
    tokenizer: {
      model: {
        convert_ids_to_tokens: ([tokenId]) => [tokenId === 42 ? "<|es|>" : "<|en|>"],
      },
    },
  };

  assert.equal(await detectWhisperLanguage(asr, sample), "es");
  assert.equal(receivedSamples, 16000 * 30);
  assert.equal(asr.model._retrieve_init_tokens, originalRetrieveTokens);
});

test("formats subtitle timestamps and creates editable subtitle outputs", () => {
  const segments = [{ start: 1.234, end: 2.5, text: "Hola\nmundo" }];
  assert.equal(formatSrtTime(1.234), "00:00:01,234");
  assert.match(makeSrt(segments), /00:00:01,234 --> 00:00:02,500/);
  assert.match(makeAss(segments, 1920, 1080), /PlayResX: 1920/);
  assert.match(makeAss(segments, 1920, 1080), /Hola\\Nmundo/);
});

test("applies the selected subtitle size, position, and colors to the MP4 captions", () => {
  const ass = makeAss(
    [{ start: 0, end: 1, text: "Hello" }],
    1920,
    1080,
    { fontSize: 24, position: 20, color: "#FF8040", backgroundColor: "#123456" }
  );
  assert.match(ass, /Style: Default,Arial,72,&H004080FF,&H000000FF,&H00000000,&H47563412,/);
  assert.match(ass, /,216,1\n/);
  assert.throws(
    () => makeAss([], 1920, 1080, { fontSize: 40, color: "#ffffff" }),
    /entre 12 y 36 píxeles/
  );
});
