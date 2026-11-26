import { defineConfig } from "vite";

function offlinePrecacheManifest() {
  return {
    name: "offline-precache-manifest",
    apply: "build",
    generateBundle(_, bundle) {
      const assets = Object.keys(bundle).filter((fileName) => {
        const output = bundle[fileName];
        return output.type === "chunk" || /\.(css|js|mjs|wasm|svg|ico|woff2?)$/i.test(fileName);
      });
      this.emitFile({
        type: "asset",
        fileName: "precache-manifest.json",
        source: JSON.stringify(assets.map((fileName) => `/${fileName}`)),
      });
    },
  };
}

const ollamaProxy = {
  "/api/ollama": {
    target: "http://127.0.0.1:5000",
    changeOrigin: false,
  },
};

export default defineConfig({
  plugins: [offlinePrecacheManifest()],
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg"],
  },
  server: {
    proxy: ollamaProxy,
  },
  preview: {
    proxy: ollamaProxy,
  },
});
