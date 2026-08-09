import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useOrder } from '../context/OrderContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useOrderFlow } from '../context/OrderFlowContext';
import { useTelegram } from '../hooks/useTelegram';
import { useMoney } from '../hooks/useMoney';
import {
  isNegativeFinalStatus,
  isOrderFinal,
  normalizeOrderNumber,
  normalizeStatusValue,
} from '../lib/orderStatus';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import OrderTimeline from '../components/OrderTimeline';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './StatusScreen.module.css';

const REFRESH_MS = 15000;

function useFormattedDate() {
  const { i18n } = useTranslation();
  return useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language || 'ar', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [i18n.language],
  );
}

function statusText(t, value, fallback) {
  const key = `status.values.${normalizeStatusValue(value)}`;
  const translated = t(key);
  return translated === key ? fallback || value : translated;
}

function paymentText(t, value, fallback) {
  const key = `status.paymentValues.${normalizeStatusValue(value)}`;
  const translated = t(key);
  return translated === key ? fallback || value : translated;
}

function orderItems(order) {
  return (order?.items ?? []).map((raw, index) => {
    const item = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
    const name =
      item?.name
      ?? item?.product_name
      ?? item?.productName
      ?? item?.product?.name
      ?? `#${item?.product_id ?? item?.id ?? index + 1}`;
    const quantity = Number(item?.quantity ?? item?.qty ?? 1);
    const total = Number(
      item?.total
      ?? item?.total_price
      ?? item?.line_total
      ?? item?.subtotal
      ?? item?.price
      ?? 0,
    );

    return {
      key: item?.id ?? item?.product_id ?? `${name}-${index}`,
      name: String(name),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      total: Number.isFinite(total) ? total : 0,
    };
  });
}

function classNames(...names) {
  return names.filter(Boolean).join(' ');
}

function SkeletonLine({ className = '' }) {
  return <span className={classNames(styles.skeleton, className)} aria-hidden="true" />;
}

function SkeletonPanel({ rows = 3 }) {
  return (
    <section className={styles.panel} aria-hidden="true">
      <SkeletonLine className={styles.skeletonPanelTitle} />
      <div className={styles.skeletonRows}>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className={styles.skeletonRow}>
            <SkeletonLine className={styles.skeletonRowLabel} />
            <SkeletonLine className={styles.skeletonRowValue} />
          </div>
        ))}
      </div>
    </section>
  );
}

function LoadingSkeleton({ t }) {
  return (
    <Screen>
      <SubHeader
        title={t('status.title')}
        showBack={false}
        trailing={<SkeletonLine className={styles.skeletonChip} />}
      />

      <main className={styles.content} aria-busy="true" aria-live="polite">
        <section className={classNames(styles.hero, styles.loadingHero)}>
          <span className={styles.eyebrow}>{t('status.loadingTitle')}</span>
          <SkeletonLine className={styles.skeletonStatusTitle} />
          <p>{t('status.loadingBody')}</p>
          <div className={styles.heroMeta} aria-hidden="true">
            <SkeletonLine className={styles.skeletonMeta} />
            <SkeletonLine className={styles.skeletonMetaShort} />
          </div>
        </section>

        <section className={classNames(styles.panel, styles.skeletonTimeline)} aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className={styles.skeletonStep}>
              <span className={styles.skeletonDot} />
              <div className={styles.skeletonStepBody}>
                <SkeletonLine className={styles.skeletonStepTitle} />
                <SkeletonLine className={styles.skeletonStepCaption} />
              </div>
            </div>
          ))}
        </section>

        <SkeletonPanel rows={4} />
        <SkeletonPanel rows={3} />
      </main>
    </Screen>
  );
}

