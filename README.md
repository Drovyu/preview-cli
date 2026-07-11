# Drovyu Preview CLI

> **Source available, not open source.** This repository is published for
> transparency and security review. Use of the official unmodified CLI is
> permitted under the [Drovyu Source-Available License](LICENSE); modification,
> redistribution, derivative works, and independent service operation are not.

[日本語](README.ja.md)

Create temporary preview links for static builds.

The CLI encrypts every file and its manifest locally before upload. The AES key
is kept in the `#k=` URL fragment and is never sent in an HTTP request. See the
[encryption design and executable verification](docs/ENCRYPTION.md).

```sh
dvyu create ./dist
```

Drovyu Preview is useful when you want to share a Vite, React, or Storybook static build without deploying it as a permanent site.

## Install

Requirements:

- Node.js 20 or later
- A static build directory such as Vite `dist` or Storybook static output

Install the npm package:

```sh
pnpm add -g dvyu
npm install -g dvyu
```

Install directly from GitHub when you need the current `main` branch:

```sh
pnpm add -g github:Drovyu/preview-cli
npm install -g github:Drovyu/preview-cli
yarn global add https://github.com/Drovyu/preview-cli.git
```

Create a preview:

```sh
dvyu create ./dist
```

One-off execution from npm:

```sh
pnpm dlx dvyu create ./dist
npx dvyu create ./dist
yarn dlx dvyu create ./dist
```

One-off execution from GitHub:

```sh
pnpm dlx github:Drovyu/preview-cli create ./dist
npx github:Drovyu/preview-cli create ./dist
yarn dlx github:Drovyu/preview-cli create ./dist
```

## Commands

```sh
dvyu create [path]
dvyu update
dvyu preview [project]
dvyu recreate
dvyu list
dvyu delete <id>
dvyu delete all
dvyu usage
dvyu lang [en|ja]
dvyu supporter
dvyu supporter start
dvyu supporter status
dvyu supporter recover
dvyu supporter recovery
dvyu supporter link <recovery-token>
dvyu supporter unlink
dvyu uninstall
```

## Usage

Build and preview a Storybook, Astro, or Vite project:

```sh
dvyu preview
```

`dvyu preview` reads the target `package.json`, builds the project for static output, then previews the output directory. If a local preview already exists for the same output path, it deletes the old preview and creates a new one.

Supported project builders:

- Storybook
- Astro
- Vite

The default output directory is `dist` for Astro and Vite, and `storybook-static` for Storybook.

```sh
dvyu preview ./my-app
dvyu preview --out-dir build
dvyu preview -p
dvyu preview --ttl 7d
```

Create a preview from a build directory:

```sh
dvyu create
dvyu create ./dist
dvyu create ./dist -p
```

When no path is provided, `create` uses `dist` if it exists, otherwise `index.html` if it exists.
The selected file or directory must contain an HTML file. `index.html` is preferred as the entrypoint; otherwise the first `.html` file is used.
Supporters can use `-p` (`--permanence`) on `create`, `update`, `recreate`, or `preview` to keep a preview URL alive until it has no access for 1 month. They can also set a lifetime from `1h` to `30d`, such as `--ttl 7d`. `-p` and `--ttl` cannot be combined.

Create a preview from a single file:

```sh
dvyu create ./example.html
```

Update the latest local preview without changing its URL:

```sh
dvyu update
dvyu update ./dist
dvyu update <id> ./dist
dvyu update -p
```

Recreate the latest preview from the same local path:

```sh
dvyu recreate
```

`recreate` deletes the old preview and creates a new preview URL. Use `update` when the URL must stay the same.

Recreate the latest preview from a specific path:

```sh
dvyu recreate ./dist
```

List saved local preview URLs:

```sh
dvyu list
```

`dvyu list` reads `~/.dvyu/previews.json` and shows active previews. To include expired local history, run `dvyu list all` or `dvyu list -a`. Active remote previews without a local key are shown without the `#k=` fragment.

Delete a preview:

```sh
dvyu delete <id>
```

Delete all previews created from this device:

```sh
dvyu delete all
```

Check usage:

```sh
dvyu usage
```

Show or set CLI language:

```sh
dvyu lang
dvyu lang en
dvyu lang ja
```

The language setting is stored in `~/.dvyu/settings.json`.

### Ko-fi supporter benefits

Before supporting on Ko-fi, create a claim code on the first device:

```sh
dvyu supporter start
```

Include the displayed `DVYU-...` code in the private message for the Ko-fi payment. The device is normally registered for 30 days from that payment. A claim code expires after 24 hours, and the initial device registration requires a code created before supporting. Check its status with:

```sh
dvyu supporter
dvyu supporter status
```

If the claim code was omitted from the payment, recover it through email verification:

```sh
dvyu supporter recover
```

Enter the email address used for Ko-fi in the interactive prompt. When it matches an unclaimed payment, a verification link valid for 15 minutes is sent. Opening the link only shows a confirmation page; registration completes after pressing the approval button. Run `dvyu supporter status` afterward.

- Recovery is available only for an unclaimed payment within 30 days of payment.
- Benefits still expire 30 days after the original Ko-fi payment, not 30 days after verification.
- Sending is limited to 3 times per email and 5 times per device in 24 hours.
- Resends require a 60-second cooldown.
- Matched and unmatched requests return the same acceptance message to prevent email enumeration.
- Raw email addresses are not stored in D1. Only an HMAC is stored; the address is provided to Resend only when sending the verification email.

To register a second device, show the recovery token on the first device and use it on the second:

