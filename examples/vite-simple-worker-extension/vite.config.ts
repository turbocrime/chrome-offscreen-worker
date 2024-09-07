import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
	root: "src",
	define: {
		"globalThis.__DEV__": true,
	},
	build: {
		target: "modules",
		minify: false,
		outDir: "../dist",
		emptyOutDir: true,
	},
	plugins: [
		webExtension({
			additionalInputs: ["offscreen.html", "web-worker.worker.ts"],
		}),
	],
});
