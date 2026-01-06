import { expect, test } from '@playwright/test';
import { mockSeedStoryApi } from './fixtures/mockApi';
import { seedLogs, seedProject } from './fixtures/seedStoryData';

test.beforeEach(async ({ page }) => {
  await mockSeedStoryApi(page);
});

test('renders refund incident logs from the seed story mocks', async ({ page }) => {
  await page.goto('/#/logs');

  await expect(page.getByText(seedLogs[0].message)).toBeVisible();
  await expect(page.getByText(seedLogs[1].message)).toBeVisible();

  await expect(page.locator('span').filter({ hasText: /guardrail/i }).first()).toBeVisible();
  await expect(page.locator('span').filter({ hasText: /compliance/i }).first()).toBeVisible();

  await expect(page.locator('span').filter({ hasText: /^SUCCESS$/ })).toBeVisible();
  await expect(page.locator('span').filter({ hasText: /^ERROR$/ })).toBeVisible();

  await expect(page.getByText('Parent 1')).toBeVisible();
  await expect(page.locator('span').filter({ hasText: /^Child$/ }).first()).toBeVisible();
});

test('applies the quick error filter to show only escalated refund traces', async ({ page }) => {
  await page.goto('/#/logs');

  await page.getByRole('button', { name: 'Errors' }).click();

  await expect(page.getByText(seedLogs[1].message)).toBeVisible();
  await expect(page.getByText(seedLogs[0].message)).not.toBeVisible();
});
