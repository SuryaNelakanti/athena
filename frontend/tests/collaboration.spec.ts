import { test, expect } from '@playwright/test';
import { mockSeedStoryApi } from './fixtures/mockApi';

test.describe('Collaboration Features', () => {
    test.beforeEach(async ({ page }) => {
        await mockSeedStoryApi(page);
    });

    test('should assign a log to a user', async ({ page }) => {
        await page.goto('/#/logs');
        await page.click('tr >> text=trace_id_'); // Click a row with trace

        // Wait for detail panel
        await expect(page.locator('.animate-slide-in-right')).toBeVisible();

        // Click assign button (using aria-label added in TraceDetail.tsx)
        await page.click('button[aria-label="Assign"]');

        // Fill assignee email in modal
        await page.fill('input[placeholder="name@company.com"]', 'user@example.com');

        // Click Create
        await page.click('button:has-text("Create")');

        // Verify success message
        await expect(page.locator('text=Assignment created')).toBeVisible();
    });
});
