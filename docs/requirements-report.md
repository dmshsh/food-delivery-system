# Food Delivery System — Requirements Report

**Project:** Food Delivery System (one restaurant, synthetic data, simulated payments)
**Report date:** 11 November 2026
**Scope of this report:** the full requirement set, what is implemented, and how each requirement was
verified. It covers the first delivery (ordering, payment simulation, roles, accounting) and the second
delivery (drag and drop, bonus points, feedback, admin panel, sign-in security).

---

## 1. Purpose and scope

The system lets a customer of one restaurant browse a menu, place an order, pay for it through a
simulated payment step, and follow the order until it is delivered. Staff see the same order through
three other roles: the kitchen prepares it, the accountant reports on the money, and the administrator
runs the menu and the accounts.

No real money moves anywhere in the system. All payment outcomes are chosen by the user on the checkout
screen, and all data is synthetic.

**Out of scope:** several restaurants, real card payments, courier tracking, mobile applications,
e-mail or SMS delivery, and public deployment (which would need HTTPS, a real `JWT_SECRET` and an
external security audit).

---

## 2. Actors

| Actor | What it is | How it is created |
|---|---|---|
| Guest | Anyone who has not signed in | — |
| Customer | Orders food, holds bonus points, writes reviews | Self-registration on the website |
| Kitchen | Sees paid orders and moves them forward | Database seed, or an admin role change |
| Accountant | Reads the money reports and reviews | Database seed, or an admin role change |
| Administrator | Manages the menu, the accounts and the security journal | Database seed, or an admin role change |

Registration always creates a **customer**. A `role` field sent with a registration request is ignored,
so a user can never make themselves staff. Staff roles are granted only from the admin panel or the seed.

---

## 3. Functional requirements

Each requirement lists where it lives in the code and how it was verified. "Unit" means a test over the
pure rules, "DB" a test against a real PostgreSQL, "E2E" a check over HTTP against the running API, and
"manual" a check done in the browser.

### 3.1 Accounts and access

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-01 | A guest can browse the menu without signing in | `menu.controller.ts` | E2E |
| FR-02 | A visitor can register as a customer with name, email, phone, address and a password of at least 8 characters | `validation.ts`, `auth.service.ts` | Unit, E2E |
| FR-03 | An email can be used by only one account | `schema.sql` (unique index on `lower(email)`) | E2E |
| FR-04 | A user signs in with email and password; passwords are stored as bcrypt hashes | `auth.service.ts` | E2E |
| FR-05 | The session is a JWT in an httpOnly, `SameSite=Strict` cookie that page scripts cannot read | `auth.controller.ts` | manual |
| FR-06 | Each role sees only its own pages and endpoints | `auth.guard.ts`, `roles.decorator.ts` | E2E |

### 3.2 Ordering and payment

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-07 | A customer fills a cart from the menu, up to 20 different dishes and 20 of each | `cartSlice.ts`, `validation.ts` | Unit, E2E |
| FR-08 | Checkout takes a delivery address, "as soon as possible" or a time within 7 days, and an optional note | `checkout/page.tsx`, `validation.ts` | Unit, E2E |
| FR-09 | Prices are read from the menu table on the server; the browser never sends a price | `orders.service.ts` | E2E |
| FR-10 | Money is stored as whole tiyn (1 KZT = 100 tiyn), never as a floating point number | `schema.sql` | DB |
| FR-11 | An order and its items are saved in one transaction: there is no half-saved order | `orders.service.ts`, `db.service.ts` | E2E |
| FR-12 | Repeating the same order attempt returns the same order instead of a second one | `UNIQUE(customer_id, attempt_id)` + `ON CONFLICT DO NOTHING` | DB, E2E |
| FR-13 | The same attempt ID with different order details is refused (409) | `orders.service.ts` (`request_hash`) | Unit, E2E |
| FR-14 | The payment is simulated and the user chooses the outcome: approved, rejected, time limit, or lost confirmation | `orders.service.ts` | E2E |
| FR-15 | One order can be paid only once; repeating a checkout returns the saved result | `payment_attempts.order_id UNIQUE` | E2E |
| FR-16 | An order not paid within 120 seconds becomes expired with a timeout payment record | `orders.service.ts` (`expirePending`) | E2E |
| FR-17 | A lost confirmation still saves the payment, and a retry recovers the same order | `orders.service.ts` | E2E |

### 3.3 Order lifecycle

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-18 | Statuses follow `PENDING → CONFIRMED │ PAYMENT_REJECTED │ EXPIRED │ CANCELLED` and `CONFIRMED → PREPARING → READY → DELIVERED` | `domain/status.ts` | Unit |
| FR-19 | A confirmed order can never go back to pending, and no step may be skipped | same, plus the database trigger | Unit, DB, E2E |
| FR-20 | The rule is enforced in three places: the interface, the service, and the database | `kitchen/page.tsx`, `orders.service.ts`, `schema.sql` | DB compares the trigger with the code over all 64 status pairs |
| FR-21 | Every status change is recorded with who changed it, from what, to what and when | `order_events` | manual |

