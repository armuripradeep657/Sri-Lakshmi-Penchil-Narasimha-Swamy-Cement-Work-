import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './hooks/usePWAInstall';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      // Do not force-reload active billing sessions; new assets apply on next app open.
    },
    onOfflineReady() {
      // Offline app shell cached silently in background.
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);
