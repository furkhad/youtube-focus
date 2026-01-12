import { pipeline, env } from '@xenova/transformers';

// === Environment configuration for Chrome extension service worker ===
try {
  env.allowLocalModels = false;
  env.backends = env.backends || {};
  env.backends.onnx = env.backends.onnx || {};
  env.backends.onnx.wasm = env.backends.onnx.wasm || {};

  // Disable multithreading and proxy to avoid Blob/worker usage
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;

  // Make WASM loader use local extension files
  env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('/');

  console.log('[Background AI] env configured:', env.backends.onnx.wasm);
} catch (err) {
  console.warn('[Background AI] env config failed', err);
}

let classifier = null;
let loading = true;
let loadError = null;

async function initClassifier() {
  try {
    console.log('[Background AI] Loading model...');
    classifier = await pipeline('zero-shot-classification', 'Xenova/mobilebert-uncased-mnli');
    loading = false;
    console.log('[Background AI] Model loaded and ready');
  } catch (err) {
    loadError = err;
    loading = false;
    console.error('[Background AI] Failed to load model', err);
  }
}

initClassifier();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'classify') return;
  const { title, goal } = message || {};

  // If model is still loading -> fail-safe: show video and inform loader state
  if (loading) {
    sendResponse({ shouldShow: true, loading: true });
    return true;
  }

  // If model failed -> fail-safe: show video
  if (loadError || !classifier) {
    sendResponse({ shouldShow: true, loading: false, error: String(loadError || 'no-model') });
    return true;
  }

  (async () => {
    try {
      const candidate_labels = [goal || 'Relevant', 'Distraction'];
      const result = await classifier(title, { candidate_labels });

      // Top label is the most likely prediction
      const topLabel = result?.labels && result.labels[0];
      const shouldShow = typeof topLabel === 'string' && (topLabel.toLowerCase() === (goal || '').toLowerCase());

      sendResponse({ shouldShow, labels: result.labels, scores: result.scores, loading: false });
    } catch (err) {
      console.error('[Background AI] Classification error', err);
      // On error, prefer showing the video (fail-safe)
      sendResponse({ shouldShow: true, loading: false, error: String(err) });
    }
  })();

  return true; // keep channel open for async response
});
