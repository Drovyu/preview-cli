# Encryption design

Drovyu Preview encrypts preview files on the user's machine before any file
content is uploaded. This document describes what the public CLI guarantees,
what the server receives, and how to verify the behavior.

## Upload sequence

1. The CLI generates a random 32-byte key with `crypto.getRandomValues`.
2. The key is imported as a non-extractable AES-256-GCM encryption key.
3. Each file is read locally and encrypted with its own random 12-byte IV.
4. Only the ciphertext is sent to the file upload endpoint.
5. The manifest containing original paths, MIME types, sizes, IVs, and the
   entrypoint is encrypted with a separate random IV.
6. Only the encrypted manifest envelope is sent to the manifest endpoint.
7. After the upload succeeds, the raw key is encoded into the preview URL
   fragment as `#k=...` and stored locally under `~/.dvyu`.

URL fragments are not part of HTTP requests. The CLI never sends the `#k=`
value in a request URL, header, or body.

## Comment encryption

The browser encrypts comment text, display names, reply-parent comment ids, target routes, coordinates, and selection data with the same AES-256-GCM key as the preview. Every comment and reply uses a distinct random 12-byte IV and AAD containing the preview id and comment id. D1 stores only the random comment id, IV, ciphertext, ciphertext size, and creation timestamp. Each reply counts as one encrypted comment.

The comments API is authorized with `SHA-256("dvyu-comment-auth-v1:" + key)`, not the preview key itself. This derived value cannot decrypt comment ciphertext. The preview key remains confined to the URL fragment and browser.

## What the service can observe

The service receives the following unencrypted metadata:

- preview id and device id;
- total plaintext and ciphertext sizes;
- file count and one random storage key per file;
- creation, access, and expiry timestamps;
- retention mode and upload status.
- encrypted-comment count, ciphertext size, random comment ids, and creation timestamps.

The service does not receive original file contents, original file names,
MIME types, the entrypoint, plaintext comment content or coordinates, or the AES key in plaintext.

## Verification

Run:

```sh
pnpm test
```

`test/encryption-upload.test.mjs` starts a local HTTP server and runs the real
compiled CLI against it. The test captures every request and verifies that:

- all uploaded files are AES-GCM ciphertext;
- the encrypted files decrypt back to the original local bytes;
- the manifest is encrypted and decrypts to the expected metadata;
- plaintext names and marker contents do not appear in the manifest request;
- the 256-bit key and URL fragment never appear in any HTTP request.

## Scope and limitations

Public source demonstrates the behavior of this implementation. To establish
that a distributed executable was built from the same source, releases should
also provide immutable version tags, CI-built artifacts, and SHA-256 checksums.

Encryption protects preview contents at rest from the service operator when
the operator does not possess the full preview URL. It does not make uploaded
HTML a security sandbox. A preview may execute its own JavaScript and may load
external resources, so recipients should open previews only from senders they
trust.
