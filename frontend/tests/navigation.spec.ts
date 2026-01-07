import { test, expect } from '@playwright/test';
import { mockSeedStoryApi } from './fixtures/mockApi';

test.describe('Navigation Smoke', () => {
    test.beforeEach(async ({ page }) => {
        await mockSeedStoryApi(page);
        await page.goto('/');
    });

    test('should navigate to all implementation pages', async ({ page }) => {
        const pages = [
            { link: 'Overview', url: 'overview' },
            { link: 'Logs', url: 'logs' },
            { link: 'Datasets', url: 'datasets' },
            { link: 'Experiments', url: 'experiments' },
            { link: 'Review', url: 'review' },
            { link: 'Settings', url: 'settings' }
        ];

        for (const p of pages) {
            await page.click(`nav >> text=${p.link}`);
            await expect(page.url()).toContain(p.url);
        }
    });
});
