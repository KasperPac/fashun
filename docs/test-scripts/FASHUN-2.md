# Test script: FASHUN-2 "See it on me" (KAS-223)

Written by QA (KAS-227) from the FASHUN-2 outcome, the 22 acceptance checks and the privacy note agreed by Kasper on 16 Nov 2026 (KAS-224). I didn't read any Engineer branch, and nothing here says how to build it. In the repository this file goes in `docs/test-scripts/FASHUN-2.md`.

**Revised 17 Nov 2026 (KAS-235)** to the final checks Kasper settled on KAS-231 (answered 16 Nov 2026, 22:28 UTC): check 6 dropped, checks 11, 15, 19 and 21 reworded, and the PM's decisions on checks 7 and 8 and on how spend is counted. Removed steps: B4, P6 (check 6). New steps: B5b, D7, E8, F4, I4. The questions at the end are now settled.

**Markers**
- `automated`: the Engineer writes a test with the name given, and it runs with the repository's tests. Outside services (FASHN, image search, background removal, the AI model) are replaced by stand-ins in these tests. No test calls the real FASHN.
- `preview`: QA runs it by hand through the real screens on the QA preview (`agent/qa-fashun`), as QA accounts A and B only, at phone size (390 × 844), with a screenshot per step. The preview runs on the live database and the live FASHN key, so every picture made here is real spend.
- `live-safe`: safe on the live site after the merge. It creates no data, makes no try-on picture, costs nothing and touches no personal data.

**Words used below**
- **Picture**: what the person sees, one try-on result for one outfit.
- **FASHN image**: one image FASHN charges for, at **US$0.075** (pitch, KAS-225). A top-and-bottom picture uses **2** FASHN images (US$0.15). A failed top-and-bottom attempt where FASHN charged for the first step uses **1**. (Dresses and jumpsuits aren't in this release: check 6 is dropped.)
- **Spend**: the "Try-on spend" panel's figure for this month: FASHN images × US$0.075, **rounded half up to the cent** (1 image shows US$0.08, 3 show US$0.23).
- **Images**: the panel's number of FASHN images this month (check 15).
- **Count**: the panel's number of pictures this month.
- **Try-ons used** (for the person): pictures made. A failure never uses one up, even when FASHN charged an image (check 11); that image shows only in the owner's spend and images.
- **Logs**: the server's own output. On the preview these are Vercel's runtime logs, which QA can't reach; the operator reads them where a step says so.

**Exact wording (from the agreed checks)**
- **Privacy note:** "To show clothes on you, Fashun sends this photo and your clothing photos to FASHN, an outside try-on service. FASHN and the companies it works with, including some in the US and South-East Asia, use them only to make your picture. FASHN deletes them within a day and doesn't use them to train its AI. Fashun keeps your photo and your try-on pictures privately in your account until you delete them. You can delete them at any time under Profile."
- **No photo yet:** "Add a try-on photo to see this on you"
- **Not shown:** a line that names **the outfit's own pieces that aren't drawn**, e.g. "Shoes aren't shown on you." for an outfit with shoes only, or one naming shoes and the bag for an outfit with both (PM decision, KAS-231). UX/UI's design fixes the final words.
- **Missing piece (example):** "Add a photo of your top to try this on"
- **Failure:** "Try-on didn't work this time. Nothing was charged. Try again later."
- **Paused:** "Try-on is paused until 1 [next month]. Your saved try-ons still show." (in November: "1 December")
- **AI label:** "Made by AI. Fit and details may not be exact."

---

## Test data

**Accounts:** the two Fashun QA accounts only (A and B). No new accounts. Neither has a try-on photo at the start (QA checks this in P0).

**Photos of people: computer-generated only, never a real person.** The test faces on KAS-214 are head-and-shoulders, so they can't be used for try-on. The operator makes two new full-length ones the same way as KAS-214 (Figma's image tool, from a written description of a fictional person) and attaches them to a fixtures task:
- `fashun-test-body-a.jpg`: the fictional person of face A, full length, head to feet, facing the camera, arms by the sides, plain light background, fitted plain clothes, about 768 × 1152 JPEG under 1 MB. **Account A only.**
- `fashun-test-body-b.jpg`: the same for the person of face B. **Account B only.**

