import assert from "node:assert/strict";
import test from "node:test";
import { runStoreCommand } from "../scripts/chrome-web-store.mjs";

const env = {
  CWS_PUBLISHER_ID: "publisher-123",
  CWS_EXTENSION_ID: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  CWS_ACCESS_TOKEN: "private-access-token",
};
const itemURL = "https://chromewebstore.googleapis.com/v2/publishers/publisher-123/items/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const zip = Buffer.from("test zip bytes");

function harness(responses = [], options = {}) {
  const calls = [];
  const logs = [];
  let builds = 0;
  let waits = 0;
  return {
    calls, logs,
    get builds() { return builds; },
    get waits() { return waits; },
    run: args => runStoreCommand(args, {
      env, log: value => logs.push(value),
      preparePackage: async () => { builds++; return { version: "1.2.1", zip }; },
      wait: async () => waits++,
      fetchImpl: async (url, init) => {
        calls.push({ url, ...init });
        assert.ok(responses.length, `Unexpected network request: ${url}`);
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return new Response(JSON.stringify(response.body ?? response), {
          status: response.status ?? 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      ...options,
    }),
  };
}

test("upload builds and sends ZIP bytes with authorization; never submits", async () => {
  const h = harness([{ uploadState: "SUCCEEDED", crxVersion: "1.2.1" }]);
  await h.run(["upload"]);
  assert.equal(h.builds, 1);
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].url, /\/upload\/v2\/publishers\/publisher-123\/items\/a+:upload$/);
  assert.equal(h.calls[0].method, "POST");
  assert.equal(h.calls[0].headers.Authorization, `Bearer ${env.CWS_ACCESS_TOKEN}`);
  assert.equal(h.calls[0].headers["Content-Type"], "application/zip");
  assert.equal(h.calls[0].body, zip);
  assert.doesNotMatch(h.logs.join("\n"), /private-access-token/);
});

test("upload waits for asynchronous processing to succeed", async () => {
  const h = harness([
    { uploadState: "IN_PROGRESS" },
    { lastAsyncUploadState: "IN_PROGRESS" },
    { lastAsyncUploadState: "SUCCEEDED" },
  ]);
  const result = await h.run(["upload"]);
  assert.equal(result.uploadState, "SUCCEEDED");
  assert.equal(h.waits, 2);
  assert.equal(h.calls[1].url, `${itemURL}:fetchStatus`);
  assert.equal(h.calls[1].method, "GET");
});

test("failed or unknown uploads fail instead of reporting success", async () => {
  for (const uploadState of ["FAILED", "NOT_FOUND", "UPLOAD_STATE_UNSPECIFIED", undefined]) {
    const h = harness([{ uploadState }]);
    await assert.rejects(h.run(["upload"]), /not confirmed successful/);
    assert.equal(h.calls.length, 1);
  }
});

test("upload polling has a bounded timeout", async () => {
  const h = harness([
    { uploadState: "IN_PROGRESS" },
    ...Array.from({ length: 30 }, () => ({ lastAsyncUploadState: "IN_PROGRESS" })),
  ]);
  await assert.rejects(h.run(["upload"]), /not confirmed successful.*IN_PROGRESS/);
  assert.equal(h.waits, 30);
  assert.equal(h.calls.length, 31);
});

test("submission stages approval by default, with an explicit automatic-release option", async () => {
  for (const [flags, publishType] of [[[], "STAGED_PUBLISH"], [["--auto-publish"], "DEFAULT_PUBLISH"]]) {
    const h = harness([{ lastAsyncUploadState: "SUCCEEDED" }, { state: "PENDING_REVIEW" }]);
    await h.run(["submit", ...flags]);
    assert.equal(h.builds, 0);
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[0].url, `${itemURL}:fetchStatus`);
    assert.equal(h.calls[1].url, `${itemURL}:publish`);
    assert.deepEqual(JSON.parse(h.calls[1].body), { publishType, skipReview: false });
  }
});

test("submission refuses pending/failed uploads and review or staged items without posting", async () => {
  for (const status of [
    { lastAsyncUploadState: "IN_PROGRESS" },
    { lastAsyncUploadState: "FAILED" },
    { submittedItemRevisionStatus: { state: "PENDING_REVIEW" } },
    { submittedItemRevisionStatus: { state: "STAGED" } },
  ]) {
    const h = harness([status]);
    await assert.rejects(h.run(["submit"]), /Cannot submit/);
    assert.equal(h.calls.length, 1);
  }
});

