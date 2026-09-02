import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Per-mode output naming.
//
// Previously this file called defineConfig() with a plain object, so it
// never received `mode` at all -- every build script in package.json
// (build:prod, build:shopify, build:wip, ...) produced byte-identical
// output settings (same outDir, same filename, same library name).
// Whichever mode was built LAST silently overwrote every earlier build's
// file on disk, with nothing in the filename to tell them apart. That's
// the direct cause of a Shopify storefront ending up served a
// "woocommerce-chat-widget.js" bundle (built with VITE_PLATFORM=woocommerce
// baked in) whenever a non-shopify build ran afterward -- which the backend
// now correctly rejects as a platform_mismatch.
//
// Each mode now gets its own filename, so no build can silently replace
// another's output. The default/production name is left unchanged so
// nothing downstream (theme block, WP enqueue) needs updating for the
// common case.
const WIDGET_NAMES: Record<string, string> = {
  shopify: "miraq-shopify",
};

export default defineConfig(({ mode }) => {
  const fileBase =
    WIDGET_NAMES[mode] ??
    (mode === "production"
      ? "woocommerce-chat-widget"
      : `woocommerce-chat-widget-${mode}`);
  const libraryName =
    mode === "shopify" ? "ShopifyChatWidget" : "WooCommerceChatWidget";

  return {
    plugins: [react()],
    base: "/chatbot",
    build: {
      outDir: "public/dist",
      emptyOutDir: true,
      lib: {
        entry: resolve(__dirname, "src/widget-entry.tsx"),
        name: libraryName,
        formats: ["iife"],
        fileName: () => `${fileBase}.js`,
      },
      rollupOptions: {
        output: {
          name: libraryName,
          assetFileNames: `${fileBase}.[ext]`,
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
  };
});
