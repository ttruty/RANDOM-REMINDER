import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController } from '@ionic/angular';
import { newProfile, PeriodType, ReminderProfile } from '../core/models';
import { ReminderStoreService } from '../core/reminder-store.service';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

@Component({
  selector: 'app-profile-editor',
  templateUrl: 'profile-editor.page.html',
  styleUrls: ['profile-editor.page.scss'],
  standalone: false,
})
export class ProfileEditorPage implements OnInit {
  profile!: ReminderProfile;
  isNew = true;
  dayNames = DAY_NAMES;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private store: ReminderStoreService,
    private alertCtrl: AlertController
  ) {}

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || id === 'new') {
      this.isNew = true;
      this.profile = newProfile();
      return;
    }
    const existing = await this.store.getProfile(id);
    if (!existing) {
      this.router.navigate(['/home']);
      return;
    }
    this.isNew = false;
    this.profile = JSON.parse(JSON.stringify(existing));
  }

  setPeriodType(type: PeriodType | string | number | undefined): void {
    if (type === 'day' || type === 'week' || type === 'month') {
      this.profile.rule.periodType = type;
    }
  }

  toggleDay(day: number): void {
    const idx = this.profile.rule.daysOfWeek.indexOf(day);
    if (idx >= 0) {
      this.profile.rule.daysOfWeek.splice(idx, 1);
    } else {
      this.profile.rule.daysOfWeek.push(day);
      this.profile.rule.daysOfWeek.sort();
    }
  }

  isDaySelected(day: number): boolean {
    return this.profile.rule.daysOfWeek.includes(day);
  }

  addTimeWindow(): void {
    this.profile.rule.timeWindows.push({ start: '09:00', end: '17:00' });
  }

  removeTimeWindow(index: number): void {
    this.profile.rule.timeWindows.splice(index, 1);
  }

  addMessage(): void {
    this.profile.messages.push({ id: crypto.randomUUID(), title: this.profile.name, body: '' });
  }

  removeMessage(index: number): void {
    this.profile.messages.splice(index, 1);
  }

  get canSave(): boolean {
    return (
      this.profile?.name?.trim().length > 0 &&
      this.profile.messages.length > 0 &&
      this.profile.rule.timeWindows.length > 0 &&
      this.profile.rule.count > 0
    );
  }

  async save(): Promise<void> {
    if (!this.canSave) return;
    await this.store.saveProfile(this.profile);
    this.router.navigate(['/home']);
  }

  async confirmDelete(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete reminder?',
      message: `"${this.profile.name}" and its schedule will be permanently removed.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            await this.store.deleteProfile(this.profile.id);
            this.router.navigate(['/home']);
          },
        },
      ],
    });
    await alert.present();
  }

  cancel(): void {
    this.router.navigate(['/home']);
  }
}
