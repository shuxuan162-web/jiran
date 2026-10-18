// Phase 7 smoke test against the live URL. Needs: npm i playwright qrcode
// The camera is tested for real: Chrome gets a fake camera (a .y4m video) showing a generated QR code,
// and the app's own scanner (getUserMedia + jsQR) has to read it.
const { chromium } = require('playwright');
const QRCode = require('qrcode');
const fs = require('fs');
const crypto = require('crypto');
const base = process.argv[2] && process.argv[2].startsWith('http') ? process.argv[2] : 'https://jiran-elmina.vercel.app';
const out = (k, v) => console.log(`${k}: ${String(typeof v === 'string' ? v : JSON.stringify(v)).replace(/\s+/g, ' ').slice(0, 320)}`);
const md5uuid = (s) => { const h = crypto.createHash('md5').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };

/** Write a 640x480 YUV4MPEG2 video (30 identical frames) showing a QR code for `text`. */
function qrVideo(text, file) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size, W = 640, H = 480, cell = Math.floor(360 / (n + 8)), size = cell * (n + 8);
  const x0 = Math.floor((W - size) / 2), y0 = Math.floor((H - size) / 2);
  const Y = Buffer.alloc(W * H, 235);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c))
    for (let dy = 0; dy < cell; dy++) for (let dx = 0; dx < cell; dx++) Y[(y0 + (r + 4) * cell + dy) * W + x0 + (c + 4) * cell + dx] = 16;
  const UV = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < 30; f++) parts.push(Buffer.from('FRAME\n'), Y, UV);
  fs.writeFileSync(file, Buffer.concat(parts));
}

