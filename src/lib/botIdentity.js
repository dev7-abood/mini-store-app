/*
|--------------------------------------------------------------------------
| Bot Identification via initData Signature (no parameters needed)
|--------------------------------------------------------------------------
| Since Bot API 7.10, initData carries `signature`: an Ed25519 signature
| of the data-check-string
|
|   "{bot_id}:WebAppData\n" + sorted "key=value" lines
|   (all fields except hash and signature)
|
| made with Telegram's key. The bot id is NOT a field in initData — but
| because it's baked into the signed string, we can identify it by
| testing each candidate id from tenants.json against the signature
| using Telegram's PUBLIC keys. The id that verifies IS the launching
| bot: cryptographically proven, purely local, zero network requests.
|
| Cost: one Ed25519 verification per candidate (~1ms each).
*/
import * as ed from '@noble/ed25519';

/** Telegram's Ed25519 public keys (hex) — from core.telegram.org/bots/webapps */
const TELEGRAM_PUBLIC_KEYS = [
  'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d', // production
  '40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec', // test env
];

/** @param {string} hex */
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** @param {string} value base64url */
function base64urlToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Identify which of the candidate bot ids issued the current initData.
 *
 * @param {Array<string|number>} candidateBotIds Bot ids from tenants.json
 * @returns {Promise<string | null>} The verified bot id, or null
 */
export async function identifyBotBySignature(candidateBotIds) {
  const raw =
    typeof window === 'undefined' ? '' : window.Telegram?.WebApp?.initData ?? '';
  if (!raw || candidateBotIds.length === 0) return null;

  /* URLSearchParams decodes values — exactly what the check-string needs. */
  const params = new URLSearchParams(raw);
  const signature = params.get('signature');
  if (!signature) {
    console.warn('Bot identification: initData has no signature (old Telegram client).');
    return null;
  }

  const lines = [];
  for (const [key, value] of params.entries()) {
    if (key !== 'hash' && key !== 'signature') lines.push(`${key}=${value}`);
  }
  lines.sort();
  const body = lines.join('\n');

  let signatureBytes;
  try {
    signatureBytes = base64urlToBytes(signature);
  } catch {
    return null;
  }

  const encoder = new TextEncoder();

  for (const candidate of candidateBotIds) {
    const botId = String(candidate);
    const message = encoder.encode(`${botId}:WebAppData\n${body}`);

    for (const publicKeyHex of TELEGRAM_PUBLIC_KEYS) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const valid = await ed.verifyAsync(signatureBytes, message, hexToBytes(publicKeyHex));
        if (valid) return botId;
      } catch {
        /* malformed input for this candidate — try the next */
      }
    }
  }

  console.warn(
    'Bot identification: signature matched none of the registry ids',
    candidateBotIds.map(String),
  );
  return null;
}
