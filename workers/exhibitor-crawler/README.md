# HELIO generic browser extraction worker (experimental)

This standalone worker is not connected to the CRM and does not write to Supabase. It uses Playwright and Crawlee to render a public exhibitor directory, inspect profile links and follow a bounded set of explicit numbered pagination links. It is deliberately conservative: it does not claim complete coverage or edition verification.

## Install (in this directory)
```bash
npm install
npx playwright install chromium
npm run crawl -- https://example.org/exhibitors 2026
```

Only run on an organizer-approved public directory after verifying access terms and the correct edition. Output: `exhibitor-candidates-review.json` for review, never direct import.

Limitations: no automatic search-engine discovery, PDF parsing, platform API authentication, CAPTCHA bypass, or email harvesting. Some websites will need a dedicated, authorized adapter. Do not pass untrusted URLs. A production worker must enforce network egress restrictions (including DNS rebinding and browser subresource requests) before accepting user-supplied URLs.

## Integration and cleanup decisions

Reviewed against the uploaded helio_leadgen.zip Python prototype. Reuse its bounded pagination, Load More, profile queue, extraction, verification and export concepts. Do **not** install its Streamlit UI, SQLite CRM or automatic SMTP outreach alongside HELIO's existing Next.js/Supabase stack. Keep marketing campaigns approval-based and compliant with suppression/unsubscribe rules.

This worker is a standalone prototype, not yet invoked by the HELIO UI. It extracts candidate names, profile URLs and up to 25 profile descriptions/websites; it does not currently enrich contact emails, use an LLM, parse PDFs, persist jobs, or discover venue calendars. A passing Next.js build does not validate the worker. Run its own install and crawl test separately. No data has been deleted from Supabase.

**Security:** The prototype is suitable only for manually reviewed, organizer-approved sources in a trusted environment. DNS checks alone do not protect against browser subresource requests or DNS rebinding. Before production or automatic scheduling, enforce outbound network policy, strict robots/terms handling, rate limits and edition proof.
