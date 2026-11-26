export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
export const PILOT_FILE_BYTES = 100 * 1024 * 1024;
export const PILOT_DURATION_SECONDS = 480;

export function whisperLanguageCode(token) {
  const match = /^<\|([a-z]{2})\|>$/.exec(token || "");
  return match?.[1] || null;
}

export function validateVideo(file, durationSeconds) {
  if (!file) return "Selecciona un video primero.";
  if (!/\.(mp4|mov)$/i.test(file.name)) {
    return "La prueba acepta videos MP4 y MOV.";
  }
  if (file.size === 0) return "El archivo está vacío.";
  if (file.size > MAX_FILE_BYTES) return "El límite final será 2 GB por archivo.";
  if (file.size > PILOT_FILE_BYTES) {
    return "La prueba actual está limitada a 100 MB para evitar que el navegador se cierre.";
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return "No se pudo leer la duración del video.";
  }
  if (durationSeconds > PILOT_DURATION_SECONDS) {
    return "La prueba inicial acepta clips de hasta 8 minutos.";
  }
  return "";
}

export function formatSrtTime(seconds) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const wholeSeconds = Math.floor((milliseconds % 60_000) / 1000);
  const remainder = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")},${String(remainder).padStart(3, "0")}`;
}

export function makeAss(segments, width, height, style = {}) {
  const requestedFontSize = style.fontSize ?? 16;
  const position = style.position ?? 18;
  const color = style.color ?? "#ffffff";
  const backgroundColor = style.backgroundColor ?? "#000000";
  if (!Number.isInteger(requestedFontSize) || requestedFontSize < 12 || requestedFontSize > 36) {
    throw new Error("El tamaño de subtítulo debe estar entre 12 y 36 píxeles.");
  }
  if (!Number.isInteger(position) || position < 6 || position > 94) {
    throw new Error("La posición del subtítulo debe estar entre 6 y 94 por ciento.");
  }
  const textColor = assColor(color);
  const backColor = assColor(backgroundColor, "47");

  const fontSize = Math.max(20, Math.round(height * requestedFontSize / 360));
  const marginV = Math.round(height * position / 100);
  const lines = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,Arial,${fontSize},${textColor},&H000000FF,&H00000000,${backColor},1,0,0,0,100,100,0,0,3,2,0,2,${Math.round(width * 0.06)},${Math.round(width * 0.06)},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];

  for (const segment of segments) {
    const text = segment.text
      .replace(/\r/g, "")
      .replace(/\\/g, "\\\\")
      .replace(/{/g, "\\{")
      .replace(/}/g, "\\}")
      .replace(/\n/g, "\\N");
    if (!text) continue;
    lines.push(
      `Dialogue: 0,${assTime(segment.start)},${assTime(segment.end)},Default,,0,0,0,,${text}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function assColor(color, alpha = "00") {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) throw new Error("El color de subtítulo no es válido.");
  return `&H${alpha}${match[3]}${match[2]}${match[1]}`.toUpperCase();
}

export function makeSrt(segments) {
  return segments
    .map((segment, index) =>
      `${index + 1}\n${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}\n${segment.text.trim()}`
    )
    .join("\n\n");
}

function assTime(seconds) {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const wholeSeconds = Math.floor((centiseconds % 6000) / 100);
  const remainder = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(remainder).padStart(2, "0")}`;
}
