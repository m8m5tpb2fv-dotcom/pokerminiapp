interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  colorScheme: 'light' | 'dark';
  openInvoice: (url: string, callback: (status: string) => void) => void;
  showAlert?: (message: string) => void;
  HapticFeedback?: { impactOccurred: (style: string) => void; notificationOccurred: (type: string) => void };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

const webApp = window.Telegram?.WebApp;

export function initTelegram(): void {
  webApp?.ready();
  webApp?.expand();
}

export function getColorScheme(): 'light' | 'dark' {
  return webApp?.colorScheme ?? 'dark';
}

/**
 * Real Telegram clients supply `initData` automatically. For local browser
 * development (no Telegram runtime) we fall back to a debug identity that the
 * server only accepts when it has no BOT_TOKEN configured.
 */
export function getInitData(): string {
  if (webApp?.initData) return webApp.initData;
  const key = 'poker_debug_identity';
  let identity = localStorage.getItem(key);
  if (!identity) {
    const id = Math.floor(Math.random() * 1_000_000) + 1000;
    identity = `debug:${id}:Guest${id}`;
    localStorage.setItem(key, identity);
  }
  return identity;
}

export function isRealTelegramClient(): boolean {
  return Boolean(webApp?.initData);
}

export function openInvoice(url: string): Promise<string> {
  return new Promise((resolve) => {
    if (!webApp) {
      window.open(url, '_blank');
      resolve('unknown');
      return;
    }
    webApp.openInvoice(url, (status) => resolve(status));
  });
}

export function haptic(kind: 'success' | 'error' | 'impact' = 'impact'): void {
  if (kind === 'success') webApp?.HapticFeedback?.notificationOccurred('success');
  else if (kind === 'error') webApp?.HapticFeedback?.notificationOccurred('error');
  else webApp?.HapticFeedback?.impactOccurred('light');
}
