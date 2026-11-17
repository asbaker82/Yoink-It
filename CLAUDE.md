# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dev Commands

```bash
# Web (primary for local testing — opens at http://localhost:8081)
npx expo start --web

# Mobile
npx expo start --android
npx expo start --ios

# TypeScript check (no separate lint script exists)
npx tsc --noEmit
```

Node.js must be in PATH. On Windows, refresh after install:
```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
```

## Architecture

### Auth — `store/AuthContext.tsx`
Wraps `AppProvider` in `app/_layout.tsx`. Persists to `AsyncStorage` (web = localStorage) under three keys:
- `@yoink_it/auth_user` — user JSON (never includes `profilePhoto`)
- `@yoink_it/registered_users` — array of registered user JSON (no photos)
- `@yoink_it/profile_photo` — photo stored separately to avoid 5 MB localStorage quota

The mock users (phones `+15555550101`–`0104`) bypass OTP and log in directly. All other numbers go through phone → OTP (`1234` always works) → name → contacts flow. The routing guard in `app/_layout.tsx` uses `useSegments` + `useEffect` to redirect unauthenticated users to `/(auth)/welcome` and authenticated users away from auth screens. During the one-frame gap while auth resolves, `AppContext` uses a stub user `{ id: '', name: '', ... }` to prevent a `useApp must be within AppProvider` crash.

**Never `await` a Supabase call inside `supabase.auth.onAuthStateChange`.** supabase-js runs that callback while holding its auth lock; a query there deadlocks every later request (saves spin forever). Defer with `setTimeout(..., 0)` as `AuthContext` does. Listing saves are wrapped in `withTimeout` (`utils/withTimeout.ts`) so a hang surfaces as an error.

### App state — `store/AppContext.tsx`
All non-auth state in a single React Context accessed via `useApp()`. No Redux/Zustand.

- `store/types.ts` — canonical types. Read `Item`, `User`, `SearchNotification` before touching any feature. Test data lives in `supabase/seed.sql`.
- Key mutations — give flow: `claimItem`, `joinWaitlist`, `leaveWaitlist`, `releaseClaim`, `markPickedUp`, `confirmPickup`, `createItem`, `updateItem`, `deleteItem`; borrow flow: `createBorrowRequest`, `cancelBorrowRequest`, `approveBorrowRequest`, `rejectBorrowRequest`, `markBorrowReturned`, `confirmBorrowReturn`, `addBlockedPeriod`, `removeBlockedPeriod`
- `processExpiredClaims` runs on a 30-second `setInterval` — promotes `waitlist[0]` to claimant when `claimDeadline` passes, or resets to `available`.
- **Dismissed items**: `dismissed` (Set<string>), `dismissItem`, `restoreItem`, `restoreAll` — per-user, persisted to AsyncStorage at `@yoink_it/dismissed/<userId>`. These must be declared **after** `currentUser` in the provider body since `dismissedKey` depends on `currentUser.id`.

