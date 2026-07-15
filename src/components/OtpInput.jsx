import { useEffect, useRef, useState } from 'react';
import styles from './OtpInput.module.css';

const LENGTH = 6;
const EMPTY = Array(LENGTH).fill('');

/**
 * Six-box OTP input with auto-advance, backspace navigation, paste
 * support, and a shake-on-error state.
 *
 * @param {{onComplete: (code: string) => void, error: boolean,
 *          onErrorHandled: () => void}} props
 */
export default function OtpInput({ onComplete, error, onErrorHandled }) {
  const [digits, setDigits] = useState(EMPTY);
  const refs = useRef([]);

  /* Focus the first box on mount (after the screen transition). */
  useEffect(() => {
    const timer = setTimeout(() => refs.current[0]?.focus(), 350);
    return () => clearTimeout(timer);
  }, []);

  /* On error: shake, then clear and refocus. */
  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => {
      setDigits(EMPTY);
      refs.current[0]?.focus();
      onErrorHandled();
    }, 450);
    return () => clearTimeout(timer);
  }, [error, onErrorHandled]);

  const commit = (next) => {
    setDigits(next);
    const code = next.join('');
    if (code.length === LENGTH && next.every(Boolean)) onComplete(code);
  };

  const handleChange = (index, raw) => {
    const value = raw.replace(/\D/g, '');
    if (!value) {
      commit(digits.map((d, i) => (i === index ? '' : d)));
      return;
    }

    /* Support pasting the whole code into any box. */
    const next = [...digits];
    value.split('').slice(0, LENGTH - index).forEach((char, offset) => {
      next[index + offset] = char;
    });
    commit(next);
    refs.current[Math.min(index + value.length, LENGTH - 1)]?.focus();
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
          maxLength={LENGTH}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
        />
      ))}
    </div>
  );
}
