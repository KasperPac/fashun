# Test script: FASHUN-3 "Fill the gaps within budget" (KAS-321)

Written by QA (KAS-337) from the FASHUN-3 outcome, the 21 acceptance checks and assumptions A1–A5 in the pitch on KAS-322, which Kasper accepted as written on 17 Nov 2026. I didn't read any Engineer branch, and nothing here says how to build it. Base: `origin/master` at `99b76c1`. In the repository this file goes in `docs/test-scripts/FASHUN-3.md`.

`docs/processes/release-testing.md` (in ks-studio-ops) isn't reachable from QA's workspace, so this follows QA's own release-testing rules (test script section) and the FASHUN-2 script's layout.

**Markers**
- `automated`: the Engineer writes a test with the name given, and it runs with the repository's tests. The search service and the AI colour tagging are replaced by stand-ins or saved search results. No automated test calls the real search service.
- `real-use`: QA runs it through the real screens on the QA preview (`agent/qa-fashun`), as QA accounts A and B only, at phone size (390 × 844), with a screenshot per step. The test-data column says which kind of search it uses:
  - **fixtures**: the preview is set to answer from saved search results. No live search is made.
  - **live search**: the preview uses the real search key on the free plan (250 searches a month, shared with the Engineer's fixture recording). These steps come last, in one final run, and are kept few (see the search budget below).
- `live-safe`: safe on the live site after the merge, as QA accounts only. It never creates an account or uses a real person's data, and QA restores the accounts' data afterwards. Where a live-safe step makes a search, the step says how many.

The preview runs on the live database. A tier, department or slider QA sets on the preview is therefore the QA account's real setting, and searches the preview makes count in the real month's search total. QA restores each account at the end (step E6).

**Words used below**
- **Tier**: one of the four budget tiers, named on screen by its example shops (A1, pitch section 3):
  1. *Budget:* Kmart, Target, Big W
  2. *High street:* Uniqlo, Cotton On, H&M
  3. *Mid:* Country Road, Myer, David Jones, THE ICONIC
  4. *Premium:* Rodd & Gunn, R.M. Williams, M.J. Bale

  If the Engineer's first searches change a tier's shop list (pitch section 5, a team call), QA uses the changed list from the completion report and records it.
- **Department**: "I shop: men's / women's / both". "Both" shows everything (A1).
- **Gap**: a top, bottom or pair of shoes for an occasion that the wardrobe is missing or has only one of (A2). Only **owned** items count.
- **Card**: the "Fill the gaps" card.
- **Item**: one suggested product on an opened gap.
- **Range**: the user's slider range for a category, shown as "$min – $max".
- **Best colours / avoid colours**: the lists on the user's Palette screen.
- **Searches**: real calls to the search service. On the preview QA counts them from the server logs (ops lane) and from the month's total, where the app shows one. A "See it at the shop" tap also costs a search (pitch section 3).
- **Same day**: suggestions are stored for a day and then refreshed (A4).

**Exact wording (from the agreed checks)**
- **No tier:** "Pick a budget to get suggestions"
- **Not available:** "Suggestions aren't available right now"
- **Paused:** suggestions are paused until the 1st of next month. In November: "Suggestions are paused until 1 December" (pitch section 3). UX/UI's design fixes any wording around it.
- **Nothing matches:** plain words that say nothing matched and suggest widening the budget or the tier. UX/UI's design fixes the words.
- **Shop link:** "See it at the shop"
- **Reason (example):** "Navy, one of your Deep Winter colours"

---

## Test data

**Accounts:** the two Fashun QA accounts only (A and B). No new accounts.
- A has a Spring reading and B an Autumn reading (KAS-214 test faces, 16 Nov 2026). QA records each account's best and avoid colours from its Palette screen at the start (step R0) and uses those lists in C6.
- **Department:** A shops **women's**, B shops **men's**, unless a step changes it.
- **Neither account has a tier at the start.** The tier is new, so both should start without one. R0 checks this before anything else.

**Clothing photos:** the computer-generated product shots made for FASHUN-2 (`fashun-test-top.jpg`, `fashun-test-bottom.jpg`, `fashun-test-shoes.jpg`), with no person in them. QA adds the pieces through the app's own "add a piece" screen, gives each a name below and sets its occasions and Owned or Wishlist in the item sheet. Adding a piece uses the existing AI tagging (a few US cents each).

**Wardrobe A** (gaps shown in brackets):

| Piece | Category | Occasions | Owned / Wishlist |
|---|---|---|---|
| QA Top 1 | tops | Casual | Owned |
| QA Top 2 | tops | Formal | Owned |
| QA Top 3 | tops | Formal | Owned |
| QA Bottom 1 | bottoms | Casual, Work | Owned |
| QA Bottom 2 | bottoms | Casual, Work | Owned |
| QA Shoes 3 | shoes | Work | **Wishlist** |

Gaps use the same rule as Style me (design spec section 6): an item tagged only Casual is kept out of Formal, an item tagged only Formal is kept out of Casual, and every other item counts for every occasion. So any owned pair of shoes counts as Work shoes; wardrobe A therefore owns no shoes. (Revision 2, 17 Nov 2026: QA Shoes 1 and 2 removed, QA Top 2 and 3 tagged Formal.)
- **Casual:** 1 top (Top 2 and 3 are Formal only), 2 bottoms, 0 shoes → "another Casual top" and "No Casual shoes yet".
- **Work:** 3 tops, 2 bottoms, 0 owned shoes (QA Shoes 3 is wishlist) → only "No Work shoes yet".
- **Formal:** 2 tops (Top 1 is Casual only), 2 bottoms, 0 shoes → "No Formal shoes yet".
- **Smart casual:** 3 tops, 2 bottoms, 0 shoes → "No Smart casual shoes yet".

**Wardrobe B:** QA Top 4 and 5, QA Bottom 3 and 4, QA Shoes 4 and 5, all Owned and tagged Casual only.
- **Casual:** 2 of each → **no card** for Casual.
- **Work:** 2 of each count (Casual-only items count for Work) → no card.
- **Formal:** nothing counts → "Formal tops", "Formal bottoms", "Formal shoes". "Formal tops" is used for R17, R18, R24 and L-R6.

**Saved search results (fixtures):** the Engineer records them once on the free plan, unedited, and lists them in the completion report. The real-use run needs at least these:

| Gap | Department | Tiers |
|---|---|---|
| Work shoes | women's | Budget, Premium |
| another Casual top | women's | Budget, Premium |
| Formal shoes | women's | Budget, Premium |
| Formal tops | men's | Budget, Mid |
| Work shoes | men's and both | Budget (for C9) |

Recorded results may not happen to contain the traps the checks are about: an out-of-tier shop, a price outside the range, an avoid colour, sneakers on Formal shoes, a hoodie on Work tops, an item for the other department. The `automated` steps cover those with made-up rows added to a copy of the saved results.

**Files QA makes itself (no cost):** none needed.

**Searches the final run will use (live search, free plan)**

| Step | What | Searches |
|---|---|---|
| L-R1 | A, Budget, opens Work shoes | 1 |
| L-R2 | A reopens Work shoes the same day | 0 |
| L-R3 | A taps "See it at the shop" once | 1 |
| L-R4 | A, Premium, opens Work shoes | 1 |
| L-R5 | A taps "See it at the shop" once | 1 |
| L-R6 | B, Mid, men's, opens Formal tops | 1 |
| L-R7 | Monthly limit lowered, A opens a gap not opened today | 0 (must be refused) |
| **Planned** | | **5** |
| Re-runs if a step has to be repeated | | up to 5 more |
| **Hard stop** | | **10 searches** |

Every opened gap also has its item photos colour-tagged by the AI (the pitch estimates a few US cents per gap). If the run reaches 10 searches, QA stops and reports.

---

## A. Tier and setup (checks 1–4)

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| A1 | 1 | Signed-in user, no tier | Open the profile's budget screen | Four tiers show, each naming its example shops as listed under "Words used below". None is selected. | `automated` (`budget screen shows four tiers with their example shops`) |
| A2 | 1 | As A1 | Pick "Mid" | Mid shows as selected, and it is saved. | `automated` (`picking a tier saves it`) |
| A3 | 1 | Tier saved as Mid | Load the budget screen again with a fresh session | Mid is still selected. | `automated` (`saved tier shows after signing in again`) |
| A4 | 1 | Server call with an unknown tier, an empty tier and a number | Send each straight to the save call | Refused with a plain error, not a server error. The saved tier is unchanged. | `automated` (`rejects an unknown tier`) |
| A5 | 2 | No tier | Pick Budget, note all six category ranges, then pick Premium and note them again | For every category, Budget's upper end is lower than Premium's, and Budget's lower end is no higher than Premium's. | `automated` (`Budget starting ranges are lower than Premium for every category`) |
| A6 | 2 | Tier Budget | Move the Shoes upper slider, save, load again | The moved range is what's saved and shown. The tier is still Budget. | `automated` (`a moved slider range is saved after picking a tier`) |
| A7 | 2 | Server call with a range where min is above max, and a negative min | Send each straight to the save call | Refused, as today (outcome 1). Nothing is saved. | `automated` (existing `rejects invalid budget (min >= max)`, plus `rejects a negative budget`) |
| A8 | 3 | Department not set | Pick each of men's, women's and both, saving each time, and load again | The last pick shows selected. | `automated` (`department choice is saved`) |
| A9 | 3 | Server call with an unknown department | Send it straight to the save call | Refused. The saved department is unchanged. | `automated` (`rejects an unknown department`) |
| A10 | 4 | No tier, a wardrobe with a gap | Open the place where the card shows | The card says "Pick a budget to get suggestions" and shows no items. The search stand-in is not called. | `automated` (`no tier shows Pick a budget and makes no search`) |
| R0 | setup | A and B as found | Sign in as each. Open Profile, the budget screen and Palette | Both have no tier. Record each account's department, slider ranges, best colours and avoid colours, and its wardrobe piece count (so E6 can restore them). Screenshot. | `real-use` (no search) |
| R1 | 4 | B, no tier, wardrobe B built, fixtures | Choose Work, where the card shows | "Pick a budget to get suggestions", no items. The logs show no search call during the step. | `real-use` (fixtures) |
| R2 | 1 | A, no tier | Open the budget screen | Four tiers, each naming its example shops as listed. Screenshot. | `real-use` (no search) |
| R3 | 1 | A | Pick Budget. Sign out, sign back in, open the budget screen | Budget is still selected. Screenshot after signing in again. | `real-use` (no search) |
| R4 | 2 | A, Budget | Record all six ranges. Pick Premium, record them again | Budget's upper end is lower than Premium's in every category, and its lower end is no higher. Screenshot of each. | `real-use` (no search) |
| R5 | 2 | A, Premium | Move the Shoes upper slider to a new value. Save if there is a save button. Sign out and back in | The Shoes range shows the moved value, and Premium is still selected. | `real-use` (no search) |
| R6 | 3 | A | Pick "I shop: men's", sign out and back in; then "both", then "women's", the same way | Each pick is still selected after signing in again. A ends on women's. | `real-use` (no search) |

## B. Gaps (checks 5–7)

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| B1 | 5 | Owned: 2 Work tops, 2 Work bottoms, no shoes tagged Work | Work out gaps for Work | One gap, named "Work shoes". | `automated` (`no Work shoes gives a Work shoes gap`) |
| B2 | 6 | Owned: 1 Casual top, 2 Casual bottoms, 2 Casual shoes | Work out gaps for Casual | One gap, offered as "another Casual top". | `automated` (`one Casual top offers another Casual top`) |
| B3 | 6 | Owned: 2 or more tops, bottoms and shoes for Casual | Work out gaps for Casual | No gap, so no card for Casual. | `automated` (`two of each for an occasion shows no card`) |
| B4 | 7 | As B1, plus Work shoes marked Wishlist | Work out gaps for Work | Still "Work shoes". The wishlist shoes don't count. | `automated` (`wishlist items do not count as owned for gaps`) |
| B5 | A2 | Owned: no outerwear, bags or accessories for an occasion | Work out gaps | No gap names outerwear, a bag or an accessory. | `automated` (`gaps cover only tops, bottoms and shoes`) |
| R7 | 5, 7 | A, Budget, wardrobe A (QA Shoes 3 is Wishlist, tagged Work), fixtures | Choose Work | A card names "Work shoes". Screenshot. | `real-use` (no search: the card shows before it is opened) |
| R8 | 6 | A, wardrobe A | Choose Casual | A card offers "another Casual top". Screenshot. | `real-use` (no search) |
| R9 | 6 | B, wardrobe B, tier Mid (set here, men's) | Choose Casual | No card for Casual. Screenshot. | `real-use` (no search) |
| R10 | 6 | A: add a second Owned Casual top ("QA Top 6") | Choose Casual again | The Casual card no longer offers "another Casual top" (it still shows "No Casual shoes yet"). Then delete QA Top 6 and check "another Casual top" is back. Screenshot of both. | `real-use` (no search) |
| R11 | 7 | A: in the item sheet, switch QA Shoes 3 from Wishlist to Owned | Choose Work | The card no longer says "No Work shoes yet"; it offers "another pair of Work shoes". Switch it back to Wishlist: "No Work shoes yet" is back. Screenshot of both. | `real-use` (no search) |

## C. Suggestions (checks 8–16)

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| C1 | 8 | Saved results with 10 matching items | Open a gap | At most 6 items. | `automated` (`a gap shows at most 6 items`) |
| C2 | 8, A4 | A gap opened earlier the same day; then the same gap after a day | Open it | Same day: the stored items come back and the search stand-in isn't called. After a day: the stand-in is called again. | `automated` (`reopening a gap the same day makes no search` and `stored suggestions refresh after a day`) |
| C3 | 9 | Saved results | Open a gap | Each item has a photo, name, shop name, price in AUD (shown with "$" and AUD as UX/UI's design sets it) and a reason naming one of the user's best colours or their season. | `automated` (`each item shows photo, name, shop, AUD price and reason`) |
| C4 | 10 | Saved results with items below, inside and above the Shoes range, including items exactly on the min and max | Open a Shoes gap | Only items inside the range, ends included. | `automated` (`items outside the slider range are dropped`) |
| C5 | 11 | Budget tier, saved results with a Rodd & Gunn, an R.M. Williams and an M.J. Bale item; Premium tier, results with a Kmart, a Target and a Big W item | Open a gap at each tier | No out-of-tier item appears. Only shops in the chosen tier appear. | `automated` (`only shops in the chosen tier are shown`) |
| C6 | 12 | Results whose photos the colour tagging stand-in reads as a best colour, an avoid colour, a colour in neither list and "not sure" | Open a gap | Only best-colour items appear. None in an avoid colour, a neither colour, or an unsure reading. | `automated` (`only items in a best colour are kept`) |
| C7 | 13 | Formal shoes results with sneakers and thongs; Work tops results with a hoodie | Open each gap | No sneakers or thongs on Formal shoes, and no hoodie on Work tops. | `automated` (`items unsuitable for the occasion are dropped`) |
| C8 | 14, A1 | Results with men's, women's and unisex items | Open a gap as men's, then women's, then both | Men's shows no women's item; women's shows no men's item; both can show either. | `automated` (`department filters items`) |
| C9 | 15 | Results where nothing passes the filters | Open a gap | A plain message saying nothing matched, suggesting widening the budget or the tier. No error and no empty grid. | `automated` (`nothing matching shows a plain message`) |
| C10 | 16 | An item | Tap "See it at the shop" | The link opens in a new tab (`target="_blank"` with `rel="noopener"`), on the shop's own website and at the shop named on the item. A link that is only a search page or google.com isn't accepted. | `automated` (`shop link opens the shop's own page in a new tab`) |
| R12 | 8, 9 | A, Budget, women's, fixtures | Open the Work shoes card. Time it from the tap until the items show | 1 to 6 items within 15 seconds. Each has a photo, name, shop, AUD price and a reason naming a best colour or Spring. Screenshot. | `real-use` (fixtures) |
| R13 | 8 | As R12 | Go back and reopen Work shoes | The items show within 2 seconds. The logs show no new search. | `real-use` (fixtures) |
| R14 | 10, 11 | A, Budget: Work shoes, another Casual top, Formal shoes | Open each gap. Note every item's shop and price against the Shoes and Tops ranges from the budget screen | Every price is inside its range. No Rodd & Gunn, R.M. Williams or M.J. Bale item. Every shop is in Budget's list. Screenshot per gap. | `real-use` (fixtures) |
| R15 | 10, 11 | A, Premium: the same three gaps | As R14 | Every price is inside its range. No Kmart, Target or Big W item. Every shop is in Premium's list. Screenshot per gap. | `real-use` (fixtures) |
| R16 | 12 | Every item seen in R12–R15 | Compare each item's reason and photo against A's best and avoid colours (from R0) | The reason names a best colour. No item's photo is clearly an avoid colour. If a photo is clearly a different colour family from the reason, it's a fail (see Questions). | `real-use` (fixtures) |
| R17 | 13 | A: Formal shoes from R14 and R15; B, Mid, men's: open Formal tops | Look at every item | No sneakers or thongs on Formal shoes. No hoodie on Formal tops. Screenshot. | `real-use` (fixtures) |
| R18 | 14 | B (men's): Formal tops from R17. A: change to men's, open Work shoes; then back to women's | Look at every item | B and A on men's see no women's item; A on women's sees no men's item. Screenshot. | `real-use` (fixtures) |
| R19 | 15 | A, Premium: set the Shoes range to its lowest (for example $0 – $10) | Open Work shoes | Plain words saying nothing matched, suggesting widening the budget or the tier. No error, the rest of the screen works. Then put the Shoes range back. Screenshot. | `real-use` (fixtures) |
| R20 | 16 | A, any item from R12 | Tap "See it at the shop" | A new tab opens. Its address is on the website of the shop named on the item (for example `kmart.com.au` for Kmart), not Google. QA records the address. QA's sandbox can't reach shop sites, so whether the shop's page then loads is "not verified" here and checked in L-R3. Screenshot of the item and the new tab's address. | `real-use` (fixtures) |

## D. Failure, cost and safety (checks 17–21)

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| D1 | 17 | Search stand-in fails (error, timeout, an answer that can't be read) | Open a gap | "Suggestions aren't available right now". No server error. Nothing is stored for the day, so the next opening tries again. | `automated` (`search failure shows Suggestions aren't available`) |
| D2 | 17, 21 | Switch off (`ENABLE_GAP_SUGGESTIONS` not "true") | Open a gap; also call the suggestions server call directly | "Suggestions aren't available right now". The direct call is refused. The search and colour tagging stand-ins are never called. | `automated` (`switch off calls no paid service`) |
| D3 | 18 | This month's count equals the cap (`GAP_SEARCH_MONTHLY_CAP`) | Open a gap not stored today; also tap "See it at the shop" on a stored item | "Suggestions are paused until 1 [next month]". The search stand-in isn't called for either. The count doesn't go past the cap, including when two openings arrive at the same time. | `automated` (`monthly search limit pauses suggestions and makes no search`) |
| D4 | 18 | 30 November and 31 December, at the cap | Open a gap | The date shown is 1 December and 1 January. | `automated` (`paused message names the 1st of next month`) |
| D5 | 19 | Users A and B with different tiers, budgets and stored suggestions | B asks for A's tier, budget and suggestions, including by A's suggestion or gap id if the server uses ids | B gets only B's own. B can't change A's tier or budget. | `automated` (in `two-user-isolation.test.ts`: `one user cannot see or change another's tier, budget or suggestions`) |
| D6 | 20 | A gap opened with items | Count the wardrobe and work out gaps again | Wardrobe count unchanged. The gap still shows. | `automated` (`suggestions are not added to the wardrobe`) |
| D7 | 21 | The whole repository | Run all tests | Outcome 1's and try-on's tests all still pass. None deleted, skipped or weakened. New tests exist for every `automated` step above. | `automated` (the full test run) |
| D8 | 21 | Code review | Read every place that calls the search service or the colour tagging for suggestions | Each is behind the switch, the cap and the tier check. No search runs on page load, only when a gap is opened or a shop link tapped. | `automated` (QA code review) |
| R21 | 17 | Preview with the search key set to a made-up one (ops lane), A, a gap not opened today | Open it | "Suggestions aren't available right now". Then open Wardrobe, Style me (make one outfit) and Saved outfits: each works. Put the key back. Screenshot. | `real-use` (made-up key: no search is charged) |
| R22 | 17, 21 | Preview with `ENABLE_GAP_SUGGESTIONS` removed (ops lane), A | Open the Work shoes card, then Wardrobe, Style me and Saved outfits | "Suggestions aren't available right now". The rest works. The logs for the step show no search and no colour tagging call. Switch back on. Screenshot. | `real-use` (fixtures) |
| R23 | 17 | A, a gap not opened today | Tap it, then cut the browser's connection before the items arrive. Reconnect and tap again | A plain message, not "Suggestions aren't available" for a dropped connection unless the design uses that for both, and no endless spinner. After reconnecting, the items load. Screenshot. | `real-use` (fixtures) |
| R24 | 19 | A on Premium, women's, with stored Work shoes. B on Mid, men's | Sign in as B. Open the budget screen and Formal tops; look for anything of A's | B sees Mid, men's, B's own ranges and B's own items, nothing of A's. Then as A: A's settings are unchanged by anything B did. Screenshot of both. | `real-use` (fixtures) |
| R25 | 20 | A after R12–R19 | Open Wardrobe (Owned and Wishlist) and choose Work | Same piece count as before the suggestions. No suggested item in Owned or Wishlist. The Work shoes card still shows. Screenshot. | `real-use` (no search) |

## E. Every page and call, bad input, clean-up

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| E1 | all | Every server call the change adds or changes | Call each signed out | Refused as signed out, not a server error, and no search. | `automated` (`suggestion calls refuse signed-out requests`) |
| E2 | all | Whole real-use run | Read the server logs (ops lane, `level: error`) for each step's minutes | No 5xx and no error lines from the change. Quote any line a step relies on. | `real-use` |
| E3 | all | Whole real-use run | Open Profile, the budget screen, Palette, Wardrobe, Style me (each occasion), Saved outfits and try-on | Each loads with no error state and no 5xx in the browser's network log. | `real-use` (no search) |
| E4 | 9 | Item photos | Look at each screenshot | Photos actually show (not broken images). If the photos come from a host QA's sandbox can't reach, this is "not verified" (see Environment needs). | `real-use` |
| E5 | all | Visible text | Read every new message | Plain, correctly encoded (no `?` for a dash), and labelled for screen readers (tier and department choices, the card, the shop link). | `real-use` |
| E6 | clean-up | R0's records | Delete every QA piece added in this run, through the app. Put each account's tier, department and ranges back to R0's values (no tier can't be restored through the app: record that the accounts now have one) | Both accounts as recorded in R0, apart from the tier. Preview settings back as they were. | `real-use` |

## L. Live searches (final run) and live-safe steps

### Final real-use run on the preview, with live searches

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| L-R1 | 8–12 | Preview with the real search key; A, Budget, women's, Work shoes not opened today | Open Work shoes, timing from the tap | 1 to 6 real items within 15 seconds, each with photo, name, shop, AUD price and reason; every price in A's Shoes range; every shop in Budget's list; every reason a best colour. Screenshot. | `real-use` (live search, 1) |
| L-R2 | 8 | As L-R1 | Reopen it | Within 2 seconds, no new search in the logs. | `real-use` (live search, 0) |
| L-R3 | 16 | An item from L-R1 | Tap "See it at the shop" | A new tab on the named shop's own site, on that item. QA records the address. Whether the page loads is "not verified" if the shop is outside QA's network. | `real-use` (live search, 1) |
| L-R4 | 10, 11 | A, Premium | Open Work shoes | As L-R1, against Premium's shops and ranges. No Kmart, Target or Big W. Screenshot. | `real-use` (live search, 1) |
| L-R5 | 16 | An item from L-R4 | Tap "See it at the shop" | As L-R3. | `real-use` (live search, 1) |
| L-R6 | 13, 14 | B, Mid, men's, Formal tops | Open it | No women's item, no hoodie, every shop in Mid's list. Screenshot. | `real-use` (live search, 1) |
| L-R7 | 18 | Preview `GAP_SEARCH_MONTHLY_CAP` set (ops lane) to this month's count so far | As A, open a gap not opened today (for example Smart casual tops); then tap "See it at the shop" on a stored item | "Suggestions are paused until 1 December" (in November). The logs show no search for either. Put the cap back. Screenshot. | `real-use` (live search, 0) |

### Live readiness (before Kasper reviews the PR)
Live still runs the old version, so the feature can't be used there yet. QA checks:
- the PR's Environment section lists `ENABLE_GAP_SUGGESTIONS`, `GAP_SEARCH_MONTHLY_CAP`, the search key and any database change, and each one's result from the ops lane or the operator is on the feature;
- the live site still works as today for A (Profile, Wardrobe, Style me), with a screenshot;
- the search key itself is proven by L-R1 on the preview. Whether the live setting holds the same key is "not verified" by QA unless the lane reports it.

### Live check (after the merge), on `fashun-web.vercel.app`

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| L1 | 1 | A | Open the budget screen | Four tiers, each naming its shops. Screenshot. | `live-safe` |
| L2 | 1, 3 | A | Pick Budget and women's. Sign out and back in | Both still selected. Screenshot. | `live-safe` (restored in L6) |
| L3 | 5 | A with QA Top 2 and 3 and QA Bottom 1 and 2 (Work) added | Choose Work | A card names "Work shoes". Screenshot. | `live-safe` (pieces deleted in L6) |
| L4 | 8–12 | As L3 | Open Work shoes | 1 to 6 real items within 15 seconds, prices in range, shops in Budget, reasons naming best colours. Screenshot. | `live-safe` (1 search) |
| L5 | 19 | B | Open the budget screen | B's own settings only. Screenshot. | `live-safe` |
| L6 | clean-up | | Delete L3's pieces. Put A's tier, department and ranges back to their recorded values | A as before. | `live-safe` |

---

## Environment needs
- **Settings on the preview:** `ENABLE_GAP_SUGGESTIONS`, `GAP_SEARCH_MONTHLY_CAP` and the search key. They are **not on the ops lane's list** for QA today (only try-on's settings are). R21, R22 and L-R7 need them added, with `{"fake": true}` and `{"secret": true}` for the key, as for `FASHN_API_KEY`. Until then those steps are "not verified".
- **Fixtures on the preview:** a way to set the preview to answer from saved search results, through a setting on the lane. The Engineer names it in the completion report.
- **Search key on the preview** for the final run (L-R1 to L-R7). The free plan's 250 searches a month are shared with the Engineer's fixture recording; this script plans 5 and stops at 10.
- **Database change** for the tier, the department and the stored suggestions and search count, applied by the Delivery Manager through the ops lane before the real-use run. Without it, every real-use step is "not verified: database update not applied".
- **QA's network:** item photos and shop sites are on hosts outside QA's sandbox. Photos that show as broken make E4 and the photo half of R12 and L-R1 "not verified", unless the Delivery Manager adds the photo host to QA's network or the app serves the photos itself. Shop pages loading (check 16) can only be confirmed by the new tab's address.
- **Server logs** through the ops lane for the "no search" steps (R1, R13, R22, L-R2, L-R7). On FASHUN-2 the lane's log reads came back empty, so these may end up checked by count only.

## Checks that can't be tested fully as a user action
None needs rewording before building. Two are partly checked outside the screens, as their own wording says:
- **Check 21:** "No paid service is called while the switch is off" is checked from the settings, the code (D8) and the logs (R22), and "tests still pass" is the test run (D7). A user can't see either.
- **Check 18:** "no further searches are made" is checked from the logs and the count, not from the screen.

## Questions (for the Product Manager, through the Delivery Manager; they don't block the build)
1. **At the monthly limit, a gap already stored today:** does it still show its stored items (they cost nothing), or the paused message? The script expects the paused message only for a gap **not** stored today, and records what a stored one shows.
2. **At the monthly limit, "See it at the shop"** costs a search. The script expects it to make no search (check 18) and show the paused message. Is that right?
3. **Check 12, judging colour from a photo:** QA fails an item when its photo is clearly a different colour family from the reason line. Anything subtler is a note, not a fail.

**Count:** 78 steps: 34 `automated` (including the full test run D7 and the code review D8), 31 `real-use` with fixtures, no search or a made-up key, 7 `real-use` with live searches (5 searches planned, hard stop 10), and 6 `live-safe`, plus the live-readiness list. Every one of the 21 checks has at least one `automated` step and one `real-use` step.
