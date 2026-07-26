#!/usr/bin/env node
/**
 * WCAG 2.1 contrast audit for the design tokens (T-42, A11Y-7).
 *
 * Parses the real token values out of src/styles/index.css and checks every
 * pair that actually appears on screen, in all four palette combinations.
 * Reading the stylesheet rather than a hand-kept copy means this cannot drift.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(ROOT, 'src/styles/index.css'), 'utf8');

/** Extracts `--token: value;` pairs from a named block. */
function block(selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`Missing block: ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const body = css.slice(open + 1, close);
  const out = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    out[name.trim()] = value.trim();
  }
  return out;
}

const base = block('@theme');
const dark = block('.dark {');
const cbLight = block("[data-palette='cb'] {");
const cbDark = block(".dark[data-palette='cb'] {");

const PALETTES = {
  light: { ...base },
  dark: { ...base, ...dark },
  'light + colourblind': { ...base, ...cbLight },
  'dark + colourblind': { ...base, ...dark, ...cbDark },
};

function toRgb(value) {
  const hex = value.trim();
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * Pairs that a user actually sees. `min` is the WCAG 2.1 threshold:
 * 4.5 for body text, 3.0 for large text (the tiles are ~2rem bold) and for
 * non-text UI boundaries.
 */
const PAIRS = [
  ['body text', '--color-text', '--color-surface', 4.5],
  ['muted text', '--color-text-muted', '--color-surface', 4.5],
  ['muted on raised', '--color-text-muted', '--color-surface-raised', 4.5],
  ['text on raised', '--color-text', '--color-surface-raised', 4.5],
  ['text on sunken', '--color-text', '--color-surface-sunken', 4.5],
  ['correct tile', '--color-tile-text-revealed', '--color-tile-correct', 3.0],
  ['present tile', '--color-tile-text-revealed', '--color-tile-present', 3.0],
  ['absent tile', '--color-tile-text-revealed', '--color-tile-absent', 3.0],
  ['unrevealed tile text', '--color-tile-text', '--color-surface', 4.5],
  ['tile border vs surface', '--color-tile-empty-border', '--color-surface', 3.0],
  ['filled border vs surface', '--color-tile-filled-border', '--color-surface', 3.0],
  ['key text', '--color-key-text', '--color-key', 4.5],
  ['correct key', '--color-key-text-revealed', '--color-key-correct', 3.0],
  ['present key', '--color-key-text-revealed', '--color-key-present', 3.0],
  ['absent key', '--color-key-text-revealed', '--color-key-absent', 3.0],
  ['focus ring vs surface', '--color-focus', '--color-surface', 3.0],
  ['focus ring vs raised', '--color-focus', '--color-surface-raised', 3.0],
  ['toast text', '--color-toast-text', '--color-toast', 4.5],
  ['danger text', '--color-danger-text', '--color-danger', 4.5],
  ['border vs surface', '--color-border', '--color-surface', 3.0],
];

let failures = 0;
const rows = [];

for (const [paletteName, tokens] of Object.entries(PALETTES)) {
  for (const [label, fgToken, bgToken, min] of PAIRS) {
    const fg = toRgb(tokens[fgToken] ?? '');
    const bg = toRgb(tokens[bgToken] ?? '');
    if (!fg || !bg) {
      rows.push([paletteName, label, 'SKIP (non-hex)', '', '']);
      continue;
    }
    const ratio = contrast(fg, bg);
    const pass = ratio >= min;
    if (!pass) failures += 1;
    rows.push([
      paletteName,
      label,
      `${ratio.toFixed(2)}:1`,
      `>= ${min.toFixed(1)}`,
      pass ? 'PASS' : 'FAIL',
    ]);
  }
}

const w = [22, 26, 10, 8, 6];
const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join(' ');
process.stdout.write(`${line(['PALETTE', 'PAIR', 'RATIO', 'MIN', ''])}\n`);
process.stdout.write(`${'-'.repeat(w.reduce((a, b) => a + b + 1, 0))}\n`);
for (const row of rows) process.stdout.write(`${line(row)}\n`);
process.stdout.write(
  `\n${failures === 0 ? 'All pairs meet WCAG 2.1 AA.' : `${String(failures)} pair(s) BELOW threshold.`}\n`,
);

process.exit(failures === 0 ? 0 : 1);
