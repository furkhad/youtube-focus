# YouTube Focus ML

YouTube Focus ML is a Chrome extension that filters your YouTube Home feed using on-device machine learning.
It keeps relevant videos visible and suppresses distractions based on your personal goal.

## Value Proposition

- **Stay in deep work mode on YouTube** without manually curating recommendations.
- **Local-first AI filtering** using ONNX/WebAssembly in the extension background worker.
- **Fast and private**: your focus goal stays in local browser storage.
- **Commercial-ready baseline** for creators, students, and professionals who need intent-aligned content.

## Core Features

- Goal-driven filtering (set your intent once, filter continuously).
- Two-layer decision engine:
	- Keyword relevance pass for fast allow decisions.
	- Zero-shot ML classification for harder cases.
- Strict distraction blocking for common low-value patterns.
- Performance-focused DOM monitoring with `MutationObserver` + debounced scanning.
- YouTube SPA-aware behavior (reinitializes on internal navigation).

## How It Works

1. You enter a focus goal in the popup (example: "Learn Python for backend development").
2. The content script detects feed cards and extracts video titles.
3. Titles are evaluated against your goal:
	 - quick keyword relevance check
	 - local ML classification for final decision
4. Non-relevant videos are hidden from the Home feed.

## Installation

### Prerequisites

- Node.js 18+
- Google Chrome (or Chromium-based browser with MV3 support)

### Setup

```bash
npm install
npm run build
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder
5. Open YouTube Home and set your focus goal from the extension popup

## Local AI / ONNX Explanation

YouTube Focus ML uses `@xenova/transformers` with ONNX runtime in the extension background service worker.
The model executes in-browser using WebAssembly.

Why `wasm-unsafe-eval` is present in CSP:

- ONNX WebAssembly runtime requires this directive for model execution in MV3 extension pages.
- This is scoped to extension pages and does not grant remote script execution.

## Privacy Guarantee

- Your focus goal is stored in `chrome.storage.local` on your own browser profile.
- No account is required.
- No personal goal data is sent to a dedicated external backend server by this project.
- Processing decisions are made locally in the extension runtime.

## Permissions

- `storage`: save and load your focus goal.
- `https://www.youtube.com/*` host permission: apply filtering on YouTube pages only.

## Development Commands

```bash
npm run build
npm run watch
```

## Release Notes (V1.0)

- Production-ready MutationObserver scanning flow (no polling interval).
- Least-privilege permissions in `manifest.json`.
- Local-first AI classification architecture documented.

## License

MIT License. See the `LICENSE` file.
