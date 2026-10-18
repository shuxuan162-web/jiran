// Phase 6 smoke test (npm i playwright; node e2e/smoke-phase6.cjs [baseUrl] [--submit]).
// --submit sends one real enquiry as KopiKaki and closes it again as management.
const { chromium } = require('playwright');
const base = process.argv[2] && process.argv[2].startsWith('http') ? process.argv[2] : 'https://jiran-elmina.vercel.app';
const submit = process.argv.includes('--submit');
const out = (k, v) => console.log(`${k}: ${String(typeof v === 'string' ? v : JSON.stringify(v)).replace(/\s+/g, ' ').slice(0, 320)}`);
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const login = async (email, staff) => {
    const c = await b.newContext({ viewport: { width: 400, height: 860 } }); const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(`${email}: ${e.message}`));
    await p.goto(base + (staff ? '/admin/login' : '/login/owner'));
    await p.fill('input[type=email]', email); await p.fill('input[type=password]', 'JiranDemo2026!');
    await p.keyboard.press('Enter'); await p.waitForTimeout(5000); return p;
  };
  const step = async (name, fn) => { try { await fn(); } catch (e) { out(`FAIL ${name}`, e.message.split('\n')[0]); } };
  const B = await login('kopikaki@jiran.example.com');

  await step('properties tab', async () => {
    await B.goto(base + '/app/properties'); await B.waitForTimeout(2500);
    out('residential cards', (await B.locator('.prop-card').allInnerTexts()).join(' || '));
    await B.getByRole('tab', { name: 'Commercial' }).click(); await B.waitForTimeout(500);
    out('commercial cards', (await B.locator('.prop-card').allInnerTexts()).join(' || '));
    await B.getByRole('tab', { name: 'Industrial' }).click(); await B.waitForTimeout(500);
    out('industrial cards', (await B.locator('.prop-card').allInnerTexts()).join(' || '));
    out('facts', (await B.locator('.fact').allInnerTexts()).join(' | '));
    await B.screenshot({ path: 'props.png', fullPage: true });
  });
  await step('property detail + form', async () => {
    await B.goto(base + '/app/properties/kanopi-residences'); await B.waitForTimeout(4000);
    out('detail', (await B.locator('section.card').first().innerText()).slice(0, 200));
    const form = B.locator('.enquiry-card');
    out('prefilled', JSON.stringify(await form.locator('input.input').evaluateAll((es) => es.map((e) => e.value ? 'filled' : 'empty'))));
    await form.getByRole('button', { name: 'Submit' }).click(); await B.waitForTimeout(800);
    out('validation without consent', (await form.locator('.error').allInnerTexts()).join(' | '));
    out('map pins', await B.locator('.pin-prop').count());
    await B.screenshot({ path: 'detail.png', fullPage: true });
    if (submit) {
      await form.locator('input[type=checkbox]').check();
      await form.getByRole('button', { name: 'Submit' }).click(); await B.waitForTimeout(3500);
      out('submit result', (await form.innerText()).slice(0, 200));
    }
  });
  await step('mall', async () => {
    await B.goto(base + '/app/mall'); await B.waitForTimeout(2500);
    out('hero', await B.locator('.mall-hero').innerText());
    out('stores shown', await B.locator('.store-list li').count());
    await B.getByRole('searchbox').fill('jaya'); await B.waitForTimeout(400);
    out('search jaya', (await B.locator('.store-list li').allInnerTexts()).join(' | '));
    await B.getByRole('searchbox').fill('');
    await B.locator('.chip-btn', { hasText: 'Food & Beverage' }).click(); await B.waitForTimeout(300);
    out('F&B count', await B.locator('.store-list li').count());
    await B.getByRole('tab', { name: 'Getting here' }).click();
    out('visit', (await B.locator('section.card').innerText()).slice(0, 220));
    await B.screenshot({ path: 'mall.png', fullPage: false });
  });
  await step('map places', async () => {
    await B.goto(base + '/app/map?place=elmina-lakeside-mall'); await B.waitForTimeout(5000);
    out('place sheet', (await B.locator('.sheet').innerText()).slice(0, 200));
    out('places chip', await B.locator('.layer-chips button', { hasText: 'Places' }).innerText());
  });
  if (submit) await step('admin enquiries', async () => {
    const m = await login('admin@jiran.example.com', true);
    await m.goto(base + '/admin/content'); await m.waitForTimeout(3500);
    const row = m.locator('tbody tr').first();
    out('admin row', (await row.innerText()).slice(0, 200));
    await row.getByRole('button', { name: 'Mark contacted' }).click(); await m.waitForTimeout(2000);
    await m.locator('tbody tr').first().getByRole('button', { name: 'Close' }).click(); await m.waitForTimeout(2000);
    out('admin after', (await m.locator('.banner').allInnerTexts()).join(' | '));
  });
  out('ERRORS', errs);
  await b.close();
})();
