import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/yansir/",
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT || 3200),
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:3101",
        changeOrigin: true
      }
    }
  }
});
