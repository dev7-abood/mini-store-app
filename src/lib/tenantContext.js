/*
|--------------------------------------------------------------------------
| Tenant Context Resolution
|--------------------------------------------------------------------------
| Launch sequence with ZERO extra network requests:
|
|   1. Read start_param (synchronous, already in memory).
|   2. Decode the payload locally (microseconds — no waiting).
|   3. Persist it to Telegram CloudStorage so relaunches WITHOUT a deep
|      link (e.g. from the bot profile button) still know their tenant —
|      again without asking any server.
|
| Trust model: decoded values are used only for ROUTING. The first real
| API request carries the raw initData string; the tenant backend's
| VerifyTelegramInitData middleware verifies Telegram's HMAC (which
| signs start_param), so a forged payload dies at the first request.
*/
import { decodeTelegramPayload } from './decodeTelegramPayload';

const CLOUD_KEY = 'tenant_ctx_v1';

/** @typedef {{u: string, b?: number, t?: string}} TenantPayload */

const tg = () => (typeof window === 'undefined' ? null : window.Telegram?.WebApp ?? null);

/** Promisified CloudStorage.getItem (a fast local Telegram call). */
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
    /* older clients without CloudStorage — deep link still works */
  }
}

/**
 * Resolve the tenant context at app launch.
 * Order: deep link payload -> CloudStorage from a previous launch -> null.
 *
 * @returns {Promise<{payload: TenantPayload, source: 'deeplink'|'cloud'} | null>}
 */
export async function resolveTenantContext() {
  /* 1. Fresh deep link (synchronous decode). */
  const startParam =
    tg()?.initDataUnsafe?.start_param ??
    new URLSearchParams(window.location.search).get('tgWebAppStartParam');

  if (startParam) {
    const payload = decodeTelegramPayload(startParam);
    if (payload?.u) {
      /* Persist for future launches without a deep link. */
      cloudSet(CLOUD_KEY, JSON.stringify(payload));
      return { payload, source: 'deeplink' };
    }
  }

  /* 2. Previous launch context from Telegram CloudStorage. */
  const stored = await cloudGet(CLOUD_KEY);
  if (stored) {
    try {
      const payload = JSON.parse(stored);
      if (payload?.u) return { payload, source: 'cloud' };
    } catch {
      /* corrupted — fall through */
    }
  }

  /* 3. Nothing — caller decides (OpenFromBotScreen / demo mode). */
  return null;
}

/** Whether we're actually running inside Telegram. */
export const isInsideTelegram = () => Boolean(tg()?.initData);
