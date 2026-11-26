import { FFmpeg } from "@ffmpeg/ffmpeg";
import ffmpegCoreURL from "@ffmpeg/core?url";
import ffmpegWasmURL from "@ffmpeg/core/wasm?url";
import { makeAss, validateVideo } from "./core.js";
import "./styles.css";

const fileInput = document.querySelector("#video-file");
const sourceSelect = document.querySelector("#source-language");
const targetSelect = document.querySelector("#target-language");
const translationEngineSelect = document.querySelector("#translation-engine");
const engineHelp = document.querySelector("#engine-help");
const engineStatus = document.querySelector("#engine-status");
const offlineGuidance = document.querySelector("#offline-guidance");
const sourcePreviewStage = document.querySelector("#source-preview-stage");
const fileName = document.querySelector("#file-name");
const fileDetail = document.querySelector("#file-detail");
const sourcePreview = document.querySelector("#source-preview");
const subtitlePreview = document.querySelector("#subtitle-preview");
const subtitleFontSize = document.querySelector("#subtitle-font-size");
const subtitleFontSizeNumber = document.querySelector("#subtitle-font-size-number");
const subtitlePosition = document.querySelector("#subtitle-position");
const subtitlePositionValue = document.querySelector("#subtitle-position-value");
const subtitleTextColor = document.querySelector("#subtitle-text-color");
const subtitleTextColorValue = document.querySelector("#subtitle-text-color-value");
const subtitleBackgroundColor = document.querySelector("#subtitle-background-color");
const subtitleBackgroundColorValue = document.querySelector("#subtitle-background-color-value");
const translateButton = document.querySelector("#translate-button");
const progressPanel = document.querySelector("#progress-panel");
const progressStage = document.querySelector("#progress-stage");
const progressPercent = document.querySelector("#progress-percent");
const progressBar = document.querySelector("#progress-bar");
const progressDetail = document.querySelector("#progress-detail");
const results = document.querySelector("#results");
const subtitleList = document.querySelector("#subtitle-list");
const renderButton = document.querySelector("#render-button");
const outputPreview = document.querySelector("#output-preview");
const downloadButton = document.querySelector("#download-button");
const shareButton = document.querySelector("#share-button");
const shareHelp = document.querySelector("#share-help");
const errorMessage = document.querySelector("#error-message");
const themeToggle = document.querySelector("#theme-toggle");
const themeIcon = document.querySelector("#theme-icon");
const themeLabel = document.querySelector("#theme-label");
const themeColor = document.querySelector('meta[name="theme-color"]');

let selectedFile = null;
let mediaUrl = null;
let outputUrl = null;
let outputFile = null;
let segments = [];
let inferenceWorker = null;
let ffmpeg = null;
let ffmpegLoading = null;
let isBusy = false;
let ollamaAvailable = false;
let renderSequence = 0;
const themePreferenceKey = "lingua-theme";
const systemColorScheme = window.matchMedia("(prefers-color-scheme: dark)");
let themePreference = null;

try {
  const savedTheme = localStorage.getItem(themePreferenceKey);
  if (savedTheme === "light" || savedTheme === "dark") {
    themePreference = savedTheme;
  }
} catch (error) {
  console.warn("Theme preference could not be read", error);
}

function applyTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = theme;
  themeIcon.textContent = dark ? "☀" : "☾";
  themeLabel.textContent = dark ? "Claro" : "Oscuro";
  themeToggle.setAttribute("aria-label", `Cambiar a modo ${dark ? "claro" : "oscuro"}`);
  themeToggle.title = `Cambiar a modo ${dark ? "claro" : "oscuro"}`;
  themeToggle.setAttribute("aria-pressed", String(dark));
  themeColor.content = dark ? "#121820" : "#f3f5f7";
}

applyTheme(themePreference || (systemColorScheme.matches ? "dark" : "light"));

themeToggle.addEventListener("click", () => {
  themePreference = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(themePreferenceKey, themePreference);
  } catch (error) {
    console.warn("Theme preference could not be saved", error);
  }
  applyTheme(themePreference);
});

