import {
  findPaymentMethod,
  manualReceivingInfoForMethod,
  manualReceivingInfoForPaymentMethod,
} from './paymentMethods';

const STORAGE_KEY = 'safra_mock_manual_payment_orders_v1';
const COUNTER_KEY = 'safra_mock_manual_payment_counter_v1';
const REMINDER_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * @typedef {{id: number|string, name: string, quantity: number, total: number}} OrderItem
 * @typedef {{id: string, nameKey?: string, name?: string, type: string, logo?: string, icon?: string}} PaymentMethodSummary
 * @typedef {{
 *   receiverName?: string,
 *   accountHolderName?: string,
 *   walletPhoneNumber?: string,
 *   accountNumber?: string,
 *   bankOrWalletName?: string,
 *   bankName?: string,
 *   iban?: string,
 *   branchName?: string,
 *   address?: string,
 *   additionalInstructions?: string,
 * }} PaymentReceiver
 * @typedef {{
 *   fullName: string,
 *   accountIdentifier: string,
 *   transactionNumber: string,
 *   paymentNote: string,
 * }} CustomerPayment
 * @typedef {{
 *   status: 'awaiting_verification'|'paid',
 *   createdAt: string,
 *   paymentInfoReceivedAt: string,
 *   nextReminderAvailableAt: string|null,
 * }} PaymentVerification
 * @typedef {{
 *   id: string,
 *   orderNumber: string,
 *   reference: string,
 *   deliveryAddress?: string,
 *   totalAmount: number,
 *   currency: string,
 *   paymentMethod: PaymentMethodSummary,
 *   receiver: PaymentReceiver,
 *   customerPayment: CustomerPayment,
 *   verification: PaymentVerification,
 *   items: OrderItem[],
 * }} Order
 */

const MOCK_CUSTOMER_PAYMENT = {
  fullName: 'Ahmad Saleh',
  accountIdentifier: '0598765432',
  transactionNumber: 'TXN-58392014',
  paymentNote: 'Paid from mobile wallet',
};

const fallbackItem = { id: 'mock-item-1', name: 'Family meal', quantity: 1, total: 150 };

function storage() {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

function readOrders() {
  try {
    return JSON.parse(storage()?.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeOrders(orders) {
  storage()?.setItem(STORAGE_KEY, JSON.stringify(orders));
}

function nextOrderId() {
  const store = storage();
  const current = Number(store?.getItem(COUNTER_KEY) || 1023);
  const next = Number.isFinite(current) ? current + 1 : 1024;
  store?.setItem(COUNTER_KEY, String(next));
  return String(next);
}

function cleanObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => Boolean(entryValue)),
  );
}

function normalizeReceiver(methodId, method = null) {
  const configured =
    manualReceivingInfoForPaymentMethod(method)
    ?? manualReceivingInfoForMethod(methodId)
    ?? {};
  return cleanObject({
    receiverName: configured.receiverName,
    accountHolderName: configured.accountHolderName,
    walletPhoneNumber: configured.walletPhoneNumber,
    accountNumber: configured.accountNumber,
    bankOrWalletName: configured.bankOrWalletName,
    bankName: configured.bankName,
    iban: configured.iban,
    branchName: configured.branchName,
    address: configured.address,
    additionalInstructions: configured.additionalInstructions,
  });
}

function methodSummary(methodId, paymentMethod = null) {
  const method = paymentMethod ?? findPaymentMethod(methodId);
  return {
    id: method?.id ?? methodId ?? '',
    nameKey: method?.labelKey ?? '',
    name: method?.label ?? '',
    type: method?.type ?? 'manual',
    logo: method?.logo,
    icon: method?.icon,
  };
}

function cartEntriesToItems(entries) {
  const items = entries.map(({ product, qty }) => ({
    id: product.id,
    name: product.name,
    quantity: qty,
    total: Number(product.price || 0) * qty,
  }));

  return items.length > 0 ? items : [fallbackItem];
}

/**
 * Create a mock manual-payment order. Swap this function for the real API
 * call later without changing the pending screen.
 *
 * @param {{entries: Array<{product: object, qty: number}>,
 *   total: number, paymentMethodId: string,
 *   paymentMethod?: import('./paymentMethods').PaymentMethod,
 *   manualPaymentSender?: {fullName: string, accountIdentifier: string},
 *   address?: string}} payload
 * @returns {Order}
 */
export function createMockManualPaymentOrder({
  entries = [],
  total = 0,
  paymentMethodId,
  paymentMethod = null,
  manualPaymentSender = null,
  address = '',
}) {
  const id = nextOrderId();
  return makeMockManualPaymentOrder({
    id,
    entries,
    total,
    paymentMethodId,
    paymentMethod,
    manualPaymentSender,
    address,
    persist: true,
  });
}

function makeMockManualPaymentOrder({
  id,
  entries = [],
  total = 0,
  paymentMethodId = 'palpay',
  paymentMethod = null,
  manualPaymentSender = null,
  address = '',
  persist = false,
}) {
  const items = cartEntriesToItems(entries);
  const totalAmount = Number(total) > 0
    ? Number(total)
    : items.reduce((sum, item) => sum + item.total, 0);
  const now = new Date().toISOString();
  const deliveryAddress = String(address || '').trim();
  const order = {
    id,
    orderNumber: `#${id}`,
    reference: `ORDER-${id}`,
    deliveryAddress,
    totalAmount,
    currency: 'ILS',
    paymentMethod: methodSummary(paymentMethodId, paymentMethod),
    receiver: normalizeReceiver(paymentMethodId, paymentMethod),
    customerPayment: {
      ...MOCK_CUSTOMER_PAYMENT,
      ...(manualPaymentSender
        ? {
          fullName: manualPaymentSender.fullName,
          accountIdentifier: manualPaymentSender.accountIdentifier,
          paymentNote: 'Customer provided sender details during checkout',
        }
        : {}),
    },
    verification: {
      status: 'awaiting_verification',
      createdAt: now,
      paymentInfoReceivedAt: now,
      nextReminderAvailableAt: null,
    },
    items,
  };

  if (persist) {
    const orders = readOrders();
    orders[id] = order;
    writeOrders(orders);
  }

  return order;
}

/**
 * @param {string} orderId
 * @returns {Order}
 */
export function getMockManualPaymentOrder(orderId) {
  const id = String(orderId || '1024').replace(/^#/, '');
  const existing = readOrders()[id];
  if (existing) return existing;

  return makeMockManualPaymentOrder({
    id,
    entries: [],
    total: 150,
    paymentMethodId: 'palpay',
  });
}

/**
 * @param {string} orderId
 * @returns {Promise<Order>}
 */
export function sendMockPaymentReminder(orderId) {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      const orders = readOrders();
      const order = orders[orderId] ?? getMockManualPaymentOrder(orderId);
      const updated = {
        ...order,
        verification: {
          ...order.verification,
          nextReminderAvailableAt: new Date(Date.now() + REMINDER_COOLDOWN_MS).toISOString(),
        },
      };
      orders[updated.id] = updated;
      writeOrders(orders);
      resolve(updated);
    }, 850);
  });
}

export function secondsUntilReminder(order) {
  const nextAt = order?.verification?.nextReminderAvailableAt;
  if (!nextAt) return 0;
  const seconds = Math.ceil((new Date(nextAt).getTime() - Date.now()) / 1000);
  return Math.max(seconds, 0);
}
