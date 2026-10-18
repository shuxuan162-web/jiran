// Phase 5 smoke test against the live URL (npm i playwright; node e2e/smoke-phase5.cjs).
// Uses the phase 4 demo event "Drop-in coffee morning (demo, open now)" (run seed_phase4.sql first).
const { chromium } = require('playwright');
const base = 'https://jiran-elmina.vercel.app';
const out = (k, v) => console.log(`${k}: ${String(typeof v === 'string' ? v : JSON.stringify(v)).replace(/\s+/g, ' ').slice(0, 300)}`);
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const login = async (email) => {
    const c = await b.newContext({ viewport: { width: 400, height: 860 } }); const p = await c.newPage();
    p.on('pageerror', (e) => errs.push(`${email}: ${e.message}`));
    await p.goto(base + '/login/owner');
    await p.fill('input[type=email]', email); await p.fill('input[type=password]', 'JiranDemo2026!');
    await p.keyboard.press('Enter'); await p.waitForTimeout(5000); return p;
  };
  const step = async (name, fn) => { try { await fn(); } catch (e) { out(`FAIL ${name}`, e.message.split('\n')[0]); } };
  const B = await login('kopikaki@jiran.example.com');
  const A = await login('cyclingauntie@jiran.example.com');

  await step('rewards page', async () => {
    await B.goto(base + '/app/rewards'); await B.waitForTimeout(4000);
    out('hero', await B.locator('.rewards-hero').innerText());
    out('quests', (await B.locator('.quest-row').allInnerTexts()).join(' || '));
    out('badges earned', await B.locator('.badge.got').count());
    out('leaderboard', (await B.locator('.leaderboard li').allInnerTexts()).slice(0, 4).join(' || '));
    out('history rows', await B.locator('.list-row').filter({ hasText: 'XP' }).count());
  });
  await step('event check-in by code + XP toast', async () => {
    await B.goto(base + '/app/events'); await B.waitForTimeout(3000);
    await B.locator('.event-card', { hasText: 'Drop-in coffee morning' }).first().click(); await B.waitForTimeout(3000);
    if (await B.getByText("You're checked in").count()) { out('checkin', 'already checked in earlier'); return; }
    await B.getByRole('button', { name: 'Use a code instead' }).click();
    await B.getByLabel('Check-in code').fill('135790');
    await B.getByRole('button', { name: 'Check in', exact: true }).click();
    const toast = await B.locator('.xp-toast').first().innerText({ timeout: 8000 }).catch(() => 'no toast');
    out('checkin banner', (await B.locator('.banner').allInnerTexts()).join(' | '));
    out('xp toast', toast);
  });
  await step('upvote XP (A)', async () => {
    await A.goto(base + '/app/issues'); await A.waitForTimeout(3500);
    const cards = A.locator('.issue-card');
    for (let i = 0; i < Math.min(8, await cards.count()); i++) {
      await A.goto(base + '/app/issues'); await A.waitForTimeout(2500);
      await A.locator('.issue-card').nth(i).click(); await A.waitForTimeout(2500);
      const up = A.getByRole('button', { name: /^Upvote/ });
      if (await up.count() && await up.first().isEnabled()) {
        await up.first().click();
        out('upvote toast', await A.locator('.xp-toast').first().innerText({ timeout: 8000 }).catch(() => 'no xp toast (daily cap or own report)'));
        return;
      }
    }
    out('upvote', 'no issue left to upvote');
  });
  await step('character editor', async () => {
    await A.goto(base + '/app/profile/character'); await A.waitForTimeout(3000);
    await A.getByRole('tab', { name: 'Extras' }).click();
    out('locked extras', (await A.locator('.item.locked').allInnerTexts()).join(', '));
    out('crown disabled', await A.locator('.item', { hasText: 'Level 6' }).isDisabled());
    await A.getByRole('tab', { name: 'Hair' }).click();
    await A.locator('.item', { hasText: 'Tudung' }).click();
    await A.getByRole('button', { name: 'Save' }).click(); await A.waitForTimeout(3500);
    out('after save url', A.url());
    await A.goto(base + '/app/profile'); await A.waitForTimeout(3000);
    out('profile svg avatar', await A.locator('.avatar-svg svg').count());
    out('level chip', await A.locator('.level-chip').first().innerText());
  });
  await step('support numbers', async () => {
    await B.goto(base + '/app/residence'); await B.waitForTimeout(3500);
    const card = B.locator('.support-card'); await card.scrollIntoViewIfNeeded();
    out('support', await card.innerText());
    out('tel links', (await card.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))).join(', '));
    out('quests card', await B.locator('a.card', { hasText: 'quests' }).first().innerText().catch(() => 'missing'));
    await B.screenshot({ path: 'residence-bottom.png' });
  });
  await step('map shows characters', async () => {
    await B.goto(base + '/app/map'); await B.waitForTimeout(5000);
    out('map svg avatars', await B.locator('.map-avatar.has-svg').count());
    out('topbar avatar svg', await B.locator('header .avatar-svg').count());
  });
  // put CyclingAuntie's character back to the seeded look
  await step('restore A character', async () => {
    await A.goto(base + '/app/profile/character'); await A.waitForTimeout(2500);
    await A.getByRole('tab', { name: 'Hair' }).click(); await A.locator('.item', { hasText: 'Bun' }).click();
    await A.getByRole('button', { name: 'Save' }).click(); await A.waitForTimeout(2500);
  });
  out('ERRORS', errs);
  await b.close();
})();
