import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: backendUrl,
        changeOrigin: true,
      },
      "/gateway": {
        target: backendUrl,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist/renderer",
  },
});