### Friends — requests the other person approves
- `profiles.friends uuid[]` holds **accepted, mutual** friendships only. Clients can't write it (trigger `profiles_guard_friends` resets client edits); only security-definer RPCs do, always on both sides.
- Table `friend_requests(from_id, to_id)`. RPCs: `send_friend_request(target_id)` (auto-accepts if they already asked me), `respond_friend_request(requester_id, accept)`, `remove_friend(friend_id)`; cancel = delete own row. `add_friend_mutual` was dropped (it used jsonb ops on a uuid[] column).
- `AppContext` exposes `incomingRequests` / `outgoingRequests` (user ids, refetched every 30 s) and `sendFriendRequest`, `acceptFriendRequest`, `declineFriendRequest`, `cancelFriendRequest`, `removeFriend`; each re-reads my profile via `refreshAuthUser()`.
- **No user directory.** RLS policy `profiles: me, friends, requests` lets you read only your own profile, your friends', and people with a pending request to/from you (`fetchAllProfiles` returns just those). Everyone else is found by phone number via security-definer RPCs: `match_contacts(phones[])` (FriendFinder sends the phone's normalized contacts; nothing stored) and `find_user_by_phone(phone)` (typing a full number in the search box). Wrappers `matchContacts` / `findUserByPhone` in `store/db.ts`. Contacts on the app get **Add** (request); others get **Invite** (text).
- **One screen**: `components/FriendFinder.tsx` (search; Friend requests → Accept/Decline; On Yoink It → Add/Requested; Invite to Yoink It; "Invite someone by text"), used by `app/add-friends.tsx` and the sign-up step `app/(auth)/contacts.tsx`.
- Entry points: Profile friends card **Add** (orange badge = incoming requests) and a Browse banner when requests are waiting.
- `getFriendItems()` shows items from people in `currentUser.friends` (mutual by construction), minus Friend-access restrictions. `canSeeItem(item)` (item detail, claim, waitlist, borrow request) = mine, or a friend's within Friend access, or one I'm mid-handoff on.
- **The database enforces this too**: RLS policy `items: friends read` (end of `schema.sql`) returns only those items, so removing a friend hides listings both ways. Because of that, friend changes must invalidate `QUERY_KEYS.items`. `AppContext` polls my own `friends` (`QUERY_KEYS.myFriends`, 30 s) so a removal/acceptance by the other person shows up without a reload. There is no per-user "item visibility" setting anymore (`profiles.item_visibility` is unused).

### Routing — Expo Router (file-based)
```
app/
  _layout.tsx              Root stack. Auth guard lives here. Loads BricolageGrotesque_800ExtraBold font.
  (auth)/
    welcome.tsx            Animated welcome screen — sticker peel entry + stagger fades. First screen for unauthenticated users.
    phone.tsx              Phone entry → sends OTP
    verify.tsx             OTP entry (always "1234") → existing user → tabs, new user → name
    name.tsx               Name entry for new users
    contacts.tsx           Sign-up friends step (FriendFinder)
  (tabs)/
    _layout.tsx            Tab bar + headerRight profile icon on Browse and My Items
    index.tsx              Browse — fuzzy search, listing type + status filters, swipe-to-dismiss, search alerts
    my-items.tsx           My Items — My Listings / From Friends views (see "My Items" below) + FAB
    profile.tsx            Profile — reached via header icon, not tab bar
  item/
    [id].tsx               Item detail — claim, waitlist, pickup, edit, SMS, lightbox, borrow request
    new.tsx                New listing form (modal)
    edit/[id].tsx          Edit listing form (modal)
  items-list.tsx           Sectioned listing view — ?filter=listed|active|claimed
  friend/[id].tsx          A friend's open listings (Free / Borrow / Skills), reached by tapping a friend in Profile. Uses getFriendItems() so visibility rules apply.
  add-friends.tsx          Friends: requests, add, invite (FriendFinder)
  edit-profile.tsx         Edit name, email, photo, area (city/state/ZIP)
```

Path alias `@/` maps to the repo root.

### Navigation structure
- Only **Browse** and **My Items** appear in the bottom tab bar (`CustomTabBar.tsx` TABS array).
- **Profile** is reached via `ProfileHeaderButton` in the header right of Browse and My Items. It is registered as a tab screen with `href: null` so routing works but it stays off the bar.
- **Do not switch back to the default tab bar** — it clips labels on web due to `overflow: hidden` in framework CSS. Add tabs by editing `TABS` in `CustomTabBar.tsx` and adding a `<Tabs.Screen>` in `app/(tabs)/_layout.tsx`.
- `CustomTabBar` renders the hidden-items trash icon (bottom-right, `position: 'absolute'`) and owns the hidden-items bottom sheet. It reads `dismissed`, `restoreItem`, `restoreAll`, and `getFriendItems` from `useApp()`.

