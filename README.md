# PulmoPlay

A 9-button keyboard clarinet in the browser, plus **Cloud Garden** — a one-minute breathing game for children. Sound is synthesized live with the Web Audio API — no audio files, no build step, no dependencies. It also supports breath input from an ESP32 flow sensor connected over Bluetooth (the ESP32 sends normal keystrokes, so the browser can't tell it apart from a person pressing keys).

## Requirements

- Any modern browser with Web Audio API support (Chrome, Firefox, Edge, Safari).
- A static file server. This is plain HTML/CSS/JS — no Node, no npm, no build tooling required.

## Install / run locally

1. Clone the repo:
   ```bash
   git clone https://github.com/nunia404/PulmoPlay.git
   cd PulmoPlay
   ```

2. Serve the folder with any static file server. For example:
   ```bash
   python3 -m http.server 8000
   ```
   or, with Node's `http-server` (if you have it installed):
   ```bash
   npx http-server -p 8000
   ```

3. Open `http://localhost:8000` in your browser.

> Opening `index.html` directly via `file://` mostly works too, but serving it over HTTP is recommended for consistent Web Audio behavior across browsers.

## Deploying

Since it's static files, deploy by copying `index.html`, `app.js`, and `style.css` to any web server or static host (nginx, Apache, GitHub Pages, Netlify, etc.). For nginx, an `alias` (or `root`) pointed at the project folder is enough — no special config needed.

## Controls

**Clarinet tab**

| Key | Action |
|---|---|
| `A` `S` `D` `←` | Notes C D E F |
| `→` `K` `L` `;` | Notes G A B C |
| `↑` (hold) | Sharp (♯) — raises the held note a semitone |
| `N` | Breath: normal |
| `↓` | Breath: exhale |
| `I` | Breath: inhale (mutes the instrument until you exhale) |

**Cloud Garden tab**

A one-minute session. Breathing creates weather that grows a magical garden. A glowing guide coaches **inhale 4 · hold 4 · exhale 8**:

| Breath state | Weather |
|---|---|
| Inhale (`I`, 4s) | Summons a cloud |
| Hold (`N`, 4s) | Cloud rests |
| Exhale (`↓`, 8s) | Makes the cloud rain |

Across the minute, seedlings become a changing mix of flowers, ferns, mushrooms, and vines. In the final 10 seconds, **one animal** (such as a bee, butterfly, frog, or bird) visits. After the session the child collects **that animal’s card** — rarity comes from garden biome, plant mix, repeat visits, and gentle randomness, **not** breathing force or session length.

When the minute ends, they can keep the same core reward and finish, or try an optional bonus: one more approved breath cycle sends wind carrying seeds to a neighbouring plot.

Cloud Garden only detects three states — inhale, pause, exhale — so it rewards a comfortable pattern and rests. It records timing, completed cycles, rests, and an optional comfort rating. It does **not** claim to measure lung capacity, strength, or cough effectiveness.

## ESP32 / Bluetooth breath sensor (optional)

The instrument can be driven by a physical breath sensor instead of the `↓`/`I`/`N` keys. The ESP32 firmware pairs as a Bluetooth HID keyboard and sends a single keystroke whenever the breath state changes:

- `n` — normal / pause (no airflow)
- `ArrowDown` — expiration (breathing out)
- `i` — inspiration (breathing in)

No app-side pairing step is needed beyond normal OS Bluetooth keyboard pairing — once paired, the ESP32's keystrokes are indistinguishable from a keyboard's to the page.
