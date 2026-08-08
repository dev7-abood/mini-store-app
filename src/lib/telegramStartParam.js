import { normalizeOrderNumber } from './orderStatus';

const ORDER_START_PARAM_PATTERN = /^(?:orders?|oder)[_:-](.+)$/i;

const tg = () => (typeof window === 'undefined' ? null : window.Telegram?.WebApp ?? null);

export function telegramStartParam() {
  if (typeof window === 'undefined') return '';

  const params = new URLSearchParams(window.location.search);
  return String(
    tg()?.initDataUnsafe?.start_param ??
      params.get('tgWebAppStartParam') ??
      params.get('start_param') ??
      params.get('startapp') ??
      '',
  ).trim();
}

export function orderNumberFromStartParam(startParam = telegramStartParam()) {
  const raw = String(startParam ?? '').trim();
  if (!raw) return null;

  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();

  const match = decoded.match(ORDER_START_PARAM_PATTERN);
  if (!match) return null;

  return normalizeOrderNumber(match[1]);
}
