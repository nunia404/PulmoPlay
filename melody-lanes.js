/* Melody Lanes — ported from MusicGame.tsx / FallingNote.tsx / NoteLane.tsx / songs.ts
   Vanilla JS for PulmoPlay (no React build). */

(function (global) {
  'use strict';

  const NOTE_FREQUENCIES = {
    C: 261.63, D: 293.66, E: 329.63, F: 349.23,
    G: 392.00, A: 440.00, B: 493.88, C_HIGH: 523.25,
  };

  const NOTES_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C_HIGH'];
  const KEY_LABELS = ['C', 'D', 'E', 'F', 'G', 'A', 'B', "C'"];
  const NOTE_COLORS = {
    C: '#cf6f52', D: '#dd8f42', E: '#e2b558', F: '#a4a260',
    G: '#57ab90', A: '#5f8fb0', B: '#8c7fc4', C_HIGH: '#eee5d6',
  };

  // Melody-lanes original keys + PulmoPlay arrow aliases for F/G
  const NOTE_KEYS = {
    a: 'C', s: 'D', d: 'E', f: 'F', j: 'G', k: 'A', l: 'B', ';': 'C_HIGH',
    arrowleft: 'F', arrowright: 'G',
  };

  const FALL_TIME = 3;
  const HIT_TIME = FALL_TIME * 0.87;
  const HIT_WINDOW = 0.35;
  const LEDGER_OFFSET = 13;
  const HIT_ZONE_OFFSET = 3.3;

  const MODEL_URL = 'https://teachablemachine.withgoogle.com/models/1DoSCygNV/';
  const AI_UI_CONFIDENCE_THRESHOLD = 0.9;
  const AI_PREDICTION_TTL_MS = 1000;
  const AI_UI_DEDUP_MS = 1200;
  const AI_EVENT_COOLDOWN_MS = 1200;

  // Song charts: `time` is the 1× onset in seconds. Falling notes reach the
  // black bar at HIT_TIME, which is when the sound should start. Speed (e.g.
  // 1.5× / 0.75×) scales musical time via time/speed so hits stay on the bar.
  const songs = [
    {
      id: 'sai-thip',
      title: 'สายทิพย์',
      artist: 'Original',
      bpm: 70,
      notes: [
        { note: 'G', time: 1.714, duration: 0.857 },
        { note: 'E', time: 2.571, duration: 1.286 },
        { note: 'G', time: 3.857, duration: 0.428 },
        { note: 'E', time: 4.285, duration: 0.428 },
        { note: 'D', time: 4.714, duration: 0.428 },
        { note: 'C', time: 5.142, duration: 1.714 },
        { note: 'G', time: 6.857, duration: 0.857 },
        { note: 'A', time: 7.714, duration: 1.286 },
        { note: 'C_HIGH', time: 9.0, duration: 0.428 },
        { note: 'A', time: 9.428, duration: 0.428 },
        { note: 'G', time: 9.857, duration: 0.428 },
        { note: 'G', time: 10.285, duration: 1.715 },
        { note: 'E', time: 12.0, duration: 0.857 },
        { note: 'D', time: 12.428, duration: 1.286 },
        { note: 'G', time: 13.714, duration: 0.428 },
        { note: 'D', time: 14.142, duration: 0.428 },
        { note: 'G', time: 14.571, duration: 0.428 },
        { note: 'D', time: 15.0, duration: 1.714 },
        { note: 'D', time: 16.714, duration: 0.857 },
        { note: 'E', time: 17.571, duration: 2.571 },
        { note: 'G', time: 21.857, duration: 0.857 },
        { note: 'E', time: 22.714, duration: 1.286 },
        { note: 'G', time: 24.0, duration: 0.428 },
        { note: 'E', time: 24.428, duration: 0.428 },
        { note: 'D', time: 24.857, duration: 0.428 },
        { note: 'C', time: 25.285, duration: 1.714 },
        { note: 'G', time: 27.0, duration: 0.857 },
        { note: 'A', time: 27.857, duration: 1.286 },
        { note: 'C_HIGH', time: 29.142, duration: 0.428 },
        { note: 'A', time: 29.571, duration: 0.428 },
        { note: 'A', time: 29.999, duration: 0.428 },
        { note: 'G', time: 30.427, duration: 1.714 },
        { note: 'E', time: 32.141, duration: 0.857 },
        { note: 'D', time: 31.714, duration: 1.286 },
        { note: 'G', time: 33.0, duration: 0.428 },
        { note: 'D', time: 33.428, duration: 0.428 },
        { note: 'G', time: 33.857, duration: 0.428 },
        { note: 'D', time: 34.285, duration: 1.714 },
        { note: 'E', time: 36.0, duration: 0.857 },
        { note: 'C', time: 36.857, duration: 1.714 },
      ],
      backingTrack: [
        { notes: ['C'], time: 2.571, duration: 0.857 },
        { notes: ['E', 'G'], time: 3.428, duration: 0.857 },
        { notes: ['E', 'G'], time: 4.285, duration: 0.857 },
        { notes: ['C'], time: 5.142, duration: 0.857 },
        { notes: ['E', 'G'], time: 6.0, duration: 0.857 },
        { notes: ['E', 'G'], time: 6.857, duration: 0.857 },
        { notes: ['F'], time: 7.714, duration: 0.857 },
        { notes: ['A', 'C_HIGH'], time: 8.571, duration: 0.857 },
        { notes: ['A', 'C_HIGH'], time: 9.428, duration: 0.857 },
        { notes: ['C'], time: 10.285, duration: 0.857 },
        { notes: ['E', 'G'], time: 11.142, duration: 0.857 },
        { notes: ['E', 'G'], time: 12.0, duration: 0.857 },
        { notes: ['G'], time: 12.428, duration: 0.857 },
        { notes: ['D', 'F'], time: 13.285, duration: 0.857 },
        { notes: ['D', 'F'], time: 14.142, duration: 0.857 },
        { notes: ['G'], time: 15.428, duration: 0.857 },
        { notes: ['D', 'F'], time: 16.285, duration: 0.857 },
        { notes: ['D', 'F'], time: 17.142, duration: 0.857 },
        { notes: ['C'], time: 18.0, duration: 0.857 },
        { notes: ['E', 'G'], time: 18.857, duration: 0.857 },
        { notes: ['E', 'G'], time: 19.714, duration: 0.857 },
        { notes: ['C'], time: 20.571, duration: 0.857 },
        { notes: ['E', 'G'], time: 21.428, duration: 0.857 },
        { notes: ['E', 'G'], time: 22.285, duration: 0.857 },
        { notes: ['C'], time: 23.142, duration: 0.857 },
        { notes: ['E', 'G'], time: 24.0, duration: 0.857 },
        { notes: ['E', 'G'], time: 24.857, duration: 0.857 },
        { notes: ['C'], time: 25.714, duration: 0.857 },
        { notes: ['E', 'G'], time: 26.571, duration: 0.857 },
        { notes: ['E', 'G'], time: 27.428, duration: 0.857 },
        { notes: ['F'], time: 28.285, duration: 0.857 },
        { notes: ['A', 'C_HIGH'], time: 29.142, duration: 0.857 },
        { notes: ['A', 'C_HIGH'], time: 30.0, duration: 0.857 },
        { notes: ['C'], time: 30.857, duration: 0.857 },
        { notes: ['E', 'G'], time: 31.714, duration: 0.857 },
        { notes: ['E', 'G'], time: 32.571, duration: 0.857 },
        { notes: ['G'], time: 33.428, duration: 0.857 },
        { notes: ['D', 'F'], time: 34.285, duration: 0.857 },
        { notes: ['D', 'F'], time: 35.142, duration: 0.857 },
        { notes: ['G'], time: 36.0, duration: 0.857 },
        { notes: ['D', 'F'], time: 36.857, duration: 0.857 },
        { notes: ['D', 'F'], time: 37.714, duration: 0.857 },
        { notes: ['C'], time: 38.571, duration: 0.857 },
        { notes: ['E', 'G'], time: 39.428, duration: 0.857 },
        { notes: ['E', 'G'], time: 40.285, duration: 0.857 },
        { notes: ['C'], time: 41.142, duration: 0.857 },
        { notes: ['E', 'G'], time: 42.0, duration: 0.857 },
        { notes: ['E', 'G'], time: 42.857, duration: 0.857 },
      ],
    },
    {
      id: 'yue-liang',
      title: '月亮代表我的心',
      artist: '邓丽君',
      bpm: 80,
      notes: [
        { note: 'E', time: 1.5, duration: 0.375 },
        { note: 'G', time: 1.875, duration: 0.375 },
        { note: 'C', time: 2.25, duration: 0.375 },
        { note: 'E', time: 2.625, duration: 0.375 },
        // M4 F: A dotted-half, G eighth, F eighth — Db: Bb Ab Gb
        { note: 'A', time: 3.0, duration: 2.25 },
        { note: 'G', time: 5.25, duration: 0.375 },
        { note: 'F', time: 5.625, duration: 0.375 },
        // M5 D/F# | G7: E dotted-half, C eighth, D eighth
        { note: 'E', time: 6.0, duration: 2.25 },
        { note: 'C', time: 8.25, duration: 0.375 },
        { note: 'D', time: 8.625, duration: 0.375 },
        // A1 M6 C: E dotted-half, C eighth, D eighth
        { note: 'E', time: 9.0, duration: 2.25 },
        { note: 'C', time: 11.25, duration: 0.375 },
        { note: 'D', time: 11.625, duration: 0.375 },
        { note: 'E', time: 12.0, duration: 2.25 },
        { note: 'C', time: 14.25, duration: 0.375 },
        { note: 'D', time: 14.625, duration: 0.375 },
        { note: 'E', time: 15.0, duration: 0.75 },
        { note: 'C', time: 15.75, duration: 0.75 },
        { note: 'A', time: 16.5, duration: 0.375 },
        { note: 'C', time: 16.875, duration: 0.375 },
        { note: 'E', time: 17.25, duration: 0.375 },
        { note: 'G', time: 17.625, duration: 0.375 },
        { note: 'G', time: 18.0, duration: 2.25 },
        { note: 'C', time: 20.25, duration: 0.375 },
        { note: 'D', time: 20.625, duration: 0.375 },
        { note: 'E', time: 21.0, duration: 0.75 },
        { note: 'E', time: 21.75, duration: 0.375 },
        { note: 'D', time: 22.125, duration: 0.375 },
        { note: 'C', time: 22.5, duration: 0.75 },
        { note: 'E', time: 23.25, duration: 0.75 },
        { note: 'E', time: 24.0, duration: 0.75 },
        { note: 'C', time: 24.75, duration: 0.75 },
        { note: 'A', time: 25.5, duration: 0.375 },
        { note: 'C', time: 25.875, duration: 0.375 },
        { note: 'E', time: 26.25, duration: 0.375 },
        { note: 'G', time: 26.625, duration: 0.375 },
        { note: 'F', time: 27.0, duration: 0.75 },
        { note: 'F', time: 27.75, duration: 0.375 },
        { note: 'E', time: 28.125, duration: 0.375 },
        { note: 'D', time: 28.5, duration: 0.75 },
        { note: 'F', time: 29.25, duration: 0.75 },
        { note: 'G', time: 30.0, duration: 2.25 },
        { note: 'C', time: 32.625, duration: 0.375 },
        // A2 M14–M19 = A1 M6–M11
        { note: 'E', time: 33.0, duration: 2.25 },
        { note: 'C', time: 35.25, duration: 0.375 },
        { note: 'D', time: 35.625, duration: 0.375 },
        { note: 'E', time: 36.0, duration: 2.25 },
        { note: 'C', time: 38.25, duration: 0.375 },
        { note: 'D', time: 38.625, duration: 0.375 },
        { note: 'E', time: 39.0, duration: 0.75 },
        { note: 'C', time: 39.75, duration: 0.75 },
        { note: 'A', time: 40.5, duration: 0.375 },
        { note: 'C', time: 40.875, duration: 0.375 },
        { note: 'E', time: 41.25, duration: 0.375 },
        { note: 'G', time: 41.625, duration: 0.375 },
        { note: 'G', time: 42.0, duration: 2.25 },
        { note: 'C', time: 44.25, duration: 0.375 },
        { note: 'D', time: 44.625, duration: 0.375 },
        { note: 'E', time: 45.0, duration: 0.75 },
        { note: 'E', time: 45.75, duration: 0.375 },
        { note: 'D', time: 46.125, duration: 0.375 },
        { note: 'C', time: 46.5, duration: 0.75 },
        { note: 'E', time: 47.25, duration: 0.75 },
        { note: 'E', time: 48.0, duration: 0.75 },
        { note: 'C', time: 48.75, duration: 0.75 },
        { note: 'A', time: 49.5, duration: 0.375 },
        { note: 'C', time: 49.875, duration: 0.375 },
        { note: 'E', time: 50.25, duration: 0.375 },
        { note: 'G', time: 50.625, duration: 0.375 },
        // A2 M20 Dm7 | G7: E q, E eighth, D eighth, C q, D q
        { note: 'E', time: 51.0, duration: 0.75 },
        { note: 'E', time: 51.75, duration: 0.375 },
        { note: 'D', time: 52.125, duration: 0.375 },
        { note: 'C', time: 52.5, duration: 0.75 },
        { note: 'D', time: 53.25, duration: 0.75 },
        // A2 M21 C6: C dotted-half + pickup C D eighths
        { note: 'C', time: 54.0, duration: 2.25 },
        { note: 'C', time: 56.25, duration: 0.375 },
        { note: 'D', time: 56.625, duration: 0.375 },
        // B M22 C: E q, E eighth, D eighth, C q, E q
        { note: 'E', time: 57.0, duration: 0.75 },
        { note: 'E', time: 57.75, duration: 0.375 },
        { note: 'D', time: 58.125, duration: 0.375 },
        { note: 'C', time: 58.5, duration: 0.75 },
        { note: 'E', time: 59.25, duration: 0.75 },
        { note: 'E', time: 60.0, duration: 2.25 },
        { note: 'C', time: 62.25, duration: 0.375 },
        { note: 'D', time: 62.625, duration: 0.375 },
        // B M24 Dm7: F q, F eighth, E eighth, D q, F q
        { note: 'F', time: 63.0, duration: 0.75 },
        { note: 'F', time: 63.75, duration: 0.375 },
        { note: 'E', time: 64.125, duration: 0.375 },
        { note: 'D', time: 64.5, duration: 0.75 },
        { note: 'F', time: 65.25, duration: 0.75 },
        { note: 'E', time: 66.0, duration: 2.25 },
        { note: 'C', time: 68.25, duration: 0.375 },
        { note: 'D', time: 68.625, duration: 0.375 },
        { note: 'E', time: 69.0, duration: 0.75 },
        { note: 'E', time: 69.75, duration: 0.375 },
        { note: 'D', time: 70.125, duration: 0.375 },
        { note: 'C', time: 70.5, duration: 0.75 },
        { note: 'E', time: 71.25, duration: 0.75 },
        { note: 'E', time: 72.0, duration: 2.25 },
        { note: 'C', time: 74.25, duration: 0.375 },
        { note: 'D', time: 74.625, duration: 0.375 },
        { note: 'F', time: 75.0, duration: 0.75 },
        { note: 'F', time: 75.75, duration: 0.375 },
        { note: 'E', time: 76.125, duration: 0.375 },
        { note: 'D', time: 76.5, duration: 0.75 },
        { note: 'F', time: 77.25, duration: 0.75 },
        { note: 'G', time: 78.0, duration: 2.25 },
        { note: 'C', time: 80.625, duration: 0.375 },
        // A3 M30–M36 = A1 M6–M12
        { note: 'E', time: 81.0, duration: 2.25 },
        { note: 'C', time: 83.25, duration: 0.375 },
        { note: 'D', time: 83.625, duration: 0.375 },
        { note: 'E', time: 84.0, duration: 2.25 },
        { note: 'C', time: 86.25, duration: 0.375 },
        { note: 'D', time: 86.625, duration: 0.375 },
        { note: 'E', time: 87.0, duration: 0.75 },
        { note: 'C', time: 87.75, duration: 0.75 },
        { note: 'A', time: 88.5, duration: 0.375 },
        { note: 'C', time: 88.875, duration: 0.375 },
        { note: 'E', time: 89.25, duration: 0.375 },
        { note: 'G', time: 89.625, duration: 0.375 },
        { note: 'G', time: 90.0, duration: 2.25 },
        { note: 'C', time: 92.25, duration: 0.375 },
        { note: 'D', time: 92.625, duration: 0.375 },
        { note: 'E', time: 93.0, duration: 0.75 },
        { note: 'E', time: 93.75, duration: 0.375 },
        { note: 'D', time: 94.125, duration: 0.375 },
        { note: 'C', time: 94.5, duration: 0.75 },
        { note: 'E', time: 95.25, duration: 0.75 },
        { note: 'E', time: 96.0, duration: 0.75 },
        { note: 'C', time: 96.75, duration: 0.75 },
        { note: 'A', time: 97.5, duration: 0.375 },
        { note: 'C', time: 97.875, duration: 0.375 },
        { note: 'E', time: 98.25, duration: 0.375 },
        { note: 'G', time: 98.625, duration: 0.375 },
        { note: 'F', time: 99.0, duration: 0.75 },
        { note: 'F', time: 99.75, duration: 0.375 },
        { note: 'E', time: 100.125, duration: 0.375 },
        { note: 'D', time: 100.5, duration: 0.75 },
        { note: 'F', time: 101.25, duration: 0.75 },
        // M38 ending 2 C6: C whole (1st ending M37 skipped)
        { note: 'C', time: 102.0, duration: 3.0 },
        // Outro M39 Am7: C q, eighth rest, C A C E G eighths
        { note: 'C', time: 105.0, duration: 0.75 },
        { note: 'C', time: 106.125, duration: 0.375 },
        { note: 'A', time: 106.5, duration: 0.375 },
        { note: 'C', time: 106.875, duration: 0.375 },
        { note: 'E', time: 107.25, duration: 0.375 },
        { note: 'G', time: 107.625, duration: 0.375 },
        // M40 F: A dotted-half, G eighth, F eighth
        { note: 'A', time: 108.0, duration: 2.25 },
        { note: 'G', time: 110.25, duration: 0.375 },
        { note: 'F', time: 110.625, duration: 0.375 },
        { note: 'E', time: 111.0, duration: 2.25 },
        { note: 'C', time: 113.25, duration: 0.375 },
        { note: 'D', time: 113.625, duration: 0.375 },
        // M42 C6: C q, rest q, arpeggio E G C′ E eighths (Db6/F6 folded)
        { note: 'C', time: 114.0, duration: 0.75 },
        { note: 'E', time: 115.5, duration: 0.375 },
        { note: 'G', time: 115.875, duration: 0.375 },
        { note: 'C_HIGH', time: 116.25, duration: 0.375 },
        { note: 'E', time: 116.625, duration: 0.375 },
        { note: 'A', time: 117.0, duration: 3.0 },
        // M44 F: A q, G F E D eighths, C q
        { note: 'A', time: 120.0, duration: 0.75 },
        { note: 'G', time: 120.75, duration: 0.375 },
        { note: 'F', time: 121.125, duration: 0.375 },
        { note: 'E', time: 121.5, duration: 0.375 },
        { note: 'D', time: 121.875, duration: 0.375 },
        { note: 'C', time: 122.25, duration: 0.75 },
        { note: 'E', time: 123.0, duration: 2.25 },
        { note: 'C', time: 125.25, duration: 0.375 },
        { note: 'D', time: 125.625, duration: 0.375 },
        { note: 'C', time: 126.0, duration: 3.0 },
      ],
      backingTrack: [
        // M3 C
        { notes: ['C', 'E'], time: 0.0, duration: 1.5 },
        { notes: ['C', 'E'], time: 1.5, duration: 1.5 },
        // M4 F
        { notes: ['F', 'A'], time: 3.0, duration: 1.5 },
        { notes: ['F', 'A'], time: 4.5, duration: 1.5 },
        // M5 D/F# | G7
        { notes: ['D', 'A'], time: 6.0, duration: 1.5 },
        { notes: ['G', 'B'], time: 7.5, duration: 1.5 },
        // A1 M6–M13 C | Em7 | F | F/G C | Am7 | F | D7 | G7
        { notes: ['C', 'E'], time: 9.0, duration: 1.5 },
        { notes: ['C', 'E'], time: 10.5, duration: 1.5 },
        { notes: ['E', 'G'], time: 12.0, duration: 1.5 },
        { notes: ['E', 'G'], time: 13.5, duration: 1.5 },
        { notes: ['F', 'A'], time: 15.0, duration: 1.5 },
        { notes: ['F', 'A'], time: 16.5, duration: 1.5 },
        { notes: ['G', 'F'], time: 18.0, duration: 1.5 },
        { notes: ['C', 'E'], time: 19.5, duration: 1.5 },
        { notes: ['A', 'C'], time: 21.0, duration: 1.5 },
        { notes: ['A', 'C'], time: 22.5, duration: 1.5 },
        { notes: ['F', 'A'], time: 24.0, duration: 1.5 },
        { notes: ['F', 'A'], time: 25.5, duration: 1.5 },
        { notes: ['D', 'A'], time: 27.0, duration: 1.5 },
        { notes: ['D', 'A'], time: 28.5, duration: 1.5 },
        { notes: ['G', 'B'], time: 30.0, duration: 1.5 },
        { notes: ['G', 'B'], time: 31.5, duration: 1.5 },
        // A2 M14–M21 (M20 Dm7|G7, M21 C6)
        { notes: ['C', 'E'], time: 33.0, duration: 1.5 },
        { notes: ['C', 'E'], time: 34.5, duration: 1.5 },
        { notes: ['E', 'G'], time: 36.0, duration: 1.5 },
        { notes: ['E', 'G'], time: 37.5, duration: 1.5 },
        { notes: ['F', 'A'], time: 39.0, duration: 1.5 },
        { notes: ['F', 'A'], time: 40.5, duration: 1.5 },
        { notes: ['G', 'F'], time: 42.0, duration: 1.5 },
        { notes: ['C', 'E'], time: 43.5, duration: 1.5 },
        { notes: ['A', 'C'], time: 45.0, duration: 1.5 },
        { notes: ['A', 'C'], time: 46.5, duration: 1.5 },
        { notes: ['F', 'A'], time: 48.0, duration: 1.5 },
        { notes: ['F', 'A'], time: 49.5, duration: 1.5 },
        { notes: ['D', 'F'], time: 51.0, duration: 1.5 },
        { notes: ['G', 'B'], time: 52.5, duration: 1.5 },
        { notes: ['C', 'A'], time: 54.0, duration: 1.5 },
        { notes: ['C', 'A'], time: 55.5, duration: 1.5 },
        // B M22–M29 C | Em7 | Dm7 | G7 C | C | Em7 | D7 | G7
        { notes: ['C', 'E'], time: 57.0, duration: 1.5 },
        { notes: ['C', 'E'], time: 58.5, duration: 1.5 },
        { notes: ['E', 'G'], time: 60.0, duration: 1.5 },
        { notes: ['E', 'G'], time: 61.5, duration: 1.5 },
        { notes: ['D', 'F'], time: 63.0, duration: 1.5 },
        { notes: ['D', 'F'], time: 64.5, duration: 1.5 },
        { notes: ['G', 'B'], time: 66.0, duration: 1.5 },
        { notes: ['C', 'E'], time: 67.5, duration: 1.5 },
        { notes: ['C', 'E'], time: 69.0, duration: 1.5 },
        { notes: ['C', 'E'], time: 70.5, duration: 1.5 },
        { notes: ['E', 'G'], time: 72.0, duration: 1.5 },
        { notes: ['E', 'G'], time: 73.5, duration: 1.5 },
        { notes: ['D', 'A'], time: 75.0, duration: 1.5 },
        { notes: ['D', 'A'], time: 76.5, duration: 1.5 },
        { notes: ['G', 'B'], time: 78.0, duration: 1.5 },
        { notes: ['G', 'B'], time: 79.5, duration: 1.5 },
        // A3 M30–M36 = A1
        { notes: ['C', 'E'], time: 81.0, duration: 1.5 },
        { notes: ['C', 'E'], time: 82.5, duration: 1.5 },
        { notes: ['E', 'G'], time: 84.0, duration: 1.5 },
        { notes: ['E', 'G'], time: 85.5, duration: 1.5 },
        { notes: ['F', 'A'], time: 87.0, duration: 1.5 },
        { notes: ['F', 'A'], time: 88.5, duration: 1.5 },
        { notes: ['G', 'F'], time: 90.0, duration: 1.5 },
        { notes: ['C', 'E'], time: 91.5, duration: 1.5 },
        { notes: ['A', 'C'], time: 93.0, duration: 1.5 },
        { notes: ['A', 'C'], time: 94.5, duration: 1.5 },
        { notes: ['F', 'A'], time: 96.0, duration: 1.5 },
        { notes: ['F', 'A'], time: 97.5, duration: 1.5 },
        { notes: ['D', 'A'], time: 99.0, duration: 1.5 },
        { notes: ['D', 'A'], time: 100.5, duration: 1.5 },
        // M38 C6 ending 2
        { notes: ['C', 'A'], time: 102.0, duration: 1.5 },
        { notes: ['C', 'A'], time: 103.5, duration: 1.5 },
        // Outro M39–M46 Am7 | F | Dm7 G7 | C6 | Am7 | F | Fm | C
        { notes: ['A', 'C'], time: 105.0, duration: 1.5 },
        { notes: ['A', 'C'], time: 106.5, duration: 1.5 },
        { notes: ['F', 'A'], time: 108.0, duration: 1.5 },
        { notes: ['F', 'A'], time: 109.5, duration: 1.5 },
        { notes: ['D', 'F'], time: 111.0, duration: 1.5 },
        { notes: ['G', 'B'], time: 112.5, duration: 1.5 },
        { notes: ['C', 'A'], time: 114.0, duration: 1.5 },
        { notes: ['C', 'A'], time: 115.5, duration: 1.5 },
        { notes: ['A', 'C'], time: 117.0, duration: 1.5 },
        { notes: ['A', 'C'], time: 118.5, duration: 1.5 },
        { notes: ['F', 'A'], time: 120.0, duration: 1.5 },
        { notes: ['F', 'A'], time: 121.5, duration: 1.5 },
        { notes: ['F', 'C'], time: 123.0, duration: 1.5 },
        { notes: ['F', 'C'], time: 124.5, duration: 1.5 },
        { notes: ['C', 'E'], time: 126.0, duration: 1.5 },
        { notes: ['C', 'E'], time: 127.5, duration: 1.5 },
      ],
    },
  ];

  let currentSong = songs[0];

  let isPlaying = false;
  let countdown = null;
  let countdownTimer = null;
  let speed = 1;
  let score = 0;
  let streak = 0;
  let currentTime = 0;
  let activeNotes = [];
  let pressedNotes = new Set();
  let noteIdCounter = 0;
  let animationFrame = null;
  let lastTimestamp = 0;
  let audioCtx = null;
  let scheduledBacking = new Set();
  let pendingNoteChecks = new Map();
  let spawnedKeys = new Set();

  let recognizer = null;
  let isModelReady = false;
  let isModelLoading = false;
  let aiRecognizedNote = null;
  let manuallyPressedNote = null;
  let aiUiTimeout = null;
  let manualUiTimeout = null;
  let lastAiPrediction = null;
  let lastAiUiShown = null;
  let lastAiHighConf = { note: null, at: 0, wasHigh: false };
  let lastAiEventAt = {};

  let laneEls = {};
  let fallingLayer = null;

  function $(id) { return document.getElementById(id); }

  function mapClassNameToNote(className) {
    const normalized = String(className || '').trim().toUpperCase();
    if (normalized.includes('C')) {
      if (/C[56789]/.test(normalized) || normalized.includes('HIGH') || normalized.includes("'") || normalized === 'C7') {
        return 'C_HIGH';
      }
      return 'C';
    }
    if (normalized.includes('D')) return 'D';
    if (normalized.includes('E')) return 'E';
    if (normalized.includes('F')) return 'F';
    if (normalized.includes('G')) return 'G';
    if (normalized.includes('A')) return 'A';
    if (normalized.includes('B')) return 'B';
    return null;
  }

  function getAudioContext() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playToneNotes(notes, duration) {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    notes.forEach(note => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = NOTE_FREQUENCIES[note];
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    });
  }

  function updateHud(flash) {
    const scoreEl = $('mlScore');
    const streakEl = $('mlStreak');
    const speedEl = $('mlSpeedValue');
    const songEl = $('mlSongSelect');
    const flashEl = $('mlFlash');
    const aiEl = $('mlAiStatus');
    if (scoreEl) scoreEl.textContent = String(score);
    if (streakEl) streakEl.textContent = String(streak);
    if (speedEl) speedEl.textContent = `${speed.toFixed(1)}×`;
    if (songEl) {
      songEl.value = currentSong.id;
      songEl.disabled = isPlaying || countdown != null;
    }
    if (flashEl && flash != null) {
      flashEl.textContent = flash;
      flashEl.classList.add('show');
      clearTimeout(flashEl._t);
      flashEl._t = setTimeout(() => flashEl.classList.remove('show'), 600);
    }
    if (aiEl) {
      if (isModelLoading) aiEl.textContent = 'Loading AI model…';
      else if (isModelReady) aiEl.textContent = '✓ AI recognition enabled';
      else aiEl.textContent = 'Keyboard mode (AI optional)';
      aiEl.classList.toggle('ready', isModelReady);
    }
    const playBtn = $('mlPlayBtn');
    if (playBtn) playBtn.textContent = isPlaying ? 'Pause' : 'Play';
  }

  function getNotePosition(activeNote) {
    const elapsed = currentTime - activeNote.startTime;
    if (elapsed <= 0) return null;
    const playableHeight = 100 - LEDGER_OFFSET - HIT_ZONE_OFFSET;
    const position = LEDGER_OFFSET + (elapsed / FALL_TIME) * playableHeight;
    const clamped = Math.max(LEDGER_OFFSET, Math.min(100 - HIT_ZONE_OFFSET, position));
    if (clamped <= LEDGER_OFFSET + 2) return null;
    return clamped;
  }

  function renderFallingNotes() {
    if (!fallingLayer) return;
    fallingLayer.innerHTML = '';
    activeNotes.forEach(an => {
      if (an.isHit) return;
      const pos = getNotePosition(an);
      if (pos == null) return;
      const el = document.createElement('div');
      el.className = 'ml-falling-note' + (an.note === 'C_HIGH' ? ' high' : '');
      el.style.top = `${pos}%`;
      el.style.background = NOTE_COLORS[an.note];
      const laneIndex = NOTES_ORDER.indexOf(an.note);
      el.style.left = `calc(${(laneIndex + 0.5) * (100 / 8)}% - 28px)`;
      fallingLayer.appendChild(el);
    });
  }

  function updateBellStates() {
    NOTES_ORDER.forEach(note => {
      const lane = laneEls[note];
      if (!lane) return;
      const bell = lane.querySelector('.ml-bell');
      if (!bell) return;
      bell.classList.toggle('pressed', pressedNotes.has(note));
      bell.classList.toggle('ai', aiRecognizedNote === note);
      bell.classList.toggle('manual', manuallyPressedNote === note);
    });
  }

  function spawnNotes(time) {
    currentSong.notes.forEach(noteEvent => {
      const adjustedTime = noteEvent.time / speed;
      const spawnTime = adjustedTime - FALL_TIME;
      const key = `${noteEvent.note}@${spawnTime.toFixed(3)}`;
      if (spawnTime <= time && spawnTime > time - 0.12 && !spawnedKeys.has(key)) {
        spawnedKeys.add(key);
        activeNotes.push({
          id: noteIdCounter++,
          note: noteEvent.note,
          startTime: spawnTime,
          duration: noteEvent.duration / speed,
          isHit: false,
        });
      }
    });
  }

  function scheduleBackingNotes(gameTime) {
    if (!currentSong.backingTrack) return;
    const visualOffset = FALL_TIME - HIT_TIME;
    currentSong.backingTrack.forEach((backingNote, index) => {
      const adjustedTime = backingNote.time / speed - visualOffset;
      const noteDuration = backingNote.duration / speed;
      if (gameTime >= adjustedTime && gameTime < adjustedTime + 0.1 && !scheduledBacking.has(index)) {
        scheduledBacking.add(index);
        playToneNotes(backingNote.notes, noteDuration);
      }
    });
  }

  function checkHit(note, source) {
    if (!isPlaying) return false;
    let hit = false;
    activeNotes.forEach(activeNote => {
      if (activeNote.note === note && !activeNote.isHit) {
        const elapsed = currentTime - activeNote.startTime;
        if (Math.abs(elapsed - HIT_TIME) < HIT_WINDOW) hit = true;
      }
    });

    if (hit) {
      if (source === 'manual') {
        manuallyPressedNote = note;
        clearTimeout(manualUiTimeout);
        manualUiTimeout = setTimeout(() => {
          manuallyPressedNote = null;
          updateBellStates();
        }, 300);
      }
      activeNotes = activeNotes.map(activeNote => {
        if (activeNote.note === note && !activeNote.isHit) {
          const elapsed = currentTime - activeNote.startTime;
          if (Math.abs(elapsed - HIT_TIME) < HIT_WINDOW) {
            return { ...activeNote, isHit: true };
          }
        }
        return activeNote;
      });
      streak += 1;
      const streakBonus = Math.floor(streak / 5) * 10;
      const points = 10 + streakBonus;
      score += points;
      updateHud(streak % 5 === 0 ? `${streak} streak! +${points}` : `Perfect! +${points}`);
      updateBellStates();
      renderFallingNotes();
      return true;
    }

    if (streak > 0) {
      streak = 0;
      updateHud('Streak lost!');
    }
    updateBellStates();
    return false;
  }

  function tick(timestamp) {
    if (!isPlaying) return;
    if (!lastTimestamp) lastTimestamp = timestamp;
    const delta = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;
    currentTime += delta * speed;

    spawnNotes(currentTime);
    scheduleBackingNotes(currentTime);

    activeNotes.forEach(note => {
      if (note.isHit) return;
      const elapsed = currentTime - note.startTime;
      const timingDiff = Math.abs(elapsed - HIT_TIME);
      if (timingDiff < HIT_WINDOW && !pendingNoteChecks.has(note.id)) {
        pendingNoteChecks.set(note.id, { note: note.note, checkTime: currentTime });
        if (
          lastAiPrediction &&
          lastAiPrediction.note === note.note &&
          Date.now() - lastAiPrediction.at <= AI_PREDICTION_TTL_MS
        ) {
          checkHit(note.note, 'ai');
          pendingNoteChecks.delete(note.id);
        }
      }
      if (elapsed > HIT_TIME + HIT_WINDOW) pendingNoteChecks.delete(note.id);
    });

    activeNotes = activeNotes.filter(note => {
      const elapsed = currentTime - note.startTime;
      return elapsed >= 0 && elapsed < HIT_TIME + HIT_WINDOW;
    });

    renderFallingNotes();

    const songEnd = (currentSong.notes[currentSong.notes.length - 1]?.time || 40) / speed + FALL_TIME + 1;
    if (currentTime > songEnd) {
      pauseGame();
      updateHud('Song finished!');
      return;
    }

    animationFrame = requestAnimationFrame(tick);
  }

  function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdown = 3;
    const overlay = $('mlCountdown');
    if (overlay) {
      overlay.hidden = false;
      overlay.textContent = '3';
    }
    countdownTimer = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        countdown = null;
        if (overlay) overlay.hidden = true;
        beginPlay();
      } else if (overlay) {
        overlay.textContent = String(countdown);
      }
    }, 1000);
  }

  function beginPlay() {
    isPlaying = true;
    lastTimestamp = 0;
    scheduledBacking.clear();
    getAudioContext();
    updateHud();
    animationFrame = requestAnimationFrame(tick);
    startAIRecognition();
  }

  function pauseGame() {
    isPlaying = false;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    updateHud();
  }

  function resetGame() {
    pauseGame();
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
    countdown = null;
    const overlay = $('mlCountdown');
    if (overlay) overlay.hidden = true;
    currentTime = 0;
    score = 0;
    streak = 0;
    activeNotes = [];
    noteIdCounter = 0;
    scheduledBacking.clear();
    pendingNoteChecks.clear();
    spawnedKeys.clear();
    pressedNotes.clear();
    aiRecognizedNote = null;
    manuallyPressedNote = null;
    stopAIRecognition();
    renderFallingNotes();
    updateBellStates();
    updateHud('Reset');
  }

  function togglePlay() {
    if (!isPlaying && countdown == null) startCountdown();
    else if (isPlaying) pauseGame();
  }

  function onKeyDown(note) {
    if (pressedNotes.has(note)) return;
    pressedNotes.add(note);
    updateBellStates();
    if (isPlaying) checkHit(note, 'manual');
  }

  function onKeyUp(note) {
    pressedNotes.delete(note);
    updateBellStates();
  }

  function handleKeyDown(e) {
    const note = NOTE_KEYS[e.key.toLowerCase()];
    if (!note) return false;
    e.preventDefault();
    if (!e.repeat) onKeyDown(note);
    return true;
  }

  function handleKeyUp(e) {
    const note = NOTE_KEYS[e.key.toLowerCase()];
    if (!note) return false;
    onKeyUp(note);
    return true;
  }

  async function loadModel() {
    if (!window.tf || !window.speechCommands) return;
    try {
      isModelLoading = true;
      updateHud();
      try {
        await window.tf.setBackend('webgl');
        await window.tf.ready();
      } catch (e) {
        await window.tf.setBackend('cpu');
        await window.tf.ready();
      }
      const modelUrl = MODEL_URL.endsWith('/') ? MODEL_URL : `${MODEL_URL}/`;
      recognizer = window.speechCommands.create(
        'BROWSER_FFT',
        undefined,
        `${modelUrl}model.json`,
        `${modelUrl}metadata.json`
      );
      await recognizer.ensureModelLoaded();
      isModelReady = true;
      startAIRecognition();
    } catch (err) {
      console.warn('Melody Lanes AI model failed to load:', err);
      isModelReady = false;
    } finally {
      isModelLoading = false;
      updateHud();
    }
  }

  function startAIRecognition() {
    if (!recognizer || !isModelReady) return;
    try {
      if (typeof recognizer.isListening === 'function' && recognizer.isListening()) return;
    } catch (e) { /* ignore */ }

    try {
      const classLabels = recognizer.wordLabels();
      recognizer.listen((result) => {
        const scores = result.scores;
        let maxProb = 0;
        let maxIndex = 0;
        for (let i = 0; i < scores.length; i++) {
          if (scores[i] > maxProb) {
            maxProb = scores[i];
            maxIndex = i;
          }
        }
        const className = classLabels[maxIndex];
        const isNoise = /noise|background|silence|unknown/i.test(className);
        const isHigh = maxProb >= AI_UI_CONFIDENCE_THRESHOLD && !isNoise;
        const prev = lastAiHighConf;
        const shouldEmit =
          isHigh &&
          (prev.note !== className || prev.wasHigh === false || Date.now() - prev.at > AI_UI_DEDUP_MS);
        lastAiHighConf = { note: className, at: Date.now(), wasHigh: isHigh };

        if (!shouldEmit) return;
        const recognizedNote = mapClassNameToNote(className);
        if (!recognizedNote) return;
        const now = Date.now();
        if (now - (lastAiEventAt[recognizedNote] || 0) < AI_EVENT_COOLDOWN_MS) return;
        lastAiEventAt[recognizedNote] = now;
        lastAiPrediction = { note: recognizedNote, confidence: maxProb, at: now };

        const lastUi = lastAiUiShown;
        if (!lastUi || lastUi.note !== recognizedNote || now - lastUi.at > AI_UI_DEDUP_MS) {
          lastAiUiShown = { note: recognizedNote, at: now };
          aiRecognizedNote = recognizedNote;
          updateBellStates();
          clearTimeout(aiUiTimeout);
          aiUiTimeout = setTimeout(() => {
            aiRecognizedNote = null;
            updateBellStates();
          }, 800);
        }

        // Score if a matching note is currently in the hit window
        if (isPlaying) {
          for (const [id, check] of pendingNoteChecks.entries()) {
            if (check.note === recognizedNote) {
              checkHit(recognizedNote, 'ai');
              pendingNoteChecks.delete(id);
              break;
            }
          }
        }
      }, {
        includeSpectrogram: false,
        probabilityThreshold: 0.1,
        invokeCallbackOnNoiseAndUnknown: true,
        overlapFactor: 0.75,
      });
    } catch (err) {
      console.warn('AI recognition start error:', err);
    }
  }

  function stopAIRecognition() {
    if (recognizer) {
      try { recognizer.stopListening(); } catch (e) { /* ignore */ }
    }
    pendingNoteChecks.clear();
  }

  function buildBoard() {
    const board = $('mlBoard');
    fallingLayer = $('mlFallingLayer');
    if (!board) return;
    board.innerHTML = '';
    laneEls = {};
    NOTES_ORDER.forEach((note, index) => {
      const lane = document.createElement('div');
      lane.className = 'ml-lane';
      lane.dataset.note = note;
      lane.innerHTML =
        `<div class="ml-lane-tint" style="background:${NOTE_COLORS[note]}"></div>` +
        `<div class="ml-lane-label"><span style="background:${NOTE_COLORS[note]}">${KEY_LABELS[index]}</span></div>` +
        `<div class="ml-hit-zone">` +
          `<button type="button" class="ml-bell${note === 'C_HIGH' ? ' high' : ''}" style="background:${NOTE_COLORS[note]}" data-note="${note}">${KEY_LABELS[index]}</button>` +
        `</div>`;
      lane.querySelector('.ml-bell').addEventListener('click', () => {
        if (isPlaying) checkHit(note, 'manual');
      });
      board.appendChild(lane);
      laneEls[note] = lane;
    });
  }

  function setupSongSelect() {
    const select = $('mlSongSelect');
    if (!select) return;
    select.innerHTML = songs.map(song =>
      `<option value="${song.id}">${song.title}</option>`
    ).join('');
    select.value = currentSong.id;
    select.addEventListener('change', () => {
      const next = songs.find(song => song.id === select.value);
      if (!next || next === currentSong) return;
      currentSong = next;
      resetGame();
    });
  }

  function setupMelodyLanes() {
    buildBoard();
    setupSongSelect();
    updateHud();

    $('mlPlayBtn')?.addEventListener('click', togglePlay);
    $('mlResetBtn')?.addEventListener('click', resetGame);
    $('mlSpeedDown')?.addEventListener('click', () => {
      speed = Math.max(0.5, Math.round((speed - 0.1) * 10) / 10);
      scheduledBacking.clear();
      spawnedKeys.clear();
      updateHud();
    });
    $('mlSpeedUp')?.addEventListener('click', () => {
      speed = Math.min(2, Math.round((speed + 0.1) * 10) / 10);
      scheduledBacking.clear();
      spawnedKeys.clear();
      updateHud();
    });

    // Load AI libs if present
    const waitForAi = async () => {
      let attempts = 0;
      while ((!window.tf || !window.speechCommands) && attempts < 50) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
      if (window.tf && window.speechCommands) await loadModel();
      else updateHud();
    };
    waitForAi();
  }

  function isPlayingLanes() {
    return isPlaying || countdown != null;
  }

  function stopIfLeavingTab() {
    if (isPlaying) pauseGame();
  }

  global.MelodyLanes = {
    setup: setupMelodyLanes,
    handleKeyDown,
    handleKeyUp,
    isPlaying: isPlayingLanes,
    stopIfLeavingTab,
    reset: resetGame,
  };
})(window);