**Clothing photos: computer-generated product shots** on a plain background, no person in them, made the same way and attached to the same fixtures task:
- `fashun-test-top.jpg` (a plain t-shirt), `fashun-test-bottom.jpg` (jeans), `fashun-test-shoes.jpg` (trainers), `fashun-test-bag.jpg` (a bag). No dress or jumpsuit is needed (check 6 is dropped).

**Files QA makes itself (no cost):** `not-a-photo.jpg` (a short text file renamed `.jpg`).

**Outfits:** QA builds O1, O2 and O5 through FASHUN-1's own screens (add the items by photo, then "Style me" and save):
- **O1** (A): top + bottom + shoes + bag.
- **O2** (A): a second saved outfit with a top and a bottom (Style me for another occasion). It never gets a picture in this run.
- **O4** (A): **operator-made test data** (PM decision, KAS-231). The operator sets up, directly on account A, a saved outfit whose top and bottom have no photo, plus shoes, and labels it "operator-made test data" in this run's report. QA never writes to the database itself. It tests the try-on screen for check 8, not how outfits are built.
- **O5** (B): top + bottom + shoes (for the data-separation steps).

(O3 is no longer used: it was the jumpsuit outfit for check 6.)

**FASHN images the real-use run will use**

| Step | Outfit | Pictures | FASHN images |
|---|---|---|---|
| P5 | O1, top and bottom | 1 | 2 |
| P10 | O1 "Try again" | 1 | 2 |
| P12 | O1 "Try again" with the connection dropped | 1 | 2 |
| P13a | O1 under a test cap with room for one outfit | 1 | 2 |
| P17 | O5 (B, top and bottom) | 1 | 2 |
| **Planned** | | **5** | **10 (US$0.75)** |
| Re-runs if a step has to be repeated | | | up to 10 more |
| **Hard stop** | | | **20 FASHN images (US$1.50)** |

That is well inside the pitch's 20 to 30 and the US$7.50 cap. All other steps make no picture. If the run reaches 20 FASHN images, QA stops and reports. These images use real FASHN credit, and because the preview shares the live database they count in November's real spend (P15 checks this).

---

## A. Your try-on photo (checks 1, 2, 3, 17)

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| A1 | 1 | Signed-in user, try-on on, no try-on photo | Open Profile | A "Your try-on photo" section with an "Add photo" button. | `automated` (`profile shows the try-on photo section with Add photo`) |
| A2 | 2 | As A1, first time | Tap "Add photo" | The privacy note shows word for word, with "I agree" and "Not now". No file picker opens and nothing is uploaded until "I agree". | `automated` (`first Add photo shows the privacy note before any upload`) |
| A3 | 2 | As A2 | Tap "Not now" | The note closes, no upload request is sent, no agreement is recorded, and the section still shows "Add photo". | `automated` (`Not now uploads nothing and records no agreement`) |
| A4 | 2 | No agreement recorded | Send a photo upload straight to the server, without going through "I agree" | Refused. Nothing is stored. | `automated` (`server refuses a try-on photo without agreement`) |
| A5 | 3 | Agreement recorded, a full-length photo | Upload | The photo shows in the section with "Replace" and "Delete". | `automated` (`uploaded try-on photo shows with Replace and Delete`) |
| A6 | 3 | Agreement recorded | "Replace" with another photo | The new photo shows, the old one is gone, and there is still only one try-on photo. The privacy note isn't shown again. | `automated` (`Replace keeps one try-on photo`) |
| A7 | 3 | Not an image, an empty file, and a file over the size limit | Upload each | A plain message says the photo couldn't be used. Nothing is stored, no server error, and the section is unchanged. | `automated` (`rejects a bad try-on photo with a plain message`) |
| A8 | 17 | A user with a try-on photo and 3 saved try-on pictures on different outfits | Tap "Delete" on the photo and confirm | The photo and all 3 pictures are removed from the account and from storage. The outfits are still there. Each outfit shows "Add a try-on photo to see this on you" again. | `automated` (`deleting the try-on photo removes every try-on picture and keeps the outfits`) |
| A9 | 17 | As A8 | Open the old photo's and pictures' addresses afterwards, as the same user | Not found. | `automated` (`deleted try-on files can no longer be opened`) |

