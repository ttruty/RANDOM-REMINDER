import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService } from '../core/notification.service';
import { VoiceService } from '../core/voice.service';

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  standalone: false,
})
export class SettingsPage {
  voicePitch: number;
  voiceRate: number;

  constructor(public notifications: NotificationService, public voice: VoiceService, private router: Router) {
    this.voicePitch = voice.pitch;
    this.voiceRate = voice.rate;
  }

  get sortedVoices(): SpeechSynthesisVoice[] {
    return this.voice.voices$.value
      .filter((v) => v.lang.toLowerCase().startsWith('en'))
      .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
  }

  onVoiceChange(uri: string | null | undefined): void {
    this.voice.selectedVoiceURI = uri ?? '';
  }

  onPitchChange(value: number | { lower: number; upper: number }): void {
    const num = typeof value === 'number' ? value : value.upper;
    this.voicePitch = num;
    this.voice.pitch = num;
  }

  onRateChange(value: number | { lower: number; upper: number }): void {
    const num = typeof value === 'number' ? value : value.upper;
    this.voiceRate = num;
    this.voice.rate = num;
  }

  testVoice(): void {
    this.voice.testVoice();
  }

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
