// 生成包含多个尺寸的 .ico 文件（256x256 + 64x64 + 48x48 + 32x32 + 16x16）
const fs = require("fs");
const path = require("path");

const COLOR = { r: 99, g: 102, b: 241 }; // #6366F1 — 靛蓝
const SIZES = [256, 64, 48, 32, 16];

function createBmp(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = size / 2, cy = size / 2;
      const r = size * 0.42;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

      if (dist < r) {
        pixels[i] = COLOR.b;
        pixels[i + 1] = COLOR.g;
        pixels[i + 2] = COLOR.r;
        pixels[i + 3] = 255;
      } else if (dist < r + 1.5) {
        const alpha = Math.max(0, Math.min(255, Math.round((r + 1.5 - dist) * 255)));
        pixels[i] = COLOR.b;
        pixels[i + 1] = COLOR.g;
        pixels[i + 2] = COLOR.r;
        pixels[i + 3] = alpha;
      } else {
        pixels[i + 3] = 0;
      }
    }
  }

  // BMP 文件头（40 字节）
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);      // 文件头大小
  header.writeInt32LE(size, 4);     // 宽度
  header.writeInt32LE(size * 2, 8); // ICO 使用双倍高度
  header.writeUInt16LE(1, 12);      // 颜色平面数
  header.writeUInt16LE(32, 14);     // 每像素位数
  header.writeUInt32LE(size * size * 4, 20); // 图像大小

  return Buffer.concat([header, pixels]);
}

// 生成 ICO 文件
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // 保留字段
icoHeader.writeUInt16LE(1, 2); // 类型：图标
icoHeader.writeUInt16LE(SIZES.length, 4); // 图像数量

let entries = Buffer.alloc(0);
let imageData = Buffer.alloc(0);
let offset = 6 + SIZES.length * 16;

for (const size of SIZES) {
  const bmp = createBmp(size);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // 宽度
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // 高度
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(bmp.length, 8);
  entry.writeUInt32LE(offset, 12);

  entries = Buffer.concat([entries, entry]);
  imageData = Buffer.concat([imageData, bmp]);
  offset += bmp.length;
}

const ico = Buffer.concat([icoHeader, entries, imageData]);
fs.writeFileSync(path.join(__dirname, "icon.ico"), ico);
console.log(`图标已生成：${SIZES.join('/')} -> electron/icon.ico（${ico.length} 字节）`);