systemColorScheme.addEventListener("change", ({ matches }) => {
  if (!themePreference) applyTheme(matches ? "dark" : "light");
});

function setProgress(stage, detail = "", value = null) {
  progressStage.textContent = stage;
  progressDetail.textContent = detail;
  if (value === null) {
    progressBar.removeAttribute("value");
    progressPercent.textContent = "";
  } else {
    const percentage = Math.max(0, Math.min(100, Math.round(value)));
    progressBar.value = percentage;
    progressPercent.textContent = `${percentage}%`;
  }
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove("hidden");
}

function clearError() {
  errorMessage.textContent = "";
  errorMessage.classList.add("hidden");
}

function setBusy(busy) {
  isBusy = busy;
  translateButton.disabled = busy || !selectedFile;
  renderButton.disabled = busy;
  translationEngineSelect.disabled = busy;
  for (const control of [
    subtitleFontSize,
    subtitleFontSizeNumber,
    subtitlePosition,
    subtitleTextColor,
    subtitleBackgroundColor,
  ]) {
    control.disabled = busy;
  }
  for (const input of subtitleList.querySelectorAll("textarea")) {
    input.disabled = busy;
  }
  updateCorrectionButtons();
}

function updateCorrectionButtons() {
  const canCorrect = translationEngineSelect.value === "ollama" && ollamaAvailable;
  for (const button of subtitleList.querySelectorAll(
    ".subtitle-correct-button, .subtitle-retranslate-button"
  )) {
    button.disabled = isBusy || !canCorrect;
    button.title = canCorrect
      ? "Pedir a Qwen3 que revise esta línea."
      : translationEngineSelect.value === "ollama"
        ? "Qwen3 no está disponible en la laptop."
        : "Selecciona Qwen3 en la laptop para corregir con IA.";
  }
}

async function updateTranslationEngineInfo() {
  engineStatus.classList.add("hidden");
  ollamaAvailable = false;
  if (translationEngineSelect.value !== "ollama") {
    engineHelp.textContent =
      "El modelo local traduce en este dispositivo. No necesita que la laptop esté encendida.";
    updateCorrectionButtons();
    return;
  }

  engineHelp.textContent =
    "Qwen3 traduce en tu laptop. Solo se envían los textos de los subtítulos por la red local; nunca el video ni el audio. Ambos dispositivos deben estar encendidos y en la misma red.";
  engineStatus.textContent = "Comprobando Ollama en la laptop…";
  engineStatus.classList.remove("hidden");
  try {
    const response = await fetch("/api/ollama/status");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "No se pudo conectar con Ollama.");
    }
    if (!payload.available) {
      engineStatus.textContent =
        payload.message || `No se encontró el modelo ${payload.model || "Qwen3"} en Ollama.`;
      updateCorrectionButtons();
      return;
    }
    ollamaAvailable = true;
    engineStatus.textContent = `${payload.model} está disponible en esta laptop.`;
    updateCorrectionButtons();
  } catch (error) {
    engineStatus.textContent =
      error instanceof Error ? error.message : "No se pudo comprobar Ollama.";
    updateCorrectionButtons();
  }
}

function updateSubtitlePreview() {
  if (!selectedFile) {
    subtitlePreview.classList.add("hidden");
    return;
  }
  const currentTime = sourcePreview.currentTime || 0;
  const segment =
    segments.find((item) => currentTime >= item.start && currentTime < item.end) ||
    (sourcePreview.paused && currentTime === 0 ? segments[0] : null);
  const text = segment?.text || (segments.length ? "" : "Subtítulo de ejemplo");
  if (!text) {
    subtitlePreview.classList.add("hidden");
    return;
  }
  subtitlePreview.textContent = text;
  subtitlePreview.style.color = subtitleTextColor.value;
  subtitlePreview.style.backgroundColor = colorWithOpacity(subtitleBackgroundColor.value, 0.72);
  subtitlePreview.style.bottom = `${subtitlePosition.value}%`;
  const scale = sourcePreview.videoHeight
    ? sourcePreview.getBoundingClientRect().height / 360
    : 1;
  subtitlePreview.style.fontSize = `${Number(subtitleFontSize.value) * scale}px`;
  subtitlePreview.classList.remove("hidden");
}

