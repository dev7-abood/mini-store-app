import styles from './Button.module.css';

/**
 * Primary call-to-action button.
 *
 * @param {{variant?: 'saffron'|'green', full?: boolean, grow?: boolean}
 *         & React.ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export default function Button({ variant = 'saffron', full = false, grow = false, className = '', ...rest }) {
  const classes = [
    styles.cta,
    variant === 'green' && styles.green,
    full && styles.full,
    grow && styles.grow,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <button type="button" className={classes} {...rest} />;
}
