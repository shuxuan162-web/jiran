// Phase 4 smoke test against the live URL (npm i playwright; node e2e/smoke-phase4.cjs). Creates "smoke test" rows and cleans them up.
const { chromium } = require('playwright');
const base = 'https://jiran-elmina.vercel.app';
const PW = 'JiranDemo2026!';
const stamp = Date.now().toString().slice(-5);
const out = (k, v) => console.log(`${k}: ${typeof v === 'string' ? v.replace(/\s+/g, ' ').slice(0, 300) : JSON.stringify(v)}`);
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const ctx = async (email, staff, geo) => {
    const c = await b.newContext(geo ? { geolocation: geo, permissions: ['geolocation'] } : {});
    const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(`${email}: ${e.message}`));
    p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Smoke test clean-up' : undefined));
    await p.goto(base + (staff ? '/admin/login' : '/login/owner'));
    await p.fill('input[type=email]', email); await p.fill('input[type=password]', PW);
    await p.keyboard.press('Enter'); await p.waitForTimeout(5000);
    return p;
  };
  const step = async (name, fn) => { try { await fn(); } catch (e) { out(`FAIL ${name}`, e.message.split('\n')[0]); } };
  const banner = async (p) => (await p.locator('.banner').allInnerTexts()).join(' | ');

  const m = await ctx('admin@jiran.example.com', true);
  const B = await ctx('kopikaki@jiran.example.com', false, { latitude: 3.1705, longitude: 101.4985 });
  const A = await ctx('lakewalker@jiran.example.com', false, { latitude: 3.2040, longitude: 101.4895 });
  const title = `Smoke test notice ${stamp}`;

  await step('publish', async () => {
    await m.goto(base + '/admin/publish'); await m.waitForTimeout(2500);
    await m.selectOption('select', 'safety');
    await m.getByLabel('Title').fill(title);
    await m.getByLabel('Message').fill('(smoke test) Checking that area notices reach the right residents.');
    await m.getByText('Chosen areas').click();
    await m.getByRole('button', { name: 'Elmina Valley', exact: true }).click();
    await m.getByRole('button', { name: 'Publish now' }).click();
    await m.getByRole('button', { name: 'Yes, send it' }).click(); await m.waitForTimeout(3000);
    out('publish', await banner(m));
  });
  await step('notice reach', async () => {
    await B.goto(base + '/app/notifications?tab=announcements'); await B.waitForTimeout(3000);
    out('B sees notice', (await B.content()).includes(title));
    await A.goto(base + '/app/notifications?tab=announcements'); await A.waitForTimeout(3000);
    out('A sees notice (should be false)', (await A.content()).includes(title));
    await B.goto(base + '/app/residence'); await B.waitForTimeout(4000);
    out('B happening', (await B.locator('.feed-row').allInnerTexts()).slice(0, 3).join(' || '));
  });
  await step('post', async () => {
    await B.goto(base + '/app/community/new'); await B.waitForTimeout(2000);
    await B.locator('textarea').fill(`(smoke test ${stamp}) Hello neighbours, testing the township feed.`);
    const agree = B.getByRole('button', { name: 'I understand' }); if (await agree.count()) await agree.click();
    await B.getByRole('button', { name: 'Publish' }).click(); await B.waitForTimeout(3500);
    out('post 1', await banner(B));
    await B.goto(base + '/app/community/new'); await B.waitForTimeout(2000);
    await B.locator('textarea').fill(`(smoke test ${stamp}) Call me at 012-345 6789`);
    out('private warn shown', await B.getByText('looks like a phone or IC number').count());
    await B.getByRole('button', { name: 'Publish' }).click(); await B.waitForTimeout(3500);
    out('post 2', await banner(B));
  });
  await step('helpful+reply (A)', async () => {
    await A.goto(base + '/app/community'); await A.waitForTimeout(3000);
    await A.locator('.post-card', { hasText: `smoke test ${stamp}) Hello` }).first().click(); await A.waitForTimeout(2500);
    await A.getByRole('button', { name: /Helpful/ }).click(); await A.waitForTimeout(1500);
    await A.locator('textarea').fill('(smoke test) Welcome!'); await A.getByRole('button', { name: 'Send' }).click(); await A.waitForTimeout(2500);
    out('A post view', (await A.locator('main').innerText()).slice(0, 400));
  });
  await step('moderation', async () => {
    await m.goto(base + '/admin/moderation'); await m.waitForTimeout(3000);
    const card = m.locator('section.card', { hasText: `smoke test ${stamp}) Call me` });
    out('held in queue', await card.count());
    await card.getByRole('button', { name: 'Remove' }).click(); await m.waitForTimeout(2500);
    out('moderation', await banner(m));
  });
  let evUrl = '';
  await step('event create (A)', async () => {
    await A.goto(base + '/app/events/new'); await A.waitForTimeout(3000);
    await A.getByLabel('Event name').fill(`Smoke test event ${stamp}`);
    await A.locator('textarea').fill('(smoke test) Checking event approval and check-in.');
    await A.getByLabel('Place').fill('Elmina Green 4 park');
    const map = A.locator('.map-wrap, [aria-label="Where on the map"]').first();
    const box = await A.locator('.gm-style, .leaflet-container').first().boundingBox();
    await A.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await A.waitForTimeout(800);
    await A.getByRole('button', { name: 'Send for approval' }).click(); await A.waitForTimeout(3500);
    evUrl = A.url(); out('event url', evUrl);
    out('event page', (await A.locator('main').innerText()).slice(0, 250));
  });
  await step('event approve', async () => {
    await m.goto(base + '/admin/events'); await m.waitForTimeout(3000);
    const card = m.locator('section.card', { hasText: `Smoke test event ${stamp}` });
    await card.getByRole('button', { name: 'Approve' }).click(); await m.waitForTimeout(2500);
    out('approve', await banner(m));
    await A.goto(evUrl); await A.waitForTimeout(3000);
    out('host code shown', await A.locator('.big-code').count());
    await A.goto(base + '/app/notifications'); await A.waitForTimeout(2500);
    out('A bell', (await A.locator('.notice-row').first().innerText()).slice(0, 120));
  });
  await step('rsvp (B)', async () => {
    await B.goto(evUrl); await B.waitForTimeout(3000);
    await B.getByRole('button', { name: "I'm going" }).click(); await B.waitForTimeout(2500);
    out('rsvp', await banner(B));
  });
  await step('newsletter draft', async () => {
    await m.goto(base + '/admin/newsletter'); await m.waitForTimeout(3000);
    await m.getByRole('button', { name: "Build this week's draft" }).click(); await m.waitForTimeout(3500);
    out('newsletter', await banner(m));
    out('preview sections', (await m.locator('.nl-section h2').allInnerTexts()).join(', '));
  });
  await step('analytics', async () => {
    await m.goto(base + '/admin/analytics'); await m.waitForTimeout(4000);
    out('stats', (await m.locator('.stat-tile').allInnerTexts()).map((s) => s.replace(/\n/g, ' ')).join(' || '));
    out('bars', await m.locator('svg path').count());
  });
  await step('map layers (B)', async () => {
    await B.goto(base + '/app/map'); await B.waitForTimeout(5000);
    out('layer chips', (await B.locator('.layer-chips button').allInnerTexts()).map((s) => s.replace(/\n/g, ' ')).join(', '));
  });
  await step('settings follows (B)', async () => {
    await B.goto(base + '/app/profile/settings'); await B.waitForTimeout(3000);
    out('follows', (await B.locator('section', { hasText: 'Areas I follow' }).innerText()).slice(0, 200));
  });
  await B.screenshot({ path: '/tmp/t/settings.png', fullPage: false });
  // clean-up
  await step('cleanup', async () => {
    await m.goto(base + '/admin/publish'); await m.waitForTimeout(3000);
    await m.locator('tr', { hasText: title }).getByRole('button', { name: 'Withdraw' }).click(); await m.waitForTimeout(2000);
    await m.goto(base + '/admin/events'); await m.waitForTimeout(3000);
    await m.locator('tr', { hasText: `Smoke test event ${stamp}` }).getByRole('button', { name: 'Cancel this event' }).click(); await m.waitForTimeout(2000);
    await B.goto(base + '/app/community?tab=mine'); await B.waitForTimeout(3000);
    await B.locator('.post-card', { hasText: `smoke test ${stamp}) Hello` }).first().click(); await B.waitForTimeout(2500);
    await B.getByRole('button', { name: 'Delete my post' }).click(); await B.waitForTimeout(2500);
    out('cleanup', 'done');
  });
  out('ERRORS', errs);
  await b.close();
})();