function StateView({ title, body, actionLabel, onAction, icon = '!', tone = 'default' }) {
  const toneClass = tone === 'danger' ? styles.stateDanger : '';

  return (
    <Screen>
      <SubHeader title={title} showBack={false} />
      <main className={styles.stateWrap}>
        <section className={classNames(styles.stateCard, toneClass)} role="status">
          <div className={styles.stateIcon} aria-hidden="true">
            {icon}
          </div>
          <h2>{title}</h2>
          <p>{body}</p>
        </section>
        {actionLabel && (
          <Button full onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </main>
    </Screen>
  );
}

function InfoRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className={styles.infoRow}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export default function StatusScreen() {
  const { t } = useTranslation();
  const money = useMoney();
  const dateFormat = useFormattedDate();
  const routeNavigate = useNavigate();
  const { orderNumber: routeOrderNumber } = useParams();
  const { orderNumber: contextOrderNumber, resetOrder } = useOrder();
  const { navigate: flowNavigate } = useNavigation();
  const { notify, haptic } = useTelegram();
  const {
    order,
    loadOrder,
    refresh,
    cancel,
    reset: resetOrderFlow,
    isBusy,
  } = useOrderFlow();
  const [loadState, setLoadState] = useState('idle');
  const [loadMessage, setLoadMessage] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const routeNumber = useMemo(
    () => (routeOrderNumber ? normalizeOrderNumber(routeOrderNumber) : null),
    [routeOrderNumber],
  );
  const invalidRouteNumber = Boolean(routeOrderNumber && !routeNumber);
  const activeOrderNumber = routeNumber ?? normalizeOrderNumber(contextOrderNumber);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (invalidRouteNumber) {
        setLoadState('invalid');
        setLoadMessage(null);
        return;
      }

      if (!activeOrderNumber) {
        setLoadState('missing');
        setLoadMessage(null);
        return;
      }

      setLoadState('loading');
      setLoadMessage(null);
      const result = await loadOrder(activeOrderNumber);
      if (cancelled) return;

      if (result.ok) {
        setLoadState('ready');
        return;
      }

      if (result.empty) {
        setLoadState('empty');
        return;
      }

      setLoadMessage(result.message);
      setLoadState(result.status === 404 ? 'notFound' : 'error');
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [activeOrderNumber, invalidRouteNumber, loadOrder, reloadKey]);

  useEffect(() => {
    if (loadState !== 'ready' || !activeOrderNumber || !order || isOrderFinal(order)) {
      return undefined;
    }

    const timer = window.setInterval(() => refresh(activeOrderNumber), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [activeOrderNumber, loadState, order, refresh]);

  const orderAgain = () => {
    resetOrderFlow();
    resetOrder();
    flowNavigate(SCREENS.MENU);
    routeNavigate('/', { replace: true });
  };

  const cancelCurrentOrder = async () => {
    if (!window.confirm(t('status.cancelConfirm'))) return;

    haptic('rigid');
    const ok = await cancel();
    notify(ok ? t('status.cancelled') : t('status.cancelFailed'));
    if (ok && activeOrderNumber) refresh(activeOrderNumber);
  };

  if (loadState === 'loading' || loadState === 'idle') {
    return <LoadingSkeleton t={t} />;
  }

  if (loadState === 'invalid' || loadState === 'missing') {
    return (
      <StateView
        title={t('status.invalidTitle')}
        body={t('status.invalidBody')}
        actionLabel={t('status.orderAgain')}
        onAction={orderAgain}
        icon="?"
      />
    );
  }

  if (loadState === 'notFound') {
    return (
      <StateView
        title={t('status.notFoundTitle')}
        body={t('status.notFoundBody')}
        actionLabel={t('status.orderAgain')}
        onAction={orderAgain}
        icon="?"
      />
    );
  }

  if (loadState === 'empty') {
    return (
      <StateView
        title={t('status.emptyTitle')}
        body={t('status.emptyBody')}
        actionLabel={t('status.refresh')}
        onAction={() => setReloadKey((key) => key + 1)}
        icon="i"
      />
    );
  }

  if (loadState === 'error' || !order) {
    return (
      <StateView
        title={t('status.errorTitle')}
        body={loadMessage || t('status.errorBody')}
        actionLabel={t('status.refresh')}
        onAction={() => setReloadKey((key) => key + 1)}
        tone="danger"
      />
    );
  }

  const negativeFinal = isNegativeFinalStatus(order.status);
  const positiveFinal = isOrderFinal(order) && !negativeFinal;
  const orderDate = order.placedAt ?? order.createdAt;
  const parsedOrderDate = orderDate ? new Date(orderDate) : null;
  const formattedDate =
    parsedOrderDate && !Number.isNaN(parsedOrderDate.getTime())
      ? dateFormat.format(parsedOrderDate)
      : null;
  const statusLabel = statusText(t, order.status, order.statusLabel);
  const finalDescription =
    order.statusDescription ||
    (negativeFinal ? t('status.finalNegativeBody') : t('status.steps.delivered.caption'));
  const statusDescription =
    negativeFinal || positiveFinal
      ? finalDescription
      : order.statusDescription || t('status.currentBody');
  const paymentLabel = paymentText(t, order.paymentStatus, order.paymentStatusLabel);
  const items = orderItems(order);

  return (
    <Screen>
      <SubHeader
        title={t('status.title')}
        showBack={false}
        trailing={<span className={styles.chip}>{order.orderNumber}</span>}
      />

      <main className={styles.content}>
        <section
          className={classNames(
            styles.hero,
            negativeFinal && styles.heroDanger,
            positiveFinal && styles.heroSuccess,
          )}
        >
          <div className={styles.heroTop}>
            <span className={styles.eyebrow}>{t('status.current')}</span>
            <span className={styles.statusMark} aria-hidden="true">
              {negativeFinal ? '!' : positiveFinal ? '✓' : order.statusStep || ''}
            </span>
          </div>
          <h2>{statusLabel}</h2>
          {statusDescription && <p>{statusDescription}</p>}
          <div className={styles.heroMeta}>
            <span>{t('status.orderNumber')}: {order.orderNumber}</span>
            {formattedDate && <span>{formattedDate}</span>}
          </div>
        </section>

        {negativeFinal ? (
          <section className={styles.finalNotice}>
            <b>{statusLabel}</b>
            <p>{finalDescription}</p>
          </section>
        ) : (
          <>
            <OrderTimeline order={order} />
            {positiveFinal && (
              <section className={classNames(styles.finalNotice, styles.finalNoticeSuccess)}>
                <b>{statusLabel}</b>
                <p>{finalDescription}</p>
              </section>
            )}
          </>
        )}

        <section className={styles.panel}>
          <h3>{t('status.summaryTitle')}</h3>
          <InfoRow label={t('status.orderDate')} value={formattedDate} />
          <InfoRow label={t('status.address')} value={order.address} />
          <InfoRow label={t('status.phone')} value={order.phoneNumber} />
          <InfoRow label={t('status.deliveryPhone')} value={order.deliveryPhone} />
          <InfoRow label={t('status.deliveryCode')} value={order.deliveryCode} />
          <InfoRow label={t('status.note')} value={order.note} />
        </section>

        {items.length > 0 && (
          <section className={styles.panel}>
            <h3>{t('status.itemsTitle')}</h3>
            <div className={styles.items}>
              {items.map((item) => (
                <div key={item.key} className={styles.item}>
                  <div>
                    <b>{item.name}</b>
                    <span>{t('status.itemQuantity', { count: item.quantity })}</span>
                  </div>
                  {item.total > 0 && <strong>{money(item.total)}</strong>}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className={styles.panel}>
          <h3>{t('status.paymentTitle')}</h3>
          <InfoRow label={t('status.paymentMethod')} value={order.paymentMethodLabel || order.paymentMethod} />
          <InfoRow label={t('status.paymentStatus')} value={paymentLabel} />
          <InfoRow label={t('status.paymentPhone')} value={order.paymentPhone} />
          <InfoRow label={t('status.paymentFailure')} value={order.paymentFailureReason} />
        </section>

        <section className={styles.panel}>
          <h3>{t('status.totalsTitle')}</h3>
          <InfoRow label={t('cart.subtotal')} value={money(order.subtotal)} />
          {order.discountTotal > 0 && (
            <InfoRow label={t('status.discount')} value={money(order.discountTotal)} />
          )}
          <InfoRow label={t('cart.delivery')} value={money(order.deliveryFee)} />
          <InfoRow label={t('cart.total')} value={money(order.total)} />
        </section>
      </main>

      <FixedCta>
        <div className={styles.actions}>
          {order.isCancellable && !negativeFinal && (
            <Button
              full
              className={styles.cancelButton}
              disabled={isBusy}
              onClick={cancelCurrentOrder}
            >
              {t('status.cancel')}
            </Button>
          )}
          <Button variant="green" full onClick={orderAgain}>
            {t('status.orderAgain')}
          </Button>
        </div>
      </FixedCta>
    </Screen>
  );
}
