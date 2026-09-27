/**
 * 生成应用图标与托盘图标。
 *
 *   npm run build:icon
 *
 * 产出：
 *   electron/icon.ico   多尺寸 Windows 图标（安装包、窗口、任务栏、资源管理器）
 *   electron/tray.png   系统托盘图标（Windows 托盘只有 16px，用简化版）
 *   .icon-preview/app-icon.png  256px 预览，便于肉眼确认
 *
 * 实现说明：ICO 从 Vista 起允许内嵌 PNG，直接放 PNG 能保留 256px 的完整质量，
 * 体积也远小于 BMP 写法。16/32 额外带一份 32bpp BMP 版本以提高兼容性。
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { appIconSvg, trayIconSvg } = require('./icon-design');

const projectRoot = path.resolve(__dirname, '..');
const electronDir = path.join(projectRoot, 'electron');
const previewDir = path.join(projectRoot, '.icon-preview');

const ICO_SIZES = [256, 128, 64, 48, 32, 24, 16];

/** 把 RGBA 像素编码成 ICO 内嵌的 BMP（BITMAPINFOHEADER + BGRA + AND 掩码）。 */
function encodeBmp(pixels, width, height) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(width, 4);
  header.writeInt32LE(height * 2, 8); // 高度包含 XOR + AND 两张图
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16); // 不压缩
  header.writeUInt32LE(width * height * 4, 20);

  // ICO 里的 BMP 是自下而上存储，且通道顺序为 BGRA
  const flipped = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceRow = (height - 1 - y) * width * 4;
    const targetRow = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const s = sourceRow + x * 4;
      const t = targetRow + x * 4;
      flipped[t] = pixels[s + 2];     // B
      flipped[t + 1] = pixels[s + 1]; // G
      flipped[t + 2] = pixels[s];     // R
      flipped[t + 3] = pixels[s + 3]; // A
    }
  }

  // AND 掩码按位行对齐到 4 字节；32bpp 图会用它做透明，这里全 0 表示「不透明」
  const maskRowBytes = Math.ceil(width / 32) * 4;
  const mask = Buffer.alloc(maskRowBytes * height);

  return Buffer.concat([header, flipped, mask]);
}

function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(entries.length * 16);
  let offset = 6 + entries.length * 16;
  const payloads = [];

  entries.forEach((entry, index) => {
    const base = index * 16;
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 0);
    directory.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 1);
    directory.writeUInt8(0, base + 2); // 调色板数
    directory.writeUInt8(0, base + 3); // reserved
    directory.writeUInt16LE(1, base + 4);
    directory.writeUInt16LE(32, base + 6);
    directory.writeUInt32LE(entry.data.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    offset += entry.data.length;
    payloads.push(entry.data);
  });

  return Buffer.concat([header, directory, ...payloads]);
}

async function main() {
  fs.mkdirSync(previewDir, { recursive: true });

  const entries = [];
  for (const size of ICO_SIZES) {
    const png = await sharp(Buffer.from(appIconSvg(size)))
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toBuffer();
    entries.push({ size, data: png });

    // 16/32 再附一份 BMP，兼容对 PNG 内嵌支持不佳的老工具
    if (size === 16 || size === 32) {
      const { data, info } = await sharp(Buffer.from(appIconSvg(size)))
        .resize(size, size)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      entries.push({ size, data: encodeBmp(data, info.width, info.height) });
    }
  }

  const ico = buildIco(entries);
  const icoPath = path.join(electronDir, 'icon.ico');
  fs.writeFileSync(icoPath, ico);

  const trayPng = await sharp(Buffer.from(trayIconSvg(32)))
    .resize(32, 32)
    .png({ compressionLevel: 9 })
    .toBuffer();
  const trayPath = path.join(electronDir, 'tray.png');
  fs.writeFileSync(trayPath, trayPng);

  const previewPng = await sharp(Buffer.from(appIconSvg(512)))
    .resize(256, 256)
    .png()
    .toBuffer();
  const previewPath = path.join(previewDir, 'app-icon.png');
  fs.writeFileSync(previewPath, previewPng);

  console.log(`[图标] 已生成 ${path.relative(projectRoot, icoPath)}（${entries.length} 个图像，${ico.length} 字节）`);
  console.log(`[图标] 已生成 ${path.relative(projectRoot, trayPath)}（${trayPng.length} 字节）`);
  console.log(`[图标] 预览：${path.relative(projectRoot, previewPath)}`);
}

main().catch((error) => {
  console.error('[图标] 生成失败：', error);
  process.exitCode = 1;
});
