import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISSED_KEY = 'rr-install-prompt-dismissed-at';
const DISMISS_COOLOFF_MS = 7 * 24 * 60 * 60 * 1000; // don't re-nag for a week after "Not now"

@Injectable({ providedIn: 'root' })
export class InstallPromptService {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  readonly promptAvailable$ = new BehaviorSubject<boolean>(false);

  constructor() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.promptAvailable$.next(true);
    });
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.promptAvailable$.next(false);
    });
  }

  isAndroid(): boolean {
    return /Android/.test(navigator.userAgent);
  }

  isStandalone(): boolean {
    const nav = navigator as Navigator & { standalone?: boolean };
    return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
  }

  private recentlyDismissed(): boolean {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    const dismissedAt = parseInt(raw, 10);
    return !isNaN(dismissedAt) && Date.now() - dismissedAt < DISMISS_COOLOFF_MS;
  }

  /** Whether we should proactively show the "install as app" modal right now. */
  shouldOfferInstall(): boolean {
    return (
      this.deferredPrompt !== null &&
      this.isAndroid() &&
      !this.isStandalone() &&
      !this.recentlyDismissed()
    );
  }

  async triggerInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!this.deferredPrompt) return 'unavailable';
    const prompt = this.deferredPrompt;
    this.deferredPrompt = null;
    this.promptAvailable$.next(false);
    await prompt.prompt();
    const choice = await prompt.userChoice;
    return choice.outcome;
  }

  dismiss(): void {
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
  }
}