## B. See it on me (checks 4, 5, 7, 8, 22)

Check 6 (dress or jumpsuit) is **not in this release** (Kasper, KAS-231: "Drop it, add to roadmap"). Its step B4 is removed, and no step here needs a dress or jumpsuit.

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| B1 | 4 | A user **with** a try-on photo, a saved outfit | Open the outfit | A "See it on me" button. | `automated` (`saved outfit shows See it on me when there is a try-on photo`) |
| B2 | 4 | A user **without** a try-on photo | Open a saved outfit, then tap the line | "Add a try-on photo to see this on you" shows instead of the button, and it opens Profile at the "Your try-on photo" section. | `automated` (`saved outfit without a try-on photo links to the photo section`) |
| B3 | 5 | Outfit with a top and a bottom, FASHN stand-in answering | Tap "See it on me" | Progress shows straight away. One picture is made: the top first, then the bottom on that result. The picture is saved with the outfit. Spend goes up by 2 FASHN images. | `automated` (`top and bottom outfit makes one picture in two steps`) |
| B5 | 7 | Outfit with a top, a bottom, shoes and an accessory | Make the picture | Shoes and accessory are never sent to FASHN. They show beside the picture, with a "Not shown" line that names both the shoes and the accessory. | `automated` (`shoes and accessories are shown beside the picture, not sent`) |
| B5b | 7 | Outfit with a top, a bottom and shoes, and no accessory | Make the picture | The shoes show beside the picture. The "Not shown" line names the shoes only (e.g. "Shoes aren't shown on you."), and says nothing about accessories. | `automated` (`not shown line names only the outfit's own undrawn pieces`) |
| B6 | 8 | Outfit with no top or bottom that has a photo (top missing; bottom missing; both missing) | Open it and tap the button | The button says what's missing (e.g. "Add a photo of your top to try this on"). No FASHN call is made and the spend doesn't change. | `automated` (`outfit with nothing to draw explains what is missing and charges nothing`) |
| B7 | 8 | Outfit with a top that has a photo and a bottom that has none | Open it | Either the picture uses only what has a photo, or the button says what's missing. In both cases nothing is charged for a piece that can't be drawn. | `automated` (`a piece without a photo is never charged`) |
| B8 | 22 | A new picture, and a saved one opened later | Look under each | "Made by AI. Fit and details may not be exact." is under every picture, word for word. | `automated` (`every try-on picture carries the AI label`) |
| B9 | 5 | Two taps on "See it on me" in quick succession | Tap twice | Only one picture is made and charged. | `automated` (`a double tap makes and charges one picture`) |

## C. Saved pictures and Try again (checks 9, 10)

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| C1 | 9 | An outfit with a saved picture | Open it again, and again in a new session | The saved picture shows at once, with no progress and no FASHN call. Spend and count don't change. | `automated` (`saved picture shows again without a new call or charge`) |
| C2 | 10 | An outfit with a saved picture | Tap "Try again" | Before anything starts, the person sees that it uses some of this month's try-ons. Only after they go ahead is FASHN called. The new picture replaces the old one on the outfit, and spend goes up. | `automated` (`Try again warns first, then makes and charges a new picture`) |
| C3 | 10 | As C2 | Back out at the warning, if the app offers it | Nothing starts and nothing is charged. | `automated` (`backing out of Try again charges nothing`) |

## D. When it doesn't work (check 11)