### 3.4 Role views

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-22 | A customer sees only their own orders; another customer's order gives 403 | `orders.service.ts` | E2E |
| FR-23 | The kitchen sees paid orders only, without prices and without the customer's address | `orders.service.ts` (`present`) | E2E |
| FR-24 | Only the kitchen may move a status forward | `@Roles('KITCHEN')` | E2E |
| FR-25 | Only the accountant reads the money reports | `@Roles('ACCOUNTANT')` | E2E |
| FR-26 | The accountant can filter by status and download the report as CSV | `reports.service.ts` | E2E |
| FR-27 | Totals use the prices saved with each order, not today's menu prices | `order_items.unit_price_tiyn` | E2E |
| FR-28 | Rejected and expired orders are listed but never counted in the approved total | `reports.service.ts` | E2E |

### 3.5 Drag and drop *(second delivery)*

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-29 | The kitchen moves an order forward by dragging its card into the next column | `kitchen/page.tsx` | manual, E2E (the endpoint behind it) |
| FR-30 | Only the one column an order may legally move to accepts the card; the others are visibly closed | `kitchen/page.tsx` | manual |
| FR-31 | Every drag action also has a button, because dragging is impossible with a keyboard | `kitchen/page.tsx`, `MenuTab.tsx` | manual |
| FR-32 | The administrator arranges the menu by dragging dishes, and customers see that arrangement | `MenuTab.tsx`, `menu_items.sort_order` | E2E |
| FR-33 | A new arrangement is saved as one list in one transaction, so the menu is never half-reordered | `admin.service.ts` | E2E |
| FR-34 | A list with a repeated or unknown dish is refused and changes nothing | `validation.ts`, `admin.service.ts` | Unit, E2E |

### 3.6 Bonus points *(second delivery)*

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-35 | One point equals 1 KZT | `domain/bonus.ts` | Unit |
| FR-36 | An approved payment earns 5% of the money actually paid, rounded down | `domain/bonus.ts` | Unit, E2E |
| FR-37 | Points may cover at most 30% of an order | `domain/bonus.ts` | Unit, E2E |
| FR-38 | A customer can never spend more points than they hold | `domain/bonus.ts`, `orders.service.ts` | Unit, E2E |
| FR-39 | Points leave the balance only when a payment is approved; a rejected or expired order costs nothing | `orders.service.ts` | E2E |
| FR-40 | Points cannot create themselves: the part of an order paid with points earns nothing | `domain/bonus.ts` | Unit |
| FR-41 | Every change of balance is written to a history the customer can read | `bonus_transactions`, `bonus.controller.ts` | E2E |
| FR-42 | The balance can never go below zero, and the history cannot record an earn that removes points | `schema.sql` CHECK constraints | DB |
| FR-43 | Two checkouts cannot spend the same point twice | `SELECT … FOR UPDATE` on the customer row | code review; covered indirectly by FR-38 |

### 3.7 Feedback *(second delivery)*

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-44 | A customer rates a delivered order from 1 to 5 stars with an optional comment | `FeedbackForm.tsx`, `orders.service.ts` | Unit, E2E |
| FR-45 | A review is possible only after delivery, and only for one's own order | `orders.service.ts`, database trigger | E2E, DB |
| FR-46 | One order carries at most one review | `order_feedback.order_id UNIQUE` | DB, E2E |
| FR-47 | The administrator and the accountant read all reviews with an average and a star breakdown | `feedback.service.ts` | E2E |
| FR-48 | The administrator replies to a review, and the customer sees the reply under their order | `feedback.controller.ts`, `FeedbackForm.tsx` | E2E |

### 3.8 Admin panel *(second delivery)*

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-49 | The admin panel is reachable only by the administrator role | `admin.controller.ts` | E2E |
| FR-50 | An overview shows accounts, orders by status, money received, average rating, points in circulation and serious security events | `admin.service.ts`, `OverviewTab.tsx` | E2E |
| FR-51 | The administrator adds, edits, hides and removes dishes | `admin.service.ts`, `MenuTab.tsx` | E2E |
| FR-52 | A dish that appears in past orders is hidden instead of deleted, so paid orders keep their history | `admin.service.ts` | E2E (deletion path), code review (hiding path) |
| FR-53 | The administrator sees every account with its role, state, order count and point balance | `admin.service.ts`, `UsersTab.tsx` | E2E |
| FR-54 | The administrator changes a user's role, and the new role takes effect on the user's next request | `admin.service.ts` | E2E |
| FR-55 | The administrator cannot block themselves or change their own role | `admin.service.ts` | E2E |

