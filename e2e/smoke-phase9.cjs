// Phase 9 smoke test against the live URL: English only, demo controls gone, billing reminders,
// service requests, surveys and FAQ. Needs: npm i playwright
// Leaves behind: one voided test bill, one completed and one cancelled "(smoke test)" request, one closed "(smoke test)" survey.
const { chromium } = require('playwright');
const base = process.argv[2] && process.argv[2].startsWith('http') ? process.argv[2] : 'https://jiran-elmina.vercel.app';
const out = (k, v) => console.log(`${k}: ${String(typeof v === 'string' ? v : JSON.stringify(v)).replace(/\s+/g, ' ').slice(0, 300)}`);
const PW = 'JiranDemo2026!';
const pdf = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const dayPlus = (n) => new Date(Date.now() + 8 * 3600000 + n * 86400000).toISOString().slice(0, 10);

(async () => {
  const errs = [];
  const browser = await chromium.launch();
  const step = async (name, fn) => { try { await fn(); } catch (e) { out(`FAIL ${name}`, e.message.split('\n')[0]); } };
  const login = async (email, { staff = false, path = '/login/owner', wide = false } = {}) => {
    const c = await browser.newContext({ viewport: wide ? { width: 1300, height: 950 } : { width: 400, height: 860 } });
    const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(`${email}: ${e.message}`));
    p.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Entered for the smoke test' : undefined));
    await p.goto(base + (staff ? '/admin/login' : path));
    await p.fill('input[type=email]', email); await p.fill('input[type=password]', PW);
    await p.keyboard.press('Enter'); await p.waitForTimeout(5000); return p;
  };
  const banners = async (p) => (await p.locator('.banner').allInnerTexts()).join(' | ');

  const owner = await login('lakewalker@jiran.example.com');
  const sub = await login('nasilemak@jiran.example.com', { path: '/login/sub-owner' });
  const other = await login('kopikaki@jiran.example.com');
  const admin = await login('admin@jiran.example.com', { staff: true, wide: true });

  await step('English only', async () => {
    await owner.goto(base + '/app/profile/settings'); await owner.waitForTimeout(2000);
    const text = await owner.locator('main').innerText();
    out('settings has language option', /Bahasa|Language/.test(text));
    out('settings has notifications', /Billing reminders/.test(text) && /Service request updates/.test(text));
    await owner.evaluate(() => localStorage.setItem('jiran.lang', 'bm'));
    await owner.reload(); await owner.waitForTimeout(3000);
    out('stored bm loads as', `${await owner.evaluate(() => document.documentElement.lang)} / ${await owner.locator('h1').first().innerText()} / pref now ${await owner.evaluate(() => localStorage.getItem('jiran.lang'))}`);
    const raw = (await owner.locator('body').innerText()).match(/\b[a-z]+(\.[a-zA-Z_]+){1,3}\b/g)?.filter((x) => /^(sr|bill|svc|admin|settings|common|sv|faq)\./.test(x));
    out('untranslated keys on settings', raw ?? []);
  });

  await step('admin nav + services hub', async () => {
    out('admin nav', (await admin.locator('.admin-side nav').innerText()).replace(/\n/g, ', '));
    await admin.goto(base + '/admin/demo'); await admin.waitForTimeout(1500);
    out('/admin/demo goes to', new URL(admin.url()).pathname);
    await owner.goto(base + '/app/services'); await owner.waitForTimeout(1500);
    out('services hub', (await owner.locator('main .list').innerText()).replace(/\n/g, ' / '));
  });

  let unitLabel = '';
  await step('billing: empty state, add bill, owner sees it', async () => {
    await owner.goto(base + '/app/billing'); await owner.waitForTimeout(3000);
    out('owner billing first', (await owner.locator('main').innerText()).slice(0, 220));
    await admin.goto(base + '/admin/billing'); await admin.waitForTimeout(3000);
    await admin.getByRole('button', { name: '+ Add bill' }).click();
    await admin.getByPlaceholder('Type part of the unit').fill('Elmina Green · No. 4'); await admin.waitForTimeout(1500);
    const opt = admin.getByRole('option').first(); unitLabel = (await opt.locator('strong').innerText()); await opt.click();
    await admin.getByLabel('Period').fill('Oct-Dec 2026 (smoke test)');
    await admin.getByLabel('Amount (RM)').fill('450.00');
    await admin.getByLabel('Due date').fill(dayPlus(2));
    await admin.getByLabel(/Invoice or account reference/).fill('SMOKE-1');
    await admin.getByRole('button', { name: 'Save' }).first().click(); await admin.waitForTimeout(3000);
    out('admin add', await banners(admin));
    const row = admin.locator('tr', { hasText: 'Oct-Dec 2026 (smoke test)' });
    out('admin row', await row.innerText());
    const [chooser] = await Promise.all([admin.waitForEvent('filechooser'), row.getByRole('button', { name: 'Attach invoice' }).click()]);
    await chooser.setFiles({ name: 'invoice-smoke.pdf', mimeType: 'application/pdf', buffer: pdf }); await admin.waitForTimeout(3000);
    out('invoice attach', await banners(admin));
    await owner.goto(base + '/app/billing'); await owner.waitForTimeout(3000);
    const card = owner.locator('.bill', { hasText: 'smoke test' });
    out('owner bill card', await card.innerText());
    const [popup] = await Promise.all([owner.waitForEvent('popup', { timeout: 10000 }).catch(() => null), card.getByRole('button', { name: 'View invoice' }).click()]);
    if (popup) { await popup.waitForLoadState().catch(() => {}); out('invoice opens', popup.url().includes('/storage/v1/object/sign/invoices/') ? 'signed URL ok' : popup.url().slice(0, 80)); }
    await owner.goto(base + '/app/notifications'); await owner.waitForTimeout(2500);
    out('owner bell', (await owner.locator('.notice-row').allInnerTexts()).slice(0, 3).join(' | '));
  });

  await step('billing: sub-owner and other owner', async () => {
    await sub.goto(base + '/app/billing'); await sub.waitForTimeout(2000);
    out('sub-owner billing', await banners(sub));
    await other.goto(base + '/app/billing'); await other.waitForTimeout(3000);
    out('other owner sees smoke bill', (await other.locator('main').innerText()).includes('smoke test'));
  });

  await step('billing: CSV preview, paid, void', async () => {
    await admin.goto(base + '/admin/billing'); await admin.waitForTimeout(3000);
    await admin.getByRole('button', { name: 'Import CSV' }).click();
    const csv = `unit,type,period,amount,due_date,reference\n${unitLabel},Sinking fund,Q4 2026 (smoke),45.00,${dayPlus(30)},\nNo such unit,Gym,,-5,31/12/2026,\n`;
    const [chooser] = await Promise.all([admin.waitForEvent('filechooser'), admin.getByRole('button', { name: 'Choose CSV file' }).click()]);
    await chooser.setFiles({ name: 'bills.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }); await admin.waitForTimeout(3000);
    out('csv preview', await banners(admin));
    out('csv row errors', (await admin.locator('section[aria-label="Import CSV"] tbody tr').nth(1).innerText()).replace(/\n/g, ' '));
    out('import button disabled', await admin.getByRole('button', { name: /^Import \d+ bills$/ }).isDisabled());
    await admin.getByRole('button', { name: 'Cancel' }).click();
    const row = admin.locator('tr', { hasText: 'Oct-Dec 2026 (smoke test)' });
    await row.getByRole('button', { name: 'Mark paid' }).click(); await admin.waitForTimeout(2500);
    out('mark paid', await banners(admin));
    await owner.goto(base + '/app/billing'); await owner.waitForTimeout(3000);
    out('owner after paid', (await owner.locator('.bill', { hasText: 'smoke test' }).innerText()).replace(/\n/g, ' '));
    await admin.getByRole('button', { name: 'All', exact: true }).click(); await admin.waitForTimeout(2500);
    await admin.locator('tr', { hasText: 'Oct-Dec 2026 (smoke test)' }).getByRole('button', { name: 'Undo paid' }).click(); await admin.waitForTimeout(2500);
    await admin.locator('tr', { hasText: 'Oct-Dec 2026 (smoke test)' }).getByRole('button', { name: 'Void' }).click(); await admin.waitForTimeout(2500);
    out('void', await banners(admin));
    await owner.reload(); await owner.waitForTimeout(3000);
    out('owner after void sees it', (await owner.locator('main').innerText()).includes('smoke test'));
  });

  let srId = '';
  await step('service request: create, visibility', async () => {
    await sub.goto(base + '/app/services/requests'); await sub.waitForTimeout(2500);
    await sub.getByRole('button', { name: '+ New request or enquiry' }).click();
    await sub.getByRole('button', { name: 'Maintenance request' }).click();
    await sub.locator('textarea').fill('(smoke test) Kitchen tap drips all night, under the sink.');
    await sub.getByLabel(/Preferred day/).fill(dayPlus(3));
    await sub.getByRole('button', { name: 'Morning' }).click();
    await sub.getByRole('button', { name: 'Submit' }).click(); await sub.waitForTimeout(4000);
    srId = sub.url().split('/').pop();
    out('sub-owner sent', await banners(sub));
    out('timeline', (await sub.locator('ol.stepper').innerText()).replace(/\n/g, ' '));
    await owner.goto(base + '/app/services/requests'); await owner.waitForTimeout(2500);
    out('owner sees it', (await owner.locator('main').innerText()).includes('(smoke test) Kitchen tap'));
    await other.goto(base + '/app/services/requests'); await other.waitForTimeout(2500);
    out('other owner sees it', (await other.locator('main').innerText()).includes('(smoke test) Kitchen tap'));
  });

  await step('service request: management flow', async () => {
    await admin.goto(base + `/admin/services?id=${srId}`); await admin.waitForTimeout(3500);
    const panel = admin.locator(`section[aria-label^="SR-"]`);
    await panel.getByRole('button', { name: 'Acknowledge' }).click(); await admin.waitForTimeout(2500);
    out('ack', await banners(admin));
    await panel.getByRole('button', { name: 'Assign' }).click(); await admin.waitForTimeout(1500);
    out('assign without handler', await banners(admin));
    await panel.locator('select').selectOption({ label: 'SecurityDesk (security desk)' });
    await panel.locator('textarea').fill('Our plumber will come on the morning you chose (smoke test).');
    await panel.getByRole('button', { name: 'Assign' }).click(); await admin.waitForTimeout(2500);
    await panel.getByPlaceholder('Add an internal note').fill('internal: check the warranty (smoke test)');
    await panel.getByRole('button', { name: 'Save' }).click(); await admin.waitForTimeout(2000);
    out('admin history', (await panel.locator('ol').innerText()).replace(/\n/g, ' '));
    await sub.goto(base + `/app/services/requests/${srId}`); await sub.waitForTimeout(3000);
    const t = await sub.locator('main').innerText();
    out('resident sees', `${/Handled by SecurityDesk/.test(t)} handler; note ${t.includes('Our plumber')}; internal ${t.includes('warranty')}; cancel ${await sub.getByRole('button', { name: 'Cancel this request' }).count()}`);
    await sub.goto(base + '/app/notifications'); await sub.waitForTimeout(2500);
    out('resident bell', (await sub.locator('.notice-row').allInnerTexts()).slice(0, 2).join(' | '));
    await panel.getByRole('button', { name: 'Start work' }).click(); await admin.waitForTimeout(2000);
    await panel.getByRole('button', { name: 'Complete' }).click(); await admin.waitForTimeout(2500);
    await sub.goto(base + `/app/services/requests/${srId}`); await sub.waitForTimeout(3000);
    await sub.getByRole('radio', { name: '5 out of 5 stars' }).click();
    await sub.getByRole('button', { name: 'Send rating' }).click(); await sub.waitForTimeout(2500);
    out('rating', await banners(sub));
  });

  await step('enquiry: cancel before assignment', async () => {
    await sub.goto(base + '/app/services/requests'); await sub.waitForTimeout(2500);
    await sub.getByRole('button', { name: '+ New request or enquiry' }).click();
    await sub.locator('label', { hasText: 'Enquiry' }).click();
    await sub.getByRole('button', { name: 'General enquiry' }).click();
    await sub.locator('textarea').fill('(smoke test) When is the next pest fogging in our street?');
    await sub.getByRole('button', { name: 'Submit' }).click(); await sub.waitForTimeout(4000);
    await sub.getByRole('button', { name: 'Cancel this request' }).click();
    await sub.getByRole('button', { name: 'Yes, cancel it' }).click(); await sub.waitForTimeout(2500);
    out('cancel', `${await banners(sub)} / ${(await sub.locator('.chip').first().innerText())}`);
  });

  await step('survey: create, open, answer, results', async () => {
    await admin.goto(base + '/admin/surveys'); await admin.waitForTimeout(2500);
    await admin.getByRole('button', { name: '+ New survey' }).click();
    await admin.getByLabel('Title').fill('Street lighting (smoke test)');
    await admin.getByLabel('Question', { exact: true }).fill('How safe do you feel walking at night?');
    await admin.getByRole('button', { name: '+ Add question' }).click();
    const q2 = admin.locator('fieldset').nth(1);
    await q2.locator('select').selectOption('choice');
    await q2.getByLabel('Question', { exact: true }).fill('Which street needs lights first?');
    await q2.getByLabel('Options').fill('Persiaran Garcinia\nJalan Elmina');
    await admin.getByRole('button', { name: 'Save draft' }).click(); await admin.waitForTimeout(2500);
    out('survey saved', await banners(admin));
    await admin.locator('section.card', { hasText: 'Street lighting (smoke test)' }).getByRole('button', { name: 'Open and notify residents' }).click(); await admin.waitForTimeout(3000);
    out('survey opened', await banners(admin));
    await sub.goto(base + '/app/feedback'); await sub.waitForTimeout(2500);
    await sub.getByRole('link', { name: /Street lighting \(smoke test\)/ }).click(); await sub.waitForTimeout(2500);
    await sub.getByRole('button', { name: 'Send answers' }).click(); await sub.waitForTimeout(500);
    out('missing answers', await banners(sub));
    await sub.getByRole('radio', { name: '4 out of 5 stars' }).click();
    await sub.getByRole('radio', { name: 'Persiaran Garcinia' }).click();
    await sub.getByRole('button', { name: 'Send answers' }).click(); await sub.waitForTimeout(2500);
    out('answered', await banners(sub));
    await admin.locator('section.card', { hasText: 'Street lighting (smoke test)' }).getByRole('button', { name: 'Results' }).click(); await admin.waitForTimeout(2500);
    out('results', (await admin.locator('[role=tabpanel]').innerText()).replace(/\n/g, ' ').slice(0, 260));
    await admin.getByRole('button', { name: '← Back' }).click(); await admin.waitForTimeout(1000);
    await admin.locator('section.card', { hasText: 'Street lighting (smoke test)' }).getByRole('button', { name: 'Close survey' }).click(); await admin.waitForTimeout(2000);
  });

  await step('FAQ', async () => {
    await other.goto(base + '/app/faq'); await other.waitForTimeout(2500);
    await other.getByRole('searchbox').fill('how do I register a guest'); await other.waitForTimeout(300);
    out('faq top', await other.locator('.faq-q').first().innerText());
    out('faq count', await other.locator('main p.small.muted').last().innerText());
    await admin.goto(base + '/admin/surveys'); await admin.waitForTimeout(2000);
    await admin.getByRole('tab', { name: 'FAQ' }).click(); await admin.waitForTimeout(2000);
    out('admin faq rows', await admin.locator('[role=tabpanel] .list-row').count());
  });

  out('PAGE ERRORS', errs);
  await browser.close();
})();