```sh
# First device
dvyu supporter recovery

# Second device
dvyu supporter link <recovery-token>
```

Treat the recovery token like a password because it can link a device to the supporter benefits. At most two devices can be linked at once. Use `dvyu supporter unlink` to unlink the current device. Unlinking does not delete previews created by that device; they continue to count against the same supporter storage quota.

Supporter benefits:

- normally active for 30 days after a payment
- unlimited simultaneous previews
- `300MB` active storage shared across both devices
- `-p` / `--permanence`
- `--ttl <duration>` from `1 hour` to `30 days`
- access to the supporter reserve when the standard service pool is full
- no Drovyu preview badge on supporter previews

After the supporter period ends, new previews cannot use `-p` or `--ttl`. Existing permanent previews are not deleted immediately, but access no longer extends their expiry and they remain available only until the currently scheduled deletion time. A later payment never shortens an existing entitlement.

Supporter credentials are stored in `~/.dvyu/support.json`. It contains the device and recovery tokens, so never share it or commit it to a repository.

Remove local Drovyu Preview data:

```sh
dvyu uninstall
```

## Supported Files

Uploads stop before starting if unsupported files are found.
Common metadata files such as `.DS_Store`, `.gitkeep`, and `Thumbs.db` are ignored automatically. If other unsupported files are found, the CLI can exclude them after confirmation.

Supported extensions:

```txt
.html .htm .md .txt .json .xml .map
.css .js .mjs .cjs
.png .jpg .jpeg .gif .svg .webp .ico .avif
.woff .woff2 .ttf .otf
.mp4 .webm .mp3 .wav
.pdf
```

If `index.html` exists at the upload root, it is used as the preview entrypoint.

Ciphertext files upload with a default concurrency of six after encryption finishes. Set `DVYU_UPLOAD_CONCURRENCY` from `1` to `16` when a connection or proxy needs a different limit.

```sh
DVYU_UPLOAD_CONCURRENCY=3 dvyu create ./dist
```

## Asset Paths

For the most reliable previews, build static sites with relative asset paths. `dvyu preview` passes a relative base and the selected output directory to Vite. Astro is built normally because its `base` option is a deployment pathname rather than a portable relative base; the Drovyu viewer resolves Astro's root asset paths. Storybook uses its static build and `storybook-static` by default.

Astro and some other builders emit root paths such as `/_astro/...`. Drovyu Preview rewrites those paths inside the viewer, including nested pages, but fully absolute URLs to external origins are left as-is.

If you build manually before running `dvyu create`, prefer:

```sh
vite build --base=./
astro build
```

Then upload the generated static directory:

```sh
dvyu create ./dist
```

## Limits

Default limits:

| Item | Standard | Supporter |
| --- | ---: | ---: |
| Active storage | `100MB` per device | `300MB` per supporter, shared by two devices |
| Active previews | `20` per device | Unlimited |
| Standard lifetime | `48 hours` | `48 hours`, or `1 hour` to `30 days` with `--ttl` |
| Permanence | Not available | `-p` / `--permanence` |
| Linked devices | Device-scoped | Up to `2` |

Service-wide capacity consists of a `3GiB` standard pool, an additional `7GiB` supporter reserve, and a `10GiB` absolute limit. Standard creation stops once total usage reaches 3GiB; only supporters can use the reserve up to 10GiB.

Expired previews are no longer viewable. Supporter permanent previews refresh their inactive cleanup deadline when they are accessed. The supporter reserve is shared by all supporters, and the individual `300MB` limit still applies.

## Public Usage Statistics

Public pages such as the product landing page can use the unauthenticated aggregate endpoint. It never returns device ids, preview ids, URLs, or decryption keys.

```http
GET https://preview.drovyu.com/api/public/stats
```

```json
{
  "devices": 1,
  "devicesEver": 1,
  "previewsCreated": 3,
  "encryptedBytesPublished": 1068949,
  "encryptedGigabytesPublished": 0.001,
  "lastPublishedAt": "2026-07-10T08:00:00.000Z",
  "updatedAt": "2026-07-11T00:17:00.000Z"
}
```

- `devices`: unique devices with at least one active preview at snapshot time; use this for the current device count.
- `devicesEver`: unique devices that have ever published a preview; this is the cumulative user-count approximation.
- `previewsCreated`: unique preview URLs successfully published; `update` does not increase it.
- `encryptedBytesPublished`: cumulative file ciphertext bytes across successful publications, including new generations published by `update`.
- `encryptedGigabytesPublished`: the byte value converted to decimal GB (`1GB = 1,000,000,000 bytes`) and rounded to three decimal places.
- `lastPublishedAt`: timestamp of the latest successful preview or update publication, or `null` if none exists.
- `updatedAt`: timestamp of the aggregate snapshot refresh.

The snapshot refreshes once a day at approximately `00:17 UTC` (`09:17 JST`), so values may lag by up to about 24 hours. The response allows CORS and can be cached for one hour. A landing page can also format the raw byte value at any desired precision.

```js
const stats = await fetch("https://preview.drovyu.com/api/public/stats")
  .then((response) => response.json());

console.log(`${stats.devices} devices`);
console.log(`${stats.previewsCreated} previews`);
console.log(`${stats.encryptedGigabytesPublished.toFixed(3)}GB`);
```

## Notes

- Preview links are intended for temporary sharing with trusted recipients.
- Drovyu Preview is not a full security sandbox.
- The viewer rewrites same-origin asset links for encrypted previews, but unusual runtime routing or external absolute assets may still need project-side adjustment.
- Keep generated preview links private.
