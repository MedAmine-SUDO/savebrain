import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Setup proxy (proxy/worker.js). Forks can point to their own with VITE_SETUP_PROXY.
const setupProxy = process.env.VITE_SETUP_PROXY || "https://savebrain-setup.medaminebenafia.workers.dev";

// Content-Security-Policy for the built site (GitHub Pages can't send headers, so it goes in a meta tag).
// Build only: the dev server needs inline scripts and a websocket for hot reload.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  `connect-src https://*.supabase.co wss://*.supabase.co ${setupProxy}`,
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
const cspMeta = (): Plugin => ({
  name: "csp-meta",
  apply: "build",
  transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: csp }, injectTo: "head-prepend" }],
});

// Relative base so the build works at https://<user>.github.io/<repo>/ and on any fork.
export default defineConfig({ base: "./", plugins: [react(), cspMeta()], define: { __SETUP_PROXY__: JSON.stringify(setupProxy) } });
