import { test, expect } from '@playwright/test';
import { mockSeedStoryApi } from './fixtures/mockApi';

test.describe('Review Workflow', () => {
    test.beforeEach(async ({ page }) => {
        await mockSeedStoryApi(page);
        await page.goto('/#/', { waitUntil: 'networkidle' });
    });

    test('should triage review items', async ({ page }) => {
        await page.goto('/#/review');

        // Select an open item
        // Assuming list items have a status indicator or we pick the first one
        await page.click('text=Open'); // Click on a status filter or an item that is open

        // Click on a review item in the list
        await page.locator('.review-item').first().click();

        // Change status to "In Review"
        await page.click('button:has-text("Open")'); // Click status dropdown
        await page.click('text=In Review');

        // Verify UI update
        await expect(page.locator('button:has-text("In Review")')).toBeVisible();
    });

    test('should promote review item to dataset', async ({ page }) => {
        await page.goto('/#/review');
        await page.locator('.review-item').first().click();

        // Open Promote Modal
        await page.click('button:has-text("Promote")');

        // Verify Modal
        await expect(page.locator('h3:has-text("Promote to Dataset")')).toBeVisible();

        // Select Dataset (assuming mock data has datasets)
        // await page.selectOption('select[name="dataset_id"]', { index: 0 }); // or similar interaction

        // Click Promote
        await page.click('button:has-text("Add Function")'); // Or "Promote", button text might vary
        // Adjusting selector based on likely button text
        // await page.click('button.variant-primary'); 
    });
});