function colorWithOpacity(hex, opacity) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function updateSubtitleStyle() {
  subtitleFontSizeNumber.value = subtitleFontSize.value;
  subtitlePositionValue.value = `${subtitlePosition.value}% desde abajo`;
  subtitleTextColorValue.value = subtitleTextColor.value.toUpperCase();
  subtitleBackgroundColorValue.value = subtitleBackgroundColor.value.toUpperCase();
  subtitleList.style.setProperty("--subtitle-font-size", `${subtitleFontSize.value}px`);
  updateSubtitlePreview();
  if (outputUrl) {
    clearOutput();
    showError("Cambiaste el estilo. Crea de nuevo el MP4 para aplicar los ajustes elegidos.");
  }
}

function clearOutput() {
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = null;
  outputFile = null;
  outputPreview.pause();
  outputPreview.removeAttribute("src");
  outputPreview.load();
  outputPreview.classList.add("hidden");
  downloadButton.removeAttribute("href");
  downloadButton.classList.add("hidden");
  shareButton.classList.add("hidden");
  shareHelp.classList.add("hidden");
}

function resetJobView() {
  segments = [];
  subtitleList.replaceChildren();
  subtitlePreview.classList.add("hidden");
  subtitlePreview.textContent = "";
  results.classList.add("hidden");
  progressPanel.classList.add("hidden");
  clearOutput();
  clearError();
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateSelection() {
  const message = validateVideo(selectedFile, sourcePreview.duration);
  translateButton.disabled = Boolean(message) || isBusy || sourceSelect.value === targetSelect.value;
  if (selectedFile && Number.isFinite(sourcePreview.duration)) {
    if (message) showError(message);
    else clearError();
  }
}

function updateFileSelection() {
  resetJobView();
  selectedFile = fileInput.files?.[0] || null;
  translateButton.disabled = true;
  if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  mediaUrl = null;
  sourcePreview.pause();
  sourcePreview.removeAttribute("src");
  sourcePreviewStage.classList.add("hidden");

  if (!selectedFile) {
    fileName.textContent = "Selecciona un video MP4 o MOV";
    fileDetail.textContent = "Prueba inicial: clips de hasta 8 min y 100 MB.";
    return;
  }

  fileName.textContent = selectedFile.name;
  fileDetail.textContent = `${formatBytes(selectedFile.size)} · revisando duración`;
  if (!/\.(mp4|mov)$/i.test(selectedFile.name)) {
    showError("La prueba acepta videos MP4 y MOV.");
    return;
  }

  mediaUrl = URL.createObjectURL(selectedFile);
  sourcePreview.src = mediaUrl;
  sourcePreviewStage.classList.remove("hidden");
  sourcePreview.load();
  updateSubtitlePreview();
}

function drawSubtitleEditor() {
  subtitleList.replaceChildren();
  for (const [index, segment] of segments.entries()) {
    const row = document.createElement("article");
    row.className = "subtitle-row";
    const timestamp = document.createElement("div");
    timestamp.className = "subtitle-time";
    timestamp.textContent = `${segment.start.toFixed(2)}s – ${segment.end.toFixed(2)}s · ${index + 1}`;
    const sourceLabel = document.createElement("div");
    sourceLabel.className = "subtitle-field-label";
    sourceLabel.textContent = "Transcripción original";
    const source = document.createElement("textarea");
    source.className = "subtitle-source";
    source.rows = 2;
    source.value = segment.source;
    source.setAttribute("aria-label", `Transcripción original ${index + 1}`);
    source.addEventListener("input", () => {
      segments[index].source = source.value;
      subtitleTextChanged();
    });
    const translationLabel = document.createElement("div");
    translationLabel.className = "subtitle-field-label";
    translationLabel.textContent = "Traducción";
    const translated = document.createElement("textarea");
    translated.className = "subtitle-translation";
    translated.rows = 2;
    translated.value = segment.text;
    translated.setAttribute("aria-label", `Subtítulo traducido ${index + 1}`);
    translated.addEventListener("input", () => {
      segments[index].text = translated.value;
      subtitleTextChanged();
    });
    const retranslateButton = document.createElement("button");
    retranslateButton.type = "button";
    retranslateButton.className = "subtitle-correct-button subtitle-retranslate-button";
    retranslateButton.textContent = "Traducir de nuevo con IA";
    retranslateButton.addEventListener("click", () =>
      retranslateSubtitle(index, retranslateButton)
    );
    const correctButton = document.createElement("button");
    correctButton.type = "button";
    correctButton.className = "subtitle-correct-button";
    correctButton.textContent = "Revisar traducción con IA";
    correctButton.addEventListener("click", () => correctSubtitle(index, correctButton));
    row.append(
      timestamp,
      sourceLabel,
      source,
      translationLabel,
      translated,
      retranslateButton,
      correctButton
    );
    subtitleList.append(row);
  }
  updateCorrectionButtons();
}

function subtitleTextChanged() {
  updateSubtitlePreview();
  if (outputUrl) {
    clearOutput();
    showError("Cambiaste un subtítulo. Crea de nuevo el MP4 para aplicar los cambios.");
  }
}

async function retranslateSubtitle(index, button) {
  const segment = segments[index];
  if (!segment || translationEngineSelect.value !== "ollama" || !ollamaAvailable) return;

  clearError();
  setBusy(true);
  button.textContent = "Traduciendo…";
  progressPanel.classList.remove("hidden");
  setProgress("Traduciendo de nuevo con IA", `Línea ${index + 1} de ${segments.length}`);
  try {
    const response = await fetch("/api/ollama/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_language: sourceSelect.value,
        target_language: targetSelect.value,
        texts: [segment.source],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Qwen3 no pudo traducir esta línea.");
    }
    if (
      !Array.isArray(payload.translations) ||
      typeof payload.translations[0] !== "string" ||
      !payload.translations[0].trim()
    ) {
      throw new Error("Qwen3 no devolvió una traducción válida.");
    }

    segment.text = payload.translations[0].trim();
    button.closest(".subtitle-row").querySelector(".subtitle-translation").value = segment.text;
    updateSubtitlePreview();
    const hadOutput = Boolean(outputUrl);
    if (hadOutput) clearOutput();
    setProgress(
      "Traducción actualizada",
      hadOutput
        ? "Revisa la línea y vuelve a crear el MP4 para aplicar el cambio."
        : "Revisa el resultado y edítalo si hace falta antes de crear el MP4.",
      100
    );
  } catch (error) {
    setProgress("No se pudo traducir la línea");
    showError(error instanceof Error ? error.message : "Qwen3 no pudo traducir esta línea.");
  } finally {
    button.textContent = "Traducir de nuevo con IA";
    setBusy(false);
  }
}

async function correctSubtitle(index, button) {
  const segment = segments[index];
  if (!segment || translationEngineSelect.value !== "ollama" || !ollamaAvailable) return;

  clearError();
  setBusy(true);
  button.textContent = "Corrigiendo…";
  progressPanel.classList.remove("hidden");
  setProgress("Corrigiendo subtítulo con IA", `Línea ${index + 1} de ${segments.length}`);
  try {
    const response = await fetch("/api/ollama/correct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_language: sourceSelect.value,
        target_language: targetSelect.value,
        source_text: segment.source,
        current_translation: segment.text,
        previous_source: segments[index - 1]?.source || "",
        next_source: segments[index + 1]?.source || "",
        previous_translation: segments[index - 1]?.text || "",
        next_translation: segments[index + 1]?.text || "",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Qwen3 no pudo corregir esta línea.");
    }
    if (typeof payload.translation !== "string" || !payload.translation.trim()) {
      throw new Error("Qwen3 no devolvió una corrección válida.");
    }

    segment.text = payload.translation.trim();
    button.closest(".subtitle-row").querySelector(".subtitle-translation").value = segment.text;
    updateSubtitlePreview();
    const hadOutput = Boolean(outputUrl);
    if (hadOutput) clearOutput();
    setProgress(
      "Subtítulo corregido",
      hadOutput
        ? "Revisa la línea y vuelve a crear el MP4 para aplicar el cambio."
        : "Revisa el resultado y edítalo si hace falta antes de crear el MP4.",
      100
    );
  } catch (error) {
    setProgress("No se pudo corregir el subtítulo");
    showError(error instanceof Error ? error.message : "Qwen3 no pudo corregir esta línea.");
  } finally {
    button.textContent = "Revisar traducción con IA";
    setBusy(false);
  }
}

async function loadFfmpeg() {
  if (ffmpeg) return ffmpeg;
  if (!ffmpegLoading) {
    ffmpegLoading = (async () => {
      const instance = new FFmpeg();
      instance.on("log", ({ message }) => {
        if (message) console.debug("[ffmpeg]", message);
      });
      await instance.load({ coreURL: ffmpegCoreURL, wasmURL: ffmpegWasmURL });
      ffmpeg = instance;
      return instance;
    })();
  }
  try {
    return await ffmpegLoading;
  } catch (error) {
    ffmpegLoading = null;
    throw error;
  }
}

async function readWavAsFloat32(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 44 || view.getUint32(0, true) !== 0x46464952) {
    throw new Error("FFmpeg no creó un archivo WAV válido.");
  }

  let offset = 12;
  let dataOffset = -1;
  let dataLength = 0;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let format = 0;
  while (offset + 8 <= view.byteLength) {
    const chunkId = view.getUint32(offset, false);
    const chunkLength = view.getUint32(offset + 4, true);
    const payload = offset + 8;
    if (chunkId === 0x666d7420 && chunkLength >= 16) {
      format = view.getUint16(payload, true);
      channels = view.getUint16(payload + 2, true);
      sampleRate = view.getUint32(payload + 4, true);
      bitsPerSample = view.getUint16(payload + 14, true);
    } else if (chunkId === 0x64617461) {
      dataOffset = payload;
      dataLength = chunkLength;
      break;
    }
    offset = payload + chunkLength + (chunkLength % 2);
  }

  if (format !== 1 || channels !== 1 || sampleRate !== 16000 || bitsPerSample !== 16 || dataOffset < 0) {
    throw new Error("El audio extraído no tiene el formato esperado (PCM mono 16 kHz).");
  }
  const sampleCount = Math.floor(Math.min(dataLength, view.byteLength - dataOffset) / 2);
  const audio = new Float32Array(sampleCount);
  const blockSize = 262144;
  for (let start = 0; start < sampleCount; start += blockSize) {
    const end = Math.min(sampleCount, start + blockSize);
    for (let index = start; index < end; index += 1) {
      audio[index] = view.getInt16(dataOffset + index * 2, true) / 32768;
    }
    setProgress(
      "Preparando el audio",
      `Convertidas ${end.toLocaleString()} de ${sampleCount.toLocaleString()} muestras`,
      (end / sampleCount) * 100
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return audio;
}

function transcribeAndTranslate(audio) {
  return new Promise((resolve, reject) => {
    if (inferenceWorker) inferenceWorker.terminate();
    inferenceWorker = new Worker(new URL("./inference-worker.js", import.meta.url), { type: "module" });
    inferenceWorker.addEventListener("message", ({ data }) => {
      if (data.type === "progress") {
        setProgress(data.stage, data.detail, data.value ?? null);
      } else if (data.type === "language-detected") {
        sourceSelect.value = data.language;
        validateSelection();
      } else if (data.type === "complete") {
        inferenceWorker.terminate();
        inferenceWorker = null;
        resolve(data.segments);
      } else if (data.type === "error") {
        inferenceWorker.terminate();
        inferenceWorker = null;
        reject(new Error(data.error));
      }
    });
    inferenceWorker.addEventListener("error", (event) => {
      inferenceWorker?.terminate();
      inferenceWorker = null;
      reject(new Error(event.message || "Falló el modelo local."));
    });
    inferenceWorker.postMessage(
      {
        type: "translate",
        audio,
        sourceLanguage: sourceSelect.value,
        targetLanguage: targetSelect.value,
        translationEngine: translationEngineSelect.value,
        duration: sourcePreview.duration,
      },
      [audio.buffer]
    );
  });
}

async function transcribeVideo() {
  const message = validateVideo(selectedFile, sourcePreview.duration);
  if (message) throw new Error(message);
  if (sourceSelect.value === targetSelect.value) {
    throw new Error("Elige dos idiomas distintos.");
  }

  setBusy(true);
  clearError();
  progressPanel.classList.remove("hidden");
  results.classList.add("hidden");
  clearOutput();
  try {
    setProgress("Cargando el procesador de video", "La primera carga descarga el motor FFmpeg.");
    const engine = await loadFfmpeg();
    const jobId = `${Date.now().toString(36)}-${renderSequence++}`;
    const extension = selectedFile.name.toLowerCase().endsWith(".mov") ? "mov" : "mp4";
    const inputName = `transcribe-source-${jobId}.${extension}`;
    setProgress("Leyendo video", `Preparando ${formatBytes(selectedFile.size)} en el navegador; no cierres Safari.`);
    const input = new Uint8Array(await selectedFile.arrayBuffer());
    setProgress("Copiando video al procesador", "Este paso puede tardar según el tamaño del archivo.");
    await engine.writeFile(inputName, input);
    const audioName = `speech-${jobId}.wav`;
    setProgress("Extrayendo audio", "El video se mantiene dentro del navegador.");
    const updateExtractionProgress = ({ progress }) => {
      if (Number.isFinite(progress)) {
        setProgress(
          "Extrayendo audio",
          "FFmpeg está leyendo el video; mantén Safari abierto.",
          progress * 100
        );
      }
    };
    engine.on("progress", updateExtractionProgress);
    let extractionCode;
    try {
      extractionCode = await engine.exec([
        "-i", inputName,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-c:a", "pcm_s16le",
        audioName,
      ]);
    } finally {
      engine.off("progress", updateExtractionProgress);
    }
    if (extractionCode !== 0) {
      throw new Error("No se pudo extraer el audio. Comprueba que el video tenga una pista de sonido compatible.");
    }

    setProgress("Leyendo audio extraído", "Preparando muestras para el modelo de voz.");
    const wav = await engine.readFile(audioName);
    const audio = await readWavAsFloat32(wav);
    await engine.deleteFile(audioName);
    await engine.deleteFile(inputName);
    segments = await transcribeAndTranslate(audio);
    drawSubtitleEditor();
    results.classList.remove("hidden");
    updateSubtitlePreview();
    setProgress("Traducción lista", "Revisa las líneas y edítalas antes de crear el MP4.", 100);
    results.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showError(error instanceof Error ? error.message : "No se pudo procesar el video.");
  } finally {
    setBusy(false);
  }
}

async function renderVideo() {
  if (!segments.length) {
    showError("Primero traduce el video.");
    return;
  }

  setBusy(true);
  clearError();
  clearOutput();
  progressPanel.classList.remove("hidden");
  try {
    setProgress("Preparando el MP4", "Se está codificando en el navegador; mantén esta pantalla abierta.");
    const engine = await loadFfmpeg();
    const renderId = `${Date.now().toString(36)}-${renderSequence++}`;
    const extension = selectedFile.name.toLowerCase().endsWith(".mov") ? "mov" : "mp4";
    const inputName = `source-${renderId}.${extension}`;
    const outputName = `lingua-translated-${renderId}.mp4`;
    const subtitleName = `translated-${renderId}.ass`;
    const input = new Uint8Array(await selectedFile.arrayBuffer());
    await engine.writeFile(inputName, input);
    await engine.writeFile(
      subtitleName,
      new TextEncoder().encode(
        makeAss(
          segments,
          sourcePreview.videoWidth || 1280,
          sourcePreview.videoHeight || 720,
          {
            fontSize: Number(subtitleFontSize.value),
            position: Number(subtitlePosition.value),
            color: subtitleTextColor.value,
            backgroundColor: subtitleBackgroundColor.value,
          }
        )
      )
    );

    const updateProgress = ({ progress }) => {
      if (Number.isFinite(progress)) {
        setProgress("Codificando MP4", "No cierres el navegador ni bloquees la pantalla durante la prueba.", progress * 100);
      }
    };
    engine.on("progress", updateProgress);
    let exitCode;
    try {
      exitCode = await engine.exec([
        "-y",
        "-i", inputName,
        "-vf", `subtitles=${subtitleName}`,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "28",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        outputName,
      ]);
    } finally {
      engine.off("progress", updateProgress);
    }
    if (exitCode !== 0) {
      throw new Error("El motor FFmpeg de esta prueba no pudo incrustar los subtítulos en este video.");
    }

    const output = await engine.readFile(outputName);
    const blob = new Blob([output], { type: "video/mp4" });
    await engine.deleteFile(inputName);
    await engine.deleteFile(subtitleName);
    await engine.deleteFile(outputName);
    if (blob.size === 0) throw new Error("El MP4 generado está vacío.");
    outputUrl = URL.createObjectURL(blob);
    outputFile = new File([blob], "lingua-traducido.mp4", { type: "video/mp4" });
    outputPreview.src = outputUrl;
    outputPreview.classList.remove("hidden");
    outputPreview.load();
    downloadButton.href = outputUrl;
    downloadButton.classList.remove("hidden");
    shareButton.classList.remove("hidden");
    let canShareFile = false;
    if (typeof navigator.share === "function" && typeof navigator.canShare === "function") {
      try {
        canShareFile = navigator.canShare({ files: [outputFile] });
      } catch (error) {
        console.warn("File-sharing support check failed", error);
        canShareFile = false;
      }
    }
    shareHelp.textContent = canShareFile
      ? "En el iPhone, elige “Guardar video” en la hoja de compartir."
      : window.isSecureContext
        ? "Este navegador no permite compartir archivos directamente. Descarga el MP4, ábrelo en Archivos y elige Compartir > Guardar video."
        : "Esta dirección HTTP no permite abrir Compartir en el iPhone. Descarga el MP4, ábrelo en Archivos y elige Compartir > Guardar video. Para compartir desde aquí se necesita HTTPS.";
    shareHelp.classList.remove("hidden");
    setProgress("MP4 subtitulado listo", "Los subtítulos ya están incrustados en este archivo.", 100);
    outputPreview.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    showError(error instanceof Error ? error.message : "No se pudo crear el MP4.");
  } finally {
    setBusy(false);
  }
}

async function shareVideo() {
  if (!outputFile) return;
  const files = [outputFile];
  try {
    if (
      typeof navigator.share !== "function" ||
      typeof navigator.canShare !== "function" ||
      !navigator.canShare({ files })
    ) {
      showError(
        window.isSecureContext
          ? "Este navegador no puede compartir archivos directamente. Abre el MP4 desde Archivos y usa Compartir > Guardar video."
          : "La dirección HTTP no permite abrir Compartir en el iPhone. Descarga el MP4, ábrelo desde Archivos y usa Compartir > Guardar video; para compartir desde aquí se necesita HTTPS."
      );
      return;
    }
    await navigator.share({ files, title: "Video traducido por Lingua" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    showError("No se pudo abrir la hoja de compartir. Descarga el MP4 y guárdalo desde Archivos.");
  }
}

fileInput.addEventListener("change", updateFileSelection);
sourcePreview.addEventListener("loadedmetadata", () => {
  fileDetail.textContent = `${formatBytes(selectedFile?.size || 0)} · ${Math.round(sourcePreview.duration)} s`;
  validateSelection();
  updateSubtitlePreview();
});
sourcePreview.addEventListener("timeupdate", updateSubtitlePreview);
sourcePreview.addEventListener("seeked", updateSubtitlePreview);
sourcePreview.addEventListener("error", () => {
  showError("El navegador no pudo abrir este archivo de video.");
});
sourceSelect.addEventListener("change", validateSelection);
targetSelect.addEventListener("change", validateSelection);
translationEngineSelect.addEventListener("change", updateTranslationEngineInfo);
subtitleFontSize.addEventListener("input", updateSubtitleStyle);
subtitleFontSizeNumber.addEventListener("input", () => {
  const numeric = Number(subtitleFontSizeNumber.value);
  if (!Number.isInteger(numeric)) return;
  subtitleFontSize.value = String(Math.max(12, Math.min(36, numeric)));
  updateSubtitleStyle();
});
subtitleFontSizeNumber.addEventListener("change", () => {
  const numeric = Number(subtitleFontSizeNumber.value);
  if (!Number.isInteger(numeric)) {
    subtitleFontSizeNumber.value = subtitleFontSize.value;
    return;
  }
  subtitleFontSize.value = String(Math.max(12, Math.min(36, numeric)));
  updateSubtitleStyle();
});
subtitlePosition.addEventListener("input", updateSubtitleStyle);
subtitleTextColor.addEventListener("input", updateSubtitleStyle);
subtitleBackgroundColor.addEventListener("input", updateSubtitleStyle);
translateButton.addEventListener("click", transcribeVideo);
renderButton.addEventListener("click", renderVideo);
shareButton.addEventListener("click", shareVideo);
window.addEventListener("resize", updateSubtitlePreview);

if (!window.isSecureContext) {
  offlineGuidance.textContent =
    "Esta dirección HTTP de la laptop solo funciona en la misma red y con la laptop encendida. Para usar Lingua fuera de casa, hace falta instalarla desde un sitio HTTPS independiente y descargar los modelos mientras haya Internet.";
} else if (!("serviceWorker" in navigator)) {
  offlineGuidance.textContent =
    "Este navegador no permite guardar la aplicación para usarla sin conexión. La primera descarga de los modelos necesita Internet.";
} else if (import.meta.env.PROD) {
  offlineGuidance.textContent = "Guardando los archivos de la aplicación para usarlos sin conexión…";
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    offlineGuidance.textContent =
      "Aplicación guardada. Para transcribir sin Internet, completa una transcripción y traducción mientras estás conectado. Safari puede eliminar los modelos; verifica el modo avión antes de salir.";
  });
  navigator.serviceWorker.register("/sw.js").then((registration) => {
    registration.installing?.addEventListener("statechange", (event) => {
      const worker = event.target;
      if (worker.state === "redundant" && !navigator.serviceWorker.controller) {
        offlineGuidance.textContent =
          "No se pudo guardar la aplicación para usarla sin conexión. Comprueba que haya espacio disponible y vuelve a cargar la página.";
      }
    });
  }).catch((error) => {
    console.warn("Service worker registration failed", error);
    offlineGuidance.textContent =
      "No se pudo guardar la aplicación para usarla sin conexión. Comprueba que haya espacio disponible y vuelve a cargar la página.";
  });
  navigator.serviceWorker.ready.then(() => {
    if (navigator.serviceWorker.controller) {
      offlineGuidance.textContent =
        "Aplicación guardada. Para transcribir sin Internet, completa una transcripción y traducción mientras estás conectado. Safari puede eliminar los modelos; verifica el modo avión antes de salir.";
    }
  });
} else {
  offlineGuidance.textContent =
    "Esta versión de desarrollo no se guarda sin conexión. Para uso fuera de casa, hace falta una versión de producción en HTTPS.";
}

window.addEventListener("beforeunload", () => {
  inferenceWorker?.terminate();
  if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  if (outputUrl) URL.revokeObjectURL(outputUrl);
});
