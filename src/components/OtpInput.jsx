import { useEffect, useRef, useState } from 'react';
import { JAWWAL_PAY_OTP_LENGTH, normalizeOtpDigits } from '../lib/jawwalPayCheckout';
import styles from './OtpInput.module.css';

const emptyDigits = (length) => Array(length).fill('');

/**
 * Five-box OTP input with auto-advance, backspace navigation, paste
 * support, and a shake-on-error state.
 *
 * @param {{onComplete?: (code: string) => void, onChangeCode?: (code: string) => void,
 *          error?: boolean, onErrorHandled?: () => void, disabled?: boolean,
 *          autoSubmit?: boolean, length?: number,
 *          getDigitLabel?: (index: number) => string}} props
 */
export default function OtpInput({
  onComplete,
  onChangeCode,
  error = false,
  onErrorHandled = () => {},
  disabled = false,
  autoSubmit = true,
  length = JAWWAL_PAY_OTP_LENGTH,
  getDigitLabel = (index) => `OTP digit ${index + 1}`,
}) {
  const [digits, setDigits] = useState(() => emptyDigits(length));
  const refs = useRef([]);

  useEffect(() => {
    setDigits(emptyDigits(length));
    refs.current = refs.current.slice(0, length);
  }, [length]);

  /* Focus the first box on mount (after the screen transition). */
  useEffect(() => {
    const timer = setTimeout(() => refs.current[0]?.focus(), 350);
    return () => clearTimeout(timer);
  }, []);

  /* On error: shake, then clear and refocus. */
  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => {
      setDigits(emptyDigits(length));
      onChangeCode?.('');
      refs.current[0]?.focus();
      onErrorHandled();
    }, 450);
    return () => clearTimeout(timer);
  }, [error, length, onChangeCode, onErrorHandled]);

  const commit = (next) => {
    setDigits(next);
    const code = next.join('');
    onChangeCode?.(code);
    if (autoSubmit && code.length === length && next.every(Boolean)) onComplete?.(code);
  };

  const handleChange = (index, raw) => {
    if (disabled) return;

    const value = normalizeOtpDigits(raw);
    if (!value) {
      commit(digits.map((d, i) => (i === index ? '' : d)));
      return;
    }

    /* Support pasting the whole code into any box. */
    const next = [...digits];
    value.split('').slice(0, length - index).forEach((char, offset) => {
      next[index + offset] = char;
    });
    commit(next);
    refs.current[Math.min(index + value.length, length - 1)]?.focus();
  };

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  return (
    <div className={styles.row}>
      {digits.map((digit, index) => (
        <input
          /* eslint-disable-next-line react/no-array-index-key */
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          className={`${styles.box} ${error ? styles.err : ''}`}
          value={digit}
          maxLength={length}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={getDigitLabel(index)}
          disabled={disabled}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
        />
      ))}
    </div>
  );
}
