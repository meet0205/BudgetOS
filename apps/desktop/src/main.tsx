import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register the service worker for installable/offline PWA behaviour (prod only;
// skipped inside Electron and on dev where it just adds noise).
if ('serviceWorker' in navigator && import.meta.env.PROD && !window.budgetosNative) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* non-fatal */ });
  });
}
