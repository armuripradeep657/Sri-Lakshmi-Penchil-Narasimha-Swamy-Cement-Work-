import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

function notifyListeners() {
  promptListeners.forEach((cb) => cb());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    notifyListeners();
  });
}

export type DirectInstallResult = 'installed' | 'dismissed' | 'manual';

function checkIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() => globalDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState(() => checkIsStandalone());
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const minimalQuery = window.matchMedia('(display-mode: minimal-ui)');
    const checkStandalone = () => {
      setIsInstalled(checkIsStandalone());
    };
    checkStandalone();

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsAndroid(/android/.test(userAgent));
    try {
      setIsInIframe(window.self !== window.top);
    } catch {
      setIsInIframe(true);
    }

    const syncPrompt = () => {
      setDeferredPrompt(globalDeferredPrompt);
      checkStandalone();
    };

    const handleAppInstalled = () => {
      globalDeferredPrompt = null;
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    promptListeners.add(syncPrompt);
    standaloneQuery.addEventListener?.('change', checkStandalone);
    minimalQuery.addEventListener?.('change', checkStandalone);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      promptListeners.delete(syncPrompt);
      standaloneQuery.removeEventListener?.('change', checkStandalone);
      minimalQuery.removeEventListener?.('change', checkStandalone);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<DirectInstallResult> => {
    const promptEvent = globalDeferredPrompt || deferredPrompt;
    if (promptEvent) {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        globalDeferredPrompt = null;
        setDeferredPrompt(null);
        setIsInstalled(true);
        return 'installed';
      }
      return 'dismissed';
    }
    return 'manual';
  }, [deferredPrompt]);

  return {
    isInstallable: Boolean(deferredPrompt || globalDeferredPrompt),
    isInstalled,
    isIOS,
    isAndroid,
    isInIframe,
    install,
  };
}
