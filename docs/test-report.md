# Food Delivery System — Test Report

**Report date:** 19 November 2026
**Subject:** the test set for the second delivery (drag and drop, bonus points, feedback, admin panel,
sign-in security), together with the first delivery's tests, which were re-run to prove nothing broke.

---

## 1. Summary

| Suite | What it proves | Checks | Result |
|---|---|---|---|
| Unit (`npm test`) | The rules themselves, as pure functions with no database and no framework | 65 | **all pass** |
| Database (`npm test` with `DATABASE_URL`) | That a real PostgreSQL refuses bad data on its own | 12 | **all pass** |
| End-to-end, first delivery (`node test/e2e.mjs`) | Ordering, payment, roles and accounting over HTTP | 15 | **all pass** |
| End-to-end, second delivery (`node test/e2e-features.mjs`) | Drag and drop, bonus points, feedback, the admin panel, sign-in limits | 27 | **all pass** |
| End-to-end, third delivery (`node test/e2e-week3.mjs`) | Languages, the profile, passwords, addresses, history, reports, the server | 35 | **all pass** |
| **Total** | | **154** | **154 pass, 0 fail** |

**New this week: 72 checks** — 32 unit, 5 database, 35 end-to-end. The brief asked for 30.

The 42 end-to-end checks written for the first two deliveries were run again after every change and
still pass unchanged. That is the evidence that languages, the profile, the password work and the
address limiter did not quietly alter ordering, payment, bonus points or the role rules.

---

## 2. How to run

```sh
npm run db:up                                                           # 1) PostgreSQL in Docker
DATABASE_URL=postgres://food:food@localhost:5433/food_delivery npm test  # unit + database
npm run dev:api                                                          # 2) in a second terminal
npm run test:e2e                                                         # 3) all three HTTP suites
```

Without `DATABASE_URL` the database tests skip themselves and only the pure rules run. `npm run test:e2e`
runs the three suites in order and stops at the first failing one. The database tests need `psql` on the
PATH.

The end-to-end suites register throwaway accounts named `e2e-…@example.test`, each with its own phone
number, since one number now belongs to one customer. `npm run db:clean-tests` removes what earlier runs
left behind.

---

## 3. Unit tests from the first two deliveries — 33 checks

Pure rules, no database, no HTTP. Run with Node's own test runner; no testing library is installed.

### 3.1 First delivery — `test/domain.test.ts` (9 checks, unchanged)

| # | Check |
|---|---|
| 1 | status: CONFIRMED can never go back to PENDING |
| 2 | status: kitchen may only take the next step |
| 3 | status: final statuses have no way out |
| 4 | order: valid input is normalised and sorted |
| 5 | order: same details give the same hash, any change gives another |
| 6 | order: empty cart, bad quantity, duplicate dish, bad id are rejected |
| 7 | order: delivery time must be ASAP or within the next 7 days |
| 8 | checkout outcome: only the four demo outcomes are accepted |
| 9 | registration: valid and invalid input |

### 3.2 Bonus points — `test/bonus.test.ts` (7 new checks)

| # | Check | Why it matters |
|---|---|---|
| 10 | an approved payment earns 5% of the money paid, rounded down | The earn rate is the heart of the scheme; rounding down keeps the restaurant from giving away fractions |
| 11 | nothing is earned from a payment that is zero, negative or not a number | A broken amount must never turn into free points |
| 12 | points may cover at most 30% of an order | The discount cap |
| 13 | a customer can never spend more points than they hold | Including a negative balance, which must give zero and not a discount |
| 14 | the applied discount is the smallest of request, balance and the 30% cap | All three limits at once, plus fractions and negatives refused |
| 15 | settle keeps discount, amount to pay and new balance in agreement | The whole money/points picture has to add up |
| 16 | points cannot create themselves, because only money paid earns them | An order must never return more points than it takes, or the scheme prints money |

### 3.3 Sign-in security — `test/security.test.ts` (8 new checks)

