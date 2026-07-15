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
