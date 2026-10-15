# HELIO: reusable RX Global directory connections

The RX reader is read-only. A source must be bound to the correct HELIO exhibition ID, with verified edition metadata and authorized Algolia search access. Do not copy a previous year's edition ID into a new year's exhibition.

## Airport Show 2027

HELIO exhibition ID: `a0404086-3927-4707-b8fa-1383cda9ec1f`

The previously captured edition `eve-14c3658b-f854-4550-81a6-7bdca68b6ce7` is associated with **2026** and MUST NOT be used as the 2027 edition ID.

The 2027 edition ID, authorized index, app ID and search key are **not yet verified**. Do not guess them or mark the edition verified without authoritative evidence.

## Multiple exhibitions

Add a single-line JSON array to the server-only `.env.local` as `HELIO_RX_SOURCES_JSON`. Each entry uses:

```json
{
  "exhibitionId": "YOUR-HELIO-EXHIBITION-UUID",
  "directoryHost": "www.example-exhibition.com",
  "app": "AUTHORIZED_ALGOLIA_APP_ID",
  "key": "AUTHORIZED_SEARCH_ONLY_KEY",
  "index": "AUTHORIZED_INDEX",
  "edition": "eve-VERIFIED-UUID",
  "year": 2027,
  "verified": true,
  "evidenceUrl": "https://official-source.example.com/edition-metadata"
}
```

Only set `verified: true` after independently checking that the edition ID corresponds to that event and year. Use authorized search-only credentials. Never commit secrets or the real .env.local file.

Alternatively, for a single source, use existing `HELIO_RX_ALGOLIA_APP_ID`, `HELIO_RX_ALGOLIA_SEARCH_KEY`, `HELIO_RX_ALGOLIA_INDEX`, `HELIO_RX_DIRECTORY_HOST`, `HELIO_RX_EDITION_ID`, `HELIO_RX_EDITION_YEAR`, and add `HELIO_RX_EXHIBITION_ID`, `HELIO_RX_EDITION_VERIFIED=true`, `HELIO_RX_EDITION_EVIDENCE_URL`.

If not configured, automatic reading returns an informative 409 without fetching any records. Manual JSON preview continues to work. No data is written to the exhibitors table by this reader.

For other platform technologies, add a separate adapter; do not reuse RX credentials across unrelated platforms.