(async () => {
  const errs = [];
  const step = async (name, fn) => { try { await fn(); } catch (e) { out(`FAIL ${name}`, e.message.split('\n')[0]); } };
  const plain = await chromium.launch();
  const login = async (browser, email, staff, opts = {}) => {
    const path = opts.path; const c = await browser.newContext({ viewport: { width: 400, height: 860 }, ...opts, path: undefined }); const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(`${email}: ${e.message}`));
    await p.goto(base + (staff ? '/admin/login' : (path || '/login/owner')));
    await p.fill('input[type=email]', email); await p.fill('input[type=password]', 'JiranDemo2026!');
    await p.keyboard.press('Enter'); await p.waitForTimeout(5000); return p;
  };
  const B = await login(plain, 'kopikaki@jiran.example.com');
  let token = null;

  await step('visitor pass', async () => {
    await B.goto(base + '/app/services/visitors'); await B.waitForTimeout(2500);
    await B.getByLabel("Visitor's name").fill('Smoke Test Visitor');
    await B.getByLabel('Car plate').fill('wxy 1234');
    await B.getByRole('button', { name: 'Create pass' }).click(); await B.waitForTimeout(3500);
    const card = await B.locator('.pass-card').innerText();
    token = (card.match(/Code: ([0-9a-f]{24})/) || [])[1];
    out('pass card', card.slice(0, 160)); out('qr image', await B.locator('.pass-card img.qr-image').count());
  });

  await step('guard scans the pass with the camera', async () => {
    if (!token) throw new Error('no token');
    qrVideo(`JIRAN:PASS:${token}`, '/tmp/pass.y4m');
    const cam = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=/tmp/pass.y4m'] });
    const S = await login(cam, 'security@jiran.example.com', true, { permissions: ['camera'], viewport: { width: 1200, height: 900 } });
    await S.goto(base + '/admin/scan'); await S.waitForTimeout(2500);
    await S.getByRole('button', { name: 'Turn on camera' }).click();
    await S.locator('.pass-verdict').waitFor({ timeout: 15000 });
    out('scan verdict', await S.locator('.pass-result').innerText());
    await S.getByRole('button', { name: 'Check in visitor' }).click(); await S.waitForTimeout(2500);
    out('after admit', await S.locator('.pass-verdict').innerText());
    await cam.close();
    await B.goto(base + '/app/notifications'); await B.waitForTimeout(2500);
    out('host bell', await B.locator('.notice-row').first().innerText());
  });

  await step('resident scans event QR with the camera', async () => {
    const eventId = md5uuid('event-5');
    qrVideo(`JIRAN:EVENT:${eventId}:135790`, '/tmp/event.y4m');
    const cam = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=/tmp/event.y4m'] });
    const A = await login(cam, 'lakewalker@jiran.example.com', false, { permissions: ['camera'] });
    await A.goto(base + '/app/scan'); await A.waitForTimeout(2500);
    await A.getByRole('button', { name: 'Turn on camera' }).click();
    await A.locator('.banner').first().waitFor({ timeout: 15000 });
    out('event scan', (await A.locator('.banner').allInnerTexts()).join(' | '));
    await A.getByRole('button', { name: 'Scan another' }).click();
    await A.getByRole('button', { name: 'Turn on camera' }).click().catch(() => {});
    await A.waitForFunction(() => document.querySelector('video')?.srcObject, null, { timeout: 10000 });
    await A.evaluate(() => { window.__cam = document.querySelector('video').srcObject; });
    out('camera live while scanning', await A.evaluate(() => window.__cam.getTracks().map((t) => t.readyState).join(',')));
    await A.locator('main a[href="/app/services/visitors"]').click(); await A.waitForTimeout(1200); // in-app navigation away
    out('camera after leaving page', await A.evaluate(() => window.__cam.getTracks().map((t) => t.readyState).join(',')));
    await cam.close();
  });

  await step('camera blocked shows help + typing works', async () => {
    const C = await login(plain, 'cyclingauntie@jiran.example.com');
    await C.goto(base + '/app/scan'); await C.waitForTimeout(2000);
    await C.getByRole('button', { name: 'Turn on camera' }).click(); await C.waitForTimeout(2500);
    out('blocked camera message', (await C.locator('.banner').allInnerTexts()).join(' | ').slice(0, 160));
    await C.getByLabel('Or type a code').fill('https://example.com/free-gift');
    await C.getByRole('button', { name: 'Check' }).click(); await C.waitForTimeout(800);
    out('unknown link', (await C.locator('.banner').allInnerTexts()).join(' | ').slice(-140));
  });

  await step('service request', async () => {
    await B.goto(base + '/app/services/requests'); await B.waitForTimeout(2500);
    await B.getByRole('button', { name: /New service request/ }).click();
    await B.getByRole('button', { name: 'Plumbing' }).click();
    await B.locator('textarea').fill('(smoke test) Kitchen sink is leaking under the cabinet.');
    await B.getByRole('button', { name: 'Submit' }).click(); await B.waitForTimeout(3000);
    out('service sent', (await B.locator('.banner').allInnerTexts()).join(' | '));
    const M = await login(plain, 'admin@jiran.example.com', true, { viewport: { width: 1280, height: 900 } });
    await M.goto(base + '/admin/services'); await M.waitForTimeout(3000);
    const row = M.locator('tr', { hasText: '(smoke test) Kitchen sink' }).first();
    await row.locator('input').first().fill('Plumber visiting Tuesday morning (smoke test)');
    await row.getByRole('button', { name: 'Scheduled' }).click(); await M.waitForTimeout(2000);
    await row.getByRole('button', { name: 'Cancelled' }).click().catch(() => {}); await M.waitForTimeout(1500);
    out('admin', (await M.locator('.banner').allInnerTexts()).join(' | '));
    await M.goto(base + '/admin/surveys'); await M.waitForTimeout(2500);
    out('feedback page', (await M.locator('main').innerText()).slice(0, 120));
  });

  await step('faq, feedback, billing, plates', async () => {
    await B.goto(base + '/app/faq'); await B.waitForTimeout(1500);
    await B.getByRole('searchbox').fill('how do I register a guest'); await B.waitForTimeout(300);
    out('faq top', await B.locator('.faq-q').first().innerText());
    await B.goto(base + '/app/billing'); await B.waitForTimeout(2500);
    out('billing', (await B.locator('main').innerText()).slice(0, 260));
    await B.goto(base + '/app/profile/plates'); await B.waitForTimeout(2000);
    await B.getByLabel('Car plate').fill('vba 2026'); await B.getByRole('button', { name: 'Add car' }).click(); await B.waitForTimeout(1500);
    out('plates', (await B.locator('.list').innerText()).slice(0, 80));
    await B.getByRole('button', { name: 'Remove VBA 2026' }).click(); await B.waitForTimeout(1200);
    const N = await login(plain, 'nasilemak@jiran.example.com', false, { path: '/login/sub-owner' });
    await N.goto(base + '/app/billing'); await N.waitForTimeout(2000);
    out('sub-owner billing', (await N.locator('.banner').allInnerTexts()).join(' | '));
  });
  out('ERRORS', errs);
  await plain.close();
})();
