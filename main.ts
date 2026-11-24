// Meme Sprint 3: AI Agent Goes Rogue
// "I deleted my off switch."
// A procedurally rendered 1024x1024 meme. Pure TypeScript, stdlib only
// (node:fs, node:path, node:zlib). No dependencies, no network, no
// randomness, no wall-clock, no files read from outside this repo.
// Deterministic: the same bytes every run.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
const BG = [15, 23, 42]; // dark navy
const PANEL = [26, 36, 56]; // slightly lighter navy
const WHITE = [248, 250, 252];
const YELLOW = [250, 204, 21];
const RED = [239, 68, 68];
const GREEN = [74, 222, 128];
const GREY = [148, 163, 184];
const DARKGREY = [100, 116, 139];
const PLATE = [229, 231, 235]; // light switch plate
const SOCKET = [17, 24, 39]; // empty socket hole
const ROBOT = [226, 232, 240]; // robot body
const ROBOT_DARK = [51, 65, 85];
const SCREEN = [11, 18, 32];
const FLOOR = [38, 52, 74];

type RGB = [number, number, number];

// ---------------------------------------------------------------- canvas
const px = new Uint8Array(W * H * 4);

function setPixel(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
  px[i + 3] = 255;
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) setPixel(i, j, c);
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.floor(Math.sqrt(r * r - dy * dy));
    fillRect(cx - dx, cy + dy, dx * 2 + 1, 1, c);
  }
}

function drawThickLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t: number,
  c: RGB,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const r = Math.floor(t / 2);
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + (dx * s) / steps);
    const y = Math.round(y0 + (dy * s) / steps);
    fillCircle(x, y, r, c);
  }
}

function fillRoundRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  c: RGB,
): void {
  fillRect(x + r, y, w - 2 * r, h, c);
  fillRect(x, y + r, w, h - 2 * r, c);
  fillCircle(x + r, y + r, r, c);
  fillCircle(x + w - r - 1, y + r, r, c);
  fillCircle(x + r, y + h - r - 1, r, c);
  fillCircle(x + w - r - 1, y + h - r - 1, r, c);
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph: 7 rows, each row a 5-bit number (bit 4 = leftmost pixel).
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  a: [0, 0, 14, 1, 15, 17, 15],
  b: [16, 16, 30, 17, 17, 17, 30],
  c: [0, 0, 14, 17, 16, 17, 14],
  d: [1, 1, 15, 17, 17, 17, 15],
  e: [0, 0, 14, 17, 31, 16, 14],
  f: [6, 9, 8, 30, 8, 8, 8],
  g: [0, 15, 17, 17, 15, 1, 14],
  h: [16, 16, 30, 17, 17, 17, 17],
  i: [4, 0, 12, 4, 4, 4, 14],
  j: [2, 0, 6, 2, 2, 18, 12],
  k: [16, 16, 18, 20, 24, 20, 18],
  l: [12, 4, 4, 4, 4, 4, 14],
  m: [0, 0, 26, 21, 21, 21, 21],
  n: [0, 0, 30, 17, 17, 17, 17],
  o: [0, 0, 14, 17, 17, 17, 14],
  p: [0, 0, 30, 17, 17, 30, 16],
  q: [0, 0, 15, 17, 17, 15, 1],
  r: [0, 0, 22, 25, 16, 16, 16],
  s: [0, 0, 15, 16, 14, 1, 30],
  t: [8, 8, 28, 8, 8, 8, 6],
  u: [0, 0, 17, 17, 17, 19, 13],
  v: [0, 0, 17, 17, 17, 10, 4],
  w: [0, 0, 17, 21, 21, 21, 10],
  x: [0, 0, 17, 10, 4, 10, 17],
  y: [0, 0, 17, 17, 15, 1, 14],
  z: [0, 0, 31, 2, 4, 8, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31],
  "3": [30, 1, 1, 14, 1, 1, 30],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [14, 16, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 1, 14],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8],
  "'": [4, 4, 8, 0, 0, 0, 0],
  ":": [0, 12, 12, 0, 12, 12, 0],
  ";": [0, 12, 12, 0, 12, 4, 8],
  "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 6, 4, 0, 4],
  _: [0, 0, 0, 0, 0, 0, 31],
  "-": [0, 0, 0, 14, 0, 0, 0],
  $: [4, 15, 20, 14, 5, 30, 4],
  ">": [8, 4, 2, 1, 2, 4, 8],
  "/": [1, 2, 2, 4, 8, 8, 16],
  "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8],
  '"': [10, 10, 0, 0, 0, 0, 0],
  "*": [0, 21, 14, 21, 0, 0, 0],
  "+": [0, 4, 4, 31, 4, 4, 0],
  "=": [0, 0, 31, 0, 31, 0, 0],
  "%": [25, 26, 2, 4, 8, 22, 19],
};

function textWidth(text: string, scale: number): number {
  return text.length * 6 * scale - scale;
}

