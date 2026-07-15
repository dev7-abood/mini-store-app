import styles from './CenterIllustration.module.css';

/**
 * Centered emoji ring + heading + body, used in the phone / OTP / empty
 * cart states.
 *
 * @param {{icon?: React.ReactNode, heading?: React.ReactNode,
 *          children?: React.ReactNode, className?: string}} props
 */
export default function CenterIllustration({ icon, heading, children, className = '' }) {
  return (
    <div className={`${styles.wrap} ${className}`}>
      {icon && <div className={styles.ring}>{icon}</div>}
      {heading && <h2>{heading}</h2>}
      {children && <p>{children}</p>}
    </div>
  );
}
