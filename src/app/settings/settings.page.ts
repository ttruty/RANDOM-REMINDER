import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService } from '../core/notification.service';

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  standalone: false,
})
export class SettingsPage {
  constructor(public notifications: NotificationService, private router: Router) {}

  get isInstalled(): boolean {
    const nav = navigator as Navigator & { standalone?: boolean };
    return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
  }

  get isAndroidChrome(): boolean {
    const ua = navigator.userAgent;
    return /Android/.test(ua) && /Chrome/.test(ua);
  }

  get periodicSyncSupportedByBrowser(): boolean {
    return typeof (window as unknown as { PeriodicSyncManager?: unknown }).PeriodicSyncManager !== 'undefined';
  }

  async requestPermission(): Promise<void> {
    await this.notifications.requestPermission();
  }

  async recheckBackground(): Promise<void> {
    await this.notifications.setup();
  }

  async sendTest(): Promise<void> {
    await this.notifications.sendTestNotification();
  }

  goBack(): void {
    this.router.navigate(['/home']);
  }
}
