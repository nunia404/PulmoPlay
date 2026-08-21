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
      bpm: 76,
      notes: [
        // Intro (前奏 5 6 1̇ 2̇ | 1̇ 6 5 3 | …) — 2̇ folded to D
        { note: 'G', time: 0.0, duration: 0.789 },
        { note: 'A', time: 0.789, duration: 0.789 },
        { note: 'C_HIGH', time: 1.579, duration: 0.789 },
        { note: 'D', time: 2.368, duration: 0.789 },
        { note: 'C_HIGH', time: 3.158, duration: 0.789 },
        { note: 'A', time: 3.947, duration: 0.789 },
        { note: 'G', time: 4.737, duration: 0.789 },
        { note: 'E', time: 5.526, duration: 0.789 },
        { note: 'G', time: 6.316, duration: 0.789 },
        { note: 'A', time: 7.105, duration: 0.789 },
        { note: 'C_HIGH', time: 7.895, duration: 0.789 },
        { note: 'D', time: 8.684, duration: 0.789 },
        { note: 'C_HIGH', time: 9.474, duration: 3.158 },
        // Verse 1 — 你问我爱你有多深 / 我爱你有几分 (3 5 6. 1̇ | 6 5 3 5 | 6. 1̇ 6 5 | 3 - - -)
        { note: 'E', time: 12.632, duration: 0.789 },
        { note: 'G', time: 13.421, duration: 0.789 },
        { note: 'A', time: 14.211, duration: 1.184 },
        { note: 'C_HIGH', time: 15.395, duration: 0.395 },
        { note: 'A', time: 15.789, duration: 0.789 },
        { note: 'G', time: 16.579, duration: 0.789 },
        { note: 'E', time: 17.368, duration: 0.789 },
        { note: 'G', time: 18.158, duration: 0.789 },
        { note: 'A', time: 18.947, duration: 1.184 },
        { note: 'C_HIGH', time: 20.132, duration: 0.395 },
        { note: 'A', time: 20.526, duration: 0.789 },
        { note: 'G', time: 21.316, duration: 0.789 },
        { note: 'E', time: 22.105, duration: 3.158 },
        // Verse 1 — 我的情也真 / 我的爱也真 (1 3 5. 6 | 5 3 1 3 | 5. 6 5 3 | 2 - - -)
        { note: 'C', time: 25.263, duration: 0.789 },
        { note: 'E', time: 26.053, duration: 0.789 },
        { note: 'G', time: 26.842, duration: 1.184 },
        { note: 'A', time: 28.026, duration: 0.395 },
        { note: 'G', time: 28.421, duration: 0.789 },
        { note: 'E', time: 29.211, duration: 0.789 },
        { note: 'C', time: 30.0, duration: 0.789 },
        { note: 'E', time: 30.789, duration: 0.789 },
        { note: 'G', time: 31.579, duration: 1.184 },
        { note: 'A', time: 32.763, duration: 0.395 },
        { note: 'G', time: 33.158, duration: 0.789 },
        { note: 'E', time: 33.947, duration: 0.789 },
        { note: 'D', time: 34.737, duration: 3.158 },
        // Verse 1 — 月亮代表我的心 (5. 6 5 3 | 2. 3 2 1 | 6, 1 2 3 | 1 - - -) — low 6 folded up to A
        { note: 'G', time: 37.895, duration: 1.184 },
        { note: 'A', time: 39.079, duration: 0.395 },
        { note: 'G', time: 39.474, duration: 0.789 },
        { note: 'E', time: 40.263, duration: 0.789 },
        { note: 'D', time: 41.053, duration: 1.184 },
        { note: 'E', time: 42.237, duration: 0.395 },
        { note: 'D', time: 42.632, duration: 0.789 },
        { note: 'C', time: 43.421, duration: 0.789 },
        { note: 'A', time: 44.211, duration: 0.789 },
        { note: 'C', time: 45.0, duration: 0.789 },
        { note: 'D', time: 45.789, duration: 0.789 },
        { note: 'E', time: 46.579, duration: 0.789 },
        { note: 'C', time: 47.368, duration: 3.158 },
        // Verse 2 — 你问我爱你有多深 / 我爱你有几分
        { note: 'E', time: 50.526, duration: 0.789 },
        { note: 'G', time: 51.316, duration: 0.789 },
        { note: 'A', time: 52.105, duration: 1.184 },
        { note: 'C_HIGH', time: 53.289, duration: 0.395 },
        { note: 'A', time: 53.684, duration: 0.789 },
        { note: 'G', time: 54.474, duration: 0.789 },
        { note: 'E', time: 55.263, duration: 0.789 },
        { note: 'G', time: 56.053, duration: 0.789 },
        { note: 'A', time: 56.842, duration: 1.184 },
        { note: 'C_HIGH', time: 58.026, duration: 0.395 },
        { note: 'A', time: 58.421, duration: 0.789 },
        { note: 'G', time: 59.211, duration: 0.789 },
        { note: 'E', time: 60.0, duration: 3.158 },
        // Verse 2 — 我的情不移 / 我的爱不变
        { note: 'C', time: 63.158, duration: 0.789 },
        { note: 'E', time: 63.947, duration: 0.789 },
        { note: 'G', time: 64.737, duration: 1.184 },
        { note: 'A', time: 65.921, duration: 0.395 },
        { note: 'G', time: 66.316, duration: 0.789 },
        { note: 'E', time: 67.105, duration: 0.789 },
        { note: 'C', time: 67.895, duration: 0.789 },
        { note: 'E', time: 68.684, duration: 0.789 },
        { note: 'G', time: 69.474, duration: 1.184 },
        { note: 'A', time: 70.658, duration: 0.395 },
        { note: 'G', time: 71.053, duration: 0.789 },
        { note: 'E', time: 71.842, duration: 0.789 },
        { note: 'D', time: 72.632, duration: 3.158 },
        // Verse 2 — 月亮代表我的心
        { note: 'G', time: 75.789, duration: 1.184 },
        { note: 'A', time: 76.974, duration: 0.395 },
        { note: 'G', time: 77.368, duration: 0.789 },
        { note: 'E', time: 78.158, duration: 0.789 },
        { note: 'D', time: 78.947, duration: 1.184 },
        { note: 'E', time: 80.132, duration: 0.395 },
        { note: 'D', time: 80.526, duration: 0.789 },
        { note: 'C', time: 81.316, duration: 0.789 },
        { note: 'A', time: 82.105, duration: 0.789 },
        { note: 'C', time: 82.895, duration: 0.789 },
        { note: 'D', time: 83.684, duration: 0.789 },
        { note: 'E', time: 84.474, duration: 0.789 },
        { note: 'C', time: 85.263, duration: 3.158 },
        // Chorus — 轻轻的一个吻 / 已经打动我的心 (ends 1̇ - - 6)
        { note: 'E', time: 88.421, duration: 0.789 },
        { note: 'G', time: 89.211, duration: 0.789 },
        { note: 'A', time: 90.0, duration: 1.184 },
        { note: 'C_HIGH', time: 91.184, duration: 0.395 },
        { note: 'A', time: 91.579, duration: 0.789 },
        { note: 'G', time: 92.368, duration: 0.789 },
        { note: 'E', time: 93.158, duration: 0.789 },
        { note: 'G', time: 93.947, duration: 0.789 },
        { note: 'A', time: 94.737, duration: 1.184 },
        { note: 'C_HIGH', time: 95.921, duration: 0.395 },
        { note: 'A', time: 96.316, duration: 0.789 },
        { note: 'G', time: 97.105, duration: 0.789 },
        { note: 'C_HIGH', time: 97.895, duration: 2.368 },
        { note: 'A', time: 100.263, duration: 0.789 },
        // Chorus — 深深的一段情 / 教我思念到如今
        { note: 'C', time: 101.053, duration: 0.789 },
        { note: 'E', time: 101.842, duration: 0.789 },
        { note: 'G', time: 102.632, duration: 1.184 },
        { note: 'A', time: 103.816, duration: 0.395 },
        { note: 'G', time: 104.211, duration: 0.789 },
        { note: 'E', time: 105.0, duration: 0.789 },
        { note: 'C', time: 105.789, duration: 0.789 },
        { note: 'E', time: 106.579, duration: 0.789 },
        { note: 'G', time: 107.368, duration: 1.184 },
        { note: 'A', time: 108.553, duration: 0.395 },
        { note: 'G', time: 108.947, duration: 0.789 },
        { note: 'E', time: 109.737, duration: 0.789 },
        { note: 'D', time: 110.526, duration: 3.158 },
        // Chorus — 月亮代表我的心
        { note: 'G', time: 113.684, duration: 1.184 },
        { note: 'A', time: 114.868, duration: 0.395 },
        { note: 'G', time: 115.263, duration: 0.789 },
        { note: 'E', time: 116.053, duration: 0.789 },
        { note: 'D', time: 116.842, duration: 1.184 },
        { note: 'E', time: 118.026, duration: 0.395 },
        { note: 'D', time: 118.421, duration: 0.789 },
        { note: 'C', time: 119.211, duration: 0.789 },
        { note: 'A', time: 120.0, duration: 0.789 },
        { note: 'C', time: 120.789, duration: 0.789 },
        { note: 'D', time: 121.579, duration: 0.789 },
        { note: 'E', time: 122.368, duration: 0.789 },
        { note: 'C', time: 123.158, duration: 3.158 },
        // Ending — 月亮代表我的心
        { note: 'G', time: 126.316, duration: 1.184 },
        { note: 'A', time: 127.5, duration: 0.395 },
        { note: 'G', time: 127.895, duration: 0.789 },
        { note: 'E', time: 128.684, duration: 0.789 },
        { note: 'D', time: 129.474, duration: 1.184 },
        { note: 'E', time: 130.658, duration: 0.395 },
        { note: 'D', time: 131.053, duration: 0.789 },
        { note: 'C', time: 131.842, duration: 0.789 },
        { note: 'A', time: 132.632, duration: 0.789 },
        { note: 'C', time: 133.421, duration: 0.789 },
        { note: 'D', time: 134.211, duration: 0.789 },
        { note: 'E', time: 135.0, duration: 0.789 },
        { note: 'C', time: 135.789, duration: 3.158 },
      ],
      backingTrack: [
        // Intro C | G | C | C
        { notes: ['C', 'E'], time: 0.0, duration: 1.579 },
        { notes: ['C', 'E'], time: 1.579, duration: 1.579 },
        { notes: ['G', 'B'], time: 3.158, duration: 1.579 },
        { notes: ['G', 'B'], time: 4.737, duration: 1.579 },
        { notes: ['C', 'E'], time: 6.316, duration: 1.579 },
        { notes: ['C', 'E'], time: 7.895, duration: 1.579 },
        { notes: ['C', 'E'], time: 9.474, duration: 1.579 },
        { notes: ['C', 'E'], time: 11.053, duration: 1.579 },
        // Verse 1 C | Em | F | G
        { notes: ['C', 'E'], time: 12.632, duration: 1.579 },
        { notes: ['C', 'E'], time: 14.211, duration: 1.579 },
        { notes: ['E', 'G'], time: 15.789, duration: 1.579 },
        { notes: ['E', 'G'], time: 17.368, duration: 1.579 },
        { notes: ['F', 'A'], time: 18.947, duration: 1.579 },
        { notes: ['F', 'A'], time: 20.526, duration: 1.579 },
        { notes: ['G', 'B'], time: 22.105, duration: 1.579 },
        { notes: ['G', 'B'], time: 23.684, duration: 1.579 },
        // Verse 1 C | Em | F | G
        { notes: ['C', 'E'], time: 25.263, duration: 1.579 },
        { notes: ['C', 'E'], time: 26.842, duration: 1.579 },
        { notes: ['E', 'G'], time: 28.421, duration: 1.579 },
        { notes: ['E', 'G'], time: 30.0, duration: 1.579 },
        { notes: ['F', 'A'], time: 31.579, duration: 1.579 },
        { notes: ['F', 'A'], time: 33.158, duration: 1.579 },
        { notes: ['G', 'B'], time: 34.737, duration: 1.579 },
        { notes: ['G', 'B'], time: 36.316, duration: 1.579 },
        // Cadence Am | Dm | G | C
        { notes: ['A', 'C'], time: 37.895, duration: 1.579 },
        { notes: ['A', 'C'], time: 39.474, duration: 1.579 },
        { notes: ['D', 'F'], time: 41.053, duration: 1.579 },
        { notes: ['D', 'F'], time: 42.632, duration: 1.579 },
        { notes: ['G', 'B'], time: 44.211, duration: 1.579 },
        { notes: ['G', 'B'], time: 45.789, duration: 1.579 },
        { notes: ['C', 'E'], time: 47.368, duration: 1.579 },
        { notes: ['C', 'E'], time: 48.947, duration: 1.579 },
        // Verse 2 C | Em | F | G
        { notes: ['C', 'E'], time: 50.526, duration: 1.579 },
        { notes: ['C', 'E'], time: 52.105, duration: 1.579 },
        { notes: ['E', 'G'], time: 53.684, duration: 1.579 },
        { notes: ['E', 'G'], time: 55.263, duration: 1.579 },
        { notes: ['F', 'A'], time: 56.842, duration: 1.579 },
        { notes: ['F', 'A'], time: 58.421, duration: 1.579 },
        { notes: ['G', 'B'], time: 60.0, duration: 1.579 },
        { notes: ['G', 'B'], time: 61.579, duration: 1.579 },
        // Verse 2 C | Em | F | G
        { notes: ['C', 'E'], time: 63.158, duration: 1.579 },
        { notes: ['C', 'E'], time: 64.737, duration: 1.579 },
        { notes: ['E', 'G'], time: 66.316, duration: 1.579 },
        { notes: ['E', 'G'], time: 67.895, duration: 1.579 },
        { notes: ['F', 'A'], time: 69.474, duration: 1.579 },
        { notes: ['F', 'A'], time: 71.053, duration: 1.579 },
        { notes: ['G', 'B'], time: 72.632, duration: 1.579 },
        { notes: ['G', 'B'], time: 74.211, duration: 1.579 },
        // Cadence Am | Dm | G | C
        { notes: ['A', 'C'], time: 75.789, duration: 1.579 },
        { notes: ['A', 'C'], time: 77.368, duration: 1.579 },
        { notes: ['D', 'F'], time: 78.947, duration: 1.579 },
        { notes: ['D', 'F'], time: 80.526, duration: 1.579 },
        { notes: ['G', 'B'], time: 82.105, duration: 1.579 },
        { notes: ['G', 'B'], time: 83.684, duration: 1.579 },
        { notes: ['C', 'E'], time: 85.263, duration: 1.579 },
        { notes: ['C', 'E'], time: 86.842, duration: 1.579 },
        // Chorus C | Em | F | G
        { notes: ['C', 'E'], time: 88.421, duration: 1.579 },
        { notes: ['C', 'E'], time: 90.0, duration: 1.579 },
        { notes: ['E', 'G'], time: 91.579, duration: 1.579 },
        { notes: ['E', 'G'], time: 93.158, duration: 1.579 },
        { notes: ['F', 'A'], time: 94.737, duration: 1.579 },
        { notes: ['F', 'A'], time: 96.316, duration: 1.579 },
        { notes: ['G', 'B'], time: 97.895, duration: 1.579 },
        { notes: ['G', 'B'], time: 99.474, duration: 1.579 },
        // Chorus C | Em | F | G
        { notes: ['C', 'E'], time: 101.053, duration: 1.579 },
        { notes: ['C', 'E'], time: 102.632, duration: 1.579 },
        { notes: ['E', 'G'], time: 104.211, duration: 1.579 },
        { notes: ['E', 'G'], time: 105.789, duration: 1.579 },
        { notes: ['F', 'A'], time: 107.368, duration: 1.579 },
        { notes: ['F', 'A'], time: 108.947, duration: 1.579 },
        { notes: ['G', 'B'], time: 110.526, duration: 1.579 },
        { notes: ['G', 'B'], time: 112.105, duration: 1.579 },
        // Cadence Am | Dm | G | C
        { notes: ['A', 'C'], time: 113.684, duration: 1.579 },
        { notes: ['A', 'C'], time: 115.263, duration: 1.579 },
        { notes: ['D', 'F'], time: 116.842, duration: 1.579 },
        { notes: ['D', 'F'], time: 118.421, duration: 1.579 },
        { notes: ['G', 'B'], time: 120.0, duration: 1.579 },
        { notes: ['G', 'B'], time: 121.579, duration: 1.579 },
        { notes: ['C', 'E'], time: 123.158, duration: 1.579 },
        { notes: ['C', 'E'], time: 124.737, duration: 1.579 },
        // Ending Am | Dm | G | C
        { notes: ['A', 'C'], time: 126.316, duration: 1.579 },
        { notes: ['A', 'C'], time: 127.895, duration: 1.579 },
        { notes: ['D', 'F'], time: 129.474, duration: 1.579 },
        { notes: ['D', 'F'], time: 131.053, duration: 1.579 },
        { notes: ['G', 'B'], time: 132.632, duration: 1.579 },
        { notes: ['G', 'B'], time: 134.211, duration: 1.579 },
        { notes: ['C', 'E'], time: 135.789, duration: 1.579 },
        { notes: ['C', 'E'], time: 137.368, duration: 1.579 },
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