### Key business logic
- **Claim flow**: `available → claimed` (sets `claimDeadline = now + claimPickupHours * 3600000`). Deadline passes → `processExpiredClaims` promotes next waiter or resets to `available`. CTA button label is "Claim →".
- **Give lifecycle**: `available → claimed → pending_pickup → picked_up` (happy path) or any state `→ disposed`. The `pending_pickup` step is a two-party confirmation: donee calls `markPickedUp` (sets `pending_pickup`), donor calls `confirmPickup` (sets `picked_up`). Either party can call `releaseClaim` to revert.
- **Borrow lifecycle**: Donee selects a date range via `DateRangePicker` → `createBorrowRequest` → donor approves (auto-rejects overlapping pending requests via `datesOverlap`) → item status `borrowed` with `borrowedBy`/`borrowedUntil`. Return is two-party: donee calls `markBorrowReturned` (sets `pending_return`), donor calls `confirmBorrowReturn` (clears borrow fields, resets to `available`). Donors can block periods via `addBlockedPeriod`/`removeBlockedPeriod`. Borrow items use `disposalDate: '2099-12-31'` and `claimPickupHours: 0` as sentinels — do not show disposal UI for them.
- **Cancel borrow request**: `cancelBorrowRequest` removes the request from the array entirely. This differs from `rejectBorrowRequest` (donor action) which marks status as `'rejected'` and keeps it in the array.
- **Skill listings** (`listingType: 'skill'`): offers of help/expertise (car maintenance, woodworking). Reuse the borrow sentinels (`disposalDate: '2099-12-31'`, `claimPickupHours: 0`), store `pickupLocation: ''`, and use `pickupWindow` as optional availability. No status lifecycle — always `available`. "Ask for Help" opens the existing SMS sheet with a prefilled message; there is no in-app request flow. Use explicit `isGive` / `isBorrow` / `isSkill` checks — never `!isBorrow` to mean "give".
- **Friend access** (`components/FriendAccessInput.tsx`): every listing is Everyone / Only these / All except. `allowedBorrowers` (DB `allowed_borrowers uuid[]`) is an allow-list; `excludedFriends` (DB `excluded_friends uuid[]`) is a block-list. They are mutually exclusive; null/empty = everyone. `canSeeRestricted()` in `AppContext` enforces it in `getFriendItems`, item detail, `claimItem`, `joinWaitlist`, and `createBorrowRequest`; current claimants, waitlisters, borrowers, and active requesters keep access if later removed.
- **Swipe-to-dismiss**: `SwipeableCard` wraps each `ItemCard` in Browse. Swiping left past 100 px (or fast flick) calls `dismissItem` from AppContext. Dismissed items are filtered out of `sortedFiltered` before the FlatList. The trash icon in `CustomTabBar` opens a restore sheet; it only appears when `dismissed.size > 0`.
- **Validation**: When creating or editing a listing, `claimPickupHours` must be less than the hours remaining until `disposalDate` — enforced in both `new.tsx` and `edit/[id].tsx`.
- **Item detail countdown**: `app/item/[id].tsx` ticks a `now` state every 30 s. The "Pick Up Within" row shows `"Xd Xh Xm remaining"` while the claim is live, or `"Xd Xh window"` when unclaimed. When `claimDeadline` has passed and the item is still `claimed`, a donor-only expiry banner renders with an "Extend 1 Day" button (`updateItem` adds 24 h to `claimDeadline`). Auto-release is handled by `processExpiredClaims` in `AppContext`.
- **Restrictions gate**: If `item.restrictions` is set and the viewer presses "Claim →", a `ConfirmSheet` intercepts, showing the restrictions text and asking for acceptance. `doClaimItem()` only fires if the user confirms.
- **Picked-up give items**: Once `status === 'picked_up'`, the item detail hides all logistical rows (pickup, window, pickup-within, disposal, map card). The bottom CTA becomes plain text ("Picked up — enjoy!"). The SMS pre-fill becomes a thank-you note from donee first name to donor first name.
- **Supabase constraint**: The `items.status` check constraint must include `'pending_pickup'`, `'borrowed'`, and `'pending_return'`. Migration for a live DB:
  ```sql
  ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_status_check;
  ALTER TABLE public.items ADD CONSTRAINT items_status_check
    CHECK (status IN ('available','claimed','pending_pickup','picked_up','disposed','borrowed','pending_return'));
  ALTER TABLE public.items
    ADD COLUMN IF NOT EXISTS listing_type text NOT NULL DEFAULT 'give',
    ADD COLUMN IF NOT EXISTS borrow_requests jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS blocked_periods jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS borrowed_by text,
    ADD COLUMN IF NOT EXISTS borrowed_until timestamptz;
  ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_listing_type_check;
  ALTER TABLE public.items ADD CONSTRAINT items_listing_type_check CHECK (listing_type IN ('give','borrow','skill'));
  ALTER TABLE public.items ADD COLUMN IF NOT EXISTS allowed_borrowers uuid[];
  ALTER TABLE public.items ADD COLUMN IF NOT EXISTS excluded_friends uuid[];
  ```

