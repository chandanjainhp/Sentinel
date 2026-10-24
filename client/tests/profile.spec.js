// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Profile page — single-sidebar refactor.
 *
 * The old /profile rendered its own 300px left identity panel alongside
 * the main 256px project sidebar, so /profile had two sidebars. The
 * refactor moves all identity info into the main content area as a card.
 *
 * Without a backend, /profile will redirect to /login if the user query
 * fails. To test the rendered layout we mock the auth cookie + localStorage
 * user so the page renders without needing the API.
 */

const VIEWPORTS = {
  'mobile-375': { width: 375, height: 667 },
  'tablet-768': { width: 768, height: 1024 },
  'desktop-1280': { width: 1280, height: 800 },
};

const FAKE_USER = {
  username: 'maya_ops',
  email: 'maya@sentinel.io',
  createdAt: '2024-01-15T09:30:00.000Z',
};

async function seedAuth(context) {
  // Set the auth cookie + localStorage user so the profile page renders.
  await context.addCookies([
    {
      name: 'ridgeway_auth',
      value: '1',
      domain: 'localhost',
      path: '/',
    },
  ]);
  await context.addInitScript((user) => {
    try {
      localStorage.setItem('ridgeway_user', JSON.stringify(user));
    } catch (e) {
      /* noop */
    }
  }, FAKE_USER);
}

for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  test(`Profile @ ${vpName} — single sidebar, no duplicate`, async ({ page, context }) => {
    await seedAuth(context);
    await page.setViewportSize(vp);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    // Single main sidebar must exist.
    await expect(page.locator('#sentinel-sidebar')).toBeAttached();

    // There must NOT be any leftover profile-specific aside that doubles as
    // a second sidebar. The old layout used <aside> inline; the new layout
    // has none — identity info lives in a card inside <main>.
    const profileAsideCount = await page.locator('main aside').count();
    expect(profileAsideCount).toBe(0);

    // Identity card is visible (avatar + name + email).
    // The email also appears in the Account Information table below, so use
    // .first() to match the identity card specifically.
    await expect(page.getByText(FAKE_USER.email).first()).toBeVisible();
    await expect(page.getByText('maya_ops').first()).toBeVisible();

    // Heading present.
    await expect(page.getByRole('heading', { name: /your profile/i })).toBeVisible();

    // Three sections exist (use heading role to disambiguate from
    // "Active session" sublabel that also contains the word "session").
    await expect(page.getByRole('heading', { name: 'Account Information' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Change Password' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Session' })).toBeVisible();

    // No horizontal overflow > 32px.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth - clientWidth).toBeLessThanOrEqual(32);
  });

  test(`Profile @ ${vpName} — password form has show/hide toggles`, async ({ page, context }) => {
    await seedAuth(context);
    await page.setViewportSize(vp);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    // Three password fields exist.
    const currentInput = page.locator('#pw-current');
    const nextInput = page.locator('#pw-next');
    const confirmInput = page.locator('#pw-confirm');

    await expect(currentInput).toBeVisible();
    await expect(nextInput).toBeVisible();
    await expect(confirmInput).toBeVisible();

    // All three should have type=password by default.
    await expect(currentInput).toHaveAttribute('type', 'password');
    await expect(nextInput).toHaveAttribute('type', 'password');
    await expect(confirmInput).toHaveAttribute('type', 'password');

    // Click the show/hide toggle on the current password — should flip to text.
    await page.locator('#pw-current')
      .locator('xpath=ancestor::div[1]')
      .getByRole('button', { name: /show password/i })
      .click();
    await expect(currentInput).toHaveAttribute('type', 'text');
  });

  test(`Profile @ ${vpName} — strength meter updates with new password`, async ({ page, context }) => {
    await seedAuth(context);
    await page.setViewportSize(vp);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    // Type a weak password — meter should appear with "Weak".
    await page.locator('#pw-next').fill('abc');
    // Wait for React to re-render after the input change.
    await page.waitForTimeout(200);
    await expect(page.getByText('Weak', { exact: true })).toBeVisible({ timeout: 5000 });

    // Type a strong password — meter should update to Good or Strong.
    await page.locator('#pw-next').fill('StrongPass123!');
    await page.waitForTimeout(200);
    // Strength: 1 (non-empty) + 1 (8+) + 1 (12+) + 1 (A-Z) + 1 (0-9) + 1 (!special) = 6, capped at 5 = "Strong"
    await expect(
      page.getByText('Strong', { exact: true }).or(page.getByText('Good', { exact: true }))
    ).toBeVisible({ timeout: 5000 });
  });

  test(`Profile @ ${vpName} — empty submit shows validation errors`, async ({ page, context }) => {
    await seedAuth(context);
    await page.setViewportSize(vp);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    // Click Update Password with empty form.
    await page.getByRole('button', { name: /update password/i }).click();

    // Three validation errors should appear.
    await expect(page.getByText('Current password is required.')).toBeVisible();
    await expect(page.getByText('New password is required.')).toBeVisible();
    await expect(page.getByText('Please confirm your new password.')).toBeVisible();
  });

  test(`Profile @ ${vpName} — sign-out button present`, async ({ page, context }) => {
    await seedAuth(context);
    await page.setViewportSize(vp);
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    const signOutBtn = page.getByRole('button', { name: /^sign out$/i });
    await expect(signOutBtn).toBeVisible();
  });
}

// Functional test: form validation rejects mismatched passwords.
test('Profile — mismatched passwords show error', async ({ page, context }) => {
  await seedAuth(context);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/profile');
  await page.waitForLoadState('networkidle');

  await page.locator('#pw-current').fill('somecurrentpass');
  await page.locator('#pw-next').fill('NewPass123');
  await page.locator('#pw-confirm').fill('DifferentPass456');
  await page.getByRole('button', { name: /update password/i }).click();

  await expect(page.getByText('Passwords do not match.')).toBeVisible();
});