Check 11 (final wording, KAS-231): the person always sees the failure message, the outfit shows as before, and **no try-on is used up for the person**. If FASHN charged for an image before the failure, **that image counts in the owner's spend and images**, so the panel still matches FASHN.

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| D1 | 11 | FASHN refuses the first step (bad key 401, out of credit, 429, 5xx), so FASHN charged nothing | Tap "See it on me" | The failure message shows word for word. The outfit shows as before (its saved picture if it had one, otherwise the items). Spend, images and count don't change. No server error reaches the screen. | `automated` (`FASHN refusal shows the failure message and charges nothing`) |
| D2 | 11 | FASHN never answers, and charges nothing | Tap "See it on me" | The failure message shows within 90 seconds, measured from the tap. Spend, images and count don't change. | `automated` (`slow FASHN gives up within 90 seconds and charges nothing`) |
| D3 | 11 | Top-and-bottom outfit: FASHN makes and charges both steps (2 images), but the picture can't be saved in our storage | Tap "See it on me" | The failure message shows word for word ("Nothing was charged" stays). No half-saved picture; the outfit shows as before. The count doesn't change, so no try-on is used up for the person. The owner's images go up by **2** and spend by **US$0.15**, matching what FASHN charged. | `automated` (`storage failure saves nothing, uses no try-on and counts FASHN's charged images for the owner`) |
| D4 | 11 | Top-and-bottom outfit: the top step works (FASHN charges 1 image) and the bottom step fails | Tap "See it on me" | The failure message shows word for word, and no picture is saved. The count doesn't change, so no try-on is used up for the person. The owner's images go up by **1** and spend by **US$0.075** (shown to the cent per check 15). | `automated` (`second step failure uses no try-on and counts the first image for the owner`) |
| D5 | 11 | The phone loses its connection after tapping | Tap, then drop the connection | When it comes back, the person sees either the finished picture or the failure message. Never two charges, never a blank screen. | `automated` (`connection lost during try-on never double charges`) |
| D6 | 11 | Every failure in D1 to D4 | Read the logs | One short reason line each. No photo, image address, email or name in the logs. | `automated` (`try-on failures log a reason with no personal data`) |
| D7 | 11 | As D4, then the person looks at the outfit and the owner opens the spend panel | Look | The person's outfit shows as before, with "See it on me" still offered (no try-on used up). The owner's panel shows the charged image in images and spend, and the picture count unchanged. | `automated` (`a charged failure shows in the owner's panel and not to the person`) |

## E. Cap and new month (checks 12, 13, 14)

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| E1 | 12 | Spend equals the cap | Open an outfit without a picture, and one with a saved picture | The first shows the paused message instead of "See it on me", with next month's name. The second still shows its saved picture. "Try again" isn't offered. No FASHN call. | `automated` (`cap used up shows the paused message and keeps saved pictures`) |
| E2 | 12, 13 | Spend equals the cap | Send a try-on request straight to the server | Refused. No FASHN call and the count doesn't change. | `automated` (`server refuses try-on once the cap is used up`) |
| E3 | 13 | Room for less than one FASHN image; room for one image but a top-and-bottom outfit needs two | Tap "See it on me" | Not started, no FASHN call, spend unchanged. With room for exactly two images, the top-and-bottom picture is made and spend ends exactly at the cap. | `automated` (`a picture that would pass the cap is never started`) |
| E4 | 13 | Room for exactly one top-and-bottom outfit, two requests at the same moment | Send both | Only one is made. Spend ends exactly at the cap, never over. | `automated` (`two requests at the cap never exceed it`) |
| E5 | 14 | Cap used up in November; clock at 30 Nov 2026 12:59:59 UTC, then 13:00:00 UTC (00:00 on 1 Dec, Sydney summer time) | Ask for a picture at each time | Paused at the first time, allowed at the second, with no reset by anyone. The new month's spend starts at US$0.00. | `automated` (`try-on resumes at midnight on the 1st Sydney time`) |
| E6 | 14 | Clock at 30 Apr 2027 13:59:59 and 14:00:00 UTC (00:00 on 1 May, Sydney standard time) | As E5 | Same as E5. | `automated` (`month boundary follows Sydney daylight saving`) |
| E7 | 12 | Paused in November, in December | Read the message | "1 December" in November, "1 January" in December. | `automated` (`paused message names the next month`) |
| E8 | 13, 15 | 3 FASHN images used this month (exactly US$0.225, shown US$0.23); cap set to 5 images' worth (US$0.375) | Ask for a top-and-bottom picture, then another | The first is made: it fits on the exact amount (room US$0.15), although the shown spend would leave only US$0.145. Spend is then exactly the cap (shown US$0.38). The second is refused, with no FASHN call. The cap is checked on the exact amount, never the rounded one. | `automated` (`cap is checked on the exact spend, not the rounded one`) |