### Texting & invites
- **Person-to-person texts always go through the device's own Messages app** via `openSms(phone, body?)` in `utils/sms.ts` (empty `phone` lets the user pick the recipient). The app never sends SMS itself, except future real login codes.
- **Invites** (in `FriendFinder`): contacts not on the app get an **Invite** button → `recordInvite` (table `invites(inviter_id, phone)`) + Messages with `inviteMessage()` from `utils/invite.ts`; a last row invites anyone by text (no recipient). Set `INVITE_LINK` there once the App Store link exists.
- **Invite → request on signup**: trigger `profiles_befriend_inviters` (after insert on `profiles`) turns each invite for the new user's phone into a `friend_requests` row (inviter → new user), which they accept on the sign-up friends step. Phones are normalized `+1XXXXXXXXXX` (`normalizeUsPhone`).
- **Reminders/alerts** (pickup deadlines, requests, returns) are meant to be **push notifications**, not SMS.

### Notifications — `utils/notifications.ts`
- `requestNotificationPermission()` — requests browser `Notification` permission; called on login in `AppContext`. Web-only; returns `false` on native.
- `sendNotification(title, body)` — fires a browser notification if permission is granted.

**Watcher pattern in `AppContext`**: A `useEffect` watches the `items` array for state transitions and fires notifications. Two refs prevent false positives:
- `notifInitialisedRef` — skips the initial data load so no spurious notifications fire on mount.
- `prevItemsRef` — snapshot of the previous `items` array; diffed on each render to detect genuine transitions (e.g. a borrow request going from `pending` → `approved`).

Transitions that fire notifications: new pending borrow request on donor's item; donor's give item → `pending_pickup`; donor's borrow item → `pending_return`; donee's borrow request → `approved` or `rejected`.

### Date utilities — `utils/dates.ts`
Three helpers for calendar fields that store dates as `YYYY-MM-DD` strings:
- `toDateOnly(value)` — slices an ISO timestamptz to `YYYY-MM-DD`.
- `parseCalendarDate(value)` — returns a `Date` at local noon to avoid UTC-midnight off-by-one errors.
- `formatCalendarDate(value, options?)` — formats a date string for display (defaults to `"May 26"` style).

### Sounds — `utils/sounds.ts`
- `playClaimSound()` — celebratory C5→E5→G5 arpeggio on web via `AudioContext`; native builds a WAV buffer in memory and plays it via `expo-av` + `expo-file-system` (no bundled audio files).
- `playWaitlistSound()` — softer two-note ascending boop, same dual-path approach.
- Both fail silently so animations still run if audio is blocked.

### Location privacy — city, state, ZIP only
- The app **never stores street addresses**. `Item.pickupLocation` and `User.defaultAddress` keep their names but hold `"City, ST 12345"` (older rows may be a bare ZIP; `pickupLocation` is `''` for skills). Exact pickup spots are arranged by text.
- `utils/location.ts`: `Location` type, `parseLocation` / `formatLocation` / `shortLocation` ("City, ST" for cards), `locationError`, and `lookupZip` (Zippopotam.us — only the ZIP is sent; cached per session).
- `components/LocationInput.tsx` (ZIP · City · State): typing a ZIP auto-fills city/state; both stay editable. Opening a ZIP-only row fills them in.
- DB check constraints `items_pickup_zip_check` / `profiles_zip_check` allow only `"City, ST 12345"` or a bare ZIP — city can't contain digits or commas, which blocks street addresses.
- Item detail shows a non-tappable "Pickup area · City, ST ZIP" card — no maps/directions link.

