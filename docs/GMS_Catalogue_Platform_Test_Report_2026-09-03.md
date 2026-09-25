# GMS Catalogue Platform — Test Report

**Test date:** 03 September 2026  
**Environment:** Development workspace, Windows, Asia/Bangkok  
**Checklist:** `GMS_Catalogue_Platform_Function_Checklist.pdf` (125 checks)  
**Overall result:** **FAIL — not ready for release**

## Executive summary

The application compiles successfully and the majority of automated functional checks pass. Core authentication, access control, catalogue lifecycle, pricing, products, promotions, organization, user management, backups, public links, and media flows are healthy in automated testing.

Release is blocked by defects in Catalogue Studio preview rendering and browser-based Studio PDF export. Live browser-route verification was attempted but the local frontend/backend services did not respond, so browser-only and visual checks remain pending.

## Automated results

| Test area | Result | Evidence |
|---|---:|---|
| Frontend production build and TypeScript | PASS | Next.js production build compiled; 33 routes generated |
| Frontend component/unit tests | FAIL | 209 passed, 2 failed (211 total) |
| Backend smoke suites | FAIL | 16 passed, 1 failed (17 total) |
| Live localhost route checks | NOT RUN | Frontend and backend endpoints timed out during verification |

## Backend smoke suite results

Passed:

- Access control
- Authentication
- Catalogues
- Catalogue share links
- Dashboard overview
- ERP brands
- ERP categories
- Feedback
- Organization
- Organization administration
- Platform operations and backups
- Pricing and catalogue versions
- Product lifecycle synchronization
- Product videos
- Promotions
- Users, password reset, unlock, and permission overrides

Failed:

- Design Studio (`smoke_design_studio.py`)

## Defects found

### QA-001 — Studio browser PDF export loses authentication

**Severity:** Critical  
**Area:** Catalogue Studio / Exports

The browser-rendered PDF export job failed while loading page assets. The renderer reported: `Page 1 assets are incomplete: Your session is invalid or has expired.` The export-content endpoint then returned HTTP 409 because the export was not ready.

**Impact:** Users may be unable to download a PDF generated from a Studio design even though ordinary catalogue PDF export tests pass.

**Reproduction evidence:** `backend/tests/smoke_design_studio.py`, assertion near line 551.

### QA-002 — Studio preview crashes for incomplete carousel configuration

**Severity:** High  
**Area:** Catalogue Studio preview

The frontend suite raised `TypeError: Cannot read properties of undefined (reading 'arrowPosition')` at `frontend/src/app/catalogue-studio/studio-preview.tsx:278`.

**Impact:** Existing or partially migrated designs with a missing carousel navigation object can break preview rendering.

### QA-003 — Authorized ERP price level is missing from Studio

**Severity:** High  
**Area:** Catalogue Studio / Prices

The test expecting authorized ERP customer level `SP1` could not find it after opening the Prices panel.

**Impact:** A user may not be able to select an authorized customer price level for a product card.

**Reproduction evidence:** `frontend/src/app/catalogue-studio/studio-editor.test.tsx:526–540`.

### QA-004 — Product Master carousel-name regression

**Severity:** Medium  
**Area:** Catalogue Studio / Product dropdowns

The test requiring Product Master names instead of carousel layer names failed.

**Impact:** Product selection controls may display internal layer names, creating ambiguity for catalogue editors.

**Reproduction evidence:** `frontend/src/app/catalogue-studio/studio-editor.test.tsx:629`.

## Checklist coverage

| Checklist section | Automated status | Manual follow-up |
|---|---|---|
| Login, session, navigation | Core API PASS | Browser redirects, language switch, session timeout |
| Dashboard and products | Core API PASS | Visual layout, search UX, image/video preview |
| Catalogue management | PASS | Card layout, brand logos, copy-link feedback |
| Catalogue Studio | FAIL | Full editor regression, grid interaction, image removal while keeping frame |
| Booklet and public catalogue | API PASS | Page peel, swipe, one-page mobile mode, fullscreen, last-page popup |
| Pricing and share links | PASS | Visual confirmation and clipboard behavior |
| Promotions | PASS | Calendar UI and responsive approval screens |
| Users, roles, permissions | PASS | Form usability, select-all controls, browser autofill behavior |
| Organization | PASS | Responsive permission matrix and grouping |
| Exports and downloads | FAIL | Visual PDF comparison and downloaded-file inspection |
| System, recovery, compatibility | Partial PASS | Real backup restore, ERP connection, Chrome/Edge/mobile devices |

The 125-item checklist has not been marked fully passed. Items requiring visual judgment, real ERP/email integration, physical mobile gestures, clipboard access, printing, or production recovery remain manual.

## Release recommendation

Do not promote this build to production until QA-001 and QA-002 are fixed and the complete frontend and backend suites pass. QA-003 should also be resolved before catalogue editors use customer-specific pricing. After fixes, rerun all automated suites, start both local services, and execute the pending browser/mobile checks from the checklist.
