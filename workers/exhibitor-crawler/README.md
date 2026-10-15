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
