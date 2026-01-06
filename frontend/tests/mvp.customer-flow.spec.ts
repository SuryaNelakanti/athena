import { expect, test, type Page } from '@playwright/test';
import { mockSeedStoryApi } from './fixtures/mockApi';
import {
  seedLogs,
  seedTraces,
  seedDatasets,
  seedReviews,
  seedExperiments,
} from './fixtures/seedStoryData';

const modalByTitle = (page: Page, title: string) =>
  page
    .getByRole('heading', { name: title })
    .first()
    .locator('..')
    .locator('..')
    .locator('..');

test.beforeEach(async ({ page }) => {
  await mockSeedStoryApi(page);
});

test('dashboard supports AQL chart preview and save', async ({ page }) => {
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.getByRole('button', { name: /Add Chart/i }).click();
  await expect(page.getByText('Chart Builder')).toBeVisible();
  await page.getByRole('button', { name: 'AQL' }).click();

  await page.getByPlaceholder('e.g. Token usage over time').fill('MVP Tokens');
  await page
    .getByPlaceholder('AQL query (ex: from project_logs(project_id="...") select timestamp, total_tokens)')
    .fill(`from project_logs(project_id="${seedDatasets[0].project_id}") select timestamp, total_tokens sort timestamp asc limit 5`);

  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByText('Generated AQL')).toBeVisible();

  await page.getByRole('button', { name: /Save Chart/i }).click();
  await expect(page.getByText('MVP Tokens')).toBeVisible();
});

test('logs to trace collaboration, share links, review, and promote', async ({ page }) => {
  await page.goto('/#/logs');
  await expect(page.getByText(seedLogs[1].message)).toBeVisible();

  await page.getByText(seedLogs[1].message).click();
  await expect(page.getByRole('heading', { name: seedTraces[1].root_span.name }).first()).toBeVisible();

  await page.getByTitle('Assign').click();
  const assignModal = modalByTitle(page, 'Create assignment');
  await assignModal.getByPlaceholder('name@company.com').fill('owner@acme.ai');
  await assignModal.getByRole('button', { name: 'Create' }).click();
  await expect(assignModal.getByText('Assignment created.')).toBeVisible();
  await assignModal.getByRole('button', { name: 'Cancel' }).click();

  await page.getByTitle('Mention').click();
  const mentionModal = modalByTitle(page, 'Create mention');
  await mentionModal.getByPlaceholder('name@company.com').fill('qa@acme.ai');
  await mentionModal.getByRole('button', { name: 'Create' }).click();
  await expect(mentionModal.getByText('Mention created.')).toBeVisible();
  await mentionModal.getByRole('button', { name: 'Cancel' }).click();

  await page.getByTitle('Share').click();
  const shareModal = modalByTitle(page, 'Create share link');
  await shareModal.getByRole('button', { name: 'Create' }).click();
  await expect(shareModal.getByText('Share link created.')).toBeVisible();
  const shareUrl = await shareModal.locator('span.font-mono').innerText();
  await shareModal.getByRole('button', { name: 'Cancel' }).click();

  await page.goto(shareUrl);
  await expect(page.getByRole('heading', { name: seedTraces[1].root_span.name }).first()).toBeVisible();

  await page.getByRole('main').getByRole('button', { name: 'Review' }).click();
  await expect(page.getByText('Sent to review queue')).toBeVisible();

  await page.getByRole('button', { name: 'Good' }).click();
  await page
    .locator('label', { hasText: 'Select Dataset' })
    .locator('..')
    .locator('select')
    .selectOption(seedDatasets[0].id);
  await page.getByRole('button', { name: 'Add as Gold' }).click();
  await expect(page.getByText('Added as gold example!')).toBeVisible();
});

test('review queue promotes to dataset and dataset rows update', async ({ page }) => {
  await page.goto('/#/review');
  await expect(page.getByText(seedReviews[0].meta.input_preview).first()).toBeVisible();

  const statusCard = page.getByText('Update review state').locator('..').locator('..');
  await statusCard.getByRole('combobox').selectOption('in_review');

  const promoteCard = page.getByRole('main').getByText('Promote to Dataset').locator('..').locator('..');
  const datasetSelect = promoteCard.getByText('Dataset').locator('..').getByRole('combobox');
  await expect(datasetSelect).toContainText(seedDatasets[0].name);
  await datasetSelect.selectOption({ label: seedDatasets[0].name });
  await promoteCard.getByRole('button', { name: 'Promote' }).click();
  await expect(page.getByText(`Promoted to dataset ${seedDatasets[0].id}`)).toBeVisible();

  await page.goto('/#/datasets');
  await page.getByText(seedDatasets[0].name).click();
  await expect(page.getByText(seedReviews[0].meta.input_preview).first()).toBeVisible();

  await page.getByRole('button', { name: 'Add Eval Row' }).click();
  await page.getByPlaceholder('What question or prompt should be given to the AI?').fill('New refund prompt');
  await page.getByPlaceholder("What's the correct response?").fill('Provide refund steps.');
  await page.getByRole('button', { name: 'Add Gold Example' }).click();
  await expect(page.getByText('New refund prompt')).toBeVisible();
});

test('experiments run, compare, and share results', async ({ page }) => {
  await page.goto('/#/experiments');
  await page.getByText(seedExperiments[0].name).click();
  await expect(page.getByRole('heading', { name: seedExperiments[0].name })).toBeVisible();

  await page.getByRole('button', { name: 'Run Experiment' }).click();
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
  await expect(page.getByText('Auto output').first()).toBeVisible();

  await page.getByRole('button', { name: 'Compare Runs' }).click();
  await expect(page.getByText('avg_score')).toBeVisible();

  await page
    .getByRole('button', { name: /Customer charged twice for seat add-on/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Share result' }).click();
  const shareModal = modalByTitle(page, 'Share Result');
  const resultShareUrl = await shareModal.locator('input').inputValue();
  await shareModal.getByRole('button', { name: 'Close' }).filter({ hasText: 'Close' }).click();

  await page.goto(resultShareUrl);
  await expect(page.getByRole('heading', { name: seedExperiments[0].name })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
});

test('collaboration lists assignments, mentions, and share links', async ({ page }) => {
  await page.goto('/#/collaboration');
  await expect(page.getByRole('heading', { name: 'Collaboration' })).toBeVisible();
  await expect(page.getByText('ops@octoworks.ai')).toBeVisible();

  await page.getByRole('button', { name: 'Mentions' }).click();
  await expect(page.getByText('pm@octoworks.ai')).toBeVisible();

  await page.getByRole('button', { name: 'Share Links' }).click();
  await expect(page.getByText('share_refund_trace')).toBeVisible();
});