## F. Spend panel (checks 15, 16)

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| F1 | 15 | The owner's account, this month: 2 top-and-bottom pictures and 1 failed attempt where FASHN charged the first step (= 5 FASHN images); some in an earlier month | Open the spend panel | It shows this month's spend in US$, the cap, the count (2 pictures), the images (5) and the previous months. This month's spend is 5 × US$0.075 = US$0.375, shown **US$0.38**. | `automated` (`owner sees spend, cap, count, images and previous months`) |
| F2 | 15 | 1, 2, 3 and 99 FASHN images | Read the spend | Images × US$0.075, rounded half up to the cent: US$0.08, US$0.15, US$0.23, US$7.43. The same rule on every screen and every month. | `automated` (`spend is images times price rounded half up to the cent`) |
| F4 | 15 | 3 separate failed attempts this month, each charged for 1 image (and nothing else) | Read the spend and images | Images 3, spend **US$0.23** (3 × US$0.075 = US$0.225, rounded once). Not US$0.24, which is what rounding each charge on its own would give. | `automated` (`spend is rounded once from the exact total, not per charge`) |
| F3 | 16 | Any other signed-in account, including an invited one; and signed out | Look for the panel, then open its address and its data address | No panel anywhere. Both addresses answer "not found" (signed out: not found or the sign-in page), and nothing about spend comes back. | `automated` (`spend panel is not found for anyone but the owner`) |

## G. Data separation (check 18)

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| G1 | 18 | Users A and B, each with a try-on photo and a picture | B asks for A's photo and A's picture, by every address the app uses (photo, picture, outfit picture data) | Not found every time. Nothing of A's comes back. | `automated` (`one user can never read another's try-on photo or pictures`) |
| G2 | 18 | As G1 | B tries to delete or replace A's photo, or make a picture of A's outfit or on A's photo | Refused, and A's data is unchanged. No FASHN call. | `automated` (`one user can never change or use another's try-on photo`) |
| G3 | 18 | Signed out | Open A's photo and picture addresses | Not found or the sign-in page. Nothing comes back. | `automated` (`try-on files are never public`) |

## H. Switches and other paid services (checks 19, 20)

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| H1 | 19 | Try-on on, image search and background removal off | Add an item by link and by photo | Both work as before. No image-search or background-removal call is made (stand-ins record zero calls). | `automated` (`try-on on makes no image search or background removal call`) |
| H2 | 19 | The branch and the service settings (preview and live) | QA reads every place the try-on switch is read, and the settings list | The try-on switch turns on try-on only. Image search and background removal still depend only on their own switch, which stays off. | `automated` (QA checks it in the code review) |
| H3 | 20 | Try-on off | Open Profile and a saved outfit | No photo section, no "See it on me", no "Add a try-on photo" line. Everything else on those screens is as on master. | `automated` (`try-on off hides the photo section and the button`) |
| H4 | 20 | Try-on off | Send a try-on or photo request straight to the server | Refused. No FASHN call, no upload stored. | `automated` (`server refuses try-on when it is switched off`) |

## I. FASHUN-1 still works, and release checks (check 21)

