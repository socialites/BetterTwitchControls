import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const readmePath = join(root, "README.md");
const controlsPath = join(root, "CONTROLS.md");

const START = "<!-- CONTROLS:START -->";
const END = "<!-- CONTROLS:END -->";

const readme = await readFile(readmePath, "utf8");
const controls = (await readFile(controlsPath, "utf8")).trimEnd();

const startIdx = readme.indexOf(START);
const endIdx = readme.indexOf(END);

if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
  throw new Error(
    `README.md must contain ${START} and ${END} markers (in that order).`,
  );
}

const before = readme.slice(0, startIdx + START.length);
const after = readme.slice(endIdx);

const nextReadme = `${before}\n\n${controls}\n\n${after}`;
await writeFile(readmePath, nextReadme, "utf8");

console.log("Synced CONTROLS.md into README.md");
