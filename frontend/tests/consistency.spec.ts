import { test, expect } from '@playwright/test';
import { mockSeedStoryApi } from './fixtures/mockApi';

test.describe('Data Consistency', () => {
    test.beforeEach(async ({ page }) => {
        await mockSeedStoryApi(page);
    });

    test('should maintain experiment version consistency when dataset updates', async ({ page }) => {
        // This is a complex state test.
        // 1. Create Exp v1 with Dataset v1
        // 2. Update Dataset to v2
        // 3. Verify Exp v1 still shows metrics for Dataset v1

        // We'll simulate this by mocking specific responses for specific endpoints
    });
});