| # | Check | Why it matters |
|---|---|---|
| 17 | the fifth failure in the window blocks the account, the fourth does not | The exact threshold, on both sides |
| 18 | the attempts shown to the user count down and stop at zero | The warning the user sees, never negative |
| 19 | a block lasts 15 minutes from the moment it is set | |
| 20 | failures are counted over the last 15 minutes only | An old mistake must not block anyone hours later |
| 21 | the wait left is read from the stored time, in any shape | `Date`, the string PostgreSQL returns, `null`, and nonsense |
| 22 | an account is blocked exactly while there is time left on it | Including the moment the block runs out |
| 23 | the wait is described in words the user can act on | "45 seconds" / "15 minutes" |
| 24 | every journal event has a severity, and unknown kinds are refused | No event can be recorded without an importance, and a made-up kind cannot be filtered in |

### 3.4 New feature validation — `test/features.test.ts` (9 new checks)

| # | Check | Why it matters |
|---|---|---|
| 25 | feedback: a whole star from 1 to 5 with an optional trimmed comment | |
| 26 | feedback: ratings outside 1-5, fractions and over-long comments are refused | 0, 6, 2.5, a string, nothing at all |
| 27 | feedback: a reply must say something and stay within the limit | An empty reply would look like an answer without being one |
| 28 | menu item: valid input is trimmed, and the price must be whole tiyn in range | |
| 29 | menu item: empty names, fractional, negative and absurd prices are refused | A slipped zero would put a 1,000,000 KZT dish on the menu |
| 30 | drag and drop: the new menu order is a list of distinct dish IDs | A repeated dish would claim two places at once |
| 31 | access: blocking needs a written reason, unblocking does not | The journal has to be able to say why |
| 32 | order: bonus points default to none and must be a whole, non-negative number | |
| 33 | order: changing the points changes the fingerprint, so a retry cannot change the discount | Without this, a retry could come back with a different discount under the same attempt ID |

---

## 4. Database tests from the first two deliveries — 7 checks

These run against a real PostgreSQL through `psql`. They prove the rules hold even when a request never
goes through the application at all — for example when someone runs an `UPDATE` by hand.

| # | Check | Status |
|---|---|---|
| 1 | schema.sql applies twice without errors (idempotent) | first delivery |
| 2 | trigger and `domain/status.ts` agree on every one of the 64 status pairs | first delivery |
| 3 | same customer + same attempt_id cannot create two orders | first delivery |
| 4 | invalid quantity and negative price are rejected by CHECK constraints | first delivery |
| 5 | ADMIN is an accepted role, nonsense roles are not | **new** |
| 6 | a review can only be stored for an order that was actually delivered | **new** |
| 7 | bonus history cannot lie: earning adds points and spending takes them away | **new** |

Check 2 is the one that keeps the two copies of the status graph honest: it walks all 8 × 8 status pairs
and asserts that the database trigger and the TypeScript rule give the same answer for each one. Check 6
covers the new trigger — a review on a pending order is refused, a second review on the same order is
refused, and a rating of 0 or 6 is refused. Check 7 covers the sign constraints: an "earned" line that
removes points, a "spent" line that adds them, and any balance below zero are all refused.

---

## 5. End-to-end tests, first delivery — 15 checks

`node test/e2e.mjs`, unchanged from the first delivery, re-run against the current code.

| # | Check |
|---|---|
| 1 | guests can read the menu, but not orders |
| 2 | login works for all four seeded roles; wrong password is rejected |
| 3 | create order: saved as PENDING, server calculates 5,100 KZT |
| 4 | retry with the same attempt returns the SAME order (no duplicate) |
| 5 | same attempt with a changed cart is refused (409) |
| 6 | empty cart, quantity 0, quantity 21 are rejected (400) |
| 7 | roles: Bob cannot read Alice's order; kitchen cannot see an unpaid order (403) |
| 8 | checkout success: CONFIRMED; repeating it does not pay twice |
| 9 | status rules: CONFIRMED → PENDING and CONFIRMED → READY are refused (409) |
| 10 | kitchen moves the order forward step by step; a customer cannot |
| 11 | kitchen view has no prices and no customer address |
| 12 | checkout rejected → PAYMENT_REJECTED; simulated time limit → EXPIRED |
| 13 | lost reply: 503 once, then Retry recovers the same saved order |
| 14 | accounting: only the accountant reads reports; approved total matches |
| 15 | registration creates a customer only and signs in |

