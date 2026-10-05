import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadEnvFile } from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const api = "https://chromewebstore.googleapis.com";
const help = `Chrome Web Store commands (Node 22):
  pnpm store:upload [--dry-run]       Build and upload the extension ZIP
  pnpm store:submit [--dry-run]       Submit for review; stage after approval
  pnpm store:submit --auto-publish    Submit and release automatically after approval
  pnpm store:status [--dry-run]       Fetch upload, review, and published status

Configure .env.store using .env.store.example, or export its variables.
--dry-run makes no network requests; upload still builds the local ZIP.`;

function required(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Missing ${key}. See .env.store.example and README.md.`);
  return value;
}

async function buildPackage() {
  const build = spawnSync("pnpm", ["run", "build:extension"], {
    cwd: root, stdio: "inherit",
  });
  if (build.error || build.status !== 0) {
    throw new Error("Extension build failed; nothing was uploaded.");
  }
  const manifest = JSON.parse(await readFile(join(root, "extension/manifest.json"), "utf8"));
  return {
    version: manifest.version,
    zip: await readFile(join(root, "BetterTwitchControls.zip")),
  };
}

// Dependencies are injectable so tests never contact Google or submit an item.
export async function runStoreCommand(args, {
  env = process.env, fetchImpl = fetch, log = console.log,
  preparePackage = buildPackage, wait = sleep,
} = {}) {
  if (args.includes("--help") || args.includes("-h")) {
    log(help);
    return;
  }
  const [command, ...flags] = args;
  if (!["upload", "submit", "status"].includes(command)) throw new Error(help);
  for (const flag of flags) {
    if (flag !== "--dry-run" && !(command === "submit" && flag === "--auto-publish")) {
      throw new Error(`Unknown option for ${command}: ${flag}`);
    }
  }
  const dryRun = flags.includes("--dry-run");
  const publishType = flags.includes("--auto-publish") ? "DEFAULT_PUBLISH" : "STAGED_PUBLISH";
  const publisher = encodeURIComponent(required(env, "CWS_PUBLISHER_ID"));
  const item = encodeURIComponent(required(env, "CWS_EXTENSION_ID"));
  const name = `publishers/${publisher}/items/${item}`;
  const statusURL = `${api}/v2/${name}:fetchStatus`;
  const secrets = [env.CWS_ACCESS_TOKEN, env.CWS_CLIENT_SECRET, env.CWS_REFRESH_TOKEN].map(value => value?.trim()).filter(Boolean);
  const redact = value => secrets.reduce((text, secret) => text.split(secret).join("[redacted]"), String(value));

  async function request(url, options, label) {
    let response;
    try {
      response = await fetchImpl(url, {
        ...options, redirect: "error", signal: AbortSignal.timeout(120000),
      });
    } catch {
      throw new Error(`${label} could not reach Google or timed out. Check connectivity and run store:status before retrying a mutation.`);
    }
    let data;
    try { data = await response.json(); }
    catch { throw new Error(`${label} returned invalid JSON (HTTP ${response.status}).`); }
    if (!response.ok || data.error) {
      const detail = data.error?.message || data.error_description || data.error || "Request failed";
      throw new Error(redact(`${label} failed (HTTP ${response.status}): ${detail}`));
    }
    return data;
  }

  let token;
  // Validate credentials before building, but do not obtain tokens during a dry run.
  if (!dryRun) {
    token = env.CWS_ACCESS_TOKEN?.trim();
    if (!token) {
      const credentials = new URLSearchParams({
        client_id: required(env, "CWS_CLIENT_ID"),
        client_secret: required(env, "CWS_CLIENT_SECRET"),
        refresh_token: required(env, "CWS_REFRESH_TOKEN"),
        grant_type: "refresh_token",
      });
      const auth = await request("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: credentials,
      }, "OAuth token refresh");
      if (!auth.access_token) throw new Error("OAuth token refresh returned no access token.");
      token = auth.access_token;
      secrets.push(token);
    }
  }
  const headers = { Authorization: `Bearer ${token}` };
  const fetchStatus = () => request(statusURL, { method: "GET", headers }, "Store status");
  const output = data => log(redact(JSON.stringify(data, null, 2)));

  if (command === "status") {
    if (dryRun) { log(`Dry run: GET ${statusURL}`); return; }
    const status = await fetchStatus();
    output(status);
    return status;
  }

  if (command === "submit") {
    const url = `${api}/v2/${name}:publish`;
    const body = { publishType, skipReview: false };
    if (dryRun) {
      log(`Dry run: check ${statusURL}, then POST ${url}`);
      output(body);
      return;
    }
    const status = await fetchStatus();
    const uploadState = status.lastAsyncUploadState;
    if (uploadState && !["SUCCEEDED", "UPLOAD_SUCCEEDED"].includes(uploadState)) {
      throw new Error(`Cannot submit: last upload state is ${uploadState}. Run store:status and check the dashboard.`);
    }
    const state = status.submittedItemRevisionStatus?.state;
    if (state === "PENDING_REVIEW" || state === "STAGED") {
      throw new Error(`Cannot submit: item is already ${state}. Publish an approved staged item from the dashboard.`);
    }
    const result = await request(url, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, "Review submission");
    if (!["PENDING_REVIEW", "STAGED", "PUBLISHED", "PUBLISHED_TO_TESTERS"].includes(result.state)) {
      throw new Error(`Submission did not succeed (state: ${result.state || "missing"}). Run store:status.`);
    }
    output(result);
    log(publishType === "STAGED_PUBLISH"
      ? "Submitted for review. After approval, release the staged version from the Developer Dashboard."
      : "Submitted for review with automatic publication after approval.");
    return result;
  }

  const { version, zip } = await preparePackage();
  const url = `${api}/upload/v2/${name}:upload`;
  log(`Extension version: ${version}; ZIP size: ${zip.length} bytes.`);
  if (dryRun) { log(`Dry run: POST ${url}; ZIP built locally, no upload or submission.`); return; }
  const upload = await request(url, {
    method: "POST", headers: { ...headers, "Content-Type": "application/zip" }, body: zip,
  }, "Package upload");
  let state = upload.uploadState;
  for (let attempt = 0; ["IN_PROGRESS", "UPLOAD_IN_PROGRESS"].includes(state) && attempt < 30; attempt++) {
    await wait(2000);
    state = (await fetchStatus()).lastAsyncUploadState;
  }
  if (!["SUCCEEDED", "UPLOAD_SUCCEEDED"].includes(state)) {
    throw new Error(`Upload is not confirmed successful (state: ${state || "missing"}). Run store:status before submitting.`);
  }
  output({ ...upload, uploadState: state });
  log("Upload complete. Run pnpm store:submit to submit this draft for review.");
  return { ...upload, uploadState: state };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    try { loadEnvFile(join(root, ".env.store")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    await runStoreCommand(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
