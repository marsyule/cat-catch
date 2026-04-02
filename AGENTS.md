# Repository Guidelines

## Project Structure & Module Organization
This repository is a browser extension with a flat, static layout rather than a bundled `src/` app. Core code lives in `js/`: `background.js` handles request capture and caching, `popup.js` drives the main UI, `options.js` manages settings, and parser pages are implemented in files such as `m3u8.js`, `mpd.js`, and `json.js`. Page-injected scripts live in `catch-script/`. Shared libraries are in `lib/`, stylesheets in `css/`, localized strings in `_locales/`, and icons/images in `img/`. HTML entry points such as `popup.html`, `options.html`, and `m3u8.html` sit at the repository root.

## Build, Test, and Development Commands
Use `just` for the supported workflows:

- `just validate`: sanity-check `manifest.json`.
- `just prepare`: copy extension files into `build/` for local loading.
- `just build-zip`: create a distributable ZIP package.
- `just build-crx`: create a CRX package using `private-key.pem`.
- `just lint`: run the repository's basic extension file checks.
- `just status`: show version, icon presence, and existing build artifacts.

For local development, load either the repository root or `build/` as an unpacked extension in Chrome/Edge. There is no Node-based dev server in this repo.

## Coding Style & Naming Conventions
Follow the existing code style: plain JavaScript, jQuery-based DOM work, and 4-space indentation. Keep filenames lowercase with hyphens only where already established, for example `content-script.js` and `m3u8.downloader.js`. Match the repository's current conventions: `camelCase` for variables/functions, `PascalCase` only for constructor-like objects when needed, and short inline comments only where the logic is non-obvious. There is no configured ESLint or Prettier setup, so consistency with neighboring files matters.

## Testing Guidelines
There is no automated test suite checked in. Validate changes by loading the extension manually and exercising the affected page or feature. At minimum, run `just validate` and `just lint` before submitting. For UI changes, verify the relevant entry page, for example `popup.html` or `options.html`, in a Chromium-based browser.

## Commit & Pull Request Guidelines
Recent history mixes conventional prefixes and direct update messages. Prefer short, imperative commits such as `feat: add smart filename cache` or `fix: guard null tab response`. Keep each commit focused on one change area. Pull requests should include a concise description, linked issue when applicable, manual verification steps, and screenshots or recordings for UI changes.

## Security & Configuration Tips
Treat API keys and user data as local-only settings. Sensitive values such as LLM credentials should remain in local/session storage, not synchronized defaults or committed files. Review permission-related changes in `manifest.json` carefully before opening a PR.
