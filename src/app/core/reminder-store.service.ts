import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DbService } from './db.service';
import { Occurrence, ReminderProfile } from './models';
import { cycleBounds, cycleKeyFor, generateOccurrenceTimes } from './scheduler';

export interface ProfileViewModel {
  profile: ReminderProfile;
  nextAlert: number | null;
}

@Injectable({ providedIn: 'root' })
export class ReminderStoreService {
  private readonly viewModelsSubject = new BehaviorSubject<ProfileViewModel[]>([]);
  readonly viewModels$ = this.viewModelsSubject.asObservable();

  constructor(private db: DbService) {
    this.refresh();
  }

  async refresh(): Promise<void> {
    const profiles = await this.db.getAllProfiles();
    const vms: ProfileViewModel[] = [];
    for (const profile of profiles) {
      const occurrences = await this.ensureFreshOccurrences(profile);
      vms.push({ profile, nextAlert: this.nextAlertFrom(occurrences) });
    }
    vms.sort((a, b) => a.profile.name.localeCompare(b.profile.name));
    this.viewModelsSubject.next(vms);
  }

  async getProfile(id: string): Promise<ReminderProfile | undefined> {
    return this.db.getProfile(id);
  }

  async saveProfile(profile: ReminderProfile): Promise<void> {
    profile.updatedAt = Date.now();
    await this.db.putProfile(profile);
    await this.regenerateForProfile(profile);
    await this.refresh();
  }

  async deleteProfile(id: string): Promise<void> {
    await this.db.deleteProfile(id);
    await this.refresh();
  }

  /** Regenerates the occurrence list for the profile's *current* cycle. */
  private async regenerateForProfile(profile: ReminderProfile, now: Date = new Date()): Promise<Occurrence[]> {
    const { start, end } = cycleBounds(profile.rule.periodType, now);
    const key = cycleKeyFor(profile.rule.periodType, now);
    const times = generateOccurrenceTimes(profile.rule, start, end);
    const occurrences: Occurrence[] = times.map((t) => ({
      id: `${profile.id}:${t}`,
      profileId: profile.id,
      cycleKey: key,
      time: t,
      fired: false,
    }));
    await this.db.replaceOccurrencesForProfile(profile.id, occurrences);
    return occurrences;
  }

  /** Regenerates if the stored occurrences belong to a stale cycle (or don't exist yet). */
  private async ensureFreshOccurrences(profile: ReminderProfile, now: Date = new Date()): Promise<Occurrence[]> {
    const existing = await this.db.getOccurrencesForProfile(profile.id);
    const key = cycleKeyFor(profile.rule.periodType, now);
    if (existing.length === 0 || existing[0].cycleKey !== key) {
      return this.regenerateForProfile(profile, now);
    }
    return existing;
  }

  private nextAlertFrom(occurrences: Occurrence[]): number | null {
    const now = Date.now();
    const upcoming = occurrences
      .filter((o) => !o.fired && o.time >= now)
      .sort((a, b) => a.time - b.time);
    return upcoming.length > 0 ? upcoming[0].time : null;
  }

  /**
   * Checks every active profile for due-but-unfired occurrences and fires a
   * notification for each, picking a random message from that profile's pool.
   * Used both by the foreground fallback timer and can be mirrored by the SW.
   * Returns how many notifications were fired.
   */
  async checkAndFireDue(showFn: (title: string, body: string) => void): Promise<number> {
    const profiles = await this.db.getAllProfiles();
    const now = Date.now();
    let fired = 0;
    for (const profile of profiles) {
      if (!profile.active || profile.messages.length === 0) continue;
      const occurrences = await this.ensureFreshOccurrences(profile);
      const due = occurrences.filter((o) => !o.fired && o.time <= now);
      for (const occ of due) {
        const msg = profile.messages[Math.floor(Math.random() * profile.messages.length)];
        showFn(msg.title || profile.name, msg.body || '');
        await this.db.markOccurrenceFired(occ.id, msg.id);
        fired++;
      }
    }
    if (fired > 0) await this.refresh();
    return fired;
  }
}
