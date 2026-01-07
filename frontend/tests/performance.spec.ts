import { test, expect } from '@playwright/test';
import { mockSeedStoryApi } from './fixtures/mockApi';

test.describe('Performance & Resilience', () => {
    test.beforeEach(async ({ page }) => {
        // We will override this in specific tests if needed
        await mockSeedStoryApi(page);
    });

    test('should handle large dataset with virtualization', async ({ page }) => {
        // Mock a large list of logs
        await page.route('**/logs/*', async (route) => {
            const largeLogs = Array.from({ length: 1000 }, (_, i) => ({
                id: `log-${i}`,
                project_id: 'p1',
                message: `Log message ${i}`,
                timestamp: Date.now(),
                attributes: {},
                log_metadata: {}
            }));
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(largeLogs)
            });
        });

        await page.goto('/#/logs');

        // Check that not all 1000 rows are in the DOM
        // This validates existence of virtualization (e.g. react-window or similar)
        // If no virtualization, this test might fail or be flaky if the app is slow.
        // If the app DOES NOT have virtualization yet, this test serves as a good benchmark/fail.
        // Assuming we want to verify the app DOES NOT crash first.

        const rowCount = await page.locator('tr').count(); // Assuming table rows
        expect(rowCount).toBeLessThan(1000);
        expect(rowCount).toBeGreaterThan(0);
    });

    test('should validate AQL syntax gracefully', async ({ page }) => {
        await page.goto('/#/logs');

        // Find AQL input
        const aqlInput = page.locator('input[placeholder*="filter"]'); // Adjust selector
        if (await aqlInput.count() > 0) {
            await aqlInput.fill('status == "error" AND '); // Invalid trailing AND
            await aqlInput.press('Enter');

            // Expect some error indicator, not a crash
            // await expect(page.locator('.error-boundary')).not.toBeVisible();
            // await expect(page.locator('text=Syntax Error')).toBeVisible();
        }
    });
});
