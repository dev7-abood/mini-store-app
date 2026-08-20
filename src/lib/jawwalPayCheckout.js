export const JAWWAL_PAY_METHOD = 'jawwalpay';
export const JAWWAL_PAY_OTP_LENGTH = 5;
export const DEFAULT_JAWWAL_PAY_CONFIRMATION_URL = '/checkout/jawwal-pay/confirm';

const INVALID_OTP_CODES = new Set([
  '89',
  'invalid_otp',
  'otp_invalid',
  'invalid_code',
  'verification_failed',
]);

function emptyToNull(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function booleanValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes'].includes(normalized)) return true;
    if (['0', 'false', 'no'].includes(normalized)) return false;
  }
  return fallback;
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function paymentFromData(data) {
  return data?.payment ?? data?.data?.payment ?? null;
}

function confirmationUrlFromData(data) {
  return (
    data?.confirmation_url
    ?? data?.confirmationUrl
    ?? data?.data?.confirmation_url
    ?? data?.data?.confirmationUrl
    ?? DEFAULT_JAWWAL_PAY_CONFIRMATION_URL
  );
}

export function buildJawwalPayCheckoutPayload({
  phone,
  deliveryPhone = null,
  address,
  paymentMethod = JAWWAL_PAY_METHOD,
  note = null,
}) {
  return {
    phone,
    delivery_phone: emptyToNull(deliveryPhone),
    address,
    payment_method: paymentMethod,
    note: emptyToNull(note),
  };
}

export function normalizeJawwalPayOtpSession(data, checkoutPayload, receivedAt = Date.now()) {
  const payment = paymentFromData(data);
  if (!payment || !booleanValue(payment.requires_otp ?? payment.requiresOtp)) return null;

  const paymentSessionId = (
    payment.payment_session_id
    ?? payment.paymentSessionId
    ?? payment.session_id
    ?? payment.sessionId
    ?? null
  );
  const expiresIn = Math.max(0, numberValue(payment.expires_in ?? payment.expiresIn, 0));

  return {
    paymentSessionId,
    confirmationUrl: confirmationUrlFromData(data),
    checkoutPayload: { ...(checkoutPayload ?? {}) },
    notifiedPhone: payment.notified_phone ?? payment.notifiedPhone ?? checkoutPayload?.phone ?? '',
    expiresIn,
    expiresAt: receivedAt + expiresIn * 1000,
    otpLength: JAWWAL_PAY_OTP_LENGTH,
    shouldPoll: false,
    checkoutCompleted: booleanValue(payment.checkout_completed ?? payment.checkoutCompleted),
    status: payment.status ?? null,
    nextAction: payment.next_action ?? payment.nextAction ?? null,
    rawPayment: payment,
  };
}

export function shouldOpenJawwalPayOtp(result, checkoutPayload) {
  return Boolean(normalizeJawwalPayOtpSession(result?.data ?? result, checkoutPayload));
}

export function normalizeOtpDigits(value) {
  return Array.from(String(value ?? ''))
    .map((char) => {
      if (char >= '0' && char <= '9') return char;

      const code = char.charCodeAt(0);
      if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
      if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
      return '';
    })
    .join('');
}

export function isCompleteJawwalPayOtp(value) {
  return normalizeOtpDigits(value).length === JAWWAL_PAY_OTP_LENGTH;
}

export function buildJawwalPayConfirmationRequest(session, code) {
  const normalizedCode = normalizeOtpDigits(code);
  if (normalizedCode.length !== JAWWAL_PAY_OTP_LENGTH) {
    throw new Error(`Jawwal Pay OTP must be exactly ${JAWWAL_PAY_OTP_LENGTH} digits.`);
  }

  return {
    url: session.confirmationUrl,
    payload: {
      ...session.checkoutPayload,
      payment_session_id: session.paymentSessionId,
      code: normalizedCode,
    },
  };
}

export function apiPathFromConfirmationUrl(confirmationUrl, apiPrefix = '/api/v1') {
  const raw = String(confirmationUrl || DEFAULT_JAWWAL_PAY_CONFIRMATION_URL).trim();
  let pathname = raw;
  let search = '';

  try {
    const parsed = new URL(raw, 'https://tenant.local');
    pathname = parsed.pathname;
    search = parsed.search;
  } catch {
    const [pathPart, queryPart = ''] = raw.split('?');
    pathname = pathPart;
    search = queryPart ? `?${queryPart}` : '';
  }

  const normalizedPrefix = `/${String(apiPrefix).replace(/^\/+|\/+$/g, '')}`;
  if (pathname.startsWith(`${normalizedPrefix}/`)) {
    pathname = pathname.slice(normalizedPrefix.length);
  }

  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  return `${pathname}${search}`;
}

function resultText(result) {
  return [
    result?.code,
    result?.error?.code,
    result?.message,
    result?.error?.message,
    result?.error?.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function jawwalPayErrorMessage(result) {
  return (
    result?.message
    ?? result?.error?.message
    ?? result?.error?.description
    ?? null
  );
}

export function isInvalidJawwalPayOtpError(result) {
  const code = String(result?.code ?? result?.error?.code ?? '').trim().toLowerCase();
  if (INVALID_OTP_CODES.has(code)) return true;
  return /\binvalid\s+(otp|code)\b|\bwrong\s+(otp|code)\b/.test(resultText(result));
}

export function isExpiredOrMissingJawwalPaySessionError(result) {
  if (isInvalidJawwalPayOtpError(result)) return false;
  return /\b(expired|missing|not\s*found)\b|session[_\s-]*(expired|missing|not[_\s-]*found|invalid)/.test(
    resultText(result),
  );
}

export function resolveJawwalPayConfirmationOutcome(result) {
  if (result?.duplicate) {
    return {
      action: 'stay_on_otp',
      keepSession: true,
      clearOtp: false,
      duplicate: true,
      message: null,
    };
  }

  if (!result?.ok) {
    const message = jawwalPayErrorMessage(result);

    if (result?.status == null) {
      return {
        action: 'stay_on_otp',
        keepSession: true,
        clearOtp: false,
        network: true,
        message,
      };
    }

    if (isInvalidJawwalPayOtpError(result)) {
      return {
        action: 'stay_on_otp',
        keepSession: true,
        clearOtp: true,
        invalidOtp: true,
        message,
      };
    }

    if (isExpiredOrMissingJawwalPaySessionError(result)) {
      return {
        action: 'return_to_checkout',
        keepSession: false,
        clearOtp: true,
        expiredSession: true,
        message,
      };
    }

    return {
      action: 'stay_on_otp',
      keepSession: true,
      clearOtp: true,
      message,
    };
  }

  const payment = paymentFromData(result.data);
  const checkoutCompleted = booleanValue(payment?.checkout_completed ?? payment?.checkoutCompleted);

  if (!checkoutCompleted) {
    return {
      action: 'stay_on_otp',
      keepSession: true,
      clearOtp: false,
      checkoutCompleted: false,
      message: result.message ?? null,
    };
  }

  return {
    action: 'redirect',
    keepSession: false,
    clearOtp: true,
    checkoutCompleted: true,
    redirectUrl: result.data?.redirect_url ?? result.data?.redirectUrl ?? null,
    order: result.data?.order ?? null,
    payment,
    message: result.message ?? null,
  };
}

export function shouldPollWhileAwaitingJawwalPayOtp() {
  return false;
}

export function createSingleFlightSubmitter(task) {
  let inFlight = false;

  return async (...args) => {
    if (inFlight) return { ok: false, duplicate: true };

    inFlight = true;
    try {
      return await task(...args);
    } finally {
      inFlight = false;
    }
  };
}
