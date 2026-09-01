import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [react(), tsconfigPaths()],
	resolve: {
		alias: {
			"server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
		},
	},
	test: {
		environment: "jsdom",
		globals: true,
	},
});
