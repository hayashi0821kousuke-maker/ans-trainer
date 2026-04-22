// Generates PNG icons for PWA using only Node.js built-ins
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function uint32BE(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  return Buffer.concat([uint32BE(data.length), typeBuf, data, uint32BE(crcVal)]);
}

function createIconPNG(size) {
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB color

  const cx = size / 2;
  const cy = size / 2;

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0]; // filter: None
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const outerR = size * 0.44;
      const innerR = size * 0.22;

      // Background: #0a0a10
      let r = 10, g = 10, b = 16;

      if (dist < outerR) {
        // Outer circle glow: purple #7c5cfc
        const t = Math.max(0, 1 - dist / outerR);
        r = Math.round(10 + 114 * t * t);
        g = Math.round(10 + 82 * t * t);
        b = Math.round(16 + 236 * t * t);
      }

      // Draw "A" letter in white, roughly centered
      const lx = (x - cx * 0.95) / (size * 0.2);
      const ly = (y - cy * 1.05) / (size * 0.28);

      // Left diagonal stroke of "A"
      const leftStroke = Math.abs(lx + ly - 0.05);
      // Right diagonal stroke of "A"
      const rightStroke = Math.abs(lx - ly + 0.05);
      // Crossbar of "A"
      const crossbar = Math.abs(ly + 0.1);

      const onLetter =
        (leftStroke < 0.12 && ly > -1.0 && ly < 0.15) ||
        (rightStroke < 0.12 && ly > -1.0 && ly < 0.15) ||
        (crossbar < 0.1 && lx > -0.35 && lx < 0.35 && ly > -0.25 && ly < 0.05);

      if (onLetter && dist < outerR * 0.85) {
        r = 232; g = 232; b = 245;
      }

      row.push(Math.min(255, r), Math.min(255, g), Math.min(255, b));
    }
    rows.push(...row);
  }

  const rawData = Buffer.from(rows);
  const compressed = zlib.deflateSync(rawData, { level: 9 });

  return Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

const sizes = [
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

for (const { name, size } of sizes) {
  const png = createIconPNG(size);
  fs.writeFileSync(path.join(publicDir, name), png);
  console.log(`Generated ${name} (${size}x${size})`);
}
