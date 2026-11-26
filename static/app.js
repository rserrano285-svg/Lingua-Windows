const sourceSelect = document.querySelector("#source-language");
const targetSelect = document.querySelector("#target-language");
const translationEngineSelect = document.querySelector("#translation-engine");
const engineMessage = document.querySelector("#engine-message");
const engineFooter = document.querySelector("#engine-footer");
const languageMessage = document.querySelector("#language-message");
const themeToggle = document.querySelector("#theme-toggle");
const themeIcon = document.querySelector("#theme-icon");
const themeLabel = document.querySelector("#theme-label");
const themeColor = document.querySelector('meta[name="theme-color"]');
const fileInput = document.querySelector("#video-file");
const fileLabel = document.querySelector("#file-label");
const startButton = document.querySelector("#start-button");
const dropzone = document.querySelector("#dropzone");
const progressPanel = document.querySelector("#progress-panel");
const progressStage = document.querySelector("#progress-stage");
const progressValue = document.querySelector("#progress-value");
const progressFill = document.querySelector("#progress-fill");
const progressNote = document.querySelector("#progress-note");
const results = document.querySelector("#results");
const videoPreview = document.querySelector("#video-preview");
const previewCaption = document.querySelector("#preview-caption");
const subtitleList = document.querySelector("#subtitle-list");
const detectedLanguage = document.querySelector("#detected-language");
const renderButton = document.querySelector("#render-button");
const downloadButton = document.querySelector("#download-button");
const dubbingStatus = document.querySelector("#dubbing-status");
const dubbingEnabled = document.querySelector("#dubbing-enabled");
const dubbingVoiceControl = document.querySelector("#dubbing-voice-control");
const dubbingVoiceSelect = document.querySelector("#dubbing-voice");
const errorMessage = document.querySelector("#error-message");
const subtitleFontSize = document.querySelector("#subtitle-font-size");
const subtitleFontSizeNumber = document.querySelector("#subtitle-font-size-number");
const subtitlePosition = document.querySelector("#subtitle-position");
const subtitlePositionNumber = document.querySelector("#subtitle-position-number");
const subtitleBackgroundOpacity = document.querySelector("#subtitle-background-opacity");
const subtitleBackgroundOpacityNumber = document.querySelector("#subtitle-background-opacity-number");
const subtitleTextColor = document.querySelector("#subtitle-text-color");
const subtitleTextColorValue = document.querySelector("#subtitle-text-color-value");
const subtitleBackgroundColor = document.querySelector("#subtitle-background-color");
const subtitleBackgroundColorValue = document.querySelector("#subtitle-background-color-value");

let jobId = null;
let jobTimer = null;
let showingOutputVideo = false;
let captionXPosition = 50;
let draggingPreviewCaption = false;
let installedLanguages = [];
let ollamaAvailable = false;
let ollamaStatusMessage = "Qwen3 is unavailable. Start Ollama and make sure its configured model is installed.";
const ALL_LANGUAGES = [
  ["English", "en"], ["Spanish", "es"], ["French", "fr"], ["German", "de"],
  ["Italian", "it"], ["Portuguese", "pt"], ["Russian", "ru"], ["Chinese", "zh"],
  ["Japanese", "ja"], ["Arabic", "ar"], ["Hindi", "hi"], ["Dutch", "nl"], ["Swedish", "sv"],
];
const themePreferenceKey = "lingua-theme";
const systemColorScheme = window.matchMedia("(prefers-color-scheme: dark)");
let themePreference = null;

try {
  const savedTheme = localStorage.getItem(themePreferenceKey);
  if (savedTheme === "light" || savedTheme === "dark") themePreference = savedTheme;
} catch (error) {
  console.warn("Theme preference could not be read", error);
}

function applyTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = theme;
  themeIcon.textContent = dark ? "☀" : "☾";
  themeLabel.textContent = dark ? "Light" : "Dark";
  themeToggle.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} mode`);
  themeToggle.title = `Switch to ${dark ? "light" : "dark"} mode`;
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

function colorWithOpacity(hex, opacity) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function getVideoContentRect() {
  const videoRect = videoPreview.getBoundingClientRect();
  if (!videoRect.width || !videoRect.height) return null;

  const sourceWidth = videoPreview.videoWidth || videoRect.width;
  const sourceHeight = videoPreview.videoHeight || videoRect.height;
  const scale = Math.min(videoRect.width / sourceWidth, videoRect.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    left: videoRect.left + (videoRect.width - width) / 2,
    top: videoRect.top + (videoRect.height - height) / 2,
    width,
    height,
  };
}

function updatePreviewCaptionLayout() {
  const contentRect = getVideoContentRect();
  if (!contentRect) return;

  const containerRect = videoPreview.parentElement.getBoundingClientRect();
  const fontSize = videoPreview.videoHeight
    ? Number(subtitleFontSize.value) * contentRect.height / 360
    : Number(subtitleFontSize.value);
  previewCaption.style.setProperty("--subtitle-font-size", `${fontSize}px`);
  previewCaption.style.maxWidth = `${contentRect.width * 0.86}px`;
  previewCaption.style.maxHeight = `${contentRect.height * 0.8}px`;
  previewCaption.style.left = `${
    contentRect.left - containerRect.left + contentRect.width * captionXPosition / 100
  }px`;
  previewCaption.style.top = `${
    contentRect.top - containerRect.top +
    contentRect.height * (100 - Number(subtitlePosition.value)) / 100
  }px`;
}

function updateSubtitleAppearance() {
  const fontSize = `${subtitleFontSize.value}px`;
  const textColor = subtitleTextColor.value;
  const backgroundColor = subtitleBackgroundColor.value;
  subtitleList.style.setProperty("--subtitle-font-size", fontSize);
  subtitleList.style.setProperty("--subtitle-text-color", textColor);
  previewCaption.style.setProperty("--subtitle-text-color", textColor);
  previewCaption.style.setProperty(
    "--subtitle-background-color",
    colorWithOpacity(backgroundColor, Number(subtitleBackgroundOpacity.value) / 100)
  );
  subtitleList.style.setProperty(
    "--subtitle-background-color",
    colorWithOpacity(backgroundColor, Number(subtitleBackgroundOpacity.value) / 100)
  );
  subtitlePositionNumber.value = subtitlePosition.value;
  subtitleBackgroundOpacityNumber.value = subtitleBackgroundOpacity.value;
  subtitleTextColorValue.value = textColor.toUpperCase();
  subtitleBackgroundColorValue.value = backgroundColor.toUpperCase();
  updatePreviewCaptionLayout();
}

function setSubtitleFontSize(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return false;
  const fontSize = Math.max(12, Math.min(36, numeric));
  subtitleFontSize.value = String(fontSize);
  subtitleFontSizeNumber.value = String(fontSize);
  updateSubtitleAppearance();
  return true;
}

subtitleFontSize.addEventListener("input", () => {
  setSubtitleFontSize(subtitleFontSize.value);
});
subtitleFontSizeNumber.addEventListener("input", () => {
  setSubtitleFontSize(subtitleFontSizeNumber.value);
});
subtitleFontSizeNumber.addEventListener("change", () => {
  if (!setSubtitleFontSize(subtitleFontSizeNumber.value)) {
    subtitleFontSizeNumber.value = subtitleFontSize.value;
  }
});
function setSubtitlePosition(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return false;
  const position = Math.max(6, Math.min(94, numeric));
  subtitlePosition.value = String(position);
  subtitlePositionNumber.value = String(position);
  updateSubtitleAppearance();
  return true;
}

function setBackgroundOpacity(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric)) return false;
  const opacity = Math.max(0, Math.min(100, numeric));
  subtitleBackgroundOpacity.value = String(opacity);
  subtitleBackgroundOpacityNumber.value = String(opacity);
  updateSubtitleAppearance();
  return true;
}

subtitlePosition.addEventListener("input", () => setSubtitlePosition(subtitlePosition.value));
subtitlePositionNumber.addEventListener("input", () => setSubtitlePosition(subtitlePositionNumber.value));
subtitlePositionNumber.addEventListener("change", () => {
  if (!setSubtitlePosition(subtitlePositionNumber.value)) {
    subtitlePositionNumber.value = subtitlePosition.value;
  }
});
document.querySelector("#font-size-up").addEventListener("click", () => setSubtitleFontSize(Number(subtitleFontSize.value) + 1));
document.querySelector("#font-size-down").addEventListener("click", () => setSubtitleFontSize(Number(subtitleFontSize.value) - 1));
document.querySelector("#position-up").addEventListener("click", () => setSubtitlePosition(Number(subtitlePosition.value) + 1));
document.querySelector("#position-down").addEventListener("click", () => setSubtitlePosition(Number(subtitlePosition.value) - 1));
subtitleBackgroundOpacity.addEventListener("input", () => setBackgroundOpacity(subtitleBackgroundOpacity.value));
subtitleBackgroundOpacityNumber.addEventListener("input", () => setBackgroundOpacity(subtitleBackgroundOpacityNumber.value));
subtitleBackgroundOpacityNumber.addEventListener("change", () => {
  if (!setBackgroundOpacity(subtitleBackgroundOpacityNumber.value)) {
    subtitleBackgroundOpacityNumber.value = subtitleBackgroundOpacity.value;
  }
});
subtitleTextColor.addEventListener("input", updateSubtitleAppearance);
subtitleBackgroundColor.addEventListener("input", updateSubtitleAppearance);
updateSubtitleAppearance();

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove("hidden");
}

function clearError() {
  errorMessage.textContent = "";
  errorMessage.classList.add("hidden");
}

function updateStartButton() {
  const isQwen = translationEngineSelect.value === "ollama";
  startButton.disabled =
    !fileInput.files.length ||
    !targetSelect.value ||
    (isQwen && !ollamaAvailable) ||
    (!!sourceSelect.value && sourceSelect.value === targetSelect.value);
}

function updateRenderButton() {
  renderButton.disabled = dubbingEnabled.checked && !dubbingVoiceSelect.value;
}

async function loadDubbingVoices() {
  dubbingVoiceSelect.disabled = true;
  dubbingVoiceSelect.replaceChildren(new Option("Loading installed voices…", ""));
  dubbingStatus.textContent = "";
  try {
    const response = await fetch(`/api/voices?language=${encodeURIComponent(targetSelect.value)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load installed voices.");
    dubbingVoiceSelect.replaceChildren();
    dubbingVoiceSelect.add(new Option("Automática (voz similar a la original)", "auto"));
    for (const voice of data.voices) {
      const gender = voice.gender && voice.gender !== "Voice" ? `, ${voice.gender}` : "";
      dubbingVoiceSelect.add(
        new Option(`${voice.name} (${voice.language}${gender})`, voice.id)
      );
    }
    if (!data.voices.length) {
      dubbingVoiceSelect.add(new Option("No voice installed for this language", ""));
      dubbingStatus.textContent = "Install a matching Windows voice to use dubbing.";
    } else {
      dubbingVoiceSelect.disabled = false;
      dubbingStatus.textContent = "Dubbing is optional; subtitles stay on with either choice.";
    }
    updateRenderButton();
  } catch (error) {
    dubbingVoiceSelect.replaceChildren(new Option("Voice list unavailable", ""));
    dubbingStatus.textContent = error.message;
    updateRenderButton();
  }
}

