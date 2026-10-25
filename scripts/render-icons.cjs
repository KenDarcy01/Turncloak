// Renders the PNG app icons from public/favicon.svg: `node scripts/render-icons.cjs` (needs Playwright).
// The files in assets/ feed `npm run native:assets`, which makes every iOS and Android icon and splash size.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'public', 'favicon.svg'), 'utf8');
const BG = 'radial-gradient(circle at 50% 30%,#2a1416,#0b0708 70%)';
// [file, size, padding as a share of the size, background]; maskable icons keep the mark inside the safe zone.
const icons = [
  ['public/icons/icon-192.png', 192, 0.1, BG],
  ['public/icons/icon-512.png', 512, 0.1, BG],
  ['public/icons/icon-maskable-512.png', 512, 0.2, BG],
  ['public/icons/apple-touch-icon.png', 180, 0.12, BG],
  ['assets/icon-only.png', 1024, 0.12, BG],
  ['assets/icon-foreground.png', 1024, 0.26, 'transparent'],
  ['assets/icon-background.png', 1024, null, BG],
  ['assets/splash.png', 2732, 0.4, BG],
  ['assets/splash-dark.png', 2732, 0.4, BG],
];

(async () => {
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [file, size, pad, bg] of icons) {
    const mark = pad === null ? '' : svg.replace('<svg ', '<svg width="100%" height="100%" ');
    const inner = pad === null ? 0 : size * (1 - 2 * pad);
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<body style="margin:0;background:${bg};width:${size}px;height:${size}px;display:grid;place-items:center">` +
        `<div style="width:${inner}px;height:${inner}px">${mark}</div></body>`,
    );
    await page.screenshot({ path: path.join(root, file), omitBackground: bg === 'transparent' });
  }
  await browser.close();
})();
