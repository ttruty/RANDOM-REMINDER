import { Injectable } from '@angular/core';

/**
 * Original catchphrases for the Rando mascot — not quotes from any show,
 * just an eager-little-helper bit ("exists to do a task, then poofs").
 */
const INTROS = [
  "Can do!",
  "Ooh, a task! Let's gooo!",
  "Rando, reporting for duty!",
  'Poof! Right on schedule!',
  'Existence achieved! Time to focus!',
  'Beep! Your friendly neighborhood Rando here!',
  "Can doooo! Here's the deal:",
];

@Injectable({ providedIn: 'root' })
export class VoiceService {
  get supported(): boolean {
    return 'speechSynthesis' in window;
  }

  /** Speaks an original intro catchphrase followed by the reminder text. Foreground-only. */
  speak(title: string, body: string): void {
    if (!this.supported) return;
    const intro = INTROS[Math.floor(Math.random() * INTROS.length)];
    const text = [intro, title, body].filter((part) => part && part.trim().length > 0).join('. ');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = 1.35;
    utterance.rate = 1.05;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }
}
