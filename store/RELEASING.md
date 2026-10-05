# Chrome Web Store releases

Publishing uses the installed `chrome-webstore-upload-cli` 4.x and Chrome Web
Store API v2. Calendar sign-in and store publishing use separate OAuth clients.
Publishing credentials never ship in the extension.

## Repository configuration

GitHub Actions secrets:

| Secret | Purpose |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | Public Calendar OAuth client ID embedded at build time |
| `CWS_CLIENT_ID` | OAuth client used by the publisher |
| `CWS_CLIENT_SECRET` | Publisher OAuth client secret |
| `CWS_REFRESH_TOKEN` | Offline authorization for the Chrome Web Store scope |

GitHub Actions variables:

| Variable | Value |
| --- | --- |
| `CWS_PUBLISHER_ID` | `f5afb768-56ba-4b77-b399-60e85312ad0e` |
| `CWS_EXTENSION_ID` | `obccfkjmkfhljjnamibiiolagcpmjklj` |

Keep the three publisher credentials together in a BWS project named
`adp-calendar` for recovery. Do not commit credential files or export tokens to
terminal logs.

## Release

1. Increment `packages/extension/package.json` before each new store upload.
2. Commit and push the change to `main`.
3. Run the **Chrome Web Store** workflow with `build` to verify the package,
   `upload` to save a draft, or `publish` to upload and submit for review.
   Alternatively, push a tag named `v<extension-version>` to upload and submit.
4. Download the ZIP from the workflow artifact when a manual upload is needed.
5. Check the [Developer Dashboard](https://chrome.google.com/webstore/devconsole/f5afb768-56ba-4b77-b399-60e85312ad0e/obccfkjmkfhljjnamibiiolagcpmjklj/edit/status).
   Submission starts Google's review; it does not imply approval or immediate availability.

Local commands, with the publisher credentials provided by your secret manager:

```sh
pnpm zip:extension
EXTENSION_ID=obccfkjmkfhljjnamibiiolagcpmjklj \
PUBLISHER_ID=f5afb768-56ba-4b77-b399-60e85312ad0e pnpm store:upload
EXTENSION_ID=obccfkjmkfhljjnamibiiolagcpmjklj \
PUBLISHER_ID=f5afb768-56ba-4b77-b399-60e85312ad0e pnpm store:publish
```

For local builds the Calendar client ID is in the ignored
`packages/extension/.env.local`. The store build omits the development manifest
key. The production Calendar OAuth redirect is
`https://obccfkjmkfhljjnamibiiolagcpmjklj.chromiumapp.org/`.

## Website and review materials

- Website: https://adp-shifts.blahaj.uk/
- Privacy: https://adp-shifts.blahaj.uk/privacy/
- Terms: https://adp-shifts.blahaj.uk/terms/
- Hosting: GitHub Pages, deployed by `.github/workflows/pages.yml`.
- DNS: Cloudflare `blahaj.uk`; DNS-only CNAME to `thedavidweng.github.io`.
- Listing and permissions: [LISTING.md](LISTING.md).
- Calendar OAuth branding and verification: [OAUTH.md](OAUTH.md).

First-time publishing requires a verified publisher contact email and completed
listing, privacy disclosures, and distribution settings in the dashboard.
Calendar OAuth production access and verification are separate from Chrome Web
Store review.

## Initial release status (2026-10-04)

- Version `0.1.0` is **Pending review**, with automatic publication after approval.
- Calendar OAuth is in Production; its branding has been verified and published.
- `calendar.app.created` is non-sensitive; Google confirms data-access verification is not required.
- Publisher contact email and the `blahaj.uk` domain are verified.
- The build-only GitHub Actions run passed tests, type checking, and ZIP artifact upload.
- Publisher credentials are not configured yet: Google API policy acceptance is awaiting the owner's confirmation. The dedicated project is `igneous-ethos-510705-r0`.
- BWS recovery storage remains pending authentication; the local CLI has no access token and the web vault requires login.