### Photo grids
Photo grids in `item/new.tsx`, `item/edit/[id].tsx`, and the thumbnail strip in `item/[id].tsx` use `flexDirection: 'row', flexWrap: 'wrap', gap: 10` — **not** a horizontal `ScrollView`. The delete (×) button on each photo thumbnail is `position: 'absolute', top: 4, right: 4` so it stays inside the photo bounds, not floating outside.

### Platform differences
- `Alert.alert` callbacks don't fire on web — use `window.confirm()` / `window.alert()` on `Platform.OS === 'web'` with `Alert.alert` fallback for native. Follow this pattern for every destructive or confirmatory action.
- `Modal` must **never** be nested inside `ScrollView` on web — silently breaks rendering. Place `Modal` as a sibling of `ScrollView` inside a wrapping `View`.
- Haptics (`expo-haptics`) must be guarded: `if (Platform.OS !== 'web') Haptics.xxx()`.
- SMS deep linking: iOS uses `sms:NUMBER&body=TEXT`, Android/web use `sms:NUMBER?body=TEXT`.
- Profile photo: on web, `expo-image-picker` returns a blob URL — must be converted to a data URL via `FileReader` then compressed with canvas before storing (see `blobUrlToCompressedDataUrl` in `edit-profile.tsx`).
- **`overflow: hidden` on RN Web**: React Native Web automatically applies `overflow: hidden` to Views with `borderRadius`, which clips absolutely-positioned children (e.g. calendar dropdowns). The fix is to use a `Modal` instead of an inline absolute overlay. `DatePickerInput` uses this pattern: `dropUp` prop causes it to use a Modal even on web. Never assume an absolutely-positioned popup will escape a bordered ancestor.

### Components reference
| Component | Purpose |
|---|---|
| `HeaderLogo` | Speed-wordmark logo used as `headerTitle` on all screens. Accepts `size` prop (default 22). Uses `BricolageGrotesque_800ExtraBold` font. |
| `CustomTabBar` | Custom bottom tab bar (Browse + My Items). Also owns the hidden-items trash icon and restore sheet. Reads dismissed state from `useApp()`. |
| `ProfileHeaderButton` | Avatar/initials button (40×40) in header right → profile screen |
| `ItemCard` | Card used in Browse, My Items, items-list, and friend pages. Shows the pickup city/state. Borrow items show a single left badge: "Borrow" (sky-blue) when available, "Borrowed" (yellow/dark text) when out. |
| `ListEnd` | Quiet "That's everything" marker used as `ListFooterComponent` on every item list (Browse says "You're all caught up"). Only shown when the list has items. |
| `SwipeableCard` | Wraps `ItemCard` in Browse. `PanResponder`-based swipe-left-to-dismiss. Shows an `eye-slash` hint icon as the card slides. Calls `onDismiss` after animation completes. |
| `LocationInput` | ZIP · City · State fields for item pickup and profile; ZIP auto-fills city/state via `lookupZip`. |
| `FriendFinder` | The single friends screen body (search, requests, add, invite). Props `doneLabel`, `onDone`. |
| `FriendAccessInput` | Everyone / Only these / All except picker for listing visibility. |
| `DatePickerInput` | Custom calendar for single date selection. Displays and accepts **MM-DD-YYYY** format. On web: absolute dropdown (no `dropUp`); with `dropUp` prop: Modal overlay (bypasses overflow clipping). Fixed width 276 px — never stretch. Past dates disabled. |
| `DateRangePicker` | Calendar for selecting a start+end date range (used in borrow request form). Always uses Modal overlay. First tap sets start, second tap (later date) sets end and closes. Highlights the range between selected dates. |
| `ImageLightbox` | Full-screen photo modal with keyboard nav on web. Sibling of `ScrollView`, never nested. |
| `ClaimToast` | Slide-up toast after claiming — shows pickup deadline. |
| `WaitlistToast` | Slide-up toast after joining waitlist. |
| `UserName` | Another person's name, tappable (bold + underline). Opens `UserSheet`. Nest it inside sentences: `<Text>Claimed by <UserName userId={id} /></Text>`. **Always use it to show another user's name** (not on add-friends/contacts rows). Plain text for the current user. |
| `UserSheet` | `UserSheetProvider` (in `app/_layout.tsx`) + `useUserSheet().openUser(id, { hideListings? })`: Modal with "Text {First}" (via `openSms` in `utils/sms.ts`) and "See {First}'s listings" (`/friend/[id]`). Profile friend rows open it too. |
| `ConfirmSheet` | Slide-up confirmation sheet (replaces `Alert` for release-claim flow). |
| `ImageCropModal` | **Web-only** circular crop modal. Injects a `<canvas>` imperatively into a `View` DOM node. Drag to pan, scroll/buttons to zoom. Used in `edit-profile.tsx` after image pick. |

