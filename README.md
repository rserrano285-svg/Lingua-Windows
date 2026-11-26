# Lingua V1

Lingua is an open-source Windows desktop app for translating videos locally in the browser. It transcribes speech with [faster-whisper](https://github.com/SYSTRAN/faster-whisper), translates subtitles with **Google Translate**, **Argos Translate** or an optional local **Qwen3** model, and produces a downloadable MP4 with translated subtitles burned into the picture.

The default translation engine is **Google Translate** (best overall accuracy; requires internet). Only subtitle text is sent — the video and audio never leave the computer. **Argos Translate** works offline with installed language models, and **Qwen3** runs locally through Ollama.

Review the video preview and edit each subtitle before rendering. Text size, vertical position, horizontal position, text color, background color and background opacity are applied to the downloaded video. Dubbing is optional and off by default; when enabled, Lingua uses an installed Windows voice (or automatically picks a male/female voice matching the original speaker's pitch) and mixes it over the original audio at a lower volume.

Machine translation and generated voices are not guaranteed to be accurate. Review the transcript and every translated line before sharing or relying on the result.

The iPhone PWA is a **separate project** (`test-whisper` repository); it is not part of this desktop app.

## Requirements

- Python 3.10 or newer
- Internet access for Google Translate and for the initial Whisper/Argos model downloads
- Disk space for the speech model, translation models, and rendered videos
- Windows speech voices installed for optional dubbing
- Ollama with `qwen3:8b` only if you choose the Qwen3 engine

## Translation engines

| Engine | Needs internet? | Notes |
| --- | --- | --- |
| Google Translate (default) | Yes | Most accurate and natural subtitles; only the subtitle text is sent |
| Argos Translate | No | Offline; install the language models you need; more literal translations |
| Qwen3 (Ollama) | No | Runs on this computer; needs Ollama started and `ollama pull qwen3:8b` |

All three engines support 13 languages: English, Spanish, French, German, Italian, Portuguese, Russian, Chinese, Japanese, Arabic, Hindi, Dutch and Swedish. The source language can be auto-detected with Whisper.

To use Qwen3, install and start Ollama, pull the model, and select "Qwen3 · on this computer" in the app. Set `OLLAMA_MODEL` before starting Flask if your model has a different name.

## Run locally

From this directory, create and activate a virtual environment, then install the dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Install the Argos language pairs you need (only for the Argos engine). For English speech into Spanish:

```powershell
python install_translation_model.py en es
```

Then start the app:

```powershell
python app.py
```

Open http://127.0.0.1:5000. The app binds to the local computer only. Supported uploads are MP4, MKV, MOV, WEBM, AVI and M4V; the upload limit is 16 GB. Processing large videos takes longer and needs extra free disk space.

On Windows, double-click `start-lingua.ps1` (or the "Lingua Windows" desktop shortcut) to open the app without a visible console window. The server runs hidden with `pythonw.exe`; close the `pythonw.exe` process to stop it. Finished videos are downloaded through the browser to Downloads, or to the location you choose with **Save video (choose location)** in Chromium browsers.

## Speech model size

The default Whisper model is `small`, which balances speed and recognition quality on a CPU. For potentially better recognition with higher memory and processing requirements:

```powershell
$env:WHISPER_MODEL = "medium"
python app.py
```

## Privacy and limitations

- Uploaded videos and rendered copies are kept temporarily under `datos\jobs` and `datos\exports` inside this folder; remove them when you no longer need them. Nothing is uploaded except subtitle text when Google or Qwen3 is selected.
- Processing runs on the CPU and can take longer than the video duration.
- Source-language detection and automatic translations can make mistakes, especially with noisy audio, overlapping speakers, accents, names, and specialist terms.
- Subtitles are burned into the downloaded video and cannot be switched off in the player.
- Dubbing estimates the original speaker's pitch and picks a matching installed Windows voice; it does not clone the original voice.
- When dubbing is enabled, the generated voice is mixed over the original audio at a lower volume. Separate audio tracks are not exported.

## License

MIT
