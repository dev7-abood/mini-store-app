import styles from './PaymentMethodHeader.module.css';

export default function PaymentMethodHeader({ method, label, kicker, headingId }) {
  const mark = method?.logo ? (
    <img src={method.logo} alt="" />
  ) : (
    <span className={styles.icon} aria-hidden="true">
      {method?.icon || label.slice(0, 2)}
    </span>
  );

  return (
    <div className={styles.header}>
      <span className={styles.logoFrame}>{mark}</span>
      <div className={styles.text}>
        <span>{kicker}</span>
        <h2 id={headingId}>{label}</h2>
      </div>
    </div>
  );
}
