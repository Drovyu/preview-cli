import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runCli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dist/cli/index.js", ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test("CLI encrypts every file and the manifest before upload and never sends the key", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "dvyu-encryption-test-"));
  const siteRoot = path.join(temporaryRoot, "site");
  const home = path.join(temporaryRoot, "home");
  const configRoot = path.join(home, ".dvyu");
  const html = Buffer.from("<!doctype html><title>private-marker-html</title>");
  const script = Buffer.from("console.log('private-marker-script')");
  const requests = [];
  let activeFileUploads = 0;
  let maxActiveFileUploads = 0;
  const previewId = "0123456789abcdef01234567";
  const uploadId = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef";

  await Promise.all([
    mkdir(siteRoot, { recursive: true }),
    mkdir(configRoot, { recursive: true })
  ]);
  await Promise.all([
    writeFile(path.join(siteRoot, "index.html"), html),
    writeFile(path.join(siteRoot, "app.js"), script),
    writeFile(path.join(configRoot, "support.json"), `${JSON.stringify({
      deviceToken: "s".repeat(43),
      recoveryToken: "r".repeat(43)
    })}\n`)
  ]);

  const server = createServer(async (request, response) => {
    const body = await requestBody(request);
    requests.push({ method: request.method, url: request.url, headers: request.headers, body });
    if (request.method === "GET" && request.url === "/api/support/status") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ active: true, pending: false, maxDevices: 2, benefits: {} }));
      return;
    }
    if (request.method === "POST" && request.url === "/api/previews") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        id: previewId,
        owner: "test",
        expiresAt: "2030-01-01T00:00:00.000Z",
        createdAt: "2029-01-01T00:00:00.000Z",
        uploadBase: `unused/${previewId}/uploads/${uploadId}`,
        uploadId
      }));
      return;
    }
    if (request.url?.includes("/files/")) {
      activeFileUploads += 1;
      maxActiveFileUploads = Math.max(maxActiveFileUploads, activeFileUploads);
      await new Promise((resolve) => setTimeout(resolve, 40));
      activeFileUploads -= 1;
    }
    response.statusCode = 204;
    response.end();
  });

  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address === "object");
    const apiUrl = `http://127.0.0.1:${address.port}`;
    const result = await runCli(["create", siteRoot, "-p"], { HOME: home, DVY_API_URL: apiUrl });
    assert.equal(result.code, 0, result.stderr);

    const outputUrl = result.stdout.match(/https?:\/\/\S+#k=([A-Za-z0-9_-]+)/);
    assert(outputUrl, `preview URL missing from output:\n${result.stdout}`);
    const keyString = outputUrl[1];
    assert.equal(keyString.length, 43);

    assert.equal(requests.length, 5);
    const createRequest = requests.find((request) => request.method === "POST" && request.url === "/api/previews");
    assert(createRequest);
    assert.equal(createRequest.method, "POST");
    const createBody = JSON.parse(createRequest.body.toString("utf8"));
    assert.equal(createBody.totalSize, html.length + script.length);
    assert.equal(createBody.encryptedSize, html.length + script.length + 32);
    assert.equal(createBody.fileCount, 2);
    assert.equal(createBody.permanence, true);
    assert.equal(createBody.files.length, 2);
    assert(createBody.files.every((file) => /^[A-Za-z0-9_-]{32}$/.test(file.storageKey)));
    assert.deepEqual(
      createBody.files.map((file) => file.encryptedSize).sort((a, b) => a - b),
      [html.length + 16, script.length + 16].sort((a, b) => a - b)
    );

    const serializedRequests = requests.map((request) => [
      request.url,
      JSON.stringify(request.headers),
      request.body.toString("utf8"),
      request.body.toString("base64")
    ].join("\n")).join("\n");
    assert(!serializedRequests.includes(keyString), "decryption key was sent in an HTTP request");
    assert(!serializedRequests.includes("index.html") && !serializedRequests.includes("app.js"), "original file names were sent in an HTTP request");
    assert(!serializedRequests.includes("private-marker"), "plaintext marker was sent in an HTTP request");
    assert(requests.every((request) => !request.url.includes("#")), "URL fragment was sent to the server");

    const fileRequests = requests.filter((request) => request.url.includes("/files/"));
    assert.equal(fileRequests.length, 2);
    assert.equal(maxActiveFileUploads, 2, "ciphertext files should upload concurrently");
    assert(fileRequests.every((request) => !request.body.equals(html) && !request.body.equals(script)));
    assert.deepEqual(fileRequests.map((request) => request.body.length).sort((a, b) => a - b), [html.length + 16, script.length + 16].sort((a, b) => a - b));

    const manifestRequest = requests.find((request) => request.url.endsWith("/manifest"));
    assert(manifestRequest);
    const manifestEnvelopeText = manifestRequest.body.toString("utf8");
    assert(!manifestEnvelopeText.includes("index.html"));
    assert(!manifestEnvelopeText.includes("app.js"));
    assert(!manifestEnvelopeText.includes("private-marker"));

    const key = await crypto.subtle.importKey("raw", Buffer.from(keyString, "base64url"), "AES-GCM", false, ["decrypt"]);
    const envelope = JSON.parse(manifestEnvelopeText);
    const manifestBytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Buffer.from(envelope.encryption.iv, "base64url") },
      key,
      Buffer.from(envelope.ciphertext, "base64url")
    );
    const manifest = JSON.parse(Buffer.from(manifestBytes).toString("utf8"));
    assert.equal(manifest.entrypoint, "index.html");
    assert.deepEqual(manifest.files.map((file) => file.path), ["app.js", "index.html"]);

    const originalByPath = new Map([["app.js", script], ["index.html", html]]);
    for (const file of manifest.files) {
      const upload = fileRequests.find((request) => request.url.endsWith(`/files/${file.storageKey}`));
      assert(upload, `missing ciphertext upload for ${file.path}`);
      const plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: Buffer.from(file.encryption.iv, "base64url") },
        key,
        upload.body
      );
      assert.deepEqual(Buffer.from(plain), originalByPath.get(file.path));
    }
  } finally {
    server.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("CLI cancels a pending update after an upload failure", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "dvyu-update-cancel-test-"));
  const siteRoot = path.join(temporaryRoot, "site");
  const home = path.join(temporaryRoot, "home");
  const configRoot = path.join(home, ".dvyu");
  const previewId = "fedcba987654321001234567";
  const uploadId = "abcdefABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const key = "a".repeat(43);
  const requests = [];

  await Promise.all([
    mkdir(siteRoot, { recursive: true }),
    mkdir(configRoot, { recursive: true })
  ]);
  await writeFile(path.join(siteRoot, "index.html"), "<!doctype html><title>update</title>");

  const server = createServer(async (request, response) => {
    requests.push({ method: request.method, url: request.url, body: await requestBody(request) });
    if (request.method === "PUT" && request.url === `/api/previews/${previewId}`) {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        id: previewId,
        owner: "test",
        expiresAt: "2030-01-01T00:00:00.000Z",
        createdAt: "2029-01-01T00:00:00.000Z",
        uploadBase: "unused",
        uploadId
      }));
      return;
    }
    if (request.method === "PUT" && request.url?.includes("/files/")) {
      response.statusCode = 500;
      response.end("upload failed");
      return;
    }
    response.statusCode = 204;
    response.end();
  });

  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address === "object");
    const apiUrl = `http://127.0.0.1:${address.port}`;
    await writeFile(path.join(configRoot, "previews.json"), `${JSON.stringify({
      previews: [{
        id: previewId,
        key,
        url: `${apiUrl}/p/${previewId}#k=${key}`,
        apiUrl,
        sourcePath: siteRoot,
        createdAt: "2029-01-01T00:00:00.000Z",
        expiresAt: "2030-01-01T00:00:00.000Z",
        totalSize: 1,
        entrypoint: "index.html"
      }]
    }, null, 2)}\n`);

    const result = await runCli(["update", previewId, siteRoot], { HOME: home, DVY_API_URL: apiUrl });
    assert.equal(result.code, 1);
    assert(requests.some((request) => request.method === "DELETE" && request.url === `/api/previews/${previewId}/uploads/${uploadId}`));
  } finally {
    server.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("CLI escapes terminal control characters from file names", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "dvyu-terminal-output-test-"));
  const siteRoot = path.join(temporaryRoot, "site");
  const home = path.join(temporaryRoot, "home");
  try {
    await mkdir(siteRoot, { recursive: true });
    await writeFile(path.join(siteRoot, "index.html"), "<!doctype html><title>safe</title>");
    await writeFile(path.join(siteRoot, "evil\u001b[2J.exe"), "not uploaded");
    const result = await runCli(["create", siteRoot], { HOME: home });
    assert.equal(result.code, 1);
    assert(!result.stderr.includes("\u001b"), "stderr must not contain raw escape characters");
    assert(result.stderr.includes("evil\\x1b[2J.exe"));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("CLI rejects malformed preview API responses before upload", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "dvyu-api-response-test-"));
  const siteRoot = path.join(temporaryRoot, "site");
  const home = path.join(temporaryRoot, "home");
  const requests = [];
  const server = createServer(async (request, response) => {
    requests.push({ method: request.method, url: request.url, body: await requestBody(request) });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      id: "invalid\u001b[2J",
      owner: "test",
      expiresAt: "2030-01-01T00:00:00.000Z",
      createdAt: "2029-01-01T00:00:00.000Z",
      uploadBase: "unused",
      uploadId: "a".repeat(32)
    }));
  });
  try {
    await mkdir(siteRoot, { recursive: true });
    await writeFile(path.join(siteRoot, "index.html"), "<!doctype html><title>safe</title>");
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address === "object");
    const result = await runCli(["create", siteRoot], {
      HOME: home,
      DVY_API_URL: `http://127.0.0.1:${address.port}`
    });
    assert.equal(result.code, 1);
    assert(result.stderr.includes("Invalid preview API response"), result.stderr);
    assert(!result.stderr.includes("\u001b"));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "POST");
    assert.equal(requests[0].url, "/api/previews");
  } finally {
    server.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