Check 21 (final wording, KAS-231): FASHUN-1's 15 checks still pass, **except FASHUN-1 check 14** ("try-on is switched off"), which **FASHUN-2's checks 19 and 20 replace**. FASHUN-1's existing automated tests still pass.

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| I1 | 21 | The branch and master | Run lint, type-check (QA's hidden type-check), tests and the build | All pass. No new lint or type problems compared with master. Every FASHUN-1 automated test on master still exists and passes, none skipped or weakened. Every test named in sections A to H exists and passes. | `automated` |
| I2 | 21 | The repository | Open `docs/test-scripts/FASHUN-2.md` | It matches this script. | `automated` (QA compares them in the review) |
| I4 | 21 | FASHUN-1's test script and its 15 checks, and this script | QA lists each FASHUN-1 check against the steps that still prove it | Checks 1 to 13 and 15 each still have a passing step (P22, L5, I1). FASHUN-1 check 14 is marked "replaced by FASHUN-2 checks 19 and 20", and those checks' steps (H1 to H4, P19, P20) pass. No other FASHUN-1 check is dropped. | `automated` (QA checks it in the code review) |
| I3 | all | The PR description | Read it before the merge | It says merging releases to production, lists every setting, the FASHN key, the database change and storage, and says the operator turns try-on on only after QA's live readiness check. The Engineer opened the PR and didn't merge it. | `preview` (checked by hand on the PR) |

---

## P. Real use on the QA preview

**Before P0, the operator sets these on the preview only (Vercel's Preview scope, never Production), then redeploys `agent/qa-fashun`:**
- try-on switch **on**; FASHN key (the live key; Kasper's credits); price US$0.075; cap US$7.50;
- the **owner setting = QA account A's email** (so A stands in for Kasper's account; B is "any other account");
- image search and background removal **off**, as on live;
- the database change from build 1 is applied, and the private storage for try-on photos exists.

QA's browser is headless Chromium at iPhone size, not a real iPhone Safari; Kasper's own phone at review is the Safari check (check 1).

Each later step that needs a different setting says exactly what the operator changes, and QA waits for the redeploy and re-checks the commit before going on. QA re-checks that the deployment is for the reviewed commit (`deployments?sha=<full sha>`, status `success`) after every redeploy.

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| P0 | - | A and B | Sign in, open Profile and the spend panel (as A). Note the spend, count and both accounts' wardrobes and outfits. | Neither has a try-on photo. Note the spend and count as the **baseline**; every spend check below is measured from it. | `preview` |
| P1 | 1 | A | Open Profile | "Your try-on photo" section with "Add photo". Screenshot. | `preview` |
| P2 | 2 | A | Tap "Add photo", read the note, tap "Not now". Reload Profile. | The note matches word for word. After "Not now" no upload goes out (browser network list), and after reload the section still says "Add photo". | `preview` |
| P3 | 3 | A, `not-a-photo.jpg` | Tap "Add photo", "I agree", choose the file | A plain message, no server error, section unchanged. | `preview` |
| P4 | 3 | A, `fashun-test-body-a.jpg` | Choose the photo | It shows in the section **within 10 seconds** (QA times it), with "Replace" and "Delete". Still there after reload, and after signing out and in. Tap "Replace" and choose the same photo: no privacy note this time, and the photo still shows. | `preview` |
| P4b | 4 | B (no photo), O5 | Open O5, tap "Add a try-on photo to see this on you" | Lands on Profile's try-on photo section. | `preview` |
| P5 | 4, 5, 7, 22 | A, O1 | Open O1. Tap "See it on me". | "See it on me" shows. Progress shows at once. **Within 90 seconds** (timed) one picture of the person in the test top and jeans. Shoes and bag beside it, with a "Not shown" line naming the shoes and the bag. The AI label under it. Spend up US$0.15, images up 2 and count up 1 from the baseline. | `preview` (2 FASHN images) |
| P7 | 8 | A, O4 (operator-made test data) | Open O4 and tap the button | The button says what's missing (e.g. "Add a photo of your top to try this on"). Spend, images and count unchanged. The report labels O4 "operator-made test data". | `preview` |
| P8 | 9 | A, O1 | Leave O1 and open it again | The same picture at once, no progress. Spend and count unchanged. | `preview` |
| P9 | 9 | A | Sign out, sign in, open O1 | The same picture at once, with the AI label. Spend and count unchanged. | `preview` |
| P10 | 10 | A, O1 | Tap "Try again" | Before it starts, a line says it uses some of this month's try-ons. Going ahead gives a new picture within 90 seconds, and spend goes up US$0.15. | `preview` (2 FASHN images) |
| P11 | 11 | **Operator:** set the FASHN key on the preview to a made-up value (never a real key), redeploy. A, O1 (has a saved picture) and O2 (no picture) | Tap "Try again" on O1, then "See it on me" on O2 | Each shows the failure message word for word **within 90 seconds**. O1 still shows its saved picture; O2 still shows its items. FASHN refused at the first step, so spend, images and count are unchanged. Operator: the logs show one reason line each, with no personal data. **Operator afterwards:** put the real key back, redeploy. | `preview` (0 FASHN images) |
| P12 | 11 | A, O1 | Tap "Try again", and drop the connection (browser offline) right after | When back online: the finished picture or the failure message, never a blank screen. Images went up by at most 2 (one picture's worth, never two). If it ended in the failure message, the count is unchanged and any image FASHN charged shows in images and spend. | `preview` (2 FASHN images) |
| P13a | 13 | **Operator:** set the cap on the preview to **(images shown in P12's panel + 2) × US$0.075**, worked out from the image count, not the rounded spend; redeploy. A, O1 | "Try again" on O1 | It works: one new picture. Spend now equals the cap exactly. | `preview` (2 FASHN images) |
| P13b | 12 | Same cap, A, O1, O2 | Open each | "See it on me" (O2) and "Try again" (O1) are replaced by the paused message, "Try-on is paused until 1 December. Your saved try-ons still show." The saved picture on O1 still opens. Count unchanged. | `preview` |
| P13c | 13 | **Operator:** set the cap to **(current images + 1) × US$0.075**, redeploy. A, O1 and O2 (each needs 2 images) | Ask for a picture on O1, then on O2 | Neither starts (paused or "would pass the cap" message). Spend, images and count unchanged. Spend never shows more than the cap. | `preview` |
| P14 | 14, 15 | **Operator:** keep P13b's used-up cap and add the Engineer's test-date setting (named in the build report), value **2026-12-01T00:05:00+11:00** (5 minutes past midnight on 1 December in Sydney), on the preview only, redeploy. A | Open O1, then a new outfit, then the spend panel | "See it on me" is back with no reset by anyone. Panel: December at US$0.00 and count 0; November listed as a previous month with its spend. **Don't tap** (a picture now would be counted in December). **Operator afterwards:** remove the test date, put the cap back to US$7.50, redeploy. | `preview` |
| P15 | 15 | A (owner on the preview) | Open the spend panel | Spend, cap US$7.50, count, images and previous months show. **Images = baseline images + the FASHN images QA's run caused in P5 to P13a** (8 planned; P12 may add fewer). **Spend = images × US$0.075, rounded half up to the cent.** QA records the images and count so Kasper can compare with FASHN's usage page. | `preview` |
| P16 | 16 | B; then signed out | Look for the panel in every screen, then open its address | No panel. "Not found". | `preview` |
| P17 | 18 | B, `fashun-test-body-b.jpg`, O5 | B agrees and adds the photo, makes O5's picture | B's picture shows B's person in the test top and jeans. B never sees A's photo or pictures anywhere. | `preview` (2 FASHN images) |
| P18 | 18 | A's photo and picture addresses (copied from A's screens), B's the same way | As B open A's; as A open B's; signed out open both | Not found or the sign-in page every time. No image comes back. | `preview` |
| P19 | 19 | A, `fashun-test-top.jpg` and a shop link from FASHUN-1's test list | Add an item by photo and one by link | Both save as before. **Operator:** the logs show no image-search or background-removal call, and the service settings show both those services still off on preview and live. Delete both items. | `preview` |
| P20 | 20 | **Operator:** turn try-on off on the preview, redeploy. A | Open Profile, O1, the wardrobe, Style me and saved outfits | No photo section and no "See it on me" anywhere. Every other screen is the same as on master (compare with screenshots of the same screens from the live site). **Operator afterwards:** turn try-on back on, redeploy. | `preview` |
| P21 | 17 | A, with O1's picture (and the photo) | Copy the photo and picture addresses. Delete the try-on photo and confirm. | The photo and O1's picture are gone. O1, O2 and O4 are still saved and show "Add a try-on photo to see this on you". The copied addresses answer not found. (Several pictures at once: A8.) | `preview` |
| P22 | 21 | A and B | Walk through FASHUN-1's checks that can be done by hand: sign in, profile view and edit, add by photo and link, wardrobe filter, edit and delete, Style me for one occasion, save an outfit, sign out and in, A and B can't see each other's clothes | All work as on master. (FASHUN-1's selfie check is left out: it's KAS-174's and costs a reading. FASHUN-1 check 14 is left out: FASHUN-2's checks 19 and 20 replace it, in P19 and P20.) | `preview` |
| P23 | all | A and B | Open every screen this touches: Profile, a saved outfit, saved outfits, the spend panel (A), wardrobe, Style me | No page shows an error. No server call returns a 5xx (browser network list). Operator: no 5xx in the logs apart from P11's on purpose. | `preview` |
| P24 | - | A and B | Delete B's try-on photo, every item and outfit QA added (O1, O2, O5 and their items), through the app. Delete O4 through the app too if it can be; otherwise the operator removes it. | Both accounts are back to P0's wardrobes and outfits, with no try-on photo. Spend and pictures already made stay counted (they were real). | `preview` |

## L. Live, after the merge (fashun-web.vercel.app)

None of these upload a photo or make a picture.

| # | Check | Test data | Action | Expected result | Marker |
|---|---|---|---|---|---|
| L1 | 1, 20 | A | Open Profile | If the operator has turned try-on on: "Your try-on photo" with "Add photo". If not yet: no section, and Profile is as before. | `live-safe` |
| L2 | 2 | A, try-on on | Tap "Add photo", read the note, tap "Not now" | The note matches word for word. Nothing is uploaded; after reload the section still says "Add photo". | `live-safe` |
| L3 | 4 | A (no photo), a saved outfit | Open it | "Add a try-on photo to see this on you", leading to the section. | `live-safe` |
| L4 | 16 | A and B (neither is the owner on live), and signed out | Open the spend panel's address | "Not found". No panel on any screen. | `live-safe` |
| L5 | 21 | A and B | Open sign-in, Profile, wardrobe, Style me, saved outfits | Each loads with no error and no 5xx. | `live-safe` |
| L6 | 15 | Kasper's own account | Kasper opens the spend panel on his phone | Panel shows; its image count matches FASHN's usage page, and the spend is that count × US$0.075, rounded half up to the cent. This is Kasper's own check at review; QA gives him P15's figures to compare. | `live-safe` (Kasper's step, not QA's) |

---

## Environment needs
- **FASHN key** in Fashun's hosting settings (Preview and Production), from Kasper via the operator.
- **New settings:** try-on switch, cap (US$7.50), price (US$0.075), owner account, and a test-date setting for P14 that works on Preview only. The Engineer's build report names each one.
- **Database change and private storage** for try-on photos and pictures (build 1). The operator applies them before the real-use run.
- **Test photos:** the 2 full-length people and 4 clothing photos above, computer-generated, attached to a fixtures task. Not available yet.
- **Operator-made test data:** outfit O4 on account A, set up by the operator before P7 (PM decision, KAS-231).
- **Logs:** the operator reads the preview logs for P11, P19 and P23.

## Questions (all settled, KAS-231)
Kasper decided 1 to 3 on the Decisions card (answered 16 Nov 2026, 22:28 UTC); the PM decided 4 to 6.
1. **Check 11 and a two-step picture: settled.** Kasper: "Count it in my spend". The person still sees "Nothing was charged" and no try-on is used up; an image FASHN charged before the failure counts in the owner's spend. Steps D3, D4, D7, F1, F4, P12.
2. **Check 15, price per image and rounding: settled.** Kasper: "Agree as written". Spend = images FASHN charged × US$0.075, rounded half up to the cent, with the image count shown. Steps F1, F2, F4, P15, L6.
3. **Check 6 (dress or jumpsuit): settled.** Kasper: "Drop it, add to roadmap". Not in this release; B4 and P6 removed, and no step needs a dress or jumpsuit.
4. **Check 8's outfit: settled.** PM: QA may use an outfit set up directly on a test account, labelled "operator-made test data". O4, P7.
5. **Check 7's line: settled.** PM: it names the outfit's own pieces that aren't drawn. B5, B5b, P5.
6. **Spend kept exactly: settled.** PM: stored exactly as an image count; only the display is rounded, and the cap is checked on the exact amount. E8, F4, P13a, P13c.
7. **FASHUN-1 check 14: settled.** Kasper agreed check 21 as written: FASHUN-1 check 14 is replaced by FASHUN-2 checks 19 and 20. I4, P22. Check 19 is QA's wording: H1, H2, P19.

## Count
50 `automated`, 28 `preview` (27 real-use steps P0 to P24, plus I3 on the PR), 6 `live-safe` (84 steps; was 81 before KAS-235: B4 and P6 removed, B5b, D7, E8, F4 and I4 added). Check 6 is not in this release and has no steps. Every other check, 1 to 5 and 7 to 22, has at least two steps (fewest: checks 5, 7, 8, 9, 10, 14, 16, 17 and 19 with 3; check 22 with 2).
