import { test, expect } from '@playwright/test';
import { mockSeedStoryApi } from './fixtures/mockApi';

test.describe('Advanced Observability', () => {
    test.beforeEach(async ({ page }) => {
        await mockSeedStoryApi(page);
    });

    test('should render nested spans correctly', async ({ page }) => {
        // Navigate to a trace
        // Verify indentation style or hierarchy
        // const span = page.locator('.span-row');
        // await expect(span).toHaveCSS('padding-left', /.+/); // rough check
    });

    test('should separate reasoning channels', async ({ page }) => {
        // Check for specific "Reasoning" tab or section in Trace Detail
    });
});
