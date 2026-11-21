// World News — Friday 20 November 2026. A program that draws a newspaper
// front page summing up the day's world news and writes it as a PNG.
// Node 22, standard library only (node:fs, node:path, node:zlib).
// No network, no clock, no randomness: two runs write identical bytes.
//
// Stories (all verified against live reporting, events of 20 Nov 2026):
//  1. Russia's massive overnight missile and drone strike on Kyiv —
//     400+ drones, 110+ missiles, three Dnipro bridges hit, 8 killed.
//  2. UK and EU strike a post-Brexit reset deal in Brussels — food trade,
//     linked carbon markets, youth mobility for 100,000 a year.
//  3. COP31 climate talks in Antalya go into overtime — the draft deal
//     drops all fossil-fuel language as nearly 200 nations deadlock.
//  4. Iran lines up 14+ tankers at Kharg Island to test the US naval
//     blockade of its oil exports.
//  5. GTA 6 day-one sales put at $2.36bn (Sensor Tower estimate, first
//     reported 20 Nov) — the biggest entertainment launch ever.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;

// ---- colours ----
const PAPER: RGB = [247, 243, 234]; // warm newsprint
const INK: RGB = [17, 17, 17]; // near-black
const RED: RGB = [178, 28, 28]; // kicker red
const BLUE: RGB = [30, 58, 95]; // deep blue
const SKY: RGB = [38, 68, 110]; // night sky
const RIVER: RGB = [70, 110, 150]; // river blue
const ORANGE: RGB = [232, 120, 30]; // explosion orange
const YELLOW: RGB = [240, 190, 60]; // explosion yellow
const GREY: RGB = [120, 120, 118]; // smoke grey
const MIDGREY: RGB = [90, 90, 88]; // dark grey
const LIGHTGREY: RGB = [210, 205, 195]; // light grey
const GREEN: RGB = [34, 120, 70]; // climate green
const GOLD: RGB = [176, 141, 60]; // gold

type RGB = [number, number, number];

// ---- CRC32 (PNG chunk checksums) ----
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// Encode an RGB framebuffer as a PNG (8-bit, colour type 2, filter 0).
function encodePNG(rgb: Buffer, width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter 0
    rgb.copy(raw, y * (1 + width * 3) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- Canvas: an RGB framebuffer with simple drawing primitives ----
class Canvas {
  readonly w: number;
  readonly h: number;
  readonly px: Buffer;
  constructor(w: number, h: number, bg: RGB) {
    this.w = w;
    this.h = h;
    this.px = Buffer.alloc(w * h * 3);
    this.fillRect(0, 0, w, h, bg);
  }
  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
  }
  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.ceil(x + w));
    const y1 = Math.min(this.h, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.w + xx) * 3;
        this.px[i] = c[0];
        this.px[i + 1] = c[1];
        this.px[i + 2] = c[2];
      }
    }
  }
  // Horizontal rule (a thin filled rect).
  rule(x: number, y: number, w: number, thick: number, c: RGB): void {
    this.fillRect(x, y, w, thick, c);
  }
  // Bresenham line.
  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    let dx = Math.abs(x1 - x0);
    let dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.set(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  // Thick line: draw the line several times offset perpendicular-ish.
  thickLine(x0: number, y0: number, x1: number, y1: number, thick: number, c: RGB): void {
    const r = Math.floor(thick / 2);
    for (let a = -r; a <= r; a++) {
      for (let b = -r; b <= r; b++) {
        this.line(x0 + a, y0 + b, x1 + a, y1 + b, c);
      }
    }
  }
  // Filled circle (midpoint scan).
  circle(cx: number, cy: number, r: number, c: RGB): void {
    for (let y = -r; y <= r; y++) {
      const half = Math.floor(Math.sqrt(r * r - y * y));
      for (let x = -half; x <= half; x++) this.set(cx + x, cy + y, c);
    }
  }
  // Circle outline.
  ring(cx: number, cy: number, r: number, c: RGB): void {
    for (let a = 0; a < 360; a += 1) {
      const rad = (a * Math.PI) / 180;
      this.set(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), c);
    }
  }
}