**Result: 15 of 15 pass.** This is the regression evidence for the second delivery.

---

## 6. End-to-end tests, second delivery — 27 new checks

`node test/e2e-features.mjs`. Each check uses its own cookie jar, so the customer, the kitchen, the
accountant, the administrator and the guest are genuinely separate sessions. Customers are registered
fresh inside the test, so balances and failure counters always start from zero.

### 6.1 Admin panel (8 checks)

| # | Check | What it proves |
|---|---|---|
| 1 | the seeded administrator can sign in | The ADMIN role exists and works end to end |
| 2 | the admin panel is closed to every other role, and the refusal is recorded | Customer, kitchen and accountant each get 403 on four admin endpoints, a guest gets 401, and the refusal appears in the security journal |
| 3 | admin overview answers with the numbers the dashboard shows | |
| 4 | admin can add a dish, edit it, and the public menu follows | The change reaches the page guests see |
| 5 | admin rejects a dish with a broken price or an empty name (400) | Negative, fractional, and blank |
| 6 | drag and drop: the new menu order is saved and shown to everyone | Moves the last dish to the front and checks both the admin list and the public menu; then restores the original order |
| 7 | drag and drop: a list with a repeat or an unknown dish is refused (400) | And the menu is unchanged afterwards — the transaction rolled back |
| 8 | a dish nobody ordered is deleted outright | |

### 6.2 Bonus points (5 checks)

| # | Check | What it proves |
|---|---|---|
| 9 | a new customer starts at zero points and earns 5% of an approved payment | The balance, the history line and the order's `bonusEarned` all agree |
| 10 | points pay part of the next order and leave the balance | And nothing leaves the balance before the payment: the order is created, the balance is checked, *then* it is paid |
| 11 | asking for more points than allowed is refused and saves no order (400) | Both limits — more than the balance, and more than 30% — and the order count is unchanged afterwards |
| 12 | a rejected payment costs no points at all | The balance is identical before and after |
| 13 | the bonus account is the customer's own: staff have none | Kitchen and admin get 403, a guest 401 |

### 6.3 Feedback (6 checks)

| # | Check | What it proves |
|---|---|---|
| 14 | a review is refused until the order has been delivered | 409 `not_delivered` |
| 15 | once delivered, the customer may review the order exactly once | The order is walked PREPARING → READY → DELIVERED by the kitchen first; the second review gives 409 |
| 16 | a review with a rating outside 1-5 is refused (400) | 0, 6, 2.5, "5", null |
| 17 | nobody can review somebody else's order (403) | |
| 18 | admin and accountant read the reviews; the kitchen and customers do not | Including the average, the star breakdown and the rating filter |
| 19 | the admin replies and the customer sees the answer under their order | And an empty reply is refused, and the accountant may not reply |

### 6.4 Security (7 checks)

| # | Check | What it proves |
|---|---|---|
| 20 | five wrong passwords block the account, and the sixth try is refused outright | Attempts 1–4 give 401, the fifth gives 403 `account_blocked`, and afterwards even the **correct** password gives 403 with the seconds left |
| 21 | the block is written to the security journal and shown in the user list | The journal holds an `ACCOUNT_BLOCKED` line for that email, and the admin user list shows `blockedUntil` and the failure count |
| 22 | the admin lifts the block and the customer can sign in again | And an `ACCOUNT_UNBLOCKED` line is recorded |
| 23 | a correct password clears the counter, so four mistakes never add up to a block | Four failures, one success, four more failures — still no block |
| 24 | an admin block stops a session that is already open | The cookie is still valid, but the guard refuses it: 403 `account_disabled` on `/auth/me` and on `/orders` |
| 25 | blocking needs a reason, and an admin cannot block themselves (400/409) | |
| 26 | the admin changes a role, and the new role takes effect | A customer who becomes an accountant can read reports in the same session; an unknown role is refused; the admin cannot demote themselves |

