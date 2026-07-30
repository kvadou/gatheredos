# iOS App — Native Design Review + Web Parity Plan

**Date:** 2026-07-12. **Scope:** `ios/GatheredOS` (SwiftUI, 855 lines, 9 files) reviewed against Apple HIG via native-ios-design checklist; feature gap mapped against the live web app.

## Design review verdict: solid native v1, no hard-rule violations

What it already does right:
- Semantic type everywhere (`.largeTitle`/`.headline`/`.body` + `fontDesign(.serif)` for the brand serif). Dynamic Type works.
- All colors from Asset Catalog (`HomeCanvas/HomeSurface/HomeInk/HomeNavy`) with light + dark variants. Zero hex in view code.
- Native chrome: `NavigationStack`, `TabView`, `List`/`Form` `.insetGrouped`, `ContentUnavailableView` empty/error states, `confirmationDialog` for delete, sheets for add, `.refreshable`.
- `.borderedProminent` buttons, SF Symbols, `contentTransition(.numericText())` on stat counts.
- Nav-bar serif styling done via native appearance APIs (not a rebuilt bar).

Polish items (small, do during parity work):
| Item | Fix |
|---|---|
| AuthView mode-toggle text button < 44pt | `.frame(minHeight: 44)` |
| No haptics | `.sensoryFeedback(.success, trigger:)` on add/delete/complete |
| Library has no search | `.searchable` once list grows |
| No item edit (add/delete only) | edit form on detail view |
| New user with no home = dead end (`firstHome()` nil) | minimal in-app onboarding (create home w/ name+address) or guided hand-off to web onboarding |

## Parity gap vs web

| Web section | iOS today | Gap |
|---|---|---|
| Dashboard | Home tab: greeting + 3 stat counts | insights, weekend priorities, upcoming maintenance, activity |
| Care | count only | task list, complete/snooze, seasonal, service history, health score |
| Projects | none | active/idea/recommended/completed, progress, budget |
| Library | items list + add/delete | rooms, files/photos, upload, search, edit |
| Ask GatheredOS | none | streaming chat |
| Worth Knowing | none | insights feed + dismiss |
| Settings | sign-out button only | profile, home, family members |
| Onboarding | none | required for iOS-first signups |

## Parity build order (one phase per session, ship + TestFlight each)

1. **Care tab** — highest daily-use value. Tasks list (open/done/seasonal), complete + snooze via `.swipeActions`, service history. Reuses existing RLS queries; no new backend.
2. **Ask tab** — the differentiator. Stream from the existing web endpoint `POST gatherroot.vercel.app/api/ask` with the Supabase JWT (server keeps the Anthropic key; zero key material in the app).
3. **Projects + Worth Knowing tabs** — read-heavy lists, low risk. Tab bar lands at 5: Home / Care / Projects / Library / Ask (Worth Knowing folds into Home feed, Settings behind profile toolbar button, per HIG 3-5 tab rule).
4. **Camera + files** — photo/receipt capture, upload to `home-files` bucket, item photos. **This is the web Phase 2 ingestion front door: receipt photo on phone → extraction cascade.** Sequence it to land right after the web ingestion pipeline ships.
5. **Settings + minimal onboarding + item edit** — profile, home info, create-home flow for iOS-first users.

Rule of thumb: iOS reads the same tables through supabase-swift + RLS; anything needing AI goes through the Vercel API routes, never direct from the app.
