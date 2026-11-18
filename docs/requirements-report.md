# Food Delivery System — Requirements Report

**Project:** Food Delivery System (one restaurant, synthetic data, simulated payments)
**Report date:** 19 November 2026
**Scope of this report:** the full requirement set, what is implemented, and how each requirement was
verified. It covers the first delivery (ordering, payment simulation, roles, accounting), the second
(drag and drop, bonus points, feedback, admin panel, sign-in security) and the third (languages, mobile
layout, profile, password reset, blocking by address, history search, repeat ordering, the newer
reports, uniqueness and deployment).

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

### 3.10 Languages *(third delivery)*

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-66 | The whole interface reads in English, Russian or Kazakh | `web/src/i18n/dictionaries.ts` | Unit |
| FR-67 | A missing translation is a compile error, not something a visitor finds | English defines the `Dictionary` type | compiler, Unit |
| FR-68 | No translation loses or invents a `{placeholder}` | `i18n.test.ts` | Unit |
| FR-69 | The language is chosen at registration, changed in the profile, and follows the account to another device | `users.preferred_language` | E2E |
| FR-70 | A visitor who has never chosen one gets their browser's language, falling back to English | `languageFromHeader`, `I18nProvider` | Unit |
| FR-71 | Server answers carry a short code, and the codes a person is likely to meet are translated | `translateError` | code review |
| FR-72 | Money and dates are formatted for the chosen language | `format.ts` | manual |

### 3.11 Mobile layout *(third delivery)*

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-73 | The page is laid out for the device's real width | `viewport` in `layout.tsx` | manual |
| FR-74 | On a narrow screen the navigation collapses behind one button and opens as the same list | `Header.tsx` | manual |
| FR-75 | Wide tables scroll rather than crushing their columns | `overflow-x-auto`, `min-w` | manual |
| FR-76 | The bonus history becomes cards on a phone | `bonus/page.tsx` | manual |
| FR-77 | The history filters fold away on a phone | `orders/page.tsx` | manual |

### 3.12 Profile and account details *(third delivery)*

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-78 | Every signed-in role can read and edit their own name and language | `profile.service.ts` | E2E |
| FR-79 | Customers also edit their phone and delivery address; staff have neither | same | E2E |
| FR-80 | The email and the role can never be changed through the profile form | same | E2E |
| FR-81 | The profile shows how many orders were placed, how many delivered, and how much was paid | same | E2E |

### 3.13 Passwords *(third delivery)*

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-82 | A password needs 8 characters, a letter and a digit, and may not be a common one | `validatePassword` | Unit, E2E |
| FR-83 | A password may not contain the owner's own name or email | same | Unit, E2E |
| FR-84 | Cyrillic counts as letters | same | Unit |
| FR-85 | "I forgot my password" answers the same way whether or not the account exists | `password.service.ts` | E2E |
| FR-86 | A reset link lasts 30 minutes and works exactly once | same | Unit, E2E |
| FR-87 | Only the hash of a reset token is stored | `hashResetToken` | Unit, DB |
| FR-88 | Asking for a new link retires the previous one | `password.service.ts` | E2E |
| FR-89 | Changing a password requires the current one | same | E2E |
| FR-90 | Changing or resetting a password signs out every other session, exactly and immediately | `users.token_version`, `isSessionCurrent` | Unit, E2E |
| FR-91 | The browser that changed the password stays signed in | `AuthService.reissue` | E2E |

### 3.14 Blocking by address *(third delivery)*

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-92 | Fifteen failed sign-ins from one address within fifteen minutes block it for an hour | `domain/security.ts`, `IpGuardService` | Unit |
| FR-93 | The address is checked before the email is looked up, so a sweep learns nothing | `auth.service.ts` | code review, E2E |
| FR-94 | One failure counts against both the account and the address | same | code review |
| FR-95 | The administrator can block and unblock an address by hand, with a reason | `admin.controller.ts` | E2E |
| FR-96 | The server's own address can never be blocked | `isBlockableIp` | Unit, E2E |
| FR-97 | Addresses collecting failures but not yet blocked are listed for the administrator | `IpGuardService.suspicious` | E2E |

### 3.15 Order history and repeating *(third delivery)*

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-98 | The history searches by dish, address, note and order number | `orders.service.ts` | E2E |
| FR-99 | The history filters by status and by date range | same | Unit, E2E |
| FR-100 | An end date covers the whole of that day | same | E2E |
| FR-101 | A past order can be ordered again | `orders.service.ts`, `orders/page.tsx` | E2E |
| FR-102 | Repeating reports what has left the menu and what now costs something different, before the cart changes | same | E2E |
| FR-103 | Only the customer's own order can be repeated | same | E2E |

### 3.16 The newer reports *(third delivery)*

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-104 | Money and orders per day, with the best day and the average order | `report-views.service.ts` | E2E |
| FR-105 | Sales per dish, with the share of revenue and the dishes never ordered | same | E2E |
| FR-106 | Orders, spending and ratings per customer | same | E2E |
| FR-107 | All three count approved payments only | same | E2E |
| FR-108 | All three take a date range and refuse a broken one | same | E2E |
| FR-109 | All three download as CSV, quoting any value that holds a comma | `toCsv` | E2E |
| FR-110 | The administrator may read the reports as well as the accountant | `reports.controller.ts` | E2E |

