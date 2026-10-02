/**
 * Playwright Tests for Athena SDK Examples
 *
 * Tests the TypeScript HTML examples (chat.html, dashboard.html).
 * Python Streamlit apps would require a subprocess to start them.
 */
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXAMPLES_DIR = resolve(__dirname, '../../examples/typescript');

test.describe('Athena SDK Examples', () => {

    test.describe('Web Chat (chat.html)', () => {

        test.beforeEach(async ({ page }) => {
            await page.goto(`file://${join(EXAMPLES_DIR, 'chat.html')}`);
        });

        test('page loads with correct branding', async ({ page }) => {
            // Check header
            await expect(page.locator('.logo')).toContainText('Athena');
            await expect(page.locator('.logo')).toContainText('Chat');

            // Check status badge
            await expect(page.locator('.status-badge')).toBeVisible();

            // Check input area
            await expect(page.locator('#chatInput')).toBeVisible();
            await expect(page.locator('#sendBtn')).toBeVisible();
        });

        test('displays initial assistant message', async ({ page }) => {
            const messages = page.locator('.message');
            await expect(messages).toHaveCount(1);
            await expect(messages.first()).toContainText('Hello');
        });

        test('can type in chat input', async ({ page }) => {
            const input = page.locator('#chatInput');
            await input.fill('Test message');
            await expect(input).toHaveValue('Test message');
        });

        test('sidebar configuration is present', async ({ page }) => {
            await expect(page.locator('#baseUrl')).toHaveValue('http://localhost:8000');
            await expect(page.locator('#model')).toBeVisible();
            await expect(page.locator('#streamToggle')).toBeChecked();
        });

        test('send button triggers message send', async ({ page }) => {
            const input = page.locator('#chatInput');
            const sendBtn = page.locator('#sendBtn');

            await input.fill('Hello!');
            await sendBtn.click();

            // User message should appear
            const userMessage = page.locator('.message.user');
            await expect(userMessage).toBeVisible();
            await expect(userMessage).toContainText('Hello!');

            // Input should be cleared
            await expect(input).toHaveValue('');
        });

        test('has pink accent color theme', async ({ page }) => {
            // Check CSS variable is set correctly
            const accent = await page.evaluate(() => {
                return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
            });
            expect(accent).toBe('#EC4899');
        });
    });

    test.describe('Dashboard (dashboard.html)', () => {

        test.beforeEach(async ({ page }) => {
            await page.goto(`file://${join(EXAMPLES_DIR, 'dashboard.html')}`);
        });

        test('page loads with correct branding', async ({ page }) => {
            await expect(page.locator('.logo')).toContainText('Athena');
            await expect(page.locator('.logo')).toContainText('Dashboard');
        });

        test('displays metric cards', async ({ page }) => {
            const metricCards = page.locator('.metric-card');
            await expect(metricCards).toHaveCount(4);

            // Check metric labels
            await expect(page.locator('#totalLogs').locator('..')).toContainText('Total Logs');
            await expect(page.locator('#totalTokens').locator('..')).toContainText('Total Tokens');
            await expect(page.locator('#totalCost').locator('..')).toContainText('Cost');
            await expect(page.locator('#avgLatency').locator('..')).toContainText('Latency');
        });

        test('has configuration inputs', async ({ page }) => {
            await expect(page.locator('#baseUrl')).toHaveValue('http://localhost:8000');
            await expect(page.locator('#projectId')).toHaveValue('proj_default');
        });

        test('has refresh button', async ({ page }) => {
            const refreshBtn = page.locator('.refresh-btn');
            await expect(refreshBtn).toBeVisible();
            await expect(refreshBtn).toContainText('REFRESH');
        });

        test('displays chart sections', async ({ page }) => {
            await expect(page.locator('#modelChart')).toBeVisible();
            await expect(page.locator('#statusChart')).toBeVisible();
        });

        test('displays logs table', async ({ page }) => {
            const table = page.locator('.logs-table');
            await expect(table).toBeVisible();

            // Check table headers
            await expect(table.locator('th')).toContainText(['Timestamp', 'Model', 'Tokens', 'Latency', 'Status', 'Trace ID']);
        });

        test('has amber accent color theme', async ({ page }) => {
            const accent = await page.evaluate(() => {
                return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
            });
            expect(accent).toBe('#F59E0B');
        });
    });

    test.describe('Theme Verification', () => {

        test('chat.html uses IBM Plex Mono font', async ({ page }) => {
            await page.goto(`file://${join(EXAMPLES_DIR, 'chat.html')}`);

            const fontFamily = await page.evaluate(() => {
                return getComputedStyle(document.body).fontFamily;
            });
            expect(fontFamily).toContain('IBM Plex Mono');
        });

        test('dashboard.html uses IBM Plex Mono font', async ({ page }) => {
            await page.goto(`file://${join(EXAMPLES_DIR, 'dashboard.html')}`);

            const fontFamily = await page.evaluate(() => {
                return getComputedStyle(document.body).fontFamily;
            });
            expect(fontFamily).toContain('IBM Plex Mono');
        });

        test('both examples have brutalist borders', async ({ page }) => {
            // Chat
            await page.goto(`file://${join(EXAMPLES_DIR, 'chat.html')}`);
            let borderColor = await page.evaluate(() => {
                return getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
            });
            expect(borderColor).toBe('#0C0C0C');

            // Dashboard
            await page.goto(`file://${join(EXAMPLES_DIR, 'dashboard.html')}`);
            borderColor = await page.evaluate(() => {
                return getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
            });
            expect(borderColor).toBe('#0C0C0C');
        });
    });
});
