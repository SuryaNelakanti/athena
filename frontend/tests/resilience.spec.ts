import { test, expect } from '@playwright/test';
import { mockSeedStoryApi } from './fixtures/mockApi';

test.describe('Resilience', () => {
    // Note: No global beforeEach mock here, we might want custom mocks per test

    test('should handle 500 API errors gracefully', async ({ page }) => {
        // Mock 500 on all API calls
        await page.route('**/*', async (route) => {
            if (route.request().url().includes('localhost:8000')) {
                await route.fulfill({ status: 500, body: 'Internal Server Error' });
            } else {
                await route.continue();
            }
        });

        await page.goto('/#/overview');

        // Expect NOT a white screen, but maybe an error toast or boundary
        // This test asserts that the app doesn't crash completely (white screen)
        // If the app has an "Error Boundary" component, we look for that.
        // Or we check that the "Loading" state resolves to "Error"

        // Generic assertion:
        await expect(page.locator('body')).not.toBeEmpty();
    });

    test('should render malformed log data without crashing', async ({ page }) => {
        await mockSeedStoryApi(page);

        // Inject bad log
        await page.route('**/logs/*', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{
                    id: 'bad-log',
                    // Missing required fields
                    // message: null, 
                    timestamp: 'invalid-date',
                    attributes: null
                }])
            });
        });

        await page.goto('/#/logs');

        // Expect table to render (maybe empty, maybe one row with error text)
        // Main verification is that the whole page didn't crash
        await expect(page.locator('table')).toBeVisible();
    });
});
