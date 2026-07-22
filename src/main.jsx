import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import i18n, { applyDocumentLocale } from './i18n';
import App from './App';
import './styles/global.css';

applyDocumentLocale(i18n.language);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/* Remove the static pre-boot loader once React has painted. */
requestAnimationFrame(() => {
  const preboot = document.getElementById('preboot');
  if (preboot) {
    preboot.style.opacity = '0';
    setTimeout(() => preboot.remove(), 400);
  }
});
