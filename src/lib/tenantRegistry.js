/*
|--------------------------------------------------------------------------
| Tenant Registry (public/tenants.json)
|--------------------------------------------------------------------------
| One deployment serves many bots. The static registry at /tenants.json
| maps telegram_bot_id -> tenant base URL:
|
|   { "tenants": [ { "telegram_bot_id": 1112563,
|                    "tenant_base_url": "https://exsample.com",
|                    "telegram_name": "o2" } ] }
|
| Bot id detection (Telegram's initData has NO bot_id field, so):
|   1. Ed25519 signature identification — the bot id is baked into the
|      signed data-check-string, so testing each registry id against
|      the initData `signature` with Telegram's PUBLIC key proves which
|      bot launched us. No parameters, no network. (botIdentity.js)
|   2. ?bot= / ?bot_id= query param — optional manual override
|   3. initDataUnsafe.bot_id — defensive, in case a client adds it
|   4. Telegram CloudStorage — remembered from a previous launch
|
| The registry is public routing data only (URLs, not secrets); the
| tenant's VerifyTelegramInitData middleware remains the authentication.
*/

import { identifyBotBySignature } from './botIdentity';

const REGISTRY_URL = '/tenants.json';
const CLOUD_BOT_KEY = 'bot_id_v1';

const tg = () => (typeof window === 'undefined' ? null : window.Telegram?.WebApp ?? null);

/**
 * Load the registry. Returns [] on any failure so callers just fall
 * through to the next resolution source.
 *
 * @returns {Promise<Array<{telegram_bot_id: number|string, tenant_base_url?: string,
 *           ttenant_base_url?: string, telegram_name?: string}>>}
 */
export async function loadTenantRegistry() {
  try {
    const response = await fetch(REGISTRY_URL, { cache: 'no-cache' });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data?.tenants) ? data.tenants : [];
  } catch {
    return [];
  }
}

/** Promisified CloudStorage.getItem. */
function cloudGet(key) {
  return new Promise((resolve) => {
    const storage = tg()?.CloudStorage;
    if (!storage) return resolve(null);
    try {
      storage.getItem(key, (err, value) => resolve(err || !value ? null : value));
    } catch {
      resolve(null);
    }
  });
}

/** Fire-and-forget CloudStorage.setItem. */
function cloudSet(key, value) {
  try {
    tg()?.CloudStorage?.setItem(key, value, () => {});
  } catch {
    /* older clients — URL param still works on every launch */
  }
}

/**
 * Detect which bot launched this session.
 *
 * @param {Array<{telegram_bot_id: number|string}>} tenants Registry entries
 * @returns {Promise<string | null>} bot id as a string, or null
 */
export async function detectBotId(tenants = []) {
  /* 1. Cryptographic identification from the initData signature —
        primary path, no parameters needed. */
  const fromSignature = await identifyBotBySignature(
    tenants.map((t) => t.telegram_bot_id),
  );
  if (fromSignature) {
    cloudSet(CLOUD_BOT_KEY, fromSignature);
    return fromSignature;
  }

  /* 2. Explicit query param — optional manual override, e.g.
        https://your-app.vercel.app/?bot={telegram_bot_id} in BotFather. */
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('bot') ?? params.get('bot_id');
  if (fromUrl) {
    cloudSet(CLOUD_BOT_KEY, fromUrl);
    return fromUrl;
  }

  /* 3. Defensive: some clients may expose it in initDataUnsafe. */
  const fromInitData = tg()?.initDataUnsafe?.bot_id;
  if (fromInitData != null) {
    cloudSet(CLOUD_BOT_KEY, String(fromInitData));
    return String(fromInitData);
  }

  /* 4. Remembered from a previous launch (covers pre-7.10 clients). */
  return cloudGet(CLOUD_BOT_KEY);
}

/**
 * Find the registry entry for a bot id (tolerates the ttenant_base_url
 * key spelling and string/number ids).
 *
 * @param {Array<object>} tenants
 * @param {string | null} botId
 * @returns {{baseUrl: string, name: string | null} | null}
 */
export function findTenantByBotId(tenants, botId) {
  if (!botId) return null;

  const entry = tenants.find((t) => String(t.telegram_bot_id) === String(botId));
  if (!entry) return null;

  const baseUrl = entry.tenant_base_url ?? entry.ttenant_base_url ?? '';
  if (!baseUrl) return null;

  return { baseUrl, name: entry.telegram_name ?? null };
}
