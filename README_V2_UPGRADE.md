# HELIO Intelligence v2.0 — Multi-page upgrade

This package was reconstructed from the uploaded HELIO v1.8.1 archive and incorporates the latest user-provided DWTC homepage discovery scanner and v1.9 dashboard feature requirements.

## Installation

1. Back up your existing HELIO project folder and Supabase database.
2. Extract this ZIP into a NEW folder.
3. Copy your own `.env.local` from your current local HELIO project into the new folder (do not share it).
4. Run `npm install`, then `npm run build`, then `npm run dev`.
5. Sign in at `http://localhost:3000`.

## Routes

Dashboard `/`; Exhibitions `/exhibitions`; Scanner `/discovery`; Find Exhibitors `/find-exhibitors`; Lead Database `/leads`; Qualification `/qualification`; Outreach `/outreach`; Reports `/reports`; Pipeline `/pipeline`; Projects `/projects`; Email Marketing `/email-marketing`; Legacy Drafts `/campaigns`; Research `/research`.

## Data safety

No database migration is included. Existing Supabase data remains in your connected project. All existing components are reused. The Find Exhibitors page identifies saved records, offers search/filter/profile links, and opens or saves the official directory URL; it does NOT automatically scrape third-party websites. Keep bulk email sending disabled until domain verification and appropriate permission to contact leads.

## Note

The uploaded RAR may be older than your latest local working files. Compare custom local changes before replacing them; the v1.9 dashboard file was included as a text backup.
