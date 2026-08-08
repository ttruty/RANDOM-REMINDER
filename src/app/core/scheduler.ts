import { ScheduleRule } from './models';

/**
 * Pure, dependency-free scheduling engine. No DB/Angular access here so the
 * exact same algorithm can be ported line-for-line into the plain-JS service
 * worker (src/sw.js), which cannot import TypeScript/Angular code.
 */

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

/** Inclusive start/end of the recurrence cycle that `date` falls within. */
export function cycleBounds(periodType: ScheduleRule['periodType'], date: Date): { start: Date; end: Date } {
  if (periodType === 'day') {
    const start = startOfDay(date);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
    return { start, end };
  }
  if (periodType === 'week') {
    const start = addDays(startOfDay(date), -date.getDay()); // back up to Sunday
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    return { start, end };
  }
  // month
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  end.setMilliseconds(-1);
  return { start, end };
}

/** Stable key identifying a specific cycle instance, e.g. 'day:2026-08-08'. */
export function cycleKeyFor(periodType: ScheduleRule['periodType'], date: Date): string {
  const { start } = cycleBounds(periodType, date);
  return `${periodType}:${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
}

function parseHHMM(value: string): number {
  const [h, m] = value.split(':').map((v) => parseInt(v, 10));
  return (h || 0) * 60 + (m || 0);
}

interface Interval {
  start: number;
  end: number;
}

function buildIntervals(rule: ScheduleRule, cycleStart: Date, cycleEnd: Date): Interval[] {
  const intervals: Interval[] = [];
  const daySet = rule.daysOfWeek && rule.daysOfWeek.length > 0 ? new Set(rule.daysOfWeek) : new Set([0, 1, 2, 3, 4, 5, 6]);
  let day = startOfDay(cycleStart);
  while (day.getTime() <= cycleEnd.getTime()) {
    if (daySet.has(day.getDay())) {
      for (const w of rule.timeWindows) {
        const startMin = parseHHMM(w.start);
        const endMin = parseHHMM(w.end);
        if (endMin > startMin) {
          const s = day.getTime() + startMin * 60000;
          const e = day.getTime() + endMin * 60000;
          const clampedStart = Math.max(s, cycleStart.getTime());
          const clampedEnd = Math.min(e, cycleEnd.getTime());
          if (clampedEnd > clampedStart) intervals.push({ start: clampedStart, end: clampedEnd });
        }
      }
    }
    day = addDays(day, 1);
  }
  return intervals;
}

function pickRandomTimeInIntervals(intervals: Interval[]): number {
  const total = intervals.reduce((s, iv) => s + (iv.end - iv.start), 0);
  let r = Math.random() * total;
  for (const iv of intervals) {
    const len = iv.end - iv.start;
    if (r < len) return Math.round(iv.start + r);
    r -= len;
  }
  return intervals[intervals.length - 1].end;
}

/**
 * Generate `rule.count` random timestamps (epoch ms, ascending) within the
 * cycle, respecting day-of-week filter, time windows, and minimum gap.
 * If the constraints can't fit `count` alerts, returns as many as will fit.
 */
export function generateOccurrenceTimes(rule: ScheduleRule, cycleStart: Date, cycleEnd: Date): number[] {
  const intervals = buildIntervals(rule, cycleStart, cycleEnd);
  if (intervals.length === 0 || rule.count <= 0) return [];

  const minGapMs = Math.max(0, rule.minGapMinutes) * 60000;
  const picked: number[] = [];
  const maxAttempts = 800;
  let attempts = 0;
  while (picked.length < rule.count && attempts < maxAttempts) {
    attempts++;
    const t = pickRandomTimeInIntervals(intervals);
    if (picked.every((p) => Math.abs(p - t) >= minGapMs)) {
      picked.push(t);
    }
  }
  picked.sort((a, b) => a - b);
  return picked;
}