function updateDubbingOptions() {
  const enabled = dubbingEnabled.checked;
  dubbingVoiceControl.classList.toggle("hidden", !enabled);
  if (enabled) {
    loadDubbingVoices();
  } else {
    dubbingVoiceSelect.replaceChildren(new Option("Dubbing is off", ""));
    dubbingVoiceSelect.disabled = true;
    dubbingStatus.textContent = "";
    updateRenderButton();
  }
}

async function loadLanguages() {
  try {
    const response = await fetch("/api/languages");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load local language models.");
    installedLanguages = data.languages.sort((a, b) => a.name.localeCompare(b.name));
    populateLanguageOptions();
  } catch (error) {
    languageMessage.textContent = `Could not load translation languages: ${error.message}`;
  }
}

function populateLanguageOptions() {
  const previousSource = sourceSelect.value;
  const previousTarget = targetSelect.value;
  const isQwen = translationEngineSelect.value === "ollama";
  const isGoogle = translationEngineSelect.value === "google";
  sourceSelect.replaceChildren();
  targetSelect.replaceChildren();

  if (isQwen || isGoogle) {
    const engineName = isQwen ? "Qwen3 (Ollama)" : "Google Translate";
    engineFooter.textContent = "Speech recognition: Whisper · Translation: " + engineName;
    sourceSelect.add(new Option("Auto-detect", ""));
    for (const [name, code] of ALL_LANGUAGES) {
      sourceSelect.add(new Option(name, code));
      targetSelect.add(new Option(name, code));
    }
    sourceSelect.value = ALL_LANGUAGES.some(([, code]) => code === previousSource) ? previousSource : "";
    targetSelect.value = ALL_LANGUAGES.some(([, code]) => code === previousTarget) && previousTarget !== sourceSelect.value
      ? previousTarget
      : previousSource === "en" ? "es" : "en";
    sourceSelect.disabled = false;
    targetSelect.disabled = false;
    engineMessage.textContent = isQwen
      ? (ollamaAvailable
          ? "Qwen3 translates the 13 languages using Ollama on this computer. Only subtitle text is sent to the local model; video and audio stay here."
          : ollamaStatusMessage)
      : "Google Translate needs an internet connection. Only subtitle text is sent; the video and audio stay on this computer.";
    languageMessage.textContent = "Choose the spoken language explicitly or leave Auto-detect.";
  } else {
    engineFooter.textContent = "Speech recognition: Whisper · Translation: Argos Translate";
    sourceSelect.add(new Option("Auto-detect", ""));
    if (!installedLanguages.length) {
      targetSelect.add(new Option("No translation models installed", ""));
      sourceSelect.disabled = true;
      targetSelect.disabled = true;
      languageMessage.textContent =
        "No local translation models installed. From the project folder run: python install_translation_model.py en es";
    } else {
      for (const language of installedLanguages) {
        sourceSelect.add(new Option(language.name, language.code));
        targetSelect.add(new Option(language.name, language.code));
      }
      sourceSelect.value = installedLanguages.some((language) => language.code === previousSource)
        ? previousSource
        : "";
      targetSelect.value = installedLanguages.some((language) => language.code === previousTarget)
        ? previousTarget
        : installedLanguages.find((language) => language.code === "en")?.code || installedLanguages[0].code;
      sourceSelect.disabled = false;
      targetSelect.disabled = false;
      languageMessage.textContent = "Only languages with models installed on this computer are available.";
    }
    engineMessage.textContent = "Argos Translate runs locally and uses installed language models (13 languages).";
  }
  updateStartButton();
}