### 3.9 Security *(second delivery)*

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-56 | Five failed sign-ins within 15 minutes block the account for 15 minutes | `domain/security.ts`, `security.service.ts` | Unit, E2E |
| FR-57 | While a block lasts, even the correct password is refused, and the answer says how long is left | `auth.service.ts` | E2E |
| FR-58 | A blocked account is refused **before** the password is compared, so the answer leaks nothing | `auth.service.ts` | code review |
| FR-59 | A correct password clears the counter and the window | `security.service.ts` | E2E |
| FR-60 | The administrator can block an account permanently, with a written reason, and lift it again | `admin.service.ts` | E2E |
| FR-61 | Blocking stops a session that is already open, not only new sign-ins | `auth.guard.ts` | E2E |
| FR-62 | A security journal records sign-ins, failures, blocks, refused roles, registrations, sign-outs and admin actions | `security.service.ts` | E2E |
| FR-63 | Each journal line has a severity (info, warning, critical) and can be filtered by kind and severity | `domain/security.ts`, `SecurityTab.tsx` | Unit, E2E |
| FR-64 | The journal is written only by the server and cannot be edited through the interface | no write endpoint exists | code review |
| FR-65 | A failure to write the journal never breaks the request it describes | `security.service.ts` | code review |

---

## 4. Non-functional requirements

| ID | Requirement | How it is met |
|---|---|---|
| NFR-01 | Correctness under repeated requests | One attempt ID per intended order, one payment per order, both guarded by database constraints rather than by application logic alone |
| NFR-02 | The database refuses invalid data on its own | CHECK constraints, unique indexes and two triggers (status transitions, feedback only on delivered orders) |
| NFR-03 | No money is ever stored as a floating point number | Integer tiyn everywhere, formatted only for display |
| NFR-04 | Rules that matter are written once | The status graph and the bonus formulas live in `src/domain/` as pure functions with no framework imports; a test compares the database trigger with the code over all 64 status pairs |
| NFR-05 | Passwords are never stored or logged in readable form | bcrypt with a cost of 10; the journal records emails and addresses, never passwords |
| NFR-06 | The site and the API share one origin | Next.js forwards `/api/*` to NestJS, so the cookie stays first-party and no CORS rules are needed |
| NFR-07 | Every drag action is reachable without a mouse | Buttons beside each drag handle, visible focus rings, labelled controls |
| NFR-08 | The interface explains refusals in plain words | Every error carries a short code for the program and a sentence for the person |
| NFR-09 | The project runs from a clean checkout in three commands | `npm run db:up`, `npm run dev:api`, `npm run dev:web`; the schema and demo data create themselves |
| NFR-10 | The schema file can be applied any number of times | `CREATE … IF NOT EXISTS`, `ALTER … IF NOT EXISTS`, `DROP` before `CREATE` for functions and triggers; a test applies it twice |

---

## 5. Data model

Eleven tables:

| Table | Holds |
|---|---|
| `users` | Account, role, and the state of any block |
| `customers` | A customer's phone, address and point balance |
| `menu_items` | Dishes, prices in tiyn, availability and the admin's arrangement |
| `orders` | One order: attempt ID, details fingerprint, status, delivery, points requested/spent/earned |
| `order_items` | The dishes in an order, with the price at the time of purchase |
| `payment_attempts` | One simulated payment per order, with the amount actually charged |
| `order_events` | The history of every status change |
| `bonus_transactions` | Every change to a point balance, with the balance after it |
| `order_feedback` | One review per order, with the restaurant's reply |
| `login_attempts` | Sign-in tries, used by the limiter |
| `security_events` | The security journal |

---

## 6. Requirement coverage

| Group | Requirements | Implemented | Verified by an automated test |
|---|---|---|---|
| Accounts and access | 6 | 6 | 5 |
| Ordering and payment | 11 | 11 | 11 |
| Order lifecycle | 4 | 4 | 3 |
| Role views | 7 | 7 | 7 |
| Drag and drop | 6 | 6 | 3 |
| Bonus points | 9 | 9 | 8 |
| Feedback | 5 | 5 | 5 |
| Admin panel | 7 | 7 | 7 |
| Security | 10 | 10 | 6 |
| **Total** | **65** | **65** | **55** |

The ten requirements without a direct automated test are the ones whose evidence is the shape of the
code rather than an observable answer: the cookie flags, the order of the checks in the sign-in path,
the row lock during a point transaction, the absence of any endpoint that writes to the journal, and the
behaviour of the interface under a mouse. Each was confirmed by reading the code and by using the site.

## 7. Summary rating

| Criterion | Assessment | Reasoning |
|---|---|---|
| Completeness against the plan | **Full** | Every item planned for this week — drag and drop, bonus system, feedback, admin panel, sign-in limits with a journal, and the test set — is implemented and running |
| Correctness | **High** | 82 automated checks pass: 33 unit, 7 against a real PostgreSQL, 42 over HTTP. The fifteen checks written for the first delivery still pass unchanged, so nothing was broken on the way |
| Defence in depth | **High** | The rules that matter are enforced at more than one level: the status graph and the feedback rule in both the service and the database, the bonus limits in both the browser and the server, and the account block in both the sign-in path and the request guard |
| Data integrity | **High** | Constraints and triggers refuse bad data even when it arrives by direct SQL; money stays in whole tiyn and points can never fall below zero |
| Usability | **Good** | Every drag has a button, errors are written as sentences, and the demo accounts are one click away on the sign-in page |
| Readiness for public use | **Not ready, by design** | HTTPS, a real `JWT_SECRET`, a per-address rate limit and an external security review are still needed; the payment step is a simulation |

**Overall: the requirements set for this stage is met in full, and verified.**
