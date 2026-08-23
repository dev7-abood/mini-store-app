import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ToastContext.module.css';

const ToastContext = createContext(null);

const TOAST_TYPES = new Set(['success', 'error', 'warning', 'info']);
const DEFAULT_DURATION = 4500;
const CONFIRM_DURATION = 10000;
const MAX_TOASTS = 4;

const TYPE_MARKS = {
  success: 'OK',
  error: '!',
  warning: '!',
  info: 'i',
};

function normalizeToastType(type) {
  return TOAST_TYPES.has(type) ? type : 'info';
}

function normalizeToastOptions(options) {
  if (typeof options === 'string') return { type: options };
  return options && typeof options === 'object' ? options : {};
}

function normalizeDuration(duration, fallback) {
  const value = Number(duration);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function toastSignature(message, options) {
  return options.key || `${normalizeToastType(options.type)}:${options.title || ''}:${message}`;
}

export function ToastProvider({ children }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState([]);
  const nextIdRef = useRef(0);
  const activeSignaturesRef = useRef(new Set());
  const toastMetaRef = useRef(new Map());

  const cleanupToast = useCallback((id, reason = 'dismiss') => {
    const meta = toastMetaRef.current.get(id);
    if (!meta) return;

    if (meta.timer) window.clearTimeout(meta.timer);
    activeSignaturesRef.current.delete(meta.signature);
    toastMetaRef.current.delete(id);
    meta.onDismiss?.(reason);
  }, []);

  const dismissToast = useCallback(
    (id, reason = 'dismiss') => {
      cleanupToast(id, reason);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    },
    [cleanupToast],
  );

  const toast = useCallback(
    (message, options = {}) => {
      const text = String(message ?? '').trim();
      if (!text) return null;

      const normalized = normalizeToastOptions(options);
      const type = normalizeToastType(normalized.type);
      const signature = toastSignature(text, { ...normalized, type });

      if (activeSignaturesRef.current.has(signature)) return null;

      const id = `toast-${Date.now()}-${(nextIdRef.current += 1)}`;
      const duration = normalizeDuration(normalized.duration, DEFAULT_DURATION);
      const entry = {
        id,
        type,
        title: normalized.title,
        message: text,
        actionLabel: normalized.actionLabel,
        onAction: normalized.onAction,
        secondaryActionLabel: normalized.secondaryActionLabel,
        onSecondaryAction: normalized.onSecondaryAction,
      };

      activeSignaturesRef.current.add(signature);
      toastMetaRef.current.set(id, {
        signature,
        timer: duration > 0
          ? window.setTimeout(() => dismissToast(id, 'timeout'), duration)
          : null,
        onDismiss: normalized.onDismiss,
      });

      setToasts((current) => {
        const next = [...current, entry];
        const overflow = next.length - MAX_TOASTS;
        if (overflow <= 0) return next;

        const removed = next.slice(0, overflow);
        removed.forEach((removedToast) => cleanupToast(removedToast.id, 'overflow'));
        return next.slice(overflow);
      });

      return id;
    },
    [cleanupToast, dismissToast],
  );

  const confirmToast = useCallback(
    (message, options = {}) =>
      new Promise((resolve) => {
        const normalized = normalizeToastOptions(options);
        let settled = false;

        const settle = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };

        const id = toast(message, {
          ...normalized,
          type: normalized.type || 'warning',
          duration: normalizeDuration(normalized.duration, CONFIRM_DURATION),
          actionLabel: normalized.confirmLabel || t('common.confirm'),
          onAction: () => settle(true),
          secondaryActionLabel: normalized.cancelLabel || t('common.cancel'),
          onSecondaryAction: () => settle(false),
          onDismiss: () => settle(false),
        });

        if (!id) settle(false);
      }),
    [t, toast],
  );

  const value = useMemo(
    () => ({ toast, confirmToast, dismissToast }),
    [toast, confirmToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.viewport} aria-live="polite" aria-relevant="additions">
        {toasts.map((entry) => {
          const hasActions = entry.actionLabel || entry.secondaryActionLabel;

          return (
            <section
              key={entry.id}
              className={`${styles.toast} ${styles[entry.type]}`}
              role={entry.type === 'error' ? 'alert' : 'status'}
            >
              <span className={styles.mark} aria-hidden="true">
                {TYPE_MARKS[entry.type]}
              </span>
              <div className={styles.body}>
                <b>{entry.title || t(`common.notificationTypes.${entry.type}`)}</b>
                <p dir="auto">{entry.message}</p>
                {hasActions && (
                  <div className={styles.actions}>
                    {entry.secondaryActionLabel && (
                      <button
                        type="button"
                        className={styles.secondaryAction}
                        onClick={() => {
                          entry.onSecondaryAction?.();
                          dismissToast(entry.id, 'secondary-action');
                        }}
                      >
                        {entry.secondaryActionLabel}
                      </button>
                    )}
                    {entry.actionLabel && (
                      <button
                        type="button"
                        className={styles.primaryAction}
                        onClick={() => {
                          entry.onAction?.();
                          dismissToast(entry.id, 'action');
                        }}
                      >
                        {entry.actionLabel}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                className={styles.dismiss}
                onClick={() => dismissToast(entry.id)}
                aria-label={t('common.dismiss')}
              >
                x
              </button>
            </section>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToasts() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToasts must be used inside <ToastProvider>');
  return context;
}
