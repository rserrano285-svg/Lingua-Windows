import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import app


class UploadLimitTests(unittest.TestCase):
    def test_rejects_uploads_over_sixteen_gb(self):
        app.app.config["TESTING"] = True
        client = app.app.test_client()
        response = client.post(
            "/api/jobs",
            data=b"",
            content_type="multipart/form-data",
            environ_overrides={
                "CONTENT_LENGTH": str(16 * 1024 * 1024 * 1024 + 1),
            },
        )
        self.assertEqual(response.status_code, 413)
        self.assertIn("16 GB", response.get_json()["error"])


class OllamaTranslationTests(unittest.TestCase):
    def setUp(self):
        app.app.config["TESTING"] = True
        self.client = app.app.test_client()

    @patch("app._ollama_request", return_value={"models": [{"name": "qwen3:8b"}]})
    def test_status_reports_configured_model(self, ollama_request):
        response = self.client.get("/api/ollama/status")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["available"])
        ollama_request.assert_called_once_with("/api/tags")

    @patch("app._ollama_request", return_value={"models": [{"name": "llama3.2:latest"}]})
    def test_status_reports_when_configured_model_is_missing(self, _ollama_request):
        response = self.client.get("/api/ollama/status")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.get_json()["available"])

    @patch("app._ollama_request")
    def test_translation_keeps_each_line_in_order(self, ollama_request):
        ollama_request.return_value = {
            "message": {
                "content": json.dumps({"translations": ["Hola.", "¿Qué tal?"]}),
            }
        }
        response = self.client.post(
            "/api/ollama/translate",
            json={
                "source_language": "en",
                "target_language": "es",
                "texts": ["Hello.", "How are you?"],
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["translations"], ["Hola.", "¿Qué tal?"])
        ollama_request.assert_called_once()

    @patch("app._ollama_request")
    def test_correction_uses_adjacent_context(self, ollama_request):
        ollama_request.return_value = {
            "message": {
                "content": json.dumps({"translation": "They treated her like a daughter."}),
            }
        }
        response = self.client.post(
            "/api/ollama/correct",
            json={
                "source_language": "es",
                "target_language": "en",
                "source_text": "La cuidaba mucho.",
                "current_translation": "She cared for her as a daughter.",
                "previous_source": "Era su vecina.",
                "next_source": "Pero no eran familia.",
                "previous_translation": "She was her neighbor.",
                "next_translation": "But they were not family.",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["translation"],
            "They treated her like a daughter.",
        )
        prompt = ollama_request.call_args.args[1]["messages"][1]["content"]
        self.assertIn("Pero no eran familia.", prompt)
        self.assertIn("She cared for her as a daughter.", prompt)

    @patch("app._ollama_request")
    def test_rejects_empty_correction_source(self, ollama_request):
        response = self.client.post(
            "/api/ollama/correct",
            json={
                "source_language": "es",
                "target_language": "en",
                "source_text": " ",
                "current_translation": "Hello.",
            },
        )
        self.assertEqual(response.status_code, 400)
        ollama_request.assert_not_called()

    @patch("app._ollama_request")
    def test_rejects_non_string_correction_language(self, ollama_request):
        response = self.client.post(
            "/api/ollama/correct",
            json={
                "source_language": ["es"],
                "target_language": "en",
                "source_text": "Hola.",
                "current_translation": "Hello.",
            },
        )
        self.assertEqual(response.status_code, 400)
        ollama_request.assert_not_called()

    @patch("app._ollama_request", return_value={"message": {"content": '{"translation":""}'}})
    def test_rejects_empty_correction_result(self, _ollama_request):
        response = self.client.post(
            "/api/ollama/correct",
            json={
                "source_language": "es",
                "target_language": "en",
                "source_text": "Hola.",
                "current_translation": "Hello.",
            },
        )
        self.assertEqual(response.status_code, 503)
        self.assertIn("corrección válida", response.get_json()["error"])

    def test_create_job_rejects_unknown_translation_engine(self):
        response = self.client.post(
            "/api/jobs",
            data={"translation_engine": "unknown"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("translation engine", response.get_json()["error"])

    def test_create_job_starts_with_selected_qwen_engine(self):
        with tempfile.TemporaryDirectory() as directory:
            jobs_dir = Path(directory) / "jobs"
            jobs_dir.mkdir()
            exports_dir = Path(directory) / "exports"
            job_id = None
            try:
                with patch.object(app, "JOBS_DIR", jobs_dir), patch.object(
                    app, "EXPORT_DIR", exports_dir
                ), patch("app.threading.Thread") as thread_class:
                    response = self.client.post(
                        "/api/jobs",
                        data={
                            "video": (BytesIO(b"video"), "clip.mp4"),
                            "source_language": "es",
                            "target_language": "en",
                            "translation_engine": "ollama",
                        },
                        content_type="multipart/form-data",
                    )
                    self.assertEqual(response.status_code, 202)
                    job_id = response.get_json()["job_id"]
                    self.assertEqual(app._find_job(job_id)["translation_engine"], "ollama")
                    self.assertEqual(thread_class.call_args.kwargs["args"][-1], "ollama")
            finally:
                if job_id:
                    with app._jobs_lock:
                        app._jobs.pop(job_id, None)

    def test_create_job_defaults_to_argos_translation(self):
        with tempfile.TemporaryDirectory() as directory:
            jobs_dir = Path(directory) / "jobs"
            jobs_dir.mkdir()
            exports_dir = Path(directory) / "exports"
            job_id = None
            try:
                with patch.object(app, "JOBS_DIR", jobs_dir), patch.object(
                    app, "EXPORT_DIR", exports_dir
                ), patch("app.threading.Thread") as thread_class:
                    response = self.client.post(
                        "/api/jobs",
                        data={
                            "video": (BytesIO(b"video"), "clip.mp4"),
                            "target_language": "en",
                        },
                        content_type="multipart/form-data",
                    )
                    self.assertEqual(response.status_code, 202)
                    job_id = response.get_json()["job_id"]
                    self.assertEqual(app._find_job(job_id)["translation_engine"], "argos")
                    self.assertEqual(thread_class.call_args.kwargs["args"][-1], "argos")
            finally:
                if job_id:
                    with app._jobs_lock:
                        app._jobs.pop(job_id, None)

    @patch("app._ollama_request")
    def test_rejects_more_than_ten_lines(self, ollama_request):
        response = self.client.post(
            "/api/ollama/translate",
            json={
                "source_language": "en",
                "target_language": "es",
                "texts": ["line"] * 11,
            },
        )
        self.assertEqual(response.status_code, 400)
        ollama_request.assert_not_called()

    @patch("app._ollama_request", return_value={"message": {"content": '{"translations":["Hola"]}'}})
    def test_rejects_misaligned_translation_count(self, _ollama_request):
        response = self.client.post(
            "/api/ollama/translate",
            json={
                "source_language": "en",
                "target_language": "es",
                "texts": ["Hello.", "How are you?"],
            },
        )
        self.assertEqual(response.status_code, 503)
        self.assertIn("cada línea", response.get_json()["error"])


class VideoTranslationEngineTests(unittest.TestCase):
    def test_video_job_uses_qwen_for_subtitle_batches(self):
        job_id = "qwen-translation-test"
        with tempfile.TemporaryDirectory() as directory:
            video_path = Path(directory) / "source.mp4"
            video_path.write_bytes(b"video")
            segments = [
                SimpleNamespace(start=float(index), end=float(index + 1), text=f"Hola {index}")
                for index in range(11)
            ]
            model = SimpleNamespace(
                transcribe=lambda *_args, **_kwargs: (
                    iter(segments),
                    SimpleNamespace(language="es", duration=11.0),
                )
            )
            with app._jobs_lock:
                app._jobs[job_id] = {"translation_engine": "ollama"}
            try:
                with patch("app._get_model", return_value=model), patch(
                    "app._ollama_translate",
                    side_effect=[
                        [f"Hello {index}" for index in range(10)],
                        ["Hello 10"],
                    ],
                ) as ollama_translate:
                    app._process_video(job_id, video_path, "es", "en", "ollama")

                job = app._find_job(job_id)
                self.assertEqual(job["status"], "complete")
                self.assertEqual(job["segments"][10]["text"], "Hello 10")
                self.assertEqual(ollama_translate.call_count, 2)
                ollama_translate.assert_any_call(
                    [f"Hola {index}" for index in range(10)],
                    "es",
                    "en",
                )
            finally:
                with app._jobs_lock:
                    app._jobs.pop(job_id, None)


class VideoRenderTests(unittest.TestCase):
    def setUp(self):
        app.app.config["TESTING"] = True
        self.client = app.app.test_client()
        self.job_id = "render-test"
        self.temp_dir = tempfile.TemporaryDirectory()
        self.video_path = Path(self.temp_dir.name) / "source.mp4"
        self.output_path = Path(self.temp_dir.name) / "translated.mp4"
        self.video_path.write_bytes(b"video")
        with app._jobs_lock:
            app._jobs[self.job_id] = {
                "status": "complete",
                "target_language": "en",
                "duration": 3.0,
                "segments": [
                    {
                        "start": 1.25,
                        "end": 2.5,
                        "source": "Hello",
                        "text": "Hello",
                    }
                ],
                "_video_path": self.video_path,
                "_output_path": self.output_path,
            }

    def tearDown(self):
        with app._jobs_lock:
            app._jobs.pop(self.job_id, None)
        self.temp_dir.cleanup()

    def test_ass_file_embeds_edited_lines_with_selected_color_and_size(self):
        subtitle_path = Path(self.temp_dir.name) / "translated.ass"
        app._write_ass(
            subtitle_path,
            [{"start": 1.25, "end": 2.5, "text": "Hola\nmundo"}],
            1920,
            1080,
            16,
            18,
            "#12AB34",
            "#000000",
        )
        contents = subtitle_path.read_text(encoding="utf-8")
        self.assertIn("Style: Default,Arial,48,&H0034AB12", contents)
        self.assertIn("&H47000000", contents)
        self.assertIn("WrapStyle: 0", contents)
        self.assertIn(",3,19,0,5,134,134,0,1", contents)
        self.assertIn(
            r"Dialogue: 0,0:00:01.25,0:00:02.50,Default,,0,0,0,,{\pos(960,886)}",
            contents,
        )
        self.assertIn(r"Hola\Nmundo", contents)

    def test_rejects_invalid_subtitle_color(self):
        with self.assertRaisesRegex(ValueError, "valid subtitle text color"):
            app._validate_render_request(
                {"segments": [{"text": "Hola"}], "color": "red"},
                app._jobs[self.job_id],
            )

    def test_rejects_invalid_subtitle_background_color(self):
        with self.assertRaisesRegex(ValueError, "valid subtitle background color"):
            app._validate_render_request(
                {
                    "segments": [{"text": "Hola"}],
                    "background_color": "transparent",
                },
                app._jobs[self.job_id],
            )

    def test_rejects_subtitle_position_outside_the_video_range(self):
        with self.assertRaisesRegex(ValueError, "between 6 and 94 percent"):
            app._validate_render_request(
                {"segments": [{"text": "Hola"}], "position": 95},
                app._jobs[self.job_id],
            )

    def test_rejects_horizontal_subtitle_position_outside_the_video_range(self):
        with self.assertRaisesRegex(ValueError, "between 5 and 95 percent"):
            app._validate_render_request(
                {"segments": [{"text": "Hola"}], "x_position": 96},
                app._jobs[self.job_id],
            )

    def test_video_preview_streams_uploaded_file(self):
        response = self.client.get(f"/api/jobs/{self.job_id}/video")
        try:
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data, b"video")
        finally:
            response.close()

    def test_refuses_render_before_translation_completes(self):
        with app._jobs_lock:
            app._jobs[self.job_id]["status"] = "processing"
        response = self.client.post(
            f"/api/jobs/{self.job_id}/render",
            json={"segments": [{"start": 1.25, "end": 2.5, "text": "Hola"}]},
        )
        self.assertEqual(response.status_code, 409)

    def test_srt_download_route_is_removed(self):
        response = self.client.post(f"/api/jobs/{self.job_id}/subtitles")
        self.assertEqual(response.status_code, 404)

    def test_starts_video_render_with_dubbing_off_by_default(self):
        payload = {
            "segments": [{"start": 1.25, "end": 2.5, "text": "Hola"}],
            "font_size": 16,
            "position": 18,
            "x_position": 25,
            "color": "#FFFFFF",
            "background_color": "#000000",
        }
        with patch("app.threading.Thread") as thread_class:
            response = self.client.post(
                f"/api/jobs/{self.job_id}/render",
                json=payload,
            )
        self.assertEqual(response.status_code, 202)
        thread_class.assert_called_once()
        args = thread_class.call_args.kwargs["args"]
        self.assertFalse(args[6])
        self.assertEqual(args[8], 25)

    def test_only_serves_the_rendered_video_after_it_is_ready(self):
        response = self.client.get(f"/api/jobs/{self.job_id}/download")
        self.assertEqual(response.status_code, 409)

        self.output_path.write_bytes(b"translated video")
        with app._jobs_lock:
            app._jobs[self.job_id]["status"] = "render_complete"
        response = self.client.get(f"/api/jobs/{self.job_id}/download")
        try:
            self.assertEqual(response.status_code, 200)
            self.assertIn("attachment", response.headers["Content-Disposition"])
            self.assertEqual(response.data, b"translated video")
        finally:
            response.close()


class TranslationChainTests(unittest.TestCase):
    def test_prefers_direct_translation(self):
        direct = SimpleNamespace(to_lang=SimpleNamespace(code="fr"))
        english = SimpleNamespace(to_lang=SimpleNamespace(code="en"))
        languages = [
            SimpleNamespace(code="es", translations_from=[direct, english]),
            SimpleNamespace(code="fr", translations_from=[]),
            SimpleNamespace(code="en", translations_from=[]),
        ]
        with patch(
            "argostranslate.translate.get_installed_languages",
            return_value=languages,
        ):
            self.assertEqual(app._get_translation_chain("es", "fr"), [direct])

    def test_uses_english_as_a_pivot_when_no_direct_translation_exists(self):
        spanish_to_english = SimpleNamespace(to_lang=SimpleNamespace(code="en"))
        english_to_french = SimpleNamespace(to_lang=SimpleNamespace(code="fr"))
        languages = [
            SimpleNamespace(code="es", translations_from=[spanish_to_english]),
            SimpleNamespace(code="en", translations_from=[english_to_french]),
            SimpleNamespace(code="fr", translations_from=[]),
        ]
        with patch(
            "argostranslate.translate.get_installed_languages",
            return_value=languages,
        ):
            self.assertEqual(
                app._get_translation_chain("es", "fr"),
                [spanish_to_english, english_to_french],
            )

    def test_returns_no_chain_when_languages_are_disconnected(self):
        languages = [
            SimpleNamespace(code="es", translations_from=[]),
            SimpleNamespace(code="fr", translations_from=[]),
        ]
        with patch(
            "argostranslate.translate.get_installed_languages",
            return_value=languages,
        ):
            self.assertIsNone(app._get_translation_chain("es", "fr"))


if __name__ == "__main__":
    unittest.main()
