import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { ReminderStoreService, UpcomingAlert } from '../core/reminder-store.service';

const LOOKAHEAD_DAYS = 14;

interface DayCell {
  date: Date;
  key: string;
  inCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  withinHorizon: boolean;
  alertCount: number;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

@Component({
  selector: 'app-calendar',
  templateUrl: 'calendar.page.html',
  styleUrls: ['calendar.page.scss'],
  standalone: false,
})
export class CalendarPage implements OnInit {
  readonly lookaheadDays = LOOKAHEAD_DAYS;
  displayMonth = startOfDay(new Date());
  selectedDate = startOfDay(new Date());
  weeks: DayCell[][] = [];
  weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  private alertsByDay = new Map<string, UpcomingAlert[]>();
  private today = startOfDay(new Date());
  private horizonEnd = new Date(this.today.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  constructor(
    private store: ReminderStoreService,
    private router: Router,
    private alertCtrl: AlertController
  ) {}

  ngOnInit(): void {
    this.load();
  }

  ionViewWillEnter(): void {
    this.load();
  }

  async load(): Promise<void> {
    const alerts = await this.store.getUpcomingWindow(LOOKAHEAD_DAYS);
    this.alertsByDay = new Map();
    for (const a of alerts) {
      const key = dateKey(new Date(a.occurrence.time));
      const list = this.alertsByDay.get(key) ?? [];
      list.push(a);
      this.alertsByDay.set(key, list);
    }
    this.today = startOfDay(new Date());
    this.horizonEnd = new Date(this.today.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
    this.buildGrid();
  }

  get selectedDateLabel(): string {
    return this.selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  get selectedDayAlerts(): UpcomingAlert[] {
    return (this.alertsByDay.get(dateKey(this.selectedDate)) ?? []).slice().sort((a, b) => a.occurrence.time - b.occurrence.time);
  }

  get selectedDateWithinHorizon(): boolean {
    return this.selectedDate.getTime() <= this.horizonEnd.getTime();
  }

  get canGoToPrevMonth(): boolean {
    return this.displayMonth.getFullYear() > this.today.getFullYear() || this.displayMonth.getMonth() > this.today.getMonth();
  }

  get monthLabel(): string {
    return this.displayMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  prevMonth(): void {
    if (!this.canGoToPrevMonth) return;
    this.displayMonth = new Date(this.displayMonth.getFullYear(), this.displayMonth.getMonth() - 1, 1);
    this.buildGrid();
  }

  nextMonth(): void {
    this.displayMonth = new Date(this.displayMonth.getFullYear(), this.displayMonth.getMonth() + 1, 1);
    this.buildGrid();
  }

  selectDay(cell: DayCell): void {
    this.selectedDate = cell.date;
  }

  formatTime(ms: number): string {
    const d = new Date(ms);
    return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`;
  }

  openProfile(profileId: string): void {
    this.router.navigate(['/profile', profileId]);
  }

  async skip(alert: UpcomingAlert, event: Event): Promise<void> {
    event.stopPropagation();
    const confirm = await this.alertCtrl.create({
      header: 'Skip this alert?',
      message: `Rando won't nag you for "${alert.profile.name}" at ${this.formatTime(alert.occurrence.time)}. The recurring schedule is unaffected.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Skip it',
          role: 'destructive',
          handler: async () => {
            await this.store.skipOccurrence(alert.occurrence.id);
            await this.load();
          },
        },
      ],
    });
    await confirm.present();
  }

  goBack(): void {
    this.router.navigate(['/home']);
  }

  private buildGrid(): void {
    const year = this.displayMonth.getFullYear();
    const month = this.displayMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());

    const weeks: DayCell[][] = [];
    let cursor = gridStart;
    for (let w = 0; w < 6; w++) {
      const week: DayCell[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(cursor);
        const key = dateKey(date);
        week.push({
          date,
          key,
          inCurrentMonth: date.getMonth() === month,
          isToday: date.getTime() === this.today.getTime(),
          isPast: date.getTime() < this.today.getTime(),
          withinHorizon: date.getTime() <= this.horizonEnd.getTime(),
          alertCount: (this.alertsByDay.get(key) ?? []).length,
        });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
      }
      weeks.push(week);
      // Stop after the row containing the last day of the month, unless we haven't started the month yet.
      if (cursor.getMonth() !== month && week.some((c) => c.inCurrentMonth)) break;
    }
    this.weeks = weeks;
  }
}
