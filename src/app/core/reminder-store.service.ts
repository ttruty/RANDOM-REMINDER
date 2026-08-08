import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DbService } from './db.service';
import { Occurrence, ReminderMessage, ReminderProfile } from './models';
import { cycleKeyFor, cyclesOverlapping, generateOccurrenceTimes } from './scheduler';

export interface ProfileViewModel {
  profile: ReminderProfile;
  nextAlert: number | null;
}

export interface UpcomingAlert {
  occurrence: Occurrence;
  profile: ReminderProfile;
  message?: ReminderMessage;
}

const LOOKAHEAD_DAYS = 14;
const LOOKAHEAD_MS = LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000;
const PRUNE_RETENTION_MS = 2 * 24 * 60 * 60 * 1000; // keep a couple days of past/fired occurrences, then drop them

@Injectable({ providedIn: 'root' })
export class ReminderStoreService {
  private readonly viewModelsSubject = new BehaviorSubject<ProfileViewModel[]>([]);
  readonly viewModels$ = this.viewModelsSubject.asObservable();

  constructor(private db: DbService) {
    this.refresh();
  }

  async refresh(): Promise<void> {
    await this.db.deleteOccurrencesBefore(Date.now() - PRUNE_RETENTION_MS);
    const profiles = await this.db.getAllProfiles();
    const vms: ProfileViewModel[] = [];
    for (const profile of profiles) {
      const occurrences = await this.ensureOccurrencesForWindow(profile);
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
    // The rule may have changed, so the whole precomputed window is invalidated
    // and rebuilt from scratch (as opposed to ensureOccurrencesForWindow's
    // additive fill, which assumes existing cycles are still valid).
    const now = new Date();
    const cycles = cyclesOverlapping(profile.rule.periodType, now, new Date(now.getTime() + LOOKAHEAD_MS));
    const fresh = this.buildOccurrencesForCycles(profile, cycles);
    await this.db.replaceOccurrencesForProfile(profile.id, fresh);
    await this.refresh();
  }

  async deleteProfile(id: string): Promise<void> {
    await this.db.deleteProfile(id);
    await this.refresh();
  }

  /** Cancels a single upcoming alert without touching the recurring rule. */
  async skipOccurrence(id: string): Promise<void> {
    await this.db.deleteOccurrence(id);
    await this.refresh();
  }

  /** All not-yet-fired alerts (across active profiles) due in the next `days`, soonest first. */
  async getUpcomingWindow(days: number = LOOKAHEAD_DAYS): Promise<UpcomingAlert[]> {
    await this.refresh();
    const now = Date.now();
    const end = now + days * 24 * 60 * 60 * 1000;
    const [occurrences, profiles] = await Promise.all([
      this.db.getOccurrencesInRange(now, end),
      this.db.getAllProfiles(),
    ]);
    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const result: UpcomingAlert[] = [];
    for (const occurrence of occurrences) {
      if (occurrence.fired) continue;
      const profile = profileMap.get(occurrence.profileId);
      if (!profile || !profile.active) continue;
      const message = profile.messages.find((m) => m.id === occurrence.messageId);
      result.push({ occurrence, profile, message });
    }
    result.sort((a, b) => a.occurrence.time - b.occurrence.time);
    return result;
  }

  private buildOccurrencesForCycles(
    profile: ReminderProfile,
    cycles: { start: Date; end: Date }[]
  ): Occurrence[] {
    const result: Occurrence[] = [];
    for (const cycle of cycles) {
      const key = cycleKeyFor(profile.rule.periodType, cycle.start);
      const times = generateOccurrenceTimes(profile.rule, cycle.start, cycle.end);
      for (const t of times) {
        const message =
          profile.messages.length > 0 ? profile.messages[Math.floor(Math.random() * profile.messages.length)] : undefined;
        result.push({
          id: `${profile.id}:${t}`,
          profileId: profile.id,
          cycleKey: key,
          time: t,
          fired: false,
          messageId: message?.id,
        });
      }
    }
    return result;
  }

  /** Additively fills in any cycles within the rolling window that don't have occurrences yet. */
  private async ensureOccurrencesForWindow(profile: ReminderProfile, now: Date = new Date()): Promise<Occurrence[]> {
    const windowEnd = new Date(now.getTime() + LOOKAHEAD_MS);
    const existing = await this.db.getOccurrencesForProfile(profile.id);
    const existingKeys = new Set(existing.map((o) => o.cycleKey));
    const missingCycles = cyclesOverlapping(profile.rule.periodType, now, windowEnd).filter(
      (c) => !existingKeys.has(cycleKeyFor(profile.rule.periodType, c.start))
    );
    if (missingCycles.length === 0) return existing;
    const fresh = this.buildOccurrencesForCycles(profile, missingCycles);
    await this.db.addOccurrences(fresh);
    return existing.concat(fresh);
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
   * notification for each, using the message that was pre-assigned when the
   * occurrence was generated (falls back to a random pick if that message
   * was since deleted). Used by the foreground fallback timer.
   */
  async checkAndFireDue(showFn: (title: string, body: string) => void): Promise<number> {
    const profiles = await this.db.getAllProfiles();
    const now = Date.now();
    let fired = 0;
    for (const profile of profiles) {
      if (!profile.active || profile.messages.length === 0) continue;
      const occurrences = await this.ensureOccurrencesForWindow(profile);
      const due = occurrences.filter((o) => !o.fired && o.time <= now);
      for (const occ of due) {
        const msg =
          profile.messages.find((m) => m.id === occ.messageId) ??
          profile.messages[Math.floor(Math.random() * profile.messages.length)];
        showFn(msg.title || profile.name, msg.body || '');
        await this.db.markOccurrenceFired(occ.id, msg.id);
        fired++;
      }
    }
    if (fired > 0) await this.refresh();
    return fired;
  }
}
