export const ORDER_NUMBER_PATTERN = /^[A-Za-z0-9-]+$/;

export const ORDER_PROGRESS_STEPS = [
  {
    id: 'pending',
    value: 'pending',
    aliases: ['awaiting_payment', 'awaiting_verification', 'unverified'],
    icon: '1',
    step: 1,
  },
  { id: 'confirmed', value: 'confirmed', aliases: ['accepted'], icon: '2', step: 2 },
  { id: 'preparing', value: 'preparing', icon: '3', step: 3 },
  { id: 'outForDelivery', value: 'out_for_delivery', aliases: ['on_the_way'], icon: '4', step: 4 },
  { id: 'delivered', value: 'delivered', aliases: ['completed'], icon: '5', step: 5 },
];

export const NEGATIVE_FINAL_STATUSES = new Set([
  'cancelled',
  'canceled',
  'rejected',
  'failed',
]);

export function normalizeOrderNumber(value) {
  const normalized = String(value ?? '').trim();
  return ORDER_NUMBER_PATTERN.test(normalized) ? normalized : null;
}

export function normalizeStatusValue(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function isNegativeFinalStatus(value) {
  return NEGATIVE_FINAL_STATUSES.has(normalizeStatusValue(value));
}

export function isOrderFinal(order) {
  return (
    Boolean(order?.isFinal) ||
    isNegativeFinalStatus(order?.status) ||
    stepForStatus(order?.status)?.id === 'delivered'
  );
}

export function stepMatchesStatus(step, statusValue) {
  const status = normalizeStatusValue(statusValue);
  return step.value === status || (step.aliases ?? []).includes(status);
}

export function stepForStatus(statusValue) {
  return ORDER_PROGRESS_STEPS.find((step) => stepMatchesStatus(step, statusValue)) ?? null;
}

export function visibleProgressSteps(order) {
  const total = Number(order?.statusTotalSteps);
  if (!Number.isFinite(total) || total <= 0) return ORDER_PROGRESS_STEPS;
  return ORDER_PROGRESS_STEPS.filter((step) => step.step <= total);
}

export function progressStateForStep(order, step) {
  if (isNegativeFinalStatus(order?.status)) return 'upcoming';

  const apiStep = Number(order?.statusStep);
  const hasApiStep = Number.isFinite(apiStep) && apiStep > 0;
  const currentByValue = stepMatchesStatus(step, order?.status);
  const currentStep = hasApiStep ? apiStep : stepForStatus(order?.status)?.step ?? 1;

  if (isOrderFinal(order) && step.step <= currentStep) return 'done';
  if (currentByValue) return 'current';
  if (step.step < currentStep) return 'done';
  if (step.step === currentStep) return 'current';
  return 'upcoming';
}