Both toast components use core RN `Animated` (not Reanimated) with `useNativeDriver: true`.

### Action banners — `app/(tabs)/index.tsx`
Stacked banners appear above the feed, one per pending action. Tapping one opens an in-place action sheet (`activeSheet`) listing those items with their action buttons; the "add friends" banner instead navigates via its `dest` field.

| Key | Condition | Color |
|---|---|---|
| `add-friends` | User has zero friends → `/add-friends` | Tangerine |
| `pickup` | I've claimed a give item and the pickup window is open | Tangerine |
| `borrow-requests` | My borrow item has a `pending` request | Sky blue |
| `confirm-pickup` | My give item is `pending_pickup` | Sage |
| `confirm-return` | My borrow item is `pending_return` | Sky blue |

### My Items — `app/(tabs)/my-items.tsx`
Two views via a segmented control, each with an orange count of items needing action. Deep link with `?view=listings|friends` (honored even when the tab is already mounted).
- **My Listings** — chips All / Free / Lending / Skills; sections **Needs your action** (`needsMyAction`: give `pending_pickup`, borrow with a pending request or `pending_return`), **Active**, **Completed**. Cards use `renderDonorCard` (confirm pickup, approve/decline, confirm return, remove) rendered inside the card via `ItemCard`'s `footer`. There is no "dispose" action in the UI; `disposed` remains a valid status only for older rows.
- **From Friends** — sections **Ready to pick up**, **Waiting on donor**, **Borrowing**, **Returning**, **Requested**, **Waitlisted**, each with a status line and inline actions (Mark Picked Up, Release, Mark Returned, Cancel Request, Leave Waitlist) confirmed through one shared `ConfirmSheet`.

### Browse screen filters — `app/(tabs)/index.tsx`
Two-level filter system:
1. **Listing type bar** (segmented control): All / Free / Borrow — styled with distinct active colors (dark / tangerine / sky). Changing this resets the status filter.
2. **Status chips** (shown only when listing type ≠ All): Free → All / Available / Claimed; Borrow → All / Available / Borrowed. The "Borrowed" chip matches both `borrowed` and `pending_return` statuses.

**Fuzzy search** — `fuzzyScore(query, item)` in `utils/search.ts` (also used for search-alert matching):
- Exact phrase match → score 100
- Whole query is a synonym term (e.g. "love seat") and a group-mate appears → 90
- Token substring match → score 10 per token (reverse containment only for listing words ≥ 4 chars, so "of"/"a" never match)
- Synonym match → 8 per token (whole words, plurals folded, no typo tolerance)
- Edit distance: words ≥ 6 chars allow 1 edit; words ≥ 9 chars allow 2 edits
- **Multi-word queries require ALL tokens to match** — partial hits return 0
- Title, description, and restrictions are all searched; if the title alone also matches, `TITLE_BONUS` (200) is added so title hits rank above description-only hits

