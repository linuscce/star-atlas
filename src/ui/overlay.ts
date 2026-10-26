import type { Mark } from '../map/skymap';
import { app } from './app';
import { $ } from './dom';

// ---------- надписи поверх карты ----------

let hintTimer = 0;
export function hint(html: string | null, ms = 4500) {
  const el = $('hint');
  clearTimeout(hintTimer);
  if (!html) { el.className = 'hint'; return; }
  el.innerHTML = html;
  el.className = 'hint show';
  if (ms) hintTimer = window.setTimeout(() => { el.className = 'hint'; }, ms);
}

export function banner(html: string | null, kind = '') {
  const el = $('banner');
  if (!html) { el.className = 'banner'; return; }
  el.innerHTML = html;
  el.className = `banner show ${kind}`;
}

let pulseTimer = 0;
export function pulse(ra: number, dec: number, kind: Mark['kind'] = 'info') {
  const map = app.map;
  clearTimeout(pulseTimer);
  map.marks = [{ ra, dec, kind, pulse: true, t0: performance.now() }];
  map.redraw();
  pulseTimer = window.setTimeout(() => { map.marks = []; map.redraw(); }, 2800);
}