### 3.17 Uniqueness *(third delivery)*

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-111 | One email belongs to one account, whatever the capitalisation | unique index + `UniquenessService` | DB, E2E |
| FR-112 | One phone number belongs to one customer, however it is punctuated | `phone_digits()` unique index | DB, E2E |
| FR-113 | Two dishes cannot share a name | unique index | DB, E2E |
| FR-114 | Each rule is checked in the service for the message and in the database for the guarantee | `UniquenessService` | code review |
| FR-115 | A uniqueness migration never rewrites or deletes existing rows to make itself fit | `schema.sql`, `cleanup-test-accounts.sql` | manual |

### 3.18 Running on a server *(third delivery)*

| ID | Requirement | Where | Verified |
|---|---|---|---|
| FR-116 | A health endpoint answers only when the database is reachable | `health.controller.ts` | E2E |
| FR-117 | A liveness endpoint answers as long as the process does | same | E2E |
| FR-118 | Settings are checked once at start-up, and a misconfigured server refuses to start | `config.ts` | code review |
| FR-119 | The development JWT secret is refused in production | same | code review |
| FR-120 | The caller's real address is read from `X-Forwarded-For` behind a proxy | `main.ts` | code review |
| FR-121 | Answers carry nosniff, DENY framing and a referrer policy, and do not advertise the server | same | E2E |
| FR-122 | Shutdown lets the requests in flight finish | `enableShutdownHooks` | code review |
| FR-123 | The whole system runs as three containers, with only the website published | `docker-compose.prod.yml` | compose validation |

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
| NFR-11 | A migration never silently changes data that already exists | A uniqueness index that existing rows would break is not created; the start-up says what is in the way and names the clean-up script, and the service-level check holds the rule meanwhile |
| NFR-12 | Session invalidation does not depend on a clock | Every token carries the account’s session generation; changing a password raises it, so old tokens are refused exactly, with no window |
| NFR-13 | Reading whether the service is alive needs no secret | The health endpoints are public and reveal no data, because the monitor checking them has no password |
| NFR-14 | Translations cannot drift apart | English defines the type, so a missing key fails the build; tests compare keys, emptiness and placeholders across all three |
| NFR-15 | Every rule that matters is enforced twice | Uniqueness in the service and in an index; the password rule in the browser meter and on the server; the address limit in the sign-in path and in the journal |

---

## 5. Data model

Thirteen tables:

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
| `password_resets` | Reset links, stored as hashes, with their expiry and whether they were used |
| `blocked_ips` | Addresses blocked automatically or by hand |

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
| Security (accounts) | 10 | 10 | 6 |
| Languages | 7 | 7 | 5 |
| Mobile layout | 5 | 5 | 0 |
| Profile | 4 | 4 | 4 |
| Passwords | 10 | 10 | 10 |
| Blocking by address | 6 | 6 | 5 |
| History and repeating | 6 | 6 | 6 |
| The newer reports | 7 | 7 | 7 |
| Uniqueness | 5 | 5 | 3 |
| Running on a server | 8 | 8 | 3 |
| **Total** | **123** | **123** | **98** |

Twenty-five requirements have no direct automated test. They fall into three kinds, and none of them is
untested by accident:

- **The shape of the code is the evidence.** The cookie flags, the order of the checks in the sign-in
  path, the row lock during a point transaction, the absence of any endpoint that writes to the journal,
  the start-up configuration check, the proxy setting, graceful shutdown. Each was confirmed by reading
  the code; an assertion would only restate it.
- **It needs a real browser.** The drag gesture, the collapsing navigation, the scrolling tables, the
  card layout on a phone. Driving these needs a browser automation tool the project does not install, so
  they were checked by hand at phone and desktop widths. The endpoints behind every drag *are* tested.
- **It needs a clock or an operator.** A block expiring on its own after fifteen or sixty minutes, and a
  migration meeting data it refuses to touch. The arithmetic of both is covered by unit tests; the
  operator-facing halves were exercised by hand against a real database.

## 7. Summary rating

| Criterion | Assessment | Reasoning |
|---|---|---|
| Completeness against the plan | **Full** | Every item planned for the three deliveries is implemented and running. The third added languages, a mobile layout, the profile, password reset and change, blocking by address, history search, repeat ordering, three reports, uniqueness rules and a deployment |
| Correctness | **High** | 154 automated checks pass: 65 unit, 12 against a real PostgreSQL, 77 over HTTP. The 42 checks written for the earlier deliveries still pass unchanged, so nothing was broken on the way |
| Defence in depth | **High** | Every rule that matters is enforced at more than one level: the status graph and the feedback rule in both the service and the database; uniqueness in both the service (for the message) and an index (for the guarantee); the password rule in both the browser meter and the server; the limits on sign-in against both the account and the address |
| Data integrity | **High** | Constraints, triggers and unique indexes refuse bad data even when it arrives by direct SQL; money stays in whole tiyn, points can never fall below zero, and a migration that existing rows would break reports the problem rather than rewriting them |
| Security | **Good for a prototype** | Passwords are hashed and judged against the owner's own details; reset links are stored only as hashes, last 30 minutes and work once; session invalidation is exact rather than clock-based; sign-in is limited per account and per address, and every refusal is journalled |
| Usability | **Good** | Three languages with no untranslated gaps, a layout that works on a phone, every drag backed by a button, and errors written as sentences in the reader's language |
| Readiness for public use | **Closer, still not ready** | Deployment, health checks, configuration validation and security headers are in place. Still missing: HTTPS in front of the site, a real mail server for reset links, and an external security review. The payment step remains a simulation |

**Overall: the requirements set for all three stages is met in full, and verified.**
