/** One HH:mm–HH:mm window during which alerts for a profile are allowed to fire. */
export interface TimeWindow {
  start: string; // 'HH:mm', 24h
  end: string; // 'HH:mm', 24h, must be > start
}

export type PeriodType = 'day' | 'week' | 'month';

/**
 * Fully custom recurrence rule: "N times per <day|week|month>", restricted to
 * certain days of the week and one or more time-of-day windows, with an optional
 * minimum gap enforced between consecutive alerts.
 */
export interface ScheduleRule {
  periodType: PeriodType;
  count: number; // how many alerts to distribute across each period
  daysOfWeek: number[]; // 0=Sun..6=Sat; which days are eligible. Empty/all-7 = every day
  timeWindows: TimeWindow[]; // at least one
  minGapMinutes: number; // minimum spacing enforced between two alerts
}

export interface ReminderMessage {
  id: string;
  title: string;
  body: string;
}

export interface ReminderProfile {
  id: string;
  name: string;
  active: boolean;
  messages: ReminderMessage[];
  rule: ScheduleRule;
  createdAt: number;
  updatedAt: number;
}

/** A single concrete future (or fired) alert time computed from a profile's rule. */
export interface Occurrence {
  id: string; // `${profileId}:${timestamp}`
  profileId: string;
  cycleKey: string; // e.g. '2026-08-08' | '2026-W32' | '2026-08'
  time: number; // epoch ms
  fired: boolean;
  messageId?: string; // message shown, once fired
}

export function defaultRule(): ScheduleRule {
  return {
    periodType: 'day',
    count: 3,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    timeWindows: [{ start: '07:00', end: '21:00' }],
    minGapMinutes: 30,
  };
}

export function newProfile(name = 'New reminder'): ReminderProfile {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    active: true,
    messages: [{ id: crypto.randomUUID(), title: name, body: 'Time for your reminder!' }],
    rule: defaultRule(),
    createdAt: now,
    updatedAt: now,
  };
}
