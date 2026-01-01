import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const outDir = join(root, "extension");
const outDistDir = join(outDir, "dist");

const pkg = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);

const manifest = {
  manifest_version: 3,
  name: "BetterTwitchControls",
  version: String(pkg.version || "1.0.0"),
  description: "Keyboard shortcuts for Twitch chat/player focus and controls.",
  content_scripts: [
    {
      matches: ["*://*.twitch.tv/*", "*://twitch.tv/*"],
      js: ["dist/index.js"],
      run_at: "document_idle",
    },
  ],
};

await mkdir(outDistDir, { recursive: true });
await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
await copyFile(join(root, "dist", "index.js"), join(outDistDir, "index.js"));

console.log("Prepared extension/ (load this folder via chrome://extensions → Load unpacked)");
