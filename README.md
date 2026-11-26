# Lingua V1
Lingua is an open-source web app for translating videos locally. It transcribes speech with [faster-whisper](https://github.com/SYSTRAN/faster-whisper), translates with [Argos Translate](https://github.com/argosopentech/argos-translate) or an optional local Ollama model, and creates a downloadable MP4 with translated subtitles burned into the picture. Video files are not sent to a cloud service.

Review the video preview and edit each subtitle before rendering. Enter a text size or use the slider, then drag the caption within the video to position it; text wrapping, position, color, and background are applied to the downloaded video. The desktop interface follows the mobile app's blue palette and supports light and dark themes. Dubbing is optional and off by default; when enabled, Lingua uses a matching voice installed on Windows and mixes the translated voice over the original audio at a lower volume.

Machine translation and generated voices are not guaranteed to be accurate. Review the transcript and every translated line before sharing or relying on the result.

## Requirements

- Python 3.10 or newer
- Internet access (required only for Google Translate; Whisper/Argos models are downloaded once)
- Disk space for the speech model, translation model packages, and rendered videos
- Windows installed speech voices for optional dubbing

The app downloads the Whisper speech model from Hugging Face the first time it is used. Video transcription, subtitle rendering, and optional dubbing run locally. Argos translation models are downloaded from the Argos catalog. You can optionally run Ollama with `qwen3:8b` on the same computer; only subtitle text is sent to that local model, never the video or audio.

To use Qwen3, install and start Ollama, then pull the model with `ollama pull qwen3:8b`. Select “Qwen3 · on this computer” in the app. This engine supports the same 13 languages as the mobile app (English, Spanish, French, German, Italian, Portuguese, Russian, Chinese, Japanese, Arabic, Hindi, Dutch and Swedish).

## Run locally

From this directory, create and activate a virtual environment, then install the dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Install the language pairs you need. For example, to translate English speech into Spanish:

```powershell
python install_translation_model.py en es
```

Then start the app:

```powershell
python app.py
```

Open http://127.0.0.1:5000. The app binds to the local computer only. Supported uploads are MP4, MKV, MOV, WEBM, AVI, and M4V; the upload limit is 16 GB. Processing large videos takes longer and needs extra free disk space for the translated output. Finished videos are saved as MP4 in `~/.video-translator/exports` and can be downloaded from the preview page.

On Windows, after setup you can also double-click `start-lingua.ps1` to open Lingua in your browser. The server window stays open while the app runs; close it to stop the server. A desktop shortcut can point to this script.

## iPhone prototype with local Qwen3

The experimental PWA in `mobile-pwa` can detect whether the audio is Spanish or English with Whisper, use the installed `qwen3:8b` model as an optional translation engine, retranslate manually corrected source lines, and correct individual translations using neighboring context. Transcription and video processing stay in the browser; when Qwen3 is selected, only subtitle text and context are sent over the local Wi-Fi network to Ollama on this laptop. The video and audio are not sent. The existing on-device translation remains the default and does not require the laptop. The PWA exposes text size, vertical position, text color, and background color before transcription, then previews translated lines on the video and burns the selected appearance into the MP4. Whisper works through 20-second audio chunks and reports progress per chunk.

To try Qwen3 from an iPhone, keep Ollama running and start Flask from this directory in one PowerShell window:

```powershell
.\.venv\Scripts\python.exe app.py
```

In a second PowerShell window, start the PWA:

```powershell
Set-Location mobile-pwa
npm run dev -- --host 0.0.0.0 --port 4173
```

Open `http://<laptop-ip>:4173` on the iPhone, with both devices on a trusted Wi-Fi network. The Vite proxy connects to Flask on `127.0.0.1:5000`; Flask and Ollama remain bound to the laptop. Do not expose their ports to the internet. This HTTP address is for local testing; iOS installation and direct file sharing require HTTPS. A browser cannot save silently to Photos: use the iPhone share sheet and choose “Save Video.” On HTTP, download to Files, open the MP4, then choose Share > Save Video. If the configured model is different, set `OLLAMA_MODEL` before starting Flask. The default is `qwen3:8b`.

The local HTTP test address is not available when the laptop is off or when the iPhone is away from that Wi-Fi. Using the PWA without the laptop requires a production deployment on an independent HTTPS host. Open that HTTPS app while online and complete one local transcription/translation so the browser can download the models; the production service worker caches the app files, but iOS may evict stored data. Test in airplane mode before relying on it. No hosting provider or deployment is configured by this repository.

## Speech model size

The default Whisper model is `small`, which balances speed and recognition quality on a CPU. For potentially better recognition with higher memory and processing requirements, set `WHISPER_MODEL=medium` before starting the app. Available model sizes are documented by faster-whisper. The first run downloads the selected model.

Windows PowerShell:

```powershell
$env:WHISPER_MODEL = "medium"
python app.py
```

## Privacy and limitations

- Uploaded video files are held locally and deleted after a successful render. Rendered videos stay in `~/.video-translator/exports` until you remove them.
- Processing runs on the CPU and can take longer than the video duration.
- Translation engines: Argos Translate (offline, 13 languages installed), Google Translate (needs internet, same 13 languages) and Qwen3 via Ollama (local, needs Ollama running). All three support: English, Spanish, French, German, Italian, Portuguese, Russian, Chinese, Japanese, Arabic, Hindi, Dutch and Swedish.
- Source-language detection and automatic translations can make mistakes, especially with noisy audio, overlapping speakers, accents, names, and specialist terms.
- Subtitles are burned into the downloaded video and cannot be switched off in the video player. Lingua no longer exports SRT files.
- Dubbing uses installed Windows voices. Choose a specific voice or "Automática (voz similar a la original)", which estimates the original speaker pitch and picks a matching male/female voice in the target language. It does not clone the original voice.
- When dubbing is enabled, the generated voice is mixed over the original audio, whose volume is reduced. It does not preserve separate selectable audio tracks.

## License

MIT
