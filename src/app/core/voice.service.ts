import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

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

const KEY_VOICE_URI = 'rr-voice-uri';
const KEY_PITCH = 'rr-voice-pitch';
const KEY_RATE = 'rr-voice-rate';

const DEFAULT_PITCH = 1.35;
const DEFAULT_RATE = 1.05;

@Injectable({ providedIn: 'root' })
export class VoiceService {
  readonly voices$ = new BehaviorSubject<SpeechSynthesisVoice[]>([]);

  constructor() {
    if (!this.supported) return;
    this.refreshVoices();
    // Most browsers load the voice list asynchronously; this fires once it's ready
    // (and again if the OS voice list changes).
    speechSynthesis.addEventListener('voiceschanged', () => this.refreshVoices());
  }

  get supported(): boolean {
    return 'speechSynthesis' in window;
  }

  private refreshVoices(): void {
    this.voices$.next(speechSynthesis.getVoices());
  }

  get selectedVoiceURI(): string {
    return localStorage.getItem(KEY_VOICE_URI) ?? '';
  }

  set selectedVoiceURI(uri: string) {
    if (uri) {
      localStorage.setItem(KEY_VOICE_URI, uri);
    } else {
      localStorage.removeItem(KEY_VOICE_URI);
    }
  }

  get pitch(): number {
    const raw = parseFloat(localStorage.getItem(KEY_PITCH) ?? '');
    return isNaN(raw) ? DEFAULT_PITCH : raw;
  }

  set pitch(value: number) {
    localStorage.setItem(KEY_PITCH, String(value));
  }

  get rate(): number {
    const raw = parseFloat(localStorage.getItem(KEY_RATE) ?? '');
    return isNaN(raw) ? DEFAULT_RATE : raw;
  }

  set rate(value: number) {
    localStorage.setItem(KEY_RATE, String(value));
  }

  private selectedVoice(): SpeechSynthesisVoice | undefined {
    const uri = this.selectedVoiceURI;
    if (!uri) return undefined;
    return this.voices$.value.find((v) => v.voiceURI === uri);
  }

  private buildUtterance(text: string): SpeechSynthesisUtterance {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = this.pitch;
    utterance.rate = this.rate;
    const voice = this.selectedVoice();
    if (voice) utterance.voice = voice;
    return utterance;
  }

  /** Speaks an original intro catchphrase followed by the reminder text. Foreground-only. */
  speak(title: string, body: string): void {
    if (!this.supported) return;
    const intro = INTROS[Math.floor(Math.random() * INTROS.length)];
    const text = [intro, title, body].filter((part) => part && part.trim().length > 0).join('. ');
    speechSynthesis.cancel();
    speechSynthesis.speak(this.buildUtterance(text));
  }

  /** Plays a short sample with the current voice/pitch/rate settings. */
  testVoice(): void {
    if (!this.supported) return;
    speechSynthesis.cancel();
    speechSynthesis.speak(this.buildUtterance("Can do! This is what Rando sounds like."));
  }
}
