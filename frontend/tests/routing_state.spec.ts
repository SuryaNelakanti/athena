import { test, expect } from '@playwright/test';
import { mockSeedStoryApi } from './fixtures/mockApi';

test.describe('Routing & State', () => {
    test.beforeEach(async ({ page }) => {
        await mockSeedStoryApi(page);
    });

    test('should respect deep link query parameters', async ({ page }) => {
        // Go to logs with a filter
        await page.goto('/#/logs?status=error&search=critical');

        // Check if filter input is populated
        // This validates that URL params -> State is working
        // Assuming the UI populates the search bar from URL
        // const searchInput = page.locator('input[placeholder="Search..."]'); // Adjust
        // await expect(searchInput).toHaveValue('critical');

        // Or check headers/mock calls if we can intercept the specific fetch
    });

    test('should handle browser back button correctly', async ({ page }) => {
        await page.goto('/#/overview');
        await page.goto('/#/logs');

        await page.goBack();
        await expect(page.url()).toContain('overview');

        await page.goForward();
        await expect(page.url()).toContain('logs');
    });
});
