# Playwright integration tests

These tests run against the repo-level dev stack (`npm run dev --prefix ..`), which launches both the Vite frontend (port `4173` in CI) and the FastAPI backend. By default, the browser requests are intercepted with mocks instead of calling the real backend API so the suite stays deterministic. The mocks intentionally mirror the personas and refund scenarios defined in `backend/scripts/seed_story.py` so that UI expectations stay aligned with the seeded demo data.

- `fixtures/seedStoryData.ts` contains the refund-focused project, traces, and logs that mirror the seed script story beats.
- `fixtures/mockApi.ts` wires Playwright `page.route` handlers to return the seed data for `/projects`, `/traces`, `/views`, and `/aql/query` requests.
- Tests live alongside the fixtures in this folder and can be extended by adding more seed data or route handlers.

Run the suite with:

```
npm run test:e2e --prefix frontend
```

To exercise the real API responses instead of mocks, start the suite with `E2E_USE_LIVE_API=1`—the web server will still boot the backend so either path works.