async function updateTranslationEngine() {
  ollamaAvailable = false;
  ollamaStatusMessage = "Checking Ollama and the configured Qwen3 model…";
  populateLanguageOptions();
  if (translationEngineSelect.value !== "ollama") return;

  updateStartButton();
  try {
    const response = await fetch("/api/ollama/status");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not connect to Ollama.");
    ollamaAvailable = Boolean(data.available);
    if (!ollamaAvailable) {
      ollamaStatusMessage =
        data.message || `The configured model ${data.model || "Qwen3"} is not installed.`;
      languageMessage.textContent = "Start Ollama and install the configured model to use this engine.";
    }
  } catch (error) {
    ollamaStatusMessage =
      error instanceof Error ? error.message : "Could not check the Qwen3 model.";
    languageMessage.textContent = "Qwen3 is available only while Ollama is running on this computer.";
  }
  populateLanguageOptions();
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  fileLabel.textContent = file ? file.name : "Drop a video here or browse files";
  results.classList.add("hidden");
  progressPanel.classList.add("hidden");
  downloadButton.classList.add("hidden");
  renderButton.classList.remove("hidden");
  jobId = null;
  videoPreview.pause();
  videoPreview.removeAttribute("src");
  videoPreview.load();
  previewCaption.textContent = "";
  previewCaption.classList.add("hidden");
  captionXPosition = 50;
  updateStartButton();
});

for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragging");
  });
}
dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files[0];
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  fileInput.dispatchEvent(new Event("change"));
});

targetSelect.addEventListener("change", () => {
  updateStartButton();
  if (dubbingEnabled.checked) loadDubbingVoices();
});
sourceSelect.addEventListener("change", updateStartButton);
translationEngineSelect.addEventListener("change", updateTranslationEngine);
dubbingEnabled.addEventListener("change", updateDubbingOptions);
dubbingVoiceSelect.addEventListener("change", updateRenderButton);

