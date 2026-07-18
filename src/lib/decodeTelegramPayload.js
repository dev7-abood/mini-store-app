/*
|--------------------------------------------------------------------------
| Deep-Link Payload Decoder
|--------------------------------------------------------------------------
| The payload is NOT encryption — it is reversible obfuscation so the
| Mini App can read it locally in microseconds:
|
|   Base64URL( XOR( JSON, key ) )
|
| The shared key is TELEGRAM_DEEP_LINK_KEY on the backend and
| VITE_TELEGRAM_DEEP_LINK_KEY here — they must match. Exposing the key
| in the bundle is fine by design: the decoded values are used only for
| ROUTING, never as proof. Authenticity comes from the initData HMAC,
| which signs start_param itself.
*/

const DEFAULT_KEY = import.meta.env.VITE_TELEGRAM_DEEP_LINK_KEY ?? '';

/**
 * Decode a start_param payload. Returns null for anything invalid —
 * wrong key, corrupted base64, non-JSON — so callers can fall through
 * to the next resolution source without try/catch.
 *
 * @param {string} encoded Base64URL string from start_param
 * @param {string} [key] Shared XOR key (defaults to the env key)
 * @returns {Record<string, any> | null}
 */
export function decodeTelegramPayload(encoded, key = DEFAULT_KEY) {
  if (!encoded || !key) return null;

  try {
    /* Base64URL -> Base64, restore '=' padding to a multiple of 4. */
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

    /* Decode to raw bytes, XOR with the repeating key. */
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    }

    /* UTF-8 first (required for Arabic values), then JSON. */
    const payload = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}