test("unsuccessful submission states cause an error", async () => {
  const h = harness([{}, { state: "REJECTED" }]);
  await assert.rejects(h.run(["submit"]), /Submission did not succeed/);
});

test("status is read-only and returns published and submitted versions", async () => {
  const status = {
    publishedItemRevisionStatus: { state: "PUBLISHED", distributionChannels: [{ crxVersion: "1.2.0" }] },
    submittedItemRevisionStatus: { state: "PENDING_REVIEW" },
  };
  const h = harness([status]);
  assert.deepEqual(await h.run(["status"]), status);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].method, "GET");
  assert.equal(h.builds, 0);
});

test("OAuth refresh obtains a token without printing secrets", async () => {
  const oauthEnv = {
    CWS_PUBLISHER_ID: env.CWS_PUBLISHER_ID, CWS_EXTENSION_ID: env.CWS_EXTENSION_ID,
    CWS_CLIENT_ID: "oauth-client", CWS_CLIENT_SECRET: "private-client-secret",
    CWS_REFRESH_TOKEN: "private-refresh-token",
  };
  const h = harness([{ access_token: "new-private-access-token" }, {}], { env: oauthEnv });
  await h.run(["status"]);
  assert.equal(h.calls[0].url, "https://oauth2.googleapis.com/token");
  assert.equal(h.calls[0].body.get("grant_type"), "refresh_token");
  assert.equal(h.calls[0].body.get("refresh_token"), oauthEnv.CWS_REFRESH_TOKEN);
  assert.equal(h.calls[1].headers.Authorization, "Bearer new-private-access-token");
  assert.doesNotMatch(h.logs.join("\n"), /private/);
});

test("API errors exit unsuccessfully and redact credential values", async () => {
  const h = harness([{ status: 401, body: { error: { message: `Invalid ${env.CWS_ACCESS_TOKEN}` } } }]);
  await assert.rejects(h.run(["status"]), error => {
    assert.match(error.message, /HTTP 401.*\[redacted\]/);
    assert.doesNotMatch(error.message, /private-access-token/);
    return true;
  });
});

test("OAuth authorization errors stop before building or mutating the item", async () => {
  const h = harness([{ status: 400, body: { error: "invalid_grant", error_description: "Authorize again" } }], {
    env: { ...env, CWS_ACCESS_TOKEN: "", CWS_CLIENT_ID: "id", CWS_CLIENT_SECRET: "private-client-secret", CWS_REFRESH_TOKEN: "private-refresh-token" },
  });
  await assert.rejects(h.run(["upload"]), /OAuth token refresh failed.*Authorize again/);
  assert.equal(h.builds, 0);
  assert.equal(h.calls.length, 1);
});

test("network errors and invalid JSON do not report success", async () => {
  const h = harness([new Error("Connection reset")]);
  await assert.rejects(h.run(["status"]), /could not reach Google/);
  await assert.rejects(runStoreCommand(["status"], {
    env, fetchImpl: async () => new Response("not JSON"),
  }), /invalid JSON/);
});

test("dry runs build only for upload and do not authenticate or contact Google", async () => {
  for (const command of ["upload", "submit", "status"]) {
    const h = harness([], { env: { CWS_PUBLISHER_ID: env.CWS_PUBLISHER_ID, CWS_EXTENSION_ID: env.CWS_EXTENSION_ID } });
    await h.run([command, "--dry-run"]);
    assert.equal(h.calls.length, 0);
    assert.equal(h.builds, command === "upload" ? 1 : 0);
    assert.match(h.logs.join("\n"), /Dry run:/);
  }
});

test("invalid arguments and missing configuration fail before network or build work", async () => {
  for (const args of [["delete"], ["status", "--auto-publish"], ["submit", "--unknown"]]) {
    const h = harness();
    await assert.rejects(h.run(args));
    assert.equal(h.calls.length, 0);
  }
  for (const config of [{}, { CWS_PUBLISHER_ID: "publisher" }, { ...env, CWS_ACCESS_TOKEN: "" }]) {
    const h = harness([], { env: config });
    await assert.rejects(h.run(["upload"]), /Missing CWS_/);
    assert.equal(h.calls.length, 0);
    assert.equal(h.builds, 0);
  }
  const h = harness([], { env: {} });
  await h.run(["--help"]);
  assert.match(h.logs[0], /store:upload/);
});

test("failed local builds do not upload", async () => {
  const h = harness([], { preparePackage: async () => { throw new Error("Extension build failed"); } });
  await assert.rejects(h.run(["upload"]), /Extension build failed/);
  assert.equal(h.calls.length, 0);
});