function renderSubtitles(segments) {
  window.currentSegments = segments;
  subtitleList.replaceChildren();
  for (const [index, segment] of segments.entries()) {
    const row = document.createElement("article");
    row.className = "subtitle-row";
    const number = document.createElement("span");
    number.className = "subtitle-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const times = document.createElement("span");
    times.className = "subtitle-time";
    times.textContent = `${formatTime(segment.start)} – ${formatTime(segment.end)}`;
    const source = document.createElement("p");
    source.className = "source-text";
    source.textContent = segment.source;
    const translated = document.createElement("textarea");
    translated.className = "translated-text";
    translated.rows = Math.max(1, Math.min(4, Math.ceil(segment.text.length / 58)));
    translated.value = segment.text;
    translated.setAttribute("aria-label", `Translated subtitle ${index + 1}`);
    translated.addEventListener("input", updatePreviewCaption);
    row.append(number, times, source, translated);
    subtitleList.append(row);
  }
  updatePreviewCaption();
}

function updatePreviewCaption() {
  if (showingOutputVideo) {
    previewCaption.classList.add("hidden");
    return;
  }
  const segments = window.currentSegments || [];
  const currentTime = videoPreview.currentTime;
  const index = segments.findIndex(
    (segment) => currentTime >= segment.start && currentTime <= segment.end
  );
  if (index < 0) {
    previewCaption.textContent = "";
    previewCaption.classList.add("hidden");
    updatePreviewCaptionLayout();
    return;
  }
  const row = subtitleList.children[index];
  const translated = row ? row.querySelector(".translated-text") : null;
  previewCaption.textContent = translated ? translated.value : segments[index].text;
  previewCaption.classList.toggle("hidden", !previewCaption.textContent);
  updatePreviewCaptionLayout();
}

videoPreview.addEventListener("timeupdate", updatePreviewCaption);
videoPreview.addEventListener("loadedmetadata", () => {
  updatePreviewCaptionLayout();
  updatePreviewCaption();
});
videoPreview.addEventListener("seeked", updatePreviewCaption);
window.addEventListener("resize", updatePreviewCaptionLayout);

function movePreviewCaption(event) {
  const contentRect = getVideoContentRect();
  if (!contentRect) return;

  const captionRect = previewCaption.getBoundingClientRect();
  const halfWidthPercent = Math.min(48, captionRect.width / contentRect.width * 50);
  const halfHeightPercent = Math.min(48, captionRect.height / contentRect.height * 50);
  const x = Math.max(
    halfWidthPercent,
    Math.min(
      100 - halfWidthPercent,
      (event.clientX - contentRect.left) / contentRect.width * 100
    )
  );
  const y = Math.max(
    halfHeightPercent,
    Math.min(
      100 - halfHeightPercent,
      (event.clientY - contentRect.top) / contentRect.height * 100
    )
  );
  captionXPosition = Math.round(x);
  subtitlePosition.value = String(
    Math.max(6, Math.min(94, Math.round(100 - y)))
  );
  updateSubtitleAppearance();
}

previewCaption.addEventListener("pointerdown", (event) => {
  if (showingOutputVideo || previewCaption.classList.contains("hidden")) return;
  draggingPreviewCaption = true;
  previewCaption.setPointerCapture(event.pointerId);
  previewCaption.classList.add("dragging");
  event.preventDefault();
});
previewCaption.addEventListener("pointermove", (event) => {
  if (draggingPreviewCaption) movePreviewCaption(event);
});
function stopDraggingPreviewCaption() {
  draggingPreviewCaption = false;
  previewCaption.classList.remove("dragging");
}
previewCaption.addEventListener("pointerup", stopDraggingPreviewCaption);
previewCaption.addEventListener("pointercancel", stopDraggingPreviewCaption);

