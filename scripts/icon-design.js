/**
 * 应用图标的绘制定义 —— 唯一真源。
 *
 * 设计：靛蓝圆角底 + 三条长短不一的白色任务条（呼应时间线里的甘特条），
 * 右下角一枚对勾表示「推进/完成」。选它的原因是 16px 下仍然可辨认：
 * 三条粗条 + 一个亮点，不会糊成一团。
 *
 * 颜色取自默认主题的强调色（--t-accent = #5E6AD2），因此图标与界面同源。
 * 生成物用 `npm run build:icon` 产出：electron/icon.ico（安装包/窗口图标）
 * 与 electron/tray.png（系统托盘，Windows 托盘图标实际只有 16px）。
 */

const INDIGO_TOP = '#6B77E0';
const INDIGO_BOTTOM = '#343C96';
const BADGE = '#4A55C4';

/** 应用图标：完整版，用于 16～256 全尺寸。 */
function appIconSvg(size = 256) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${INDIGO_TOP}"/>
      <stop offset="1" stop-color="${INDIGO_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="256" height="256" rx="56" ry="56" fill="url(#bg)"/>
  <g>
    <rect x="48" y="72" width="92" height="30" rx="15" fill="#FFFFFF" opacity="0.5"/>
    <rect x="48" y="113" width="126" height="30" rx="15" fill="#FFFFFF" opacity="0.75"/>
    <rect x="48" y="154" width="76" height="30" rx="15" fill="#FFFFFF"/>
  </g>
  <circle cx="188" cy="176" r="34" fill="${BADGE}"/>
  <path d="M172 176 l12 12 l22 -25" fill="none" stroke="#FFFFFF" stroke-width="11"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

/**
 * 托盘图标：Windows 托盘实际只显示 16px，对勾在这个尺寸只剩几个像素，
 * 反而干扰三条主条，因此去掉对勾、条加粗、四周留白更少。
 */
function trayIconSvg(size = 32) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${INDIGO_TOP}"/>
      <stop offset="1" stop-color="${INDIGO_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="256" height="256" rx="52" ry="52" fill="url(#bg)"/>
  <g>
    <rect x="42" y="68" width="172" height="34" rx="17" fill="#FFFFFF" opacity="0.55"/>
    <rect x="42" y="111" width="126" height="34" rx="17" fill="#FFFFFF" opacity="0.8"/>
    <rect x="42" y="154" width="152" height="34" rx="17" fill="#FFFFFF"/>
  </g>
</svg>`;
}

module.exports = { appIconSvg, trayIconSvg };