### 6.5 Accounting with bonus points (1 check)

| # | Check | What it proves |
|---|---|---|
| 27 | the accounting report separates the list price from the money received | For every approved order paid partly with points, `paidTiyn = totalTiyn − discountTiyn`, the summary sums agree, and the CSV carries the new columns |

---

---

## 6a. Unit tests added in the third delivery — 32 checks

### `test/password.test.ts` (9 checks)

| # | Check | Why it matters |
|---|---|---|
| 1 | length alone is not enough, it needs a letter and a digit | The rule itself, from both sides |
| 2 | the most common choices are refused outright | `password1`, `qwerty123` and the rest of the short list |
| 3 | it must not contain the owner's own name or email | `alice2026` for alice@example.test is the first guess anyone makes; a short fragment like "ann" is deliberately not enough to refuse on |
| 4 | Cyrillic letters count as letters | The site is read in Russian and Kazakh; a password written in those alphabets must not be refused for "having no letters" |
| 5 | the strength meter agrees with what the rules accept | The meter guides, the rule decides, and they must not contradict each other |
| 6 | the token is random, and only its hash is ever stored | A stolen database must contain no working reset links |
| 7 | comparing hashes does not leak how much matched | Constant-time comparison, and no crash on different lengths |
| 8 | a reset link works once, and only before it expires | Expired, already used, unreadable, and the string form PostgreSQL returns |
| 9 | a token from an earlier generation is refused | The exact rule behind "other devices have been signed out", including a token with no version at all |

### `test/ip.test.ts` (5 checks)

| # | Check | Why it matters |
|---|---|---|
| 10 | fifteen failures from one machine block it, fourteen do not | The threshold, on both sides |
| 11 | its limit is looser than the account limit, and that is the point | One household behind one address must not block itself with ordinary mistakes |
| 12 | the block lasts an hour, failures count over fifteen minutes | |
| 13 | a manual block has no end, an automatic one runs out | Two different kinds of block in one table |
| 14 | the server's own address is never blocked | Behind the site's proxy, blocking loopback would lock out every visitor at once |

### `test/week3.test.ts` (13 checks)

| # | Check | Why it matters |
|---|---|---|
| 15 | only the three languages the site speaks are accepted | |
| 16 | a browser header is read, and anything unknown falls back to English | Including `kz`, which is the country, not the language, and quality values that reorder the list |
| 17 | the new language field defaults to English and is validated | |
| 18 | the password is judged against the name and the email | The registration form applies the rule with the person's own details |
| 19 | the same number written differently is the same number | What the unique index compares, so the code and the index must agree |
| 20 | a number needs 7 to 15 digits, however it is punctuated | |
| 21 | the profile takes name, phone, address and language — and nothing else | `role`, `email` and `bonusPoints` sent along are simply absent from the result |
| 22 | a broken phone or an unknown language is refused | |
| 23 | changing a password needs the current one and a different new one | |
| 24 | the email form and the token form of a reset | |
| 25 | every history filter is optional, and an empty one narrows nothing | An empty search box must not hide every order |
| 26 | the search is trimmed and limited, the status must be real | |
| 27 | dates are parsed, and the range has to run forwards | One side on its own is fine: "everything since the first" is a real question |

### `test/i18n.test.ts` (5 checks)

These read the website's dictionary file directly. It imports nothing of its own, so it loads here
without pulling in React, and a broken translation is caught by `npm test` rather than by someone
opening the site in Kazakh and finding English in the middle of it.

| # | Check | Why it matters |
|---|---|---|
| 28 | every language carries every key, with nothing left over | A missing key would silently fall back to English |
| 29 | no translation is left empty or left in English by accident | Plus a spot check that the other two are genuinely translated, not copied |
| 30 | a translation never loses or invents a placeholder | "{count} orders" translated without its `{count}` would show a sentence with a hole in it |
| 31 | looking a message up fills its placeholders and falls back to English | A placeholder with no value stays as it is rather than printing "undefined" |
| 32 | every status and role a page can show has a label in all three | The two sets that come from the database rather than from a page |

---

## 6b. Database tests added in the third delivery — 5 checks

