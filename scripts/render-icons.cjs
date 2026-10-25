// Renders the PNG app icons from public/favicon.svg: `node scripts/render-icons.cjs` (needs Playwright).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const pub = path.join(__dirname, '..', 'public');
const svg = fs.readFileSync(path.join(pub, 'favicon.svg'), 'utf8');
// [file, size, padding as a share of the size]; maskable icons keep the mark inside the safe zone.
const icons = [
  ['icons/icon-192.png', 192, 0.1],
  ['icons/icon-512.png', 512, 0.1],
  ['icons/icon-maskable-512.png', 512, 0.2],
  ['icons/apple-touch-icon.png', 180, 0.12],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [file, size, pad] of icons) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<body style="margin:0;background:radial-gradient(circle at 50% 30%,#2a1416,#0b0708 70%);width:${size}px;height:${size}px;display:grid;place-items:center">` +
        `<div style="width:${size * (1 - 2 * pad)}px;height:${size * (1 - 2 * pad)}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body>`,
    );
    await page.screenshot({ path: path.join(pub, file) });
  }
  await browser.close();
})();
