# English/Thai Localization Matrix

New deliverable for this pass — no prior `docs/I18N_MATRIX.md` existed. Based on direct inspection of `frontend/src/lib/i18n.tsx` and `frontend/src/lib/management-translations.ts`.

## Architecture

- Single source of truth: `THAI_TRANSLATIONS: Record<string, string>` in `i18n.tsx`, extended by spreading `MANAGEMENT_THAI_TRANSLATIONS` from `management-translations.ts` (122 KB — the larger, management-screen-specific dictionary).
- Language state: React context (`LanguageProvider`/`useLanguage`), persisted to `localStorage` under `gms-catalogue-language`, defaulting to `"en"`.
- Lookup mechanism: components call `t("English source string")` or wrap text in `<T>English source string</T>`. There is **no separate key namespace** — the English string itself is the dictionary key.
- Fallback behavior: `t()`'s default (no-provider) implementation and any lookup miss both resolve to returning the input string unchanged — i.e., **a missing Thai translation silently renders English text**, with no console warning, no test failure, and no visual distinction from an intentional English label.
- Interpolation: `interpolate()` supports `{{variable}}` placeholders inside either language's string.

## Coverage — what this pass could verify

- Both language dictionaries load and the app builds/tests successfully with this structure in place (213/213 frontend tests pass, `tsc` clean).
- No automated check exists (in this codebase, before or after this pass) that verifies every `t("...")` call site has a corresponding Thai entry. This pass did not add one (no source changes permitted in Phase 0) — see BUG_REGISTER I18N-001 and the proposed test.
- Spot-read of `THAI_TRANSLATIONS` shows consistent, complete-looking translations for the login/register flow strings sampled during this inspection (all sampled entries had non-empty Thai text, correct Unicode, no visible mojibake in the sample).

## Risk (I18N-001, cross-referenced in Bug Register)

Because the English string doubles as the lookup key:
1. **Silent drift:** editing English copy (even fixing a typo) orphans the Thai translation with zero build/test signal — the UI simply falls back to English for Thai users until someone notices visually.
2. **Encoding sensitivity:** the carried-forward BUG-010 (mojibake in source strings) compounds this — a corrupted English key can never match its Thai counterpart, again with a silent English fallback rather than an error.
3. **No compile-time safety:** unlike a namespaced-key system (e.g. `login.welcome_back`), there is no TypeScript or lint mechanism tying a JSX call site to a guaranteed dictionary entry.

## Recommended verification for a later segment (not performed here — Phase 0 is audit only)

- A single test that imports every source file, extracts `t("...")`/`<T>...</T>` literal arguments via a simple AST or regex pass, and asserts each exists as a `THAI_TRANSLATIONS` key. This is additive (no behavior change) and directly closes the silent-drift risk — a reasonable Segment 1 candidate given it changes no runtime behavior.
- A manual or automated pass to confirm the Thai dictionary itself has no mojibake (ties into BUG-010's existing "inventory and replace with tests/snapshots" plan).
- Visual QA of the Thai UI at a few key screens (login, dashboard, Studio) — still a MANUAL item per the existing functional inspection report; nothing in this pass changes that.

## What this pass did NOT verify

- Actual rendered Thai text in a browser (no live services / no visual check available this pass).
- Whether every screen has a language switcher reachable in the UI (component exists — `LanguageSwitcher` — reachability from every screen not checked).
- RTL/pluralization edge cases (Thai doesn't pluralize, so likely not applicable, but not explicitly confirmed against actual copy).
