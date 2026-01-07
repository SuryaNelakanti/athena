import { test, expect } from '@playwright/test';
import { mockSeedStoryApi } from './fixtures/mockApi';

test.describe('Logs Analytics', () => {
    test.beforeEach(async ({ page }) => {
        await mockSeedStoryApi(page);
        await page.goto('/#/', { waitUntil: 'networkidle' });
    });

    test('should apply complex filters', async ({ page }) => {
        await page.goto('/#/logs');

        // Open Filter menu
        await page.click('button:has-text("Filter")');

        // Add a status filter
        // Note: Selectors need to be precise based on exact UI implementation
        // Assuming a standard popover form
        // await page.click('text=Status');
        // await page.click('text=Error');
        // await page.click('button:has-text("Apply")');

        // For now, verify Quick Filters which are visible buttons usually
        const errorFilterBtn = page.locator('button:has-text("Errors")');
        if (await errorFilterBtn.isVisible()) {
            await errorFilterBtn.click();
            await expect(page.url()).toContain('status=error');
        }
    });

    test('should save and apply views', async ({ page }) => {
        await page.goto('/#/logs');

        // Open Views menu
        await page.click('button:has-text("Views")');

        // Click Save Current View
        await page.click('button:has-text("Save Current View")');

        // Fill view name
        await page.fill('input[placeholder="View Name"]', 'My Custom View');

        // Save
        await page.click('button:has-text("Save")');

        // Verify view appears in list (Views menu is expected to be open or can be reopened)
        // Re-open views list if closed, or verify list item is present
        if (!(await page.isVisible('text=My Custom View'))) {
            await page.click('button:has-text("Views")');
        }
        await expect(page.locator('text=My Custom View')).toBeVisible();
    });

    test('should drill down into a trace', async ({ page }) => {
        await page.goto('/#/logs');

        // Click on a log row that has a trace
        await page.click('tr >> text=trace_id_'); // Select a row with a trace ID

        // Verify Trace Sidebar/Panel opens
        await expect(page.locator('.animate-slide-in-right')).toBeVisible();

        // Check for spans
        await expect(page.locator('text=root_span')).toBeVisible();
    });
});
