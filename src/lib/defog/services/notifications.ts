// Browser Push Notification Service

export interface PushNotificationOptions {
  title: string;
  body: string;
  tag?: string;
  icon?: string;
  requireInteraction?: boolean;
  data?: Record<string, unknown>;
}

// Check if notifications are supported
export function isNotificationSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

// Get current permission status
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

// Request notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) return 'unsupported';

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    console.error('Failed to request notification permission:', error);
    return 'denied';
  }
}

// Check if we're in quiet hours
export function isInQuietHours(quietHours: { enabled: boolean; start: string; end: string }): boolean {
  if (!quietHours.enabled) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startHour, startMin] = quietHours.start.split(':').map(Number);
  const [endHour, endMin] = quietHours.end.split(':').map(Number);

  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  // Handle overnight quiet hours (e.g., 22:00 - 08:00)
  if (startMinutes > endMinutes) {
    // Quiet hours span midnight
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  } else {
    // Quiet hours within same day
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }
}

// Send a push notification
export async function sendPushNotification(
  options: PushNotificationOptions,
  quietHours?: { enabled: boolean; start: string; end: string }
): Promise<boolean> {
  // Check quiet hours
  if (quietHours && isInQuietHours(quietHours)) {
    console.log('Notification suppressed - quiet hours active');
    return false;
  }

  // Check permission
  if (getNotificationPermission() !== 'granted') {
    console.log('Notification permission not granted');
    return false;
  }

  try {
    // Try to use service worker for better persistence
    const registration = await navigator.serviceWorker?.ready;

    if (registration) {
      await registration.showNotification(options.title, {
        body: options.body,
        icon: options.icon || '/icons/icon.svg',
        badge: '/icons/icon.svg',
        tag: options.tag || 'defog-alert',
        requireInteraction: options.requireInteraction || false,
        data: options.data,
      } as NotificationOptions);
    } else {
      // Fallback to regular notification
      new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/icons/icon.svg',
        tag: options.tag || 'defog-alert',
      });
    }

    return true;
  } catch (error) {
    console.error('Failed to send notification:', error);
    return false;
  }
}

// Notification templates
export function createBuySignalNotification(
  ticker: string,
  currentPrice: number,
  buyLimit: number,
  currency: string
): PushNotificationOptions {
  return {
    title: `🎯 Buy Signal: ${ticker}`,
    body: `${ticker} heeft je buy limit bereikt!\nHuidige prijs: ${currency} ${currentPrice.toFixed(2)}\nBuy limit: ${currency} ${buyLimit.toFixed(2)}`,
    tag: `buy-signal-${ticker}`,
    requireInteraction: true,
    data: { type: 'buy_signal', ticker },
  };
}

export function createThresholdNotification(
  ticker: string,
  threshold: number,
  currentPrice: number,
  buyLimit: number,
  currency: string
): PushNotificationOptions {
  return {
    title: `📊 ${ticker} nadert buy limit`,
    body: `${ticker} is binnen ${threshold}% van je buy limit\nHuidige prijs: ${currency} ${currentPrice.toFixed(2)}\nBuy limit: ${currency} ${buyLimit.toFixed(2)}`,
    tag: `threshold-${ticker}-${threshold}`,
    data: { type: 'threshold', ticker, threshold },
  };
}

export function createDailyDropNotification(
  ticker: string,
  dropPercent: number,
  currentPrice: number,
  currency: string
): PushNotificationOptions {
  return {
    title: `📉 ${ticker} daalt ${Math.abs(dropPercent).toFixed(1)}%`,
    body: `${ticker} is vandaag ${Math.abs(dropPercent).toFixed(1)}% gedaald\nHuidige prijs: ${currency} ${currentPrice.toFixed(2)}`,
    tag: `daily-drop-${ticker}`,
    data: { type: 'daily_drop', ticker, dropPercent },
  };
}

// PWA Install Prompt
let deferredPrompt: BeforeInstallPromptEvent | null = null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Listen for install prompt
export function initInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    console.log('PWA install prompt ready');
  });
}

// Check if can show install prompt
export function canShowInstallPrompt(): boolean {
  return deferredPrompt !== null;
}

// Show install prompt
export async function showInstallPrompt(): Promise<boolean> {
  if (!deferredPrompt) return false;

  try {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return outcome === 'accepted';
  } catch (error) {
    console.error('Install prompt failed:', error);
    return false;
  }
}

// Check if app is installed
export function isAppInstalled(): boolean {
  // Check if running in standalone mode (installed PWA)
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }

  // Check for iOS standalone mode
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) {
    return true;
  }

  return false;
}
