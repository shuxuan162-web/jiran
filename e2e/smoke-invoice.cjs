// Invoice privacy check on the live site: management attaches a PDF to a test bill; the unit owner opens it through a
// short-lived signed link; another owner's storage request for the same file is refused. The test bill is voided after.
const { chromium } = require('playwright');
const base = process.argv[2] && process.argv[2].startsWith('http') ? process.argv[2] : 'https://jiran-elmina.vercel.app';
const pdf = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
(async () => {
  const b = await chromium.launch();
  const login = async (email, staff, wide) => {
    const c = await b.newContext({ viewport: wide ? { width: 1300, height: 950 } : { width: 400, height: 860 } }); const p = await c.newPage();
    p.on('dialog', (d) => d.accept('Invoice link test'));
    await p.goto(base + (staff ? '/admin/login' : '/login/owner'));
    await p.fill('input[type=email]', email); await p.fill('input[type=password]', 'JiranDemo2026!'); await p.keyboard.press('Enter'); await p.waitForTimeout(5000); return p;
  };
  const a = await login('admin@jiran.example.com', true, true);
  const o = await login('lakewalker@jiran.example.com');
  const k = await login('kopikaki@jiran.example.com');
  await a.goto(base + '/admin/billing'); await a.waitForTimeout(3000);
  console.log('admin menu has Surveys and FAQ:', (await a.locator('.admin-side nav').innerText()).includes('Surveys and FAQ'));
  await a.getByRole('button', { name: '+ Add bill' }).click();
  await a.getByPlaceholder('Type part of the unit').fill('Elmina Green · No. 4'); await a.waitForTimeout(1500); await a.getByRole('option').first().click();
  await a.getByLabel('Period').fill('Invoice link test (smoke test)'); await a.getByLabel('Amount (RM)').fill('1.00');
  await a.getByLabel('Due date').fill(new Date(Date.now() + 8 * 3600000 + 20 * 86400000).toISOString().slice(0, 10));
  await a.getByRole('button', { name: 'Save' }).first().click(); await a.waitForTimeout(3000);
  const row = a.locator('tr', { hasText: 'Invoice link test' });
  const [ch] = await Promise.all([a.waitForEvent('filechooser'), row.getByRole('button', { name: 'Attach invoice' }).click()]);
  await ch.setFiles({ name: 'inv.pdf', mimeType: 'application/pdf', buffer: pdf }); await a.waitForTimeout(3000);
  await o.goto(base + '/app/billing'); await o.waitForTimeout(3000);
  const [pop] = await Promise.all([o.waitForEvent('popup'), o.locator('.bill', { hasText: 'Invoice link test' }).getByRole('button', { name: 'View invoice' }).click()]);
  await pop.waitForURL(/object\/sign\/invoices\//, { timeout: 15000 }).catch(() => {});
  const u = pop.url();
  const r = u.includes('/object/sign/invoices/') ? await o.request.get(u) : null;
  console.log('owner opens invoice:', r ? `HTTP ${r.status()} ${r.headers()['content-type']} starts ${(await r.body()).slice(0, 5).toString()}` : u.slice(0, 100));
  // Another owner asks storage directly for a signed link to the same file: refused by the storage rules
  const path = decodeURIComponent((u.split('/object/sign/invoices/')[1] ?? '').split('?')[0]);
  const supa = u.split('/storage/v1/')[0];
  const other = await k.evaluate(async ({ supa, path }) => {
    const key = Object.keys(localStorage).find((x) => x.includes('auth-token'));
    const tok = key ? JSON.parse(localStorage.getItem(key)).access_token : null;
    const apikey = (window.__jiranAnonKey) || '';
    const res = await fetch(`${supa}/storage/v1/object/sign/invoices/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, apikey, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 60 }) });
    return `${res.status} ${(await res.text()).slice(0, 80)}`;
  }, { supa, path });
  console.log('other owner asks for the same file:', other);
  await row.getByRole('button', { name: 'Void' }).click(); await a.waitForTimeout(2500);
  console.log('cleanup:', (await a.locator('.banner').allInnerTexts()).join(' | '));
  await b.close();
})();