| # | Check | What it proves |
|---|---|---|
| 1 | one phone number belongs to one customer, however it is written | `+7 700 555 11 22` and `77005551122` collide, as they should |
| 2 | two dishes cannot share a name, whatever the capitalisation or spacing | |
| 3 | the language column accepts only the three the site speaks | And defaults to English rather than to nothing |
| 4 | a reset link is stored once, as a hash, and never twice | And deleting the account takes its links with it: a link must never outlive its owner |
| 5 | an address can be blocked only once, and never with a negative failure count | |

---

## 6c. End-to-end tests of the third delivery — 35 checks

`node test/e2e-week3.mjs`. Each check uses its own cookie jar, so every role is a genuinely separate
session, and every customer is registered fresh with a phone number no other account holds.

### The server (3 checks)

| # | Check | What it proves |
|---|---|---|
| 1 | the health endpoint answers, and says whether the database is reachable | And the cheap liveness endpoint answers without touching the database |
| 2 | answers carry the headers that stop the page being framed or sniffed | `nosniff`, `DENY`, and no `X-Powered-By` |
| 3 | the seeded staff can still sign in | |

### Registration, language and uniqueness (5 checks)

| # | Check | What it proves |
|---|---|---|
| 4 | registration takes a language, and it comes back with the session | Signing in on another device finds the same choice |
| 5 | an unknown language, and a password built from the name, are refused | |
| 6 | one phone number belongs to one account | The same number written without spacing is still refused, with the code `phone_taken` |
| 7 | one email belongs to one account | Capitalisation does not create a second one |
| 8 | two dishes cannot share a name | And renaming a dish to its own name is not a clash |

### Profile (4 checks)

| # | Check | What it proves |
|---|---|---|
| 9 | a customer reads and edits their own profile | The change is real, not echoed back |
| 10 | the profile cannot change the email, the role or the balance | `role: ADMIN`, another person's email and 99999 points are all ignored, and the account still cannot open the admin panel |
| 11 | a profile cannot take a phone number another account holds | And keeping its own number is not a clash |
| 12 | staff have a profile and a language, but no delivery details | |

### Passwords (6 checks)

| # | Check | What it proves |
|---|---|---|
| 13 | a forgotten password answers the same either way | Word for word, whether or not the address exists |
| 14 | a reset link works once and signs the old sessions out | The old password stops working, the link cannot be replayed, and the session opened beforehand is refused with `password_changed` |
| 15 | asking again retires the earlier link | |
| 16 | a weak new password is refused by the reset form | And the link survives the refusal: a rejected attempt must not consume it |
| 17 | changing a password needs the current one, and keeps this session alive | The browser doing the changing is handed a fresh token |
| 18 | changing a password signs the OTHER devices out | A second session, signed in moments earlier, is refused |

### Blocking by address (3 checks)

| # | Check | What it proves |
|---|---|---|
| 19 | the admin blocks and unblocks an address, and it is journalled | |
| 20 | the address list is admin-only, and states the rules in force | |
| 21 | the server's own address cannot be blocked | `127.0.0.1`, `::1` and `localhost` are all refused, and a block with no reason is too |

### History, search and repeating (6 checks)

| # | Check | What it proves |
|---|---|---|
| 22 | two orders are placed, to search through | |
| 23 | the history searches by dish name | And the other order does not match |
| 24 | the history searches by note, address and order number | |
| 25 | the history filters by status and date, and refuses nonsense | An end date covers the whole of that day; a range in the past finds nothing |
| 26 | repeating lists what is still on the menu and what it costs now | |
| 27 | repeating notices a dish that has left the menu and one whose price moved | A dish is ordered, then hidden, and the tea is repriced; the answer reports both |
| 28 | nobody can repeat somebody else's order | |

### The newer reports (6 checks)