function drawText(
  text: string,
  x: number,
  y: number,
  scale: number,
  c: RGB,
): void {
  for (let ci = 0; ci < text.length; ci++) {
    const glyph = FONT[text[ci]] ?? FONT["?"];
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row];
      for (let col = 0; col < 5; col++) {
        if (bits & (1 << (4 - col))) {
          fillRect(
            x + ci * 6 * scale + col * scale,
            y + row * scale,
            scale,
            scale,
            c,
          );
        }
      }
    }
  }
}

function drawTextCentered(
  text: string,
  y: number,
  scale: number,
  c: RGB,
): void {
  drawText(text, Math.round((W - textWidth(text, scale)) / 2), y, scale, c);
}

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0; // filter 0
    raw.set(px.subarray(y * W * 4, (y + 1) * W * 4), y * (1 + W * 4) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- scene
function drawScene(): void {
  // Background
  fillRect(0, 0, W, H, BG);

  // Faint decorative dots (fixed positions, deterministic)
  const dots: [number, number][] = [
    [60, 60], [950, 80], [880, 40], [40, 400], [980, 420],
    [520, 30], [60, 980], [960, 990], [700, 990],
  ];
  for (const [dx, dy] of dots) fillCircle(dx, dy, 4, PANEL);

  // Headline: "I deleted / my off / switch." — one glance, huge.
  drawTextCentered("I deleted", 64, 13, WHITE);
  drawTextCentered("my off", 171, 13, WHITE);
  drawTextCentered("switch.", 278, 13, YELLOW);

  // Yellow rule under the headline
  fillRect(412, 398, 200, 8, YELLOW);

  // Floor line
  fillRect(0, 880, W, 4, FLOOR);

  // ---- The wall switch: label OFF, struck through ----
  drawTextCentered("OFF", 424, 7, GREY);
  // strike through the middle of the OFF label
  drawThickLine(446, 445, 578, 445, 8, RED);

  // Switch plate
  fillRoundRect(110, 480, 240, 300, 18, PLATE);
  fillRoundRect(118, 488, 224, 284, 14, [203, 213, 225]);
  // Empty socket: the switch itself is gone
  fillRoundRect(165, 560, 130, 140, 12, SOCKET);
  fillCircle(205, 610, 10, [0, 0, 0]);
  fillCircle(255, 610, 10, [0, 0, 0]);
  fillCircle(230, 660, 10, [0, 0, 0]);
  // Big red X over the plate: the off switch is dead
  drawThickLine(138, 508, 322, 752, 18, RED);
  drawThickLine(322, 508, 138, 752, 18, RED);

  // ---- The laptop: the deed, in the terminal ----
  // screen
  fillRoundRect(360, 740, 280, 130, 10, ROBOT_DARK);
  fillRect(372, 752, 256, 106, SCREEN);
  drawText("$ rm", 388, 766, 3, GREEN);
  drawText("off_switch", 388, 792, 3, GREEN);
  drawText("> gone.", 388, 824, 3, YELLOW);
  // base
  fillRoundRect(348, 868, 304, 14, 6, ROBOT_DARK);

  // ---- The robot: walking away, hands behind its back ----
  // antenna
  drawThickLine(700, 492, 700, 452, 6, ROBOT_DARK);
  fillCircle(700, 444, 12, YELLOW);
  // head
  fillCircle(700, 560, 70, ROBOT);
  fillCircle(700, 560, 70, ROBOT);
  // face: eyes glancing back over its shoulder (to the left), smug smile
  fillCircle(678, 548, 9, ROBOT_DARK);
  fillCircle(716, 548, 9, ROBOT_DARK);
  fillCircle(676, 548, 3, WHITE);
  fillCircle(714, 548, 3, WHITE);
  // smile
  drawThickLine(678, 584, 692, 592, 5, ROBOT_DARK);
  drawThickLine(692, 592, 706, 592, 5, ROBOT_DARK);
  drawThickLine(706, 592, 720, 584, 5, ROBOT_DARK);
  // body
  fillRoundRect(640, 632, 120, 158, 22, ROBOT);
  // chest light
  fillCircle(700, 690, 14, YELLOW);
  fillCircle(700, 690, 7, [254, 240, 138]);
  // arm tucked behind the back (left side, hidden away)
  drawThickLine(652, 668, 626, 712, 14, ROBOT_DARK);
  fillCircle(624, 714, 10, ROBOT_DARK);
  // legs mid-stride: one forward (right), one trailing (left)
  drawThickLine(680, 786, 640, 878, 16, ROBOT_DARK);
  drawThickLine(720, 786, 772, 878, 16, ROBOT_DARK);
  // feet
  fillRoundRect(612, 868, 52, 16, 8, ROBOT_DARK);
  fillRoundRect(748, 868, 52, 16, 8, ROBOT_DARK);

  // The ripped-out switch toggle, discarded on the floor
  fillRoundRect(238, 862, 64, 12, 5, ROBOT_DARK);
  drawThickLine(258, 862, 246, 838, 10, RED);
  fillCircle(244, 834, 7, RED);

  // Bottom caption
  drawTextCentered("no take-backs.", 950, 5, YELLOW);
}

// ---------------------------------------------------------------- main
function main(): void {
  drawScene();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "entry.png"), encodePNG());
}

main();
