/**
 * ElevenLabs Multi-Key Manager
 *
 * Manages multiple ElevenLabs API keys and rotates between them reactively.
 * No external API calls are made to check quota — instead, keys are tried
 * in order and marked exhausted only when the actual ElevenLabs call
 * returns 401 / 403 / 429.  The retry logic in the call sites
 * (lib/elevenlabs.ts, app/api/transcribe/route.ts) handles switching to
 * the next key automatically.
 *
 * Keys are loaded from:
 *   ELEVENLABS_API_KEYS=key1,key2,key3   (preferred – comma-separated)
 *   ELEVENLABS_API_KEY=key               (single-key fallback)
 */

// ── State ───────────────────────────────────────────────────────────────

/**
 * Keys that failed at runtime (quota exhausted, invalid, suspended).
 * Maps key → timestamp when it was marked, so we can auto-recover
 * after the cooldown period (e.g. quota resets at the billing cycle).
 */
const exhaustedKeys = new Map<string, number>();

/** How long before an exhausted key is retried (ms). Default: 1 hour. */
const EXHAUSTED_COOLDOWN_MS = 60 * 60 * 1_000;

// ── Helpers ─────────────────────────────────────────────────────────────

function loadKeys(): string[] {
  const multi = process.env.ELEVENLABS_API_KEYS;
  if (multi) {
    return multi
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
  }

  const single = process.env.ELEVENLABS_API_KEY;
  if (single) {
    return [single.trim()];
  }

  return [];
}

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "…" + key.slice(-4);
}

function isExhausted(key: string): boolean {
  const ts = exhaustedKeys.get(key);
  if (ts === undefined) return false;

  // Auto-recover after cooldown (quota may have reset)
  if (Date.now() - ts > EXHAUSTED_COOLDOWN_MS) {
    exhaustedKeys.delete(key);
    console.log(
      `[ElevenLabs-Keys] Key ${maskKey(key)} cooldown expired – making it available again.`
    );
    return false;
  }

  return true;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Returns the first API key that hasn't been marked as exhausted.
 * No network calls are made — this is a pure in-memory lookup.
 *
 * If all keys are exhausted, throws an error.
 */
export function getAvailableApiKey(): string {
  const keys = loadKeys();

  if (keys.length === 0) {
    throw new Error(
      "No ElevenLabs API keys configured. " +
        "Set ELEVENLABS_API_KEYS (comma-separated) or ELEVENLABS_API_KEY in your environment."
    );
  }

  const errors: string[] = [];

  for (const key of keys) {
    if (isExhausted(key)) {
      const ago = Math.round((Date.now() - (exhaustedKeys.get(key) ?? 0)) / 1_000);
      errors.push(`${maskKey(key)}: exhausted ${ago}s ago`);
      continue;
    }
    return key;
  }

  throw new Error(
    `All ElevenLabs API keys are exhausted.\n` +
      errors.map((e) => `  • ${e}`).join("\n") +
      `\nKeys auto-recover after ${EXHAUSTED_COOLDOWN_MS / 60_000} minutes.`
  );
}

/**
 * Mark a key as exhausted after the actual ElevenLabs API call fails
 * with 401 / 403 / 429.  Call sites should then retry via
 * getAvailableApiKey() which will return the next healthy key.
 */
export function markKeyExhausted(apiKey: string): void {
  exhaustedKeys.set(apiKey, Date.now());
  console.warn(`[ElevenLabs-Keys] Key ${maskKey(apiKey)} marked as exhausted.`);
}

/**
 * Clear all exhaustion markers — useful if you know quotas have been
 * reset (e.g. new billing cycle, manual top-up).
 */
export function resetAllKeys(): void {
  exhaustedKeys.clear();
  console.log("[ElevenLabs-Keys] All keys reset to available.");
}