| # | Check | What it proves |
|---|---|---|
| 29 | the daily report adds up to the same money as the order report | Two reports over the same data must not disagree, and the summary must match its own rows |
| 30 | the dish report accounts for every dish, and its shares add up | To 100%, within rounding |
| 31 | the customer report counts orders and spending per customer | And the average is the total divided by the count |
| 32 | all three take a date range and refuse a broken one | An empty range is empty, not an error |
| 33 | each report downloads as CSV, with its own columns | |
| 34 | a dish whose name holds a comma does not break the CSV | Read back with a real CSV reader, because splitting on commas is the mistake the quoting exists to survive |
| 35 | reports stay closed to customers and the kitchen | And open to the administrator as well as the accountant |

---

## 7. What is not covered by an automated test

Honesty about the gaps matters more than a full-looking table.

| Area | Why not, and how it was checked instead |
|---|---|
| The drag gesture itself | Driving real HTML5 drag events needs a browser automation tool, which this project does not install. The endpoint behind every drag **is** tested (checks 6 and 7 above), and the gesture was tried by hand in Chrome and Firefox |
| Cookie flags | `httpOnly`, `SameSite=Strict` and `Secure` were read from the response headers by hand |
| Two checkouts at the same instant | The customer row is locked with `SELECT … FOR UPDATE` inside the payment transaction, which was confirmed by reading the code; a true race needs a load-testing tool |
| The 15-minute block expiring on its own | Testing it for real would mean waiting fifteen minutes. The arithmetic is covered by unit checks, and the admin's manual unblock is covered end to end |
| The hour-long address block expiring | The same reasoning, an hour instead of fifteen minutes |
| A reset link expiring after 30 minutes | The same again. That a link works once, and that a new one retires the old, *are* covered |
| The mobile layout | The collapsing navigation, the scrolling tables and the card layout on a phone were checked by hand at phone and desktop widths |
| A migration meeting data it refuses to touch | Exercised by hand against a database that held duplicate phone numbers: the index was not created, the warning named the clean-up script, and the service-level check held the rule meanwhile |
| The production containers actually running | `docker compose -f docker-compose.prod.yml config` is run, which proves the file is valid and that it refuses to start without a `JWT_SECRET`. Building and running the three images is a manual step |
| Visual layout | Checked by hand at phone and desktop widths |

---

## 8. Defects found and fixed during testing

| What the test found | Fix |
|---|---|
| Bonus points were not part of the order fingerprint, so a retry under the same attempt ID could arrive with a different discount | The points were folded into the `request_hash`, with a unit check guarding it |
| The accounting total still showed the list price after a bonus discount, so the report overstated the money received | The report now carries both: `totalTiyn` for the food and `paidTiyn` for the till, with the discount between them |
| Signing out required a valid token, so a user blocked mid-session could not clear their cookie | Sign-out now always clears the cookie and writes a journal line only when the token can still be read |
| **(third delivery)** "Other devices have been signed out" was decided by comparing the token's issue time with the password's change time. A JWT records whole seconds, so a session opened in the same second as the change survived — a window of up to one second, and an end-to-end check that passed or failed depending on the clock | Replaced with a session generation: `users.token_version` is carried in every token and raised when a password changes, so old tokens are refused exactly. The clock is no longer involved, and the test is deterministic |
| **(third delivery)** The unique index on phone numbers could not be created on an existing database, because earlier test runs had registered every account with the same number | Two changes. The migration now reports the clash and names a clean-up script instead of failing the start-up or rewriting rows, and `UniquenessService` holds the rule meanwhile. The suites now generate a distinct number per account, which is what a system with unique phone numbers should have been testing all along |
| **(third delivery)** The first CSV check counted columns with a regular expression that produced one field too many, and failed against correct output | The check now parses the line the way a spreadsheet does. Splitting on commas was exactly the mistake the quoting exists to survive, so the test had to stop making it |

---

## 9. Conclusion

All 154 automated checks pass. The third delivery's features are covered at the same three levels as the
earlier ones — the rules on their own, the database's own refusals, and the behaviour over HTTP — and the
42 checks from the first two deliveries still pass unchanged, so the new work did not break the old.

Three of this week's defects were found by the tests rather than by a reader, and two of them were real
faults in the product: a one-second window in which a signed-out session kept working, and a migration
that could not be applied to a database that already had data in it. Both are described above, with what
replaced them.