// ---- Bitmap font: 5x7, uppercase + digits + punctuation ----
// Each glyph is 7 rows of 5 characters; '#' is ink, '.' is blank.
const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
};

// ---- font, continued: N-Z, digits, punctuation ----
const FONT2: Record<string, string[]> = {
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.#...'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '.###.', '.....', '.....', '.....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '&': ['.##..', '#..#.', '#..#.', '.#...', '#.#.#', '#..#.', '.##.#'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '#.##.', '#..##'],
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  '+': ['.....', '..#..', '..#..', '.###.', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '.###.', '.....', '.###.', '.....', '.....'],
  '*': ['.....', '.#.#.', '..#..', '#####', '..#..', '.#.#.', '.....'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.###.'],
};

function glyph(ch: string): string[] {
  return FONT[ch] ?? FONT2[ch] ?? FONT2[' '];
}

// Width in pixels of a string at a given scale (advance 6 units per char).
function textWidth(s: string, scale: number): number {
  if (s.length === 0) return 0;
  return s.length * 6 * scale - scale;
}

// Draw a string; returns the x just past the last character.
function drawText(cv: Canvas, s: string, x: number, y: number, scale: number, c: RGB): number {
  let cx = x;
  for (const ch of s) {
    const g = glyph(ch);
    for (let row = 0; row < 7; row++) {
      const line = g[row];
      for (let col = 0; col < 5; col++) {
        if (line[col] === '#') {
          cv.fillRect(cx + col * scale, y + row * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
  return cx;
}

// Draw a string centred on cx.
function drawTextCentred(cv: Canvas, s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(cv, s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}

// Break a string into lines that fit maxWidth pixels at the given scale.
function wrapText(s: string, scale: number, maxWidth: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur === '' ? w : cur + ' ' + w;
    if (textWidth(trial, scale) <= maxWidth) {
      cur = trial;
    } else {
      if (cur !== '') lines.push(cur);
      cur = w;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

// Draw wrapped text; returns the y just past the last line.
function drawWrapped(cv: Canvas, s: string, x: number, y: number, scale: number, maxWidth: number, c: RGB): number {
  const lines = wrapText(s, scale, maxWidth);
  let yy = y;
  for (const line of lines) {
    drawText(cv, line, x, yy, scale, c);
    yy += 8 * scale;
  }
  return yy;
}

// ---- illustration helpers ----

// Fixed star positions (relative to the art box), deterministic.
const STARS: [number, number][] = [
  [30, 18], [90, 40], [150, 14], [210, 34], [280, 12], [350, 42], [420, 16],
  [480, 36], [540, 14], [610, 40], [680, 18], [750, 38], [820, 14], [890, 36],
  [60, 70], [180, 78], [330, 66], [470, 80], [600, 68], [730, 78], [860, 66],
  [120, 105], [260, 112], [520, 108], [660, 112], [800, 104], [920, 110],
];

// A parabolic arch drawn as short line segments.
function arch(cv: Canvas, x0: number, yBase: number, x1: number, archH: number, thick: number, c: RGB): void {
  const steps = 24;
  let px = x0;
  let py = yBase;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + t * (x1 - x0);
    const y = yBase - archH * 4 * t * (1 - t);
    cv.thickLine(Math.round(px), Math.round(py), Math.round(x), Math.round(y), thick, c);
    px = x;
    py = y;
  }
}

// Lead illustration: night sky over Kyiv — skyline, a bridge over the river,
// and an explosion burst. Drawn inside the box (x, y, w, h).
function drawLeadArt(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, SKY);
  // Stars.
  for (const [sx, sy] of STARS) {
    if (sx < w && sy < h) cv.fillRect(x + sx, y + sy, 2, 2, YELLOW);
  }
  // Moon.
  cv.circle(x + w - 70, y + 34, 16, PAPER);
  cv.circle(x + w - 76, y + 30, 13, SKY);
  // Skyline silhouettes (dark blocks with lit windows).
  const buildings: [number, number, number][] = [
    [0, 70, 52], [80, 46, 78], [136, 60, 44], [206, 52, 88], [268, 74, 60],
    [352, 48, 96], [410, 66, 54], [486, 56, 82], [552, 72, 48], [634, 50, 90],
    [694, 64, 58], [768, 58, 76], [836, 70, 50], [916, 36, 66],
  ];
  const baseY = y + h - 34; // top of the river band
  for (const [bx, bw, bh] of buildings) {
    cv.fillRect(x + bx, baseY - bh, bw, bh, INK);
    // Lit windows: a small fixed grid inside each building.
    for (let wy = 0; wy < 3; wy++) {
      for (let wx = 0; wx < 3; wx++) {
        if ((bx + wy * 3 + wx) % 2 === 0) {
          cv.fillRect(x + bx + 8 + wx * 14, baseY - bh + 10 + wy * 16, 4, 5, YELLOW);
        }
      }
    }
  }
  // River band.
  cv.fillRect(x, baseY, w, 34, RIVER);
  cv.fillRect(x, baseY, w, 3, LIGHTGREY);
  // Bridge: deck, two towers, arch, cables.
  const deckY = baseY - 8;
  cv.fillRect(x + 40, deckY, w - 80, 5, LIGHTGREY);
  cv.fillRect(x + 300, deckY - 64, 8, 64, LIGHTGREY);
  cv.fillRect(x + 640, deckY - 64, 8, 64, LIGHTGREY);
  arch(cv, x + 300, deckY, x + 648, 58, 3, LIGHTGREY);
  // Cables from tower tops to the deck.
  cv.line(x + 304, deckY - 64, x + 420, deckY, LIGHTGREY);
  cv.line(x + 304, deckY - 64, x + 480, deckY, LIGHTGREY);
  cv.line(x + 644, deckY - 64, x + 540, deckY, LIGHTGREY);
  cv.line(x + 644, deckY - 64, x + 600, deckY, LIGHTGREY);
  // Explosion burst above the bridge (left of centre).
  const ex = x + 470;
  const ey = y + 62;
  cv.circle(ex, ey, 26, ORANGE);
  cv.circle(ex, ey, 15, YELLOW);
  for (let a = 0; a < 8; a++) {
    const rad = (a * Math.PI) / 4;
    const x2 = Math.round(ex + 40 * Math.cos(rad));
    const y2 = Math.round(ey + 40 * Math.sin(rad));
    cv.thickLine(ex, ey, x2, y2, 3, ORANGE);
  }
  // Smoke puffs drifting up from the burst.
  cv.circle(ex - 34, ey - 30, 13, GREY);
  cv.circle(ex - 8, ey - 44, 16, GREY);
  cv.circle(ex + 22, ey - 34, 12, MIDGREY);
  // A second, smaller burst on the right.
  const ex2 = x + 800;
  const ey2 = y + 88;
  cv.circle(ex2, ey2, 17, ORANGE);
  cv.circle(ex2, ey2, 9, YELLOW);
  for (let a = 0; a < 8; a++) {
    const rad = (a * Math.PI) / 4 + 0.4;
    const x2 = Math.round(ex2 + 26 * Math.cos(rad));
    const y2 = Math.round(ey2 + 26 * Math.sin(rad));
    cv.thickLine(ex2, ey2, x2, y2, 2, ORANGE);
  }
  cv.circle(ex2 - 20, ey2 - 22, 10, GREY);
}

// EU stars: a blue disc with twelve gold dots in a circle.
function drawEUStars(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.circle(cx, cy, r, BLUE);
  for (let i = 0; i < 12; i++) {
    const rad = (i * Math.PI) / 6 - Math.PI / 2;
    const dx = Math.round(cx + (r - 8) * Math.cos(rad));
    const dy = Math.round(cy + (r - 8) * Math.sin(rad));
    cv.circle(dx, dy, 2, GOLD);
  }
}

// Climate sun: a green disc with a yellow sun and rays.
function drawSun(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.circle(cx, cy, r, GREEN);
  for (let i = 0; i < 8; i++) {
    const rad = (i * Math.PI) / 4;
    const x1 = Math.round(cx + (r - 14) * Math.cos(rad));
    const y1 = Math.round(cy + (r - 14) * Math.sin(rad));
    const x2 = Math.round(cx + (r - 4) * Math.cos(rad));
    const y2 = Math.round(cy + (r - 4) * Math.sin(rad));
    cv.thickLine(x1, y1, x2, y2, 2, YELLOW);
  }
  cv.circle(cx, cy, 8, YELLOW);
}

// ---- page layout ----
function drawPage(): Canvas {
  const cv = new Canvas(W, H, PAPER);
  const L = 36; // left margin
  const R = 988; // right edge
  const CW = R - L; // content width 952

  // Top rule + masthead.
  cv.rule(L, 24, CW, 3, INK);
  drawTextCentred(cv, 'THE WORLD', 512, 36, 13, INK);
  cv.rule(L, 136, CW, 2, INK);
  drawTextCentred(cv, 'FRIDAY 20 NOVEMBER 2026', 512, 146, 5, INK);
  cv.rule(L, 190, CW, 3, RED);

  // Lead headline (centred, two lines).
  drawTextCentred(cv, 'RUSSIA STRIKES KYIV BRIDGES', 512, 204, 6, INK);
  drawTextCentred(cv, 'IN MASSIVE NIGHT ASSAULT', 512, 252, 6, INK);
  // Lead deck (centred, two lines).
  drawTextCentred(cv, '400+ DRONES AND 110 MISSILES - AT LEAST 8 KILLED', 512, 306, 3, INK);
  drawTextCentred(cv, 'POWER AND WATER CUT ACROSS THE CAPITAL', 512, 330, 3, INK);

  // Lead illustration.
  drawLeadArt(cv, L, 366, CW, 180);
  cv.rule(L, 558, CW, 2, INK);

  // Two columns: EU-UK (left) and COP31 (right).
  const colW = 460;
  const colL = L;
  const colR = 528;
  // Left column: EU stars icon + kicker.
  drawEUStars(cv, colL + 22, 574 + 22, 22);
  drawText(cv, 'EUROPE', colL + 56, 582, 3, RED);
  let yy = drawWrapped(cv, 'UK AND EU STRIKE POST-BREXIT RESET DEAL', colL, 630, 4, colW, INK);
  drawWrapped(cv, 'FOOD TRADE EASED, CARBON MARKETS LINKED, 100,000 A YEAR FREE TO MOVE.', colL, yy + 10, 3, colW, INK);
  // Right column: sun icon + kicker.
  drawSun(cv, colR + 22, 574 + 22, 22);
  drawText(cv, 'CLIMATE', colR + 56, 582, 3, GREEN);
  yy = drawWrapped(cv, 'COP31 TALKS GO INTO OVERTIME', colR, 630, 4, colW, INK);
  drawWrapped(cv, 'DRAFT DEAL DROPS FOSSIL FUELS AS 200 NATIONS DEADLOCK IN ANTALYA.', colR, yy + 10, 3, colW, INK);
  // Divider between the columns.
  cv.rule(512, 574, 2, 234, LIGHTGREY);

  cv.rule(L, 820, CW, 2, INK);

  // Bottom strip: two short items with coloured top rules.
  cv.rule(colL, 834, colW, 4, ORANGE);
  drawText(cv, 'MIDDLE EAST', colL, 848, 3, RED);
  yy = drawWrapped(cv, 'IRAN LINES UP 14 TANKERS TO TEST US BLOCKADE', colL, 876, 3, colW, INK);
  drawWrapped(cv, 'US WIDENS BLOCKADE NET.', colL, yy + 8, 3, colW, INK);
  cv.rule(colR, 834, colW, 4, GOLD);
  drawText(cv, 'CULTURE', colR, 848, 3, RED);
  yy = drawWrapped(cv, 'GTA 6 SALES PUT AT $2.36BN', colR, 876, 3, colW, INK);
  drawWrapped(cv, '24.6M COPIES IN A DAY.', colR, yy + 8, 3, colW, INK);

  // Footer.
  cv.rule(L, 964, CW, 2, INK);
  drawTextCentred(cv, 'SOURCES: REUTERS, AL JAZEERA, UN NEWS, SENSOR TOWER', 512, 974, 3, MIDGREY);
  return cv;
}

function main(): void {
  const cv = drawPage();
  const png = encodePNG(cv.px, cv.w, cv.h);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), png);
}

main();
