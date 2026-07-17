# Viewer publication and trust boundary

Drovyu Preview receives files encrypted by the CLI or browser and decrypts them
inside the Viewer. Plaintext files and the `#k=` decryption key are not sent to
the Drovyu API.

## Published code

- `src/viewer/`: comments, notification setup, and notification Service Worker
- `dist/viewer-static/`: JavaScript served by the production Worker
- `viewer-reference/preview-service-worker.js`: reference output of the Service
  Worker that fetches and decrypts encrypted manifests and files in the browser
- `viewer-reference/viewer-shell.html`: reference output of the Viewer shell
  that reads the fragment key and sends it to the Service Worker with
  `postMessage`
- `viewer-reference/SHA256SUMS`: SHA-256 hashes of the reference outputs

The reference preview ID is fixed to `000000000000000000000000`. Production
changes this configuration value per preview while using the same template for
the decryption and request behavior.

## Code that remains private

API routing, D1/R2 operations, quotas, abuse controls, supporter checks, cron,
email delivery, webhooks, and operational monitoring are not published. They
are not required to review browser-side decryption and exposing them would add
operational attack information for an unauthenticated service.

## What can be verified

The reference Service Worker shows that it:

1. Fetches encrypted data from `/manifest` and `/file`.
2. Receives the decryption key from the Viewer window through `postMessage`.
3. Runs `crypto.subtle.decrypt` in the browser.
4. Returns decrypted responses to the preview iframe.

The decryption key remains in the URL fragment. Fragments are not part of the
normal HTTP request target, and the Viewer does not add the key to an API URL,
query, header, or request body.

## Limitation

Published source alone cannot cryptographically prove that production always
serves identical code. It enables implementation review and comparison with
JavaScript fetched from production. The Worker that serves Viewer JavaScript
is part of the trust boundary. Do not use Drovyu Preview for confidential,
NDA-covered, or personal data when that delivery boundary is unacceptable.
