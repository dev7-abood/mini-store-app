import { useState } from 'react';
import styles from './Photo.module.css';

/**
 * Photo with an emoji fallback: the emoji sits underneath and the image
 * unmounts itself if it fails to load (offline / blocked CDN).
 *
 * @param {{src: string, fallback: string, tint?: string,
 *          fallbackSize?: string, className?: string}} props
 */
export default function Photo({ src, fallback, tint, fallbackSize, className = '' }) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={`${styles.frame} ${className}`}
      style={{ '--tint': tint, '--fb-size': fallbackSize }}
    >
      <span className={styles.fallback} aria-hidden="true">
        {fallback}
      </span>
      {!failed && (
        <img
          className={styles.img}
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
