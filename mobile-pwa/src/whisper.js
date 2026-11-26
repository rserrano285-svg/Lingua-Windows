import { whisperLanguageCode } from "./core.js";

export async function detectWhisperLanguage(asr, audio) {
  const sample = audio.subarray(0, 16000 * 30);
  const features = await asr.processor(sample);
  const model = asr.model;
  const originalRetrieveTokens = model._retrieve_init_tokens;
  if (typeof originalRetrieveTokens !== "function") {
    throw new Error("El modelo Whisper no permite detectar el idioma automáticamente.");
  }

  model._retrieve_init_tokens = (config) => [config.decoder_start_token_id];
  let generated;
  try {
    generated = await model.generate({
      inputs: features.input_features,
      max_new_tokens: 1,
    });
  } finally {
    model._retrieve_init_tokens = originalRetrieveTokens;
  }

  const tokenIds = generated?.[0]?.tolist?.();
  if (!Array.isArray(tokenIds) || tokenIds.length < 2) {
    throw new Error("Whisper no pudo detectar el idioma del audio.");
  }
  const token = asr.tokenizer.model.convert_ids_to_tokens([tokenIds[1]])[0];
  const language = whisperLanguageCode(token);
  if (!language) throw new Error("Whisper no pudo identificar el idioma del audio.");
  return language;
}