function formatTime(seconds) {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function pollJob() {
  clearInterval(jobTimer);
  jobTimer = setInterval(async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`);
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || "Could not check the translation status.");
      progressStage.textContent = job.stage;
      progressValue.textContent = `${job.progress}%`;
      progressFill.style.width = `${job.progress}%`;
      if (job.status === "complete") {
        clearInterval(jobTimer);
        progressNote.textContent = "Review the subtitles, then create the downloadable video.";
        detectedLanguage.textContent = `Detected: ${job.source_language}`;
        renderSubtitles(job.segments);
        showingOutputVideo = false;
        videoPreview.src = `/api/jobs/${jobId}/video`;
        videoPreview.load();
        updateRenderButton();
        results.classList.remove("hidden");
        results.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (job.status === "error") {
        clearInterval(jobTimer);
        showError(job.error || "Translation failed.");
        startButton.disabled = false;
      }
    } catch (error) {
      clearInterval(jobTimer);
      showError(error.message);
      startButton.disabled = false;
    }
  }, 1000);
}

startButton.addEventListener("click", async () => {
  clearError();
  results.classList.add("hidden");
  downloadButton.classList.add("hidden");
  renderButton.classList.remove("hidden");
  showingOutputVideo = false;
  previewCaption.textContent = "";
  previewCaption.classList.add("hidden");
  videoPreview.pause();
  videoPreview.removeAttribute("src");
  videoPreview.load();
  progressPanel.classList.remove("hidden");
  progressStage.textContent = "Uploading video…";
  progressValue.textContent = "0%";
  progressFill.style.width = "0%";
  progressNote.textContent = "Speech recognition runs locally and can take a while for longer videos.";
  startButton.disabled = true;

  const form = new FormData();
  form.append("video", fileInput.files[0]);
  form.append("source_language", sourceSelect.value);
  form.append("target_language", targetSelect.value);
  form.append("translation_engine", translationEngineSelect.value);
  try {
    const response = await fetch("/api/jobs", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not start translation.");
    jobId = data.job_id;
    pollJob();
  } catch (error) {
    showError(error.message);
    startButton.disabled = false;
  }
});

function editedSegments() {
  return [...subtitleList.querySelectorAll(".subtitle-row")].map((row, index) => {
    const segment = window.currentSegments[index];
    return {
      start: segment.start,
      end: segment.end,
      text: row.querySelector(".translated-text").value,
    };
  });
}

function pollRender() {
  clearInterval(jobTimer);
  jobTimer = setInterval(async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`);
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || "Could not check the video render status.");
      progressStage.textContent = job.stage;
      progressValue.textContent = `${job.progress}%`;
      progressFill.style.width = `${job.progress}%`;
      if (job.status === "render_complete") {
        clearInterval(jobTimer);
        progressNote.textContent = "Preview the finished video, then save it to your device.";
        videoPreview.pause();
        videoPreview.src = `/api/jobs/${jobId}/output?cache=${Date.now()}`;
        videoPreview.load();
        showingOutputVideo = true;
        previewCaption.textContent = "";
        previewCaption.classList.add("hidden");
        renderButton.classList.add("hidden");
        downloadButton.href = `/api/jobs/${jobId}/download`;
        downloadButton.classList.remove("hidden");
      } else if (job.status === "render_error") {
        clearInterval(jobTimer);
        showError(job.error || "Could not render the translated video.");
        renderButton.disabled = false;
      }
    } catch (error) {
      clearInterval(jobTimer);
      showError(error.message);
      renderButton.disabled = false;
    }
  }, 1000);
}

renderButton.addEventListener("click", async () => {
  clearError();
  renderButton.disabled = true;
  downloadButton.classList.add("hidden");
  progressPanel.classList.remove("hidden");
  progressStage.textContent = "Preparing translated video…";
  progressValue.textContent = "0%";
  progressFill.style.width = "0%";
  progressNote.textContent = "Rendering can take a few minutes for longer videos.";
  try {
    const response = await fetch(`/api/jobs/${jobId}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        segments: editedSegments(),
        font_size: Number(subtitleFontSize.value),
        position: Number(subtitlePosition.value),
        x_position: captionXPosition,
        color: subtitleTextColor.value,
        background_color: subtitleBackgroundColor.value,
        background_opacity: Number(subtitleBackgroundOpacity.value),
        include_dubbing: dubbingEnabled.checked,
        voice_id: dubbingVoiceSelect.value,
      }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Could not start video rendering.");
    }
    pollRender();
  } catch (error) {
    showError(error.message);
    renderButton.disabled = false;
  }
});

loadLanguages();


downloadButton.addEventListener("click", async (event) => {
  if (typeof window.showSaveFilePicker !== "function") return;
  event.preventDefault();
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "lingua-translated.mp4",
      types: [{ description: "Video MP4", accept: { "video/mp4": [".mp4"] } }],
    });
    downloadButton.disabled = true;
    const response = await fetch(`/api/jobs/${jobId}/download`);
    if (!response.ok) throw new Error("No se pudo descargar el video.");
    const writable = await handle.createWritable();
    await writable.write(await response.blob());
    await writable.close();
  } catch (error) {
    if (error.name !== "AbortError") showError(error.message);
  } finally {
    downloadButton.disabled = false;
  }
});
