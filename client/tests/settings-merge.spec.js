// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Verify the settings page no longer has two sidebars — only the main
 * project sidebar exists, with Settings expandable to reveal sub-items.
 *
 * NOTE: Without a backend, /settings/* pages will still render their
 * settings shells. We're verifying the LAYOUT, not the data.
 *
 * Selector strategy: the test selectors target the SIDEBAR specifically
 * (`.sentinel-sidebar-sublink`) instead of `getByRole('link', { name })` —
 * because the hidden tab strip also contains links with the same names,
 * causing strict-mode violations. The CSS class scopes to the sidebar only.
 */

const VIEWPORTS = {
  'mobile-375': { width: 375, height: 667 },
  'tablet-768': { width: 768, height: 1024 },
  'desktop-1280': { width: 1280, height: 800 },
};

for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  test(`Settings /general @ ${vpName} — single sidebar`, async ({ page }) => {
    await page.goto('/settings/general');
    await page.waitForLoadState('networkidle');

    // The single main sidebar (id="sentinel-sidebar") must exist.
    await expect(page.locator('#sentinel-sidebar')).toBeAttached();

    // There must NOT be a leftover secondary settings sidebar.
    // The old layout used a div with className="settings-sidebar".
    const secondaryCount = await page.locator('.settings-sidebar').count();
    expect(secondaryCount).toBe(0);

    // On desktop: the sidebar subnav should be visible (auto-expanded).
    if (vp.width >= 1024) {
      // Use the .sentinel-sidebar-link selector (scoped to sidebar, not tabs).
      const settingsRow = page.locator('.sentinel-sidebar-link--has-chevron');
      await expect(settingsRow).toBeVisible();
      await expect(settingsRow).toHaveClass(/is-active/);

      // Sub-items: scoped to the sidebar subnav.
      const generalSub = page.locator('.sentinel-sidebar-sublink', { hasText: 'General' });
      const apiKeysSub = page.locator('.sentinel-sidebar-sublink', { hasText: 'API Keys' });
      const webhooksSub = page.locator('.sentinel-sidebar-sublink', { hasText: 'Webhooks' });

      await expect(generalSub).toBeVisible();
      await expect(apiKeysSub).toBeVisible();
      await expect(webhooksSub).toBeVisible();

      // General sub-item should be the active one.
      await expect(generalSub).toHaveClass(/is-active/);
      await expect(apiKeysSub).not.toHaveClass(/is-active/);
    }
  });

  test(`Settings /api-keys @ ${vpName} — subnav highlights API Keys`, async ({ page }) => {
    await page.goto('/settings/api-keys');
    await page.waitForLoadState('networkidle');

    if (vp.width >= 1024) {
      const apiKeysSub = page.locator('.sentinel-sidebar-sublink', { hasText: 'API Keys' });
      await expect(apiKeysSub).toBeVisible();
      await expect(apiKeysSub).toHaveClass(/is-active/);

      // General should NOT be active now.
      const generalSub = page.locator('.sentinel-sidebar-sublink', { hasText: 'General' });
      await expect(generalSub).not.toHaveClass(/is-active/);
    }

    // The breadcrumb at the top of the content should say "Settings / API Keys".
    if (vp.width >= 1024) {
      const breadcrumb = page.locator('.settings-breadcrumb');
      await expect(breadcrumb).toContainText('Settings');
      await expect(breadcrumb).toContainText('API Keys');
    }
  });

  test(`Settings /webhooks @ ${vpName} — single sidebar, no duplicates`, async ({ page }) => {
    await page.goto('/settings/webhooks');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#sentinel-sidebar')).toBeAttached();
    expect(await page.locator('.settings-sidebar').count()).toBe(0);

    if (vp.width >= 1024) {
      const webhooksSub = page.locator('.sentinel-sidebar-sublink', { hasText: 'Webhooks' });
      await expect(webhooksSub).toBeVisible();
      await expect(webhooksSub).toHaveClass(/is-active/);
    }
  });
}

// Functional test: clicking the chevron toggles expansion (desktop only).
test('Sidebar — Settings chevron toggles subnav (desktop)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/overview');
  await page.waitForLoadState('networkidle');

  // Initially Settings is collapsed (we're on /overview, not /settings/*).
  // Sub-items should NOT be visible.
  await expect(page.locator('.sentinel-sidebar-subnav')).toHaveCount(0);

  // Click the chevron button to expand.
  const chevron = page.locator('.sentinel-sidebar-chevron');
  await chevron.click();

  // Sub-items should now be visible.
  await expect(page.locator('.sentinel-sidebar-subnav')).toBeVisible();
  await expect(page.locator('.sentinel-sidebar-sublink', { hasText: 'General' })).toBeVisible();
  await expect(page.locator('.sentinel-sidebar-sublink', { hasText: 'API Keys' })).toBeVisible();
  await expect(page.locator('.sentinel-sidebar-sublink', { hasText: 'Webhooks' })).toBeVisible();

  // Click again to collapse.
  await chevron.click();
  await expect(page.locator('.sentinel-sidebar-subnav')).toHaveCount(0);
});

// Functional test: clicking "Settings" navigates to /settings/general AND expands.
test('Sidebar — clicking Settings row navigates + expands', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/overview');
  await page.waitForLoadState('networkidle');

  // Click the Settings row (not the chevron).
  await page.locator('.sentinel-sidebar-link--has-chevron').click();
  await page.waitForURL('**/settings/general');

  // Sub-items should now be visible because we're on /settings/*.
  await expect(page.locator('.sentinel-sidebar-subnav')).toBeVisible();

  // The General sub-item should be the active one.
  const generalSub = page.locator('.sentinel-sidebar-sublink', { hasText: 'General' });
  await expect(generalSub).toHaveClass(/is-active/);
});

// Functional test: navigates between sub-items.
test('Sidebar — subnav links navigate between settings sections', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/settings/general');
  await page.waitForLoadState('networkidle');

  // Click "API Keys" subnav.
  await page.locator('.sentinel-sidebar-sublink', { hasText: 'API Keys' }).click();
  await page.waitForURL('**/settings/api-keys');
  await page.waitForLoadState('networkidle');

  // API Keys is now active, General is not.
  await expect(page.locator('.sentinel-sidebar-sublink', { hasText: 'API Keys' })).toHaveClass(/is-active/);
  await expect(page.locator('.sentinel-sidebar-sublink', { hasText: 'General' })).not.toHaveClass(/is-active/);
});
