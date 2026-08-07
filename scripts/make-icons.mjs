// Genera los PNG de la PWA sin dependencias: el juego no descarga assets y los
// iconos tampoco tenian por que ser un binario opaco en el repo.
// Uso: node scripts/make-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

class Canvas {
  constructor(size) {
    this.size = size;
    this.data = new Uint8Array(size * size * 4);
  }
  px(x, y, [r, g, b], a = 1) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size || a <= 0) return;
    const i = (y * this.size + x) * 4;
    const d = this.data;
    const dst = d[i + 3] / 255;
    const out = a + dst * (1 - a);
    d[i] = (r * a + d[i] * dst * (1 - a)) / out;
    d[i + 1] = (g * a + d[i + 1] * dst * (1 - a)) / out;
    d[i + 2] = (b * a + d[i + 2] * dst * (1 - a)) / out;
    d[i + 3] = out * 255;
  }
  /** Coordenadas 0..1 para no repetir el escalado en cada figura. */
  rect(x, y, w, h, color, a = 1) {
    const s = this.size;
    const x0 = Math.round(x * s);
    const y0 = Math.round(y * s);
    const x1 = Math.round((x + w) * s);
    const y1 = Math.round((y + h) * s);
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) this.px(px, py, color, a);
  }
  circle(cx, cy, r, color, a = 1) {
    const s = this.size;
    const X = cx * s;
    const Y = cy * s;
    const R = r * s;
    for (let py = Math.floor(Y - R) - 1; py <= Y + R + 1; py++) {
      for (let px = Math.floor(X - R) - 1; px <= X + R + 1; px++) {
        const d = Math.hypot(px + 0.5 - X, py + 0.5 - Y);
        if (d <= R - 0.5) this.px(px, py, color, a);
        else if (d < R + 0.5) this.px(px, py, color, a * (R + 0.5 - d)); // antialias del borde
      }
    }
  }
  png() {
    const s = this.size;
    const raw = Buffer.alloc((s * 4 + 1) * s);
    for (let y = 0; y < s; y++) {
      raw[y * (s * 4 + 1)] = 0; // filtro: ninguno
      Buffer.from(this.data.buffer, y * s * 4, s * 4).copy(raw, y * (s * 4 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(s, 0);
    ihdr.writeUInt32BE(s, 4);
    ihdr[8] = 8; // bits por canal
    ihdr[9] = 6; // RGBA
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** El tanque del jugador, visto desde arriba y girado hacia la derecha. */
function draw(size) {
  const c = new Canvas(size);
  const bg = hex("#232733");
  const outline = hex("#0e0e14");
  const dark = hex("#1f4f8f");
  const light = hex("#3f8fdf");
  const barrel = hex("#9fd0ff");
  const spark = hex("#f5e7b0");

  c.rect(0, 0, 1, 1, bg);
  c.rect(0, 0, 1, 0.5, hex("#2b3040"), 0.5); // medio tono arriba: no queda tan plano

  c.rect(0.2, 0.28, 0.5, 0.44, outline); // chasis
  c.rect(0.215, 0.295, 0.47, 0.41, dark);
  c.rect(0.215, 0.295, 0.47, 0.085, outline, 0.75); // orugas
  c.rect(0.215, 0.62, 0.47, 0.085, outline, 0.75);
  for (let i = 0; i < 6; i++) {
    c.rect(0.23 + i * 0.077, 0.295, 0.028, 0.085, light, 0.35);
    c.rect(0.23 + i * 0.077, 0.62, 0.028, 0.085, light, 0.35);
  }
  c.rect(0.27, 0.405, 0.36, 0.19, light);

  c.circle(0.44, 0.5, 0.115, outline);
  c.circle(0.44, 0.5, 0.095, barrel);
  c.rect(0.44, 0.455, 0.33, 0.09, outline);
  c.rect(0.44, 0.468, 0.31, 0.064, barrel);

  c.circle(0.86, 0.5, 0.055, spark); // la bala saliendo
  return c;
}

mkdirSync(OUT, { recursive: true });
for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  writeFileSync(join(OUT, name), draw(size).png());
  console.log(name, size);
}
