import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  base: "/chatbot",
  build: {
    outDir: "public/dist",
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, "src/widget-entry.tsx"),
      name: "WooCommerceChatWidget",
      formats: ["iife"],
      fileName: () => "woocommerce-chat-widget.js",
    },
    rollupOptions: {
      output: {
        name: "WooCommerceChatWidget",
        assetFileNames: "woocommerce-chat-widget.[ext]",
        inlineDynamicImports: true,
        format: "iife",
      },
    },
    // For debugging: disable minification temporarily
    // Re-enable for production: minify: 'terser'
    minify: false,
    sourcemap: true,
  },
  define: {
    "process.env": JSON.stringify({}),
    "process.env.NODE_ENV": JSON.stringify("production"),
    global: "globalThis",
  },
});
