import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { NotificationService } from '../core/notification.service';
import { ReminderProfile } from '../core/models';
import { ProfileViewModel, ReminderStoreService } from '../core/reminder-store.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {
  viewModels$: Observable<ProfileViewModel[]> = this.store.viewModels$;

  constructor(
    private store: ReminderStoreService,
    public notifications: NotificationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.store.refresh();
  }

  ionViewWillEnter(): void {
    this.store.refresh();
  }

  get needsPermission(): boolean {
    return this.notifications.permission === 'default';
  }

  async enableNotifications(): Promise<void> {
    await this.notifications.requestPermission();
  }

  addProfile(): void {
    this.router.navigate(['/profile', 'new']);
  }

  openProfile(id: string): void {
    this.router.navigate(['/profile', id]);
  }

  openSettings(): void {
    this.router.navigate(['/settings']);
  }

  openCalendar(): void {
    this.router.navigate(['/calendar']);
  }

  async toggleActive(vm: ProfileViewModel, event: CustomEvent): Promise<void> {
    const active = (event as CustomEvent<{ checked: boolean }>).detail.checked;
    const updated: ReminderProfile = { ...vm.profile, active };
    await this.store.saveProfile(updated);
  }

  ruleSummary(profile: ReminderProfile): string {
    const r = profile.rule;
    const periodLabel = r.periodType === 'day' ? 'day' : r.periodType === 'week' ? 'week' : 'month';
    const windows = r.timeWindows.map((w) => `${w.start}–${w.end}`).join(', ');
    const allDays = r.daysOfWeek.length === 7 || r.daysOfWeek.length === 0;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayLabel = allDays ? '' : ` on ${r.daysOfWeek.map((d) => dayNames[d]).join(',')}`;
    return `${r.count}× per ${periodLabel}${dayLabel}, ${windows}`;
  }

  formatNextAlert(time: number | null): string {
    if (time === null) return 'No upcoming alert scheduled';
    const d = new Date(time);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    const hh = `${d.getHours()}`.padStart(2, '0');
    const mm = `${d.getMinutes()}`.padStart(2, '0');
    if (sameDay) return `Today, ${hh}:${mm}`;
    if (isTomorrow) return `Tomorrow, ${hh}:${mm}`;
    return `${d.toLocaleDateString()}, ${hh}:${mm}`;
  }

  trackByProfileId(_index: number, vm: ProfileViewModel): string {
    return vm.profile.id;
  }
}
