import { pipeline, env } from '@xenova/transformers';

try {
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
} catch (err) {
  console.warn('[Background] env config failed', err);
}

let classifier = null;

async function initClassifier() {
  if (classifier) return;
  try {
    console.log('[Background] Loading Zero Tolerance Model...');
    classifier = await pipeline('zero-shot-classification', 'Xenova/mobilebert-uncased-mnli');
    console.log('[Background] Model Ready');
  } catch (err) {
    console.error('[Background] Load Error', err);
  }
}

initClassifier();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'classify') return;

  if (!classifier) {
    sendResponse({ shouldShow: true });
    return true;
  }

  (async () => {
    try {
      // 1. The Categories
      const labels = [
        message.goal,       // Your Goal (e.g. "Learn Python")
  "gaming",           // Distraction
  "anime",            // Distraction
  "music video",      // Distraction
  "entertainment",    // Distraction
  "vlog",             // Distraction
  "comedy",           // Distraction
  "movie"             // Distraction
      ];

      // 2. Ask the AI
      const result = await classifier(message.title, labels, { multi_label: false });
      const bestMatch = result.labels[0];
      const confidence = result.scores[0];

      console.log(`[AI] "${message.title}" -> ${bestMatch} (${(confidence * 100).toFixed(0)}%)`);

      // === ZERO TOLERANCE LOGIC ===

      // If the best match is YOUR GOAL, show it.
      if (bestMatch === message.goal) {
        sendResponse({ shouldShow: true });
      }
      // If the best match is ANY distraction (Gaming, Anime, etc.), BLOCK IT.
      // We don't care about confidence anymore. If AI says "Gaming", it's gone.
      else {
        sendResponse({ shouldShow: false });
      }

    } catch (err) {
      // On error, default to showing (fail safe)
      sendResponse({ shouldShow: true });
    }
  })();

  return true;
});
