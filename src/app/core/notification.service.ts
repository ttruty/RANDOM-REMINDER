import { Injectable } from '@angular/core';
import { ReminderStoreService } from './reminder-store.service';

const FOREGROUND_CHECK_INTERVAL_MS = 60 * 1000; // 1 min while app is open
const PERIODIC_SYNC_TAG = 'check-reminders';
const PERIODIC_SYNC_MIN_INTERVAL_MS = 15 * 60 * 1000; // browser treats this as a floor, not a guarantee

export type BackgroundCapability = 'active' | 'unsupported' | 'denied' | 'unknown';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  registration: ServiceWorkerRegistration | null = null;
  backgroundCapability: BackgroundCapability = 'unknown';
  private foregroundTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private store: ReminderStoreService) {}

  get permission(): NotificationPermission | 'unsupported' {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }

  async requestPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (!('Notification' in window)) return 'unsupported';
    const result = await Notification.requestPermission();
    if (result === 'granted') await this.setup();
    return result;
  }

  /** Registers the service worker and (best-effort) periodic background sync. */
  async setup(): Promise<void> {
    this.startForegroundFallback();

    if (!('serviceWorker' in navigator)) {
      this.backgroundCapability = 'unsupported';
      return;
    }
    try {
      this.registration = await navigator.serviceWorker.register('sw.js');
    } catch {
      this.backgroundCapability = 'unsupported';
      return;
    }

    const reg = this.registration as ServiceWorkerRegistration & {
      periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> };
    };
    if (!reg.periodicSync) {
      this.backgroundCapability = 'unsupported'; // e.g. Safari/Firefox — no Periodic Background Sync API
      return;
    }
    try {
      await reg.periodicSync.register(PERIODIC_SYNC_TAG, { minInterval: PERIODIC_SYNC_MIN_INTERVAL_MS });
      this.backgroundCapability = 'active';
    } catch {
      // Most commonly: not installed as a PWA yet, or low site-engagement score
      this.backgroundCapability = 'denied';
    }
  }

  /** While the app/tab is open, poll for due reminders — a reliable fallback
   *  independent of Periodic Background Sync's best-effort browser scheduling. */
  private startForegroundFallback(): void {
    if (this.foregroundTimer) return;
    const tick = () => {
      this.store.checkAndFireDue((title, body) => this.show(title, body));
    };
    tick();
    this.foregroundTimer = setInterval(tick, FOREGROUND_CHECK_INTERVAL_MS);
  }

  show(title: string, body: string): void {
    if (this.permission !== 'granted') return;
    const options: NotificationOptions = { body, icon: 'assets/icon/icon.svg', badge: 'assets/icon/icon.svg' };
    if (this.registration) {
      this.registration.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
  }

  async sendTestNotification(): Promise<void> {
    this.show('Test reminder', 'If you can see this, notifications are working.');
  }
}