**Synonyms** — `utils/searchSynonyms.ts` holds `SYNONYM_GROUPS` (sofa = couch = loveseat …). Keep groups tight, never add bare generic words that collide across items ("seat", "frame", "washer", "saw"), and keep each term in one group.

Do not loosen thresholds or add synonyms without testing "can opener" does not return car seats.

### Profile screen — `app/(tabs)/profile.tsx`
- Friends list is a **collapsible card** (collapsed by default). The Add button is always visible.
- Friends sorted alphabetically by **last name**.
- Removing a friend is blocked if the current user has an active borrow (`status === 'borrowed' || 'pending_return'`) from that friend.

### Styling
**Every colour comes from `constants/theme.ts`** — never write a hex literal in a screen or component (the only exception is `'#000'` as a `shadowColor`). If a new shade is needed, add a named token there first. All styles use `StyleSheet.create` inline per file. The RN-web `boxShadow` deprecation warning is harmless.

**No dark mode.** `app.json` sets `userInterfaceStyle: "light"` and `app/_layout.tsx` always uses a light navigation theme (`navTheme`, Cream background). Don't reintroduce `useColorScheme`.

**Editing safely with live reload:** when adding a token to a file, add it to the `@/constants/theme` import *before* (or in the same write as) the code that uses it, and remove a token from the import only *after* its last use is gone — otherwise Metro hot-reloads a broken intermediate file and shows "X is not defined".

Core brand tokens:
| Token | Hex | Role |
|---|---|---|
| Tangerine | `#F26B3A` | Primary CTAs, active chips, badges |
| Tangerine Deep | `#D8531F` | Alert text, shadows, pressed states |
| Cream | `#FBF6EE` | Screen backgrounds, button text on dark |
| Cream 2 | `#F4ECDD` | Card backgrounds, secondary surfaces |
| Ink | `#1F1A17` | Primary text |
| Ink 2 | `#3A332E` | Secondary text |
| Mute | `#847A70` | Placeholder / label text |
| Sage | `#7FA88A` | Pickup pin, "picked up" badge |
| Butter | `#F4C95D` | "Claimed" / "Borrowed" badge background |
| Sky | `#7BA7BC` | Borrow accent color, "Borrow" badge |
| Plum | `#7A5C8C` | Selected "All" filter (Browse and My Items) |

Supporting tokens: `WHITE` (item cards, sheets, modals), `BORDER` `#E8DDD0`, `TRACK` (segmented-control track), `MUTE_LIGHT` (disabled / past dates / empty states / "Gone"), `FAINT` (very faint text/icons), `STEEL_BLUE` (pending-pickup badge), `ROSE`, and tints with matching text colours: `TANGERINE_TINT` + `PEACH` (alerts, errors, calendar "today"/range), `SKY_TINT` (borrow panels), `BUTTER_TINT` + `BUTTER_INK`, `ROSE_INK` (waitlist text). Calendars (`DatePickerInput`, `DateRangePicker`) and `ImageCropModal` use Tangerine for selection — not green.

**All screen backgrounds** use Cream (`#FBF6EE`) — auth screens, tab screens, and stack screens alike. Do not use `#fff` as a screen background.

**Tab headers** (Browse, My Items, Profile) use `backgroundColor: '#FBF6EE'` (Cream) with `headerShadowVisible: false` so the header blends into the page. **Stack headers** (item detail, modals, edit screens) keep the default white (`#fff`) from React Navigation. All headers use `HeaderLogo` as `headerTitle` — do not use plain string titles. All headers use `headerTitleAlign: 'center'`.

**Item cards** (`ItemCard`) are white (`#FFFFFF`) with a `BORDER` (`#E8DDD0`) edge and soft shadow so they stand apart from the Cream background. Per-card actions (My Items) go inside the card via `ItemCard`'s `footer` prop, never as a loose row below it. **Other surfaces** (panels, chips, secondary buttons) use Cream 2 (`#F4ECDD`). Colours live in `constants/theme.ts` — import from there rather than redefining hex values. Destructive actions use Tangerine Deep (`#D8531F`), never `#e53e3e` or other reds.
