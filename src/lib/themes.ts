export interface Theme {
  id: string;
  name: string;
  mode: 'dark' | 'light';
  vars: Record<string, string>;
}

const DARK_INK = '#08090A';
const LIGHT_INK = '#FFFFFF';

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(hex: string) {
  return hexToRgb(hex)
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(first: string, second: string) {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function readableForeground(background: string) {
  if (!/^#[0-9a-f]{6}$/i.test(background)) return LIGHT_INK;
  return contrastRatio(background, LIGHT_INK) >= contrastRatio(background, DARK_INK)
    ? LIGHT_INK
    : DARK_INK;
}

function alpha(hex: string, opacity: number) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const [red, green, blue] = hexToRgb(hex);
  return `rgba(${red},${green},${blue},${opacity})`;
}

function completeTheme(theme: Theme): Theme {
  const dark = theme.mode === 'dark';
  const accent = theme.vars['--t-accent'];
  const danger = theme.vars['--t-danger'];
  const success = theme.vars['--t-success'];

  return {
    ...theme,
    vars: {
      '--t-border-light': dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
      '--t-bg-hover-mid': dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
      '--t-bg-subtler': dark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)',
      '--t-danger-subtler': alpha(danger, dark ? 0.12 : 0.08),
      '--t-success-subtle': alpha(success, dark ? 0.14 : 0.1),
      '--t-card-shadow-hover': dark
        ? '0 10px 28px rgba(0,0,0,0.22)'
        : '0 8px 24px rgba(15,23,42,0.08)',
      '--t-radius-card': '8px',
      '--t-radius-control': '7px',
      ...theme.vars,
      '--t-border-strong': theme.vars['--t-border-hover'],
      '--t-accent-foreground': readableForeground(accent),
      '--t-danger-foreground': readableForeground(danger),
      '--t-ring': alpha(accent, dark ? 0.46 : 0.34),
    },
  };
}

const DARK: Theme[] = [
  {
    id: 'github-dark', name: 'GitHub Dark', mode: 'dark',
    vars: {
      '--t-surface': '#0D1117', '--t-sidebar': '#010409', '--t-card': '#161B22', '--t-hover': '#21262D',
      '--t-primary': '#E6EDF3', '--t-muted': '#7D8590',
      '--t-accent': '#2F81F7', '--t-accent-hover': '#1F6FEB',
      '--t-danger': '#F85149', '--t-danger-hover': '#DA3633', '--t-warning': '#D29922', '--t-success': '#3FB950',
      '--t-border': '#30363D', '--t-border-mid': '#3D444D', '--t-border-hover': '#444C56',
      '--t-bg-hover': 'rgba(255,255,255,0.04)',
      '--t-accent-subtle': 'rgba(47,129,247,0.15)',
      '--t-danger-subtle': 'rgba(248,81,73,0.15)', '--t-danger-light': 'rgba(248,81,73,0.1)', '--t-danger-bg': 'rgba(248,81,73,0.06)',
      '--t-warning-subtle': 'rgba(210,153,34,0.15)',
      '--t-muted-subtle': 'rgba(125,133,144,0.15)',
      '--t-accent-subtler': 'rgba(47,129,247,0.1)', '--t-accent-light': 'rgba(47,129,247,0.12)',
      '--t-accent-ghost': 'rgba(47,129,247,0.08)', '--t-accent-dim': 'rgba(47,129,247,0.05)',
      '--t-bg-light': 'rgba(255,255,255,0.1)',
      '--t-card-shadow': 'none',
      '--t-overlay': 'rgba(0,0,0,0.6)',
    },
  },
  {
    id: 'vscode-dark', name: 'VS Code Dark+', mode: 'dark',
    vars: {
      '--t-surface': '#1E1E1E', '--t-sidebar': '#252526', '--t-card': '#2D2D30', '--t-hover': '#2A2D2E',
      '--t-primary': '#CCCCCC', '--t-muted': '#9D9D9D',
      '--t-accent': '#007ACC', '--t-accent-hover': '#1177BB',
      '--t-danger': '#F14C4C', '--t-danger-hover': '#D32F2F', '--t-warning': '#CCA700', '--t-success': '#89D185',
      '--t-border': '#3C3C3C', '--t-border-mid': '#454545', '--t-border-hover': '#505050',
      '--t-bg-hover': 'rgba(255,255,255,0.04)',
      '--t-accent-subtle': 'rgba(0,122,204,0.15)',
      '--t-danger-subtle': 'rgba(241,76,76,0.15)', '--t-danger-light': 'rgba(241,76,76,0.1)', '--t-danger-bg': 'rgba(241,76,76,0.06)',
      '--t-warning-subtle': 'rgba(204,167,0,0.15)',
      '--t-muted-subtle': 'rgba(128,128,128,0.15)',
      '--t-accent-subtler': 'rgba(0,122,204,0.1)', '--t-accent-light': 'rgba(0,122,204,0.12)',
      '--t-accent-ghost': 'rgba(0,122,204,0.08)', '--t-accent-dim': 'rgba(0,122,204,0.05)',
      '--t-bg-light': 'rgba(255,255,255,0.1)',
      '--t-card-shadow': 'none',
      '--t-overlay': 'rgba(0,0,0,0.6)',
    },
  },
  {
    id: 'linear-dark', name: 'Linear', mode: 'dark',
    vars: {
      '--t-surface': '#08090A', '--t-sidebar': '#0C0D0E', '--t-card': '#141516', '--t-hover': '#1C1D1F',
      '--t-primary': '#F7F8F8', '--t-muted': '#8A8F98',
      '--t-accent': '#5E6AD2', '--t-accent-hover': '#4E59C0',
      '--t-danger': '#EB5757', '--t-danger-hover': '#D64545', '--t-warning': '#F2C94C', '--t-success': '#4CB782',
      '--t-border': 'rgba(255,255,255,0.06)', '--t-border-mid': 'rgba(255,255,255,0.08)', '--t-border-hover': 'rgba(255,255,255,0.1)',
      '--t-bg-hover': 'rgba(255,255,255,0.04)',
      '--t-accent-subtle': 'rgba(94,106,210,0.14)',
      '--t-danger-subtle': 'rgba(235,87,87,0.15)', '--t-danger-light': 'rgba(235,87,87,0.1)', '--t-danger-bg': 'rgba(235,87,87,0.06)',
      '--t-warning-subtle': 'rgba(242,201,76,0.15)',
      '--t-muted-subtle': 'rgba(138,143,152,0.15)',
      '--t-accent-subtler': 'rgba(94,106,210,0.09)', '--t-accent-light': 'rgba(94,106,210,0.11)',
      '--t-accent-ghost': 'rgba(94,106,210,0.07)', '--t-accent-dim': 'rgba(94,106,210,0.04)',
      '--t-bg-light': 'rgba(255,255,255,0.1)',
      '--t-card-shadow': 'none',
      '--t-overlay': 'rgba(0,0,0,0.6)',
    },
  },
  {
    id: 'discord-dark', name: 'Discord Dark', mode: 'dark',
    vars: {
      '--t-surface': '#313338', '--t-sidebar': '#2B2D31', '--t-card': '#1E1F22', '--t-hover': '#35373C',
      '--t-primary': '#F2F3F5', '--t-muted': '#949BA4',
      '--t-accent': '#5865F2', '--t-accent-hover': '#4752C4',
      '--t-danger': '#F23F42', '--t-danger-hover': '#D83C3E', '--t-warning': '#F0B232', '--t-success': '#23A55A',
      '--t-border': '#26272B', '--t-border-mid': '#3F4147', '--t-border-hover': '#4A4D53',
      '--t-bg-hover': 'rgba(255,255,255,0.04)',
      '--t-accent-subtle': 'rgba(88,101,242,0.15)',
      '--t-danger-subtle': 'rgba(242,63,66,0.15)', '--t-danger-light': 'rgba(242,63,66,0.1)', '--t-danger-bg': 'rgba(242,63,66,0.06)',
      '--t-warning-subtle': 'rgba(240,178,50,0.15)',
      '--t-muted-subtle': 'rgba(148,155,164,0.15)',
      '--t-accent-subtler': 'rgba(88,101,242,0.1)', '--t-accent-light': 'rgba(88,101,242,0.12)',
      '--t-accent-ghost': 'rgba(88,101,242,0.08)', '--t-accent-dim': 'rgba(88,101,242,0.05)',
      '--t-bg-light': 'rgba(255,255,255,0.1)',
      '--t-card-shadow': 'none',
      '--t-overlay': 'rgba(0,0,0,0.6)',
    },
  },
  {
    id: 'vercel-dark', name: 'Vercel / Geist', mode: 'dark',
    vars: {
      '--t-surface': '#000000', '--t-sidebar': '#0A0A0A', '--t-card': '#111111', '--t-hover': '#1A1A1A',
      '--t-primary': '#EDEDED', '--t-muted': '#888888',
      '--t-accent': '#FFFFFF', '--t-accent-hover': '#E5E5E5',
      '--t-danger': '#E5484D', '--t-danger-hover': '#CC3A3F', '--t-warning': '#F5A623', '--t-success': '#45B36B',
      '--t-border': '#333333', '--t-border-mid': '#3A3A3A', '--t-border-hover': '#454545',
      '--t-bg-hover': 'rgba(255,255,255,0.04)',
      '--t-accent-subtle': 'rgba(255,255,255,0.12)',
      '--t-danger-subtle': 'rgba(229,72,77,0.15)', '--t-danger-light': 'rgba(229,72,77,0.1)', '--t-danger-bg': 'rgba(229,72,77,0.06)',
      '--t-warning-subtle': 'rgba(245,166,35,0.15)',
      '--t-muted-subtle': 'rgba(136,136,136,0.15)',
      '--t-accent-subtler': 'rgba(255,255,255,0.08)', '--t-accent-light': 'rgba(0,112,243,0.12)',
      '--t-accent-ghost': 'rgba(0,112,243,0.08)', '--t-accent-dim': 'rgba(255,255,255,0.04)',
      '--t-bg-light': 'rgba(255,255,255,0.1)',
      '--t-card-shadow': 'none',
      '--t-overlay': 'rgba(0,0,0,0.6)',
    },
  },
  {
    id: 'notion-dark', name: 'Notion Dark', mode: 'dark',
    vars: {
      '--t-surface': '#191919', '--t-sidebar': '#202020', '--t-card': '#252525', '--t-hover': '#2F2F2F',
      '--t-primary': '#E9E9E7', '--t-muted': '#9B9B9B',
      '--t-accent': '#2E75CC', '--t-accent-hover': '#2563AC',
      '--t-danger': '#E03E3E', '--t-danger-hover': '#C13636', '--t-warning': '#D9730D', '--t-success': '#0F7B6C',
      '--t-border': 'rgba(255,255,255,0.09)', '--t-border-mid': 'rgba(255,255,255,0.11)', '--t-border-hover': 'rgba(255,255,255,0.13)',
      '--t-bg-hover': 'rgba(255,255,255,0.05)',
      '--t-accent-subtle': 'rgba(46,117,204,0.15)',
      '--t-danger-subtle': 'rgba(224,62,62,0.15)', '--t-danger-light': 'rgba(224,62,62,0.1)', '--t-danger-bg': 'rgba(224,62,62,0.06)',
      '--t-warning-subtle': 'rgba(217,115,13,0.15)',
      '--t-muted-subtle': 'rgba(155,155,155,0.15)',
      '--t-accent-subtler': 'rgba(46,117,204,0.1)', '--t-accent-light': 'rgba(46,117,204,0.12)',
      '--t-accent-ghost': 'rgba(46,117,204,0.08)', '--t-accent-dim': 'rgba(46,117,204,0.05)',
      '--t-bg-light': 'rgba(255,255,255,0.1)',
      '--t-card-shadow': 'none',
      '--t-overlay': 'rgba(0,0,0,0.6)',
    },
  },
];

const LIGHT: Theme[] = [
  {
    id: 'github-light', name: 'GitHub Light', mode: 'light',
    vars: {
      '--t-surface': '#FFFFFF', '--t-sidebar': '#F6F8FA', '--t-card': '#FFFFFF', '--t-hover': '#F3F4F6',
      '--t-primary': '#1F2328', '--t-muted': '#656D76',
      '--t-accent': '#0969DA', '--t-accent-hover': '#0860CA',
      '--t-danger': '#D1242F', '--t-danger-hover': '#B91C28', '--t-warning': '#9A6700', '--t-success': '#1A7F37',
      '--t-border': '#D1D9E0', '--t-border-mid': '#C4CCD4', '--t-border-hover': '#B0B9C1',
      '--t-bg-hover': 'rgba(0,0,0,0.04)',
      '--t-accent-subtle': 'rgba(9,105,218,0.1)',
      '--t-danger-subtle': 'rgba(209,36,47,0.1)', '--t-danger-light': 'rgba(209,36,47,0.07)', '--t-danger-bg': 'rgba(209,36,47,0.04)',
      '--t-warning-subtle': 'rgba(154,103,0,0.1)',
      '--t-muted-subtle': 'rgba(101,109,118,0.1)',
      '--t-accent-subtler': 'rgba(9,105,218,0.06)', '--t-accent-light': 'rgba(9,105,218,0.08)',
      '--t-accent-ghost': 'rgba(9,105,218,0.05)', '--t-accent-dim': 'rgba(9,105,218,0.03)',
      '--t-bg-light': 'rgba(0,0,0,0.06)',
      '--t-card-shadow': '0 1px 2px rgba(0,0,0,0.05)',
      '--t-overlay': 'rgba(0,0,0,0.5)',
    },
  },
  {
    id: 'vscode-light', name: 'VS Code Light+', mode: 'light',
    vars: {
      '--t-surface': '#FFFFFF', '--t-sidebar': '#F3F3F3', '--t-card': '#F8F8F8', '--t-hover': '#E8E8E8',
      '--t-primary': '#1E1E1E', '--t-muted': '#6E6E6E',
      '--t-accent': '#005FB8', '--t-accent-hover': '#0258A8',
      '--t-danger': '#E51400', '--t-danger-hover': '#C71300', '--t-warning': '#BF8803', '--t-success': '#008000',
      '--t-border': '#E0E0E0', '--t-border-mid': '#D4D4D4', '--t-border-hover': '#C0C0C0',
      '--t-bg-hover': 'rgba(0,0,0,0.04)',
      '--t-accent-subtle': 'rgba(0,95,184,0.1)',
      '--t-danger-subtle': 'rgba(229,20,0,0.1)', '--t-danger-light': 'rgba(229,20,0,0.07)', '--t-danger-bg': 'rgba(229,20,0,0.04)',
      '--t-warning-subtle': 'rgba(191,136,3,0.1)',
      '--t-muted-subtle': 'rgba(110,110,110,0.1)',
      '--t-accent-subtler': 'rgba(0,95,184,0.06)', '--t-accent-light': 'rgba(0,95,184,0.08)',
      '--t-accent-ghost': 'rgba(0,95,184,0.05)', '--t-accent-dim': 'rgba(0,95,184,0.03)',
      '--t-bg-light': 'rgba(0,0,0,0.06)',
      '--t-card-shadow': '0 1px 3px rgba(0,0,0,0.06)',
      '--t-overlay': 'rgba(0,0,0,0.5)',
    },
  },
  {
    id: 'notion-light', name: 'Notion Light', mode: 'light',
    vars: {
      '--t-surface': '#FFFFFF', '--t-sidebar': '#F7F7F5', '--t-card': '#F7F6F3', '--t-hover': '#EFEEEC',
      '--t-primary': '#37352F', '--t-muted': '#6B6965',
      '--t-accent': '#2383E2', '--t-accent-hover': '#1A73C7',
      '--t-danger': '#E03E3E', '--t-danger-hover': '#C13636', '--t-warning': '#DFAB01', '--t-success': '#448361',
      '--t-border': 'rgba(15,15,15,0.1)', '--t-border-mid': 'rgba(15,15,15,0.12)', '--t-border-hover': 'rgba(15,15,15,0.15)',
      '--t-bg-hover': 'rgba(15,15,15,0.05)',
      '--t-accent-subtle': 'rgba(35,131,226,0.1)',
      '--t-danger-subtle': 'rgba(224,62,62,0.1)', '--t-danger-light': 'rgba(224,62,62,0.07)', '--t-danger-bg': 'rgba(224,62,62,0.04)',
      '--t-warning-subtle': 'rgba(223,171,1,0.12)',
      '--t-muted-subtle': 'rgba(155,154,151,0.12)',
      '--t-accent-subtler': 'rgba(35,131,226,0.06)', '--t-accent-light': 'rgba(35,131,226,0.08)',
      '--t-accent-ghost': 'rgba(35,131,226,0.05)', '--t-accent-dim': 'rgba(35,131,226,0.03)',
      '--t-bg-light': 'rgba(15,15,15,0.08)',
      '--t-card-shadow': '0 1px 2px rgba(0,0,0,0.04)',
      '--t-overlay': 'rgba(0,0,0,0.4)',
    },
  },
  {
    id: 'vercel-light', name: 'Vercel / Geist Light', mode: 'light',
    vars: {
      '--t-surface': '#FFFFFF', '--t-sidebar': '#FAFAFA', '--t-card': '#FFFFFF', '--t-hover': '#F2F2F2',
      '--t-primary': '#171717', '--t-muted': '#666666',
      '--t-accent': '#000000', '--t-accent-hover': '#333333',
      '--t-danger': '#DC2626', '--t-danger-hover': '#B91C1C', '--t-warning': '#B45309', '--t-success': '#16A34A',
      '--t-border': '#EAEAEA', '--t-border-mid': '#E0E0E0', '--t-border-hover': '#CCCCCC',
      '--t-bg-hover': 'rgba(0,0,0,0.04)',
      '--t-accent-subtle': 'rgba(0,0,0,0.06)',
      '--t-danger-subtle': 'rgba(220,38,38,0.1)', '--t-danger-light': 'rgba(220,38,38,0.07)', '--t-danger-bg': 'rgba(220,38,38,0.04)',
      '--t-warning-subtle': 'rgba(180,83,9,0.1)',
      '--t-muted-subtle': 'rgba(102,102,102,0.1)',
      '--t-accent-subtler': 'rgba(0,0,0,0.04)', '--t-accent-light': 'rgba(0,112,243,0.08)',
      '--t-accent-ghost': 'rgba(0,112,243,0.05)', '--t-accent-dim': 'rgba(0,0,0,0.02)',
      '--t-bg-light': 'rgba(0,0,0,0.06)',
      '--t-card-shadow': '0 2px 4px rgba(0,0,0,0.04)',
      '--t-overlay': 'rgba(0,0,0,0.4)',
    },
  },
  {
    id: 'stripe-light', name: 'Stripe Dashboard', mode: 'light',
    vars: {
      '--t-surface': '#FFFFFF', '--t-sidebar': '#F6F9FC', '--t-card': '#FFFFFF', '--t-hover': '#F6F9FC',
      '--t-primary': '#1A1F36', '--t-muted': '#697386',
      '--t-accent': '#635BFF', '--t-accent-hover': '#524BDB',
      '--t-danger': '#DF1B41', '--t-danger-hover': '#C41739', '--t-warning': '#B45309', '--t-success': '#0A8A5F',
      '--t-border': '#E3E8EE', '--t-border-mid': '#D8DEE4', '--t-border-hover': '#C1C9D2',
      '--t-bg-hover': 'rgba(0,0,0,0.03)',
      '--t-accent-subtle': 'rgba(99,91,255,0.1)',
      '--t-danger-subtle': 'rgba(223,27,65,0.1)', '--t-danger-light': 'rgba(223,27,65,0.07)', '--t-danger-bg': 'rgba(223,27,65,0.04)',
      '--t-warning-subtle': 'rgba(180,83,9,0.1)',
      '--t-muted-subtle': 'rgba(105,115,134,0.1)',
      '--t-accent-subtler': 'rgba(99,91,255,0.06)', '--t-accent-light': 'rgba(99,91,255,0.08)',
      '--t-accent-ghost': 'rgba(99,91,255,0.05)', '--t-accent-dim': 'rgba(99,91,255,0.03)',
      '--t-bg-light': 'rgba(0,0,0,0.06)',
      '--t-card-shadow': '0 2px 5px rgba(60,66,87,0.08)',
      '--t-overlay': 'rgba(0,0,0,0.4)',
    },
  },
  {
    id: 'linear-light', name: 'Linear Light', mode: 'light',
    vars: {
      '--t-surface': '#FFFFFF', '--t-sidebar': '#FAFAFA', '--t-card': '#FFFFFF', '--t-hover': '#F4F4F5',
      '--t-primary': '#17181C', '--t-muted': '#6F6F76',
      '--t-accent': '#5E6AD2', '--t-accent-hover': '#4E59C0',
      '--t-danger': '#EB5757', '--t-danger-hover': '#D64545', '--t-warning': '#DE9F1D', '--t-success': '#4CB782',
      '--t-border': '#E7E7E9', '--t-border-mid': '#DCDCDF', '--t-border-hover': '#C9C9CE',
      '--t-bg-hover': 'rgba(0,0,0,0.04)',
      '--t-accent-subtle': 'rgba(94,106,210,0.1)',
      '--t-danger-subtle': 'rgba(235,87,87,0.1)', '--t-danger-light': 'rgba(235,87,87,0.07)', '--t-danger-bg': 'rgba(235,87,87,0.04)',
      '--t-warning-subtle': 'rgba(222,159,29,0.12)',
      '--t-muted-subtle': 'rgba(111,111,118,0.1)',
      '--t-accent-subtler': 'rgba(94,106,210,0.06)', '--t-accent-light': 'rgba(94,106,210,0.08)',
      '--t-accent-ghost': 'rgba(94,106,210,0.05)', '--t-accent-dim': 'rgba(94,106,210,0.03)',
      '--t-bg-light': 'rgba(0,0,0,0.06)',
      '--t-card-shadow': '0 1px 2px rgba(0,0,0,0.04)',
      '--t-overlay': 'rgba(0,0,0,0.4)',
    },
  },
];

// 默认主题：亮色 Indigo（近似 #FAFAFB 的中性底 + 靛蓝强调色）。
// 它刻意不继承任何其它主题的调色板——历史上这里是 `{ ...DARK[2] }`（即 Linear），
// 导致设置页里「Original Indigo」与「Linear」几乎是同一个主题。
// 这里把 29 个令牌全部显式声明，不再展开任何其它主题的 vars，
// 因此默认主题与其余 12 套之间没有任何隐式耦合。
// 注意：每个令牌都必须与 globals.css 的 :root 回退值一致，
// 否则首屏会先画出另一套颜色再被引导脚本纠正。scripts/check-theme-tokens.js 会强制校验。
const DEFAULT: Theme = { id: 'default', name: 'Original Indigo', mode: 'light',
  vars: {
    // 亮色层级：surface 略灰、card 纯白，靠边框而不是阴影分层
    '--t-surface': '#FAFAFB', '--t-sidebar': '#F2F2F5', '--t-card': '#FFFFFF', '--t-hover': '#F1F1F4',
    '--t-primary': '#1B1C24', '--t-muted': '#666A7A',
    '--t-accent': '#5E6AD2', '--t-accent-hover': '#4E59C0',
    '--t-danger': '#DC2626', '--t-danger-hover': '#B91C1C', '--t-warning': '#B45309', '--t-success': '#0D8456',
    '--t-border': '#E4E4E9', '--t-border-mid': '#D8D8DF', '--t-border-hover': '#C4C4CE',
    '--t-bg-hover': 'rgba(20,20,40,0.045)',
    '--t-accent-subtle': 'rgba(94,106,210,0.1)', '--t-accent-subtler': 'rgba(94,106,210,0.07)',
    '--t-accent-light': 'rgba(94,106,210,0.09)', '--t-accent-ghost': 'rgba(94,106,210,0.05)', '--t-accent-dim': 'rgba(94,106,210,0.03)',
    '--t-danger-subtle': 'rgba(220,38,38,0.1)', '--t-danger-light': 'rgba(220,38,38,0.07)', '--t-danger-bg': 'rgba(220,38,38,0.04)',
    '--t-warning-subtle': 'rgba(180,83,9,0.12)', '--t-muted-subtle': 'rgba(102,106,122,0.1)',
    '--t-bg-light': 'rgba(20,20,40,0.06)',
    '--t-card-shadow': '0 1px 2px rgba(16,18,35,0.04)',
    '--t-overlay': 'rgba(15,17,30,0.4)',
  },
};

export const allThemes: Theme[] = [DEFAULT, ...DARK, ...LIGHT].map(completeTheme);

export const THEME_STORAGE_KEY = 'baton-theme';
