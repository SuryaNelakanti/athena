import { test, expect } from '@playwright/test';
import { mockSeedStoryApi } from './fixtures/mockApi';

test.describe('Experiments Feature', () => {
    test.slow(); // Mark test as slow to triple the timeout

    test.beforeEach(async ({ page }) => {
        await mockSeedStoryApi(page);
        await page.goto('/experiments', { waitUntil: 'domcontentloaded' });
    });

    test('should create a new experiment version', async ({ page }) => {
        await page.waitForTimeout(1000); // Wait for mock data to settle
        await page.click('text=Refund Quality Eval >> nth=0'); // Click first match

        // Click "New Version" (assuming button exists)
        await page.click('button:has-text("New Version")');

        // Fill version details
        await page.fill('textarea[placeholder="You are a helpful assistant..."]', 'You are a helpful assistant v2');

        // Save
        await page.click('button:has-text("Create")');

        // Verify new version is active (look for version selector or header)
        // This depends on how the UI indicates the current version.
        await expect(page.locator('text=v3')).toBeVisible();
    });

    test('should run an experiment version', async ({ page }) => {
        await page.waitForTimeout(1000);
        await page.click('text=Refund Quality Eval >> nth=0');

        // Trigger run
        // Note: mockApi needs to handle the run creation and subsequent polling/status update
        const runBtn = page.locator('button:has-text("Run Version")');
        await expect(runBtn).toBeEnabled({ timeout: 10000 });
        await runBtn.click();

        // Verify status changes to "Running" then "Completed"
        // Since we are mocking, we might see "Completed" immediately or after a mocked delay
        await expect(page.locator('text=completed').first()).toBeVisible();
    });

    test('should compare experiment runs', async ({ page }) => {
        await page.waitForTimeout(1000);
        await page.click('text=Refund Quality Eval >> nth=0');

        // Assuming there is a "Compare" tab or button
        // Based on inspection earlier, there seemed to be comparison logic.
        // If the UI is complex, we might need more specific selectors.

        // For now, let's verify we can switch versions and see diferent data
        // Select version 1
        await page.getByRole('button', { name: 'Compare' }).first().click();
        await expect(page.getByText('Baseline')).toBeVisible();
    });
});
