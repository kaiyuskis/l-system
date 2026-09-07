import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.API_PORT || "3000"}`,
        changeOrigin: false,
        timeout: 610000,
        proxyTimeout: 610000,
      },
    },
  },
});
