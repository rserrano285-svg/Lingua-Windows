import { env, pipeline } from "@huggingface/transformers";
import { detectWhisperLanguage } from "./whisper.js";

env.allowLocalModels = false;
env.useBrowserCache = typeof globalThis.caches !== "undefined";

const translationModels = {
  "es-en": "Xenova/opus-mt-es-en",
  "en-es": "Xenova/opus-mt-en-es",
};

let transcriber;
let translator;
let translatorKey;

function report(stage, detail, value = null) {
  self.postMessage({ type: "progress", stage, detail, value });
}

function normalizeChunks(result, duration) {
  const chunks = Array.isArray(result.chunks) ? result.chunks : [];
  const normalized = chunks
    .map((chunk) => {
      const timestamp = chunk.timestamp || [];
      const start = Number(timestamp[0]);
      const end = Number(timestamp[1]);
      const text = String(chunk.text || "").trim();
      if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
      return { start, end: Math.min(duration, end), source: text, text };
    })
    .filter(Boolean);

  if (normalized.length) return normalized;
  const text = String(result.text || "").trim();
  return text ? [{ start: 0, end: duration, source: text, text }] : [];
}

self.addEventListener("message", async ({ data }) => {
  if (data.type !== "translate") return;
  const { audio, sourceLanguage, targetLanguage, duration, translationEngine } = data;

  try {
    if (!transcriber) {
      report("Descargando modelo de voz", "Se descarga una vez y queda en la caché del navegador.");
      transcriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
        dtype: "q8",
        device: "wasm",
        progress_callback: (progress) => {
          if (progress.status === "progress" && Number.isFinite(progress.progress)) {
            const percentage = Math.round(progress.progress);
            report("Descargando modelo de voz", `${percentage}%`, percentage);
          }
        },
      });
    }

    const sampleRate = 16000;
    const chunkLengthSeconds = 20;
    const chunkLengthSamples = sampleRate * chunkLengthSeconds;
    const chunkCount = Math.ceil(audio.length / chunkLengthSamples);
    let resolvedSourceLanguage = sourceLanguage;
    if (sourceLanguage === "auto") {
      report("Detectando idioma del audio", "Whisper analizará el inicio del audio y después transcribirá el clip.", 0);
      resolvedSourceLanguage = await detectWhisperLanguage(transcriber, audio);
      if (resolvedSourceLanguage !== "es" && resolvedSourceLanguage !== "en") {
        throw new Error(
          `Whisper detectó otro idioma (${resolvedSourceLanguage}); por ahora solo se admite español o inglés.`
        );
      }
      const languageName = resolvedSourceLanguage === "es" ? "español" : "inglés";
      self.postMessage({ type: "language-detected", language: resolvedSourceLanguage });
      report("Idioma detectado", `Whisper detectó ${languageName}.`, 100);
      if (resolvedSourceLanguage === targetLanguage) {
        throw new Error(`Whisper detectó ${languageName}. Elige otro idioma de destino y vuelve a intentarlo.`);
      }
    }

    const languageName = resolvedSourceLanguage === "es" ? "spanish" : "english";
    const segments = [];
    report("Transcribiendo el audio", "Preparando fragmentos de 20 segundos.", 0);
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      const startSample = chunkIndex * chunkLengthSamples;
      const endSample = Math.min(audio.length, startSample + chunkLengthSamples);
      const chunkDuration = (endSample - startSample) / sampleRate;
      const transcriptionOptions = {
        task: "transcribe",
        return_timestamps: true,
        chunk_length_s: chunkLengthSeconds,
        stride_length_s: 3,
      };
      if (sourceLanguage !== "auto") transcriptionOptions.language = languageName;
      report(
        "Transcribiendo el audio",
        `Analizando fragmento ${chunkIndex + 1} de ${chunkCount} (hasta 20 s). En iPhone puede tardar más que el audio.`,
        (chunkIndex / chunkCount) * 100
      );
      const result = await transcriber(
        audio.subarray(startSample, endSample),
        transcriptionOptions
      );
      for (const segment of normalizeChunks(result, chunkDuration)) {
        const start = startSample / sampleRate + segment.start;
        const end = Math.min(duration, startSample / sampleRate + segment.end);
        if (end > start) segments.push({ ...segment, start, end });
      }
      report(
        "Transcribiendo el audio",
        `Fragmento ${chunkIndex + 1} de ${chunkCount}`,
        ((chunkIndex + 1) / chunkCount) * 100
      );
    }
    if (!segments.length) throw new Error("No se detectó voz en este clip.");

    const translated = [];
    if (translationEngine === "ollama") {
      const batchSize = 10;
      for (let offset = 0; offset < segments.length; offset += batchSize) {
        const batch = segments.slice(offset, offset + batchSize);
        const response = await fetch("/api/ollama/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_language: resolvedSourceLanguage,
            target_language: targetLanguage,
            texts: batch.map((segment) => segment.source),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || "No se pudo traducir con Qwen3 en la laptop.");
        }
        const translations = payload.translations;
        if (
          !Array.isArray(translations) ||
          translations.length !== batch.length ||
          translations.some((text) => typeof text !== "string" || !text.trim())
        ) {
          throw new Error("Qwen3 no devolvió una traducción válida para cada línea.");
        }
        translated.push(
          ...batch.map((segment, index) => ({ ...segment, text: translations[index].trim() }))
        );
        report(
          "Traduciendo con Qwen3 en la laptop",
          `${translated.length} de ${segments.length} líneas`,
          (translated.length / segments.length) * 100
        );
      }
    } else {
      const key = `${resolvedSourceLanguage}-${targetLanguage}`;
      if (translatorKey !== key) {
        translator = null;
        translatorKey = key;
      }
      if (!translator) {
        const model = translationModels[key];
        if (!model) throw new Error("Esta prueba solo permite español e inglés.");
        report("Descargando modelo de traducción", "Se descarga una vez para el par de idiomas elegido.");
        translator = await pipeline("translation", model, {
          dtype: "q8",
          device: "wasm",
          progress_callback: (progress) => {
            if (progress.status === "progress" && Number.isFinite(progress.progress)) {
              const percentage = Math.round(progress.progress);
              report("Descargando modelo de traducción", `${percentage}%`, percentage);
            }
          },
        });
      }
      for (let index = 0; index < segments.length; index += 1) {
        const result = await translator(segments[index].source, { max_new_tokens: 128 });
        const text = result?.[0]?.translation_text?.trim();
        if (!text) throw new Error(`No se pudo traducir la línea ${index + 1}.`);
        translated.push({ ...segments[index], text });
        report(
          "Traduciendo subtítulos",
          `${index + 1} de ${segments.length} líneas`,
          ((index + 1) / segments.length) * 100
        );
      }
    }

    self.postMessage({ type: "complete", segments: translated });
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "Falló el procesamiento local.",
    });
  }
});
