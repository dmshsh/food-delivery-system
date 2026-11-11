# Food Delivery System — Test Report

**Report date:** 11 November 2026
**Subject:** the test set for the second delivery (drag and drop, bonus points, feedback, admin panel,
sign-in security), together with the first delivery's tests, which were re-run to prove nothing broke.

---

## 1. Summary

| Suite | What it proves | Checks | Result |
|---|---|---|---|
| Unit (`npm test`) | The rules themselves, as pure functions with no database and no framework | 33 | **all pass** |
| Database (`npm test` with `DATABASE_URL`) | That a real PostgreSQL refuses bad data on its own | 7 | **all pass** |
| End-to-end, first delivery (`node test/e2e.mjs`) | Ordering, payment, roles and accounting over HTTP | 15 | **all pass** |
| End-to-end, second delivery (`node test/e2e-features.mjs`) | The new features over HTTP | 27 | **all pass** |
| **Total** | | **82** | **82 pass, 0 fail** |

**New this week: 54 checks** — 24 unit, 3 database, 27 end-to-end.

The 15 checks written for the first delivery were run again after every change and still pass unchanged.
That is the evidence that bonus points, the admin panel and the sign-in limiter did not quietly alter
ordering, payment or the role rules.

---

## 2. How to run

```sh
npm run db:up                                                           # 1) PostgreSQL in Docker
DATABASE_URL=postgres://food:food@localhost:5433/food_delivery npm test  # unit + database
npm run dev:api                                                          # 2) in a second terminal
npm run test:e2e                                                         # 3) both HTTP suites
```

Without `DATABASE_URL` the database tests skip themselves and only the pure rules run. `npm run test:e2e`
runs the old suite and the new one in that order and stops at the first failing suite. The database tests
need `psql` on the PATH.

---

## 3. Unit tests — 33 checks

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

## 4. Database tests — 7 checks

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

## 7. What is not covered by an automated test

Honesty about the gaps matters more than a full-looking table.

| Area | Why not, and how it was checked instead |
|---|---|
| The drag gesture itself | Driving real HTML5 drag events needs a browser automation tool, which this project does not install. The endpoint behind every drag **is** tested (checks 6 and 7 above), and the gesture was tried by hand in Chrome and Firefox |
| Cookie flags | `httpOnly`, `SameSite=Strict` and `Secure` were read from the response headers by hand |
| Two checkouts at the same instant | The customer row is locked with `SELECT … FOR UPDATE` inside the payment transaction, which was confirmed by reading the code; a true race needs a load-testing tool |
| The 15-minute block expiring on its own | Testing it for real would mean waiting fifteen minutes. The arithmetic is covered by unit checks 19–22, and the admin's manual unblock is covered end to end |
| Visual layout | Checked by hand at phone and desktop widths |

---

## 8. Defects found and fixed during testing

| What the test found | Fix |
|---|---|
| Bonus points were not part of the order fingerprint, so a retry under the same attempt ID could arrive with a different discount | The points were folded into the `request_hash`; unit check 33 now guards it |
| The accounting total still showed the list price after a bonus discount, so the report overstated the money received | The report now carries both: `totalTiyn` for the food and `paidTiyn` for the till, with the discount between them (end-to-end check 27) |
| Signing out required a valid token, so a user blocked mid-session could not clear their cookie | Sign-out now always clears the cookie and writes a journal line only when the token can still be read |

---

## 9. Conclusion

All 82 automated checks pass. The second delivery's features are covered at three levels — the rules on
their own, the database's own refusals, and the behaviour over HTTP — and the first delivery's fifteen
checks still pass unchanged, so the new work did not break the old.
