Date created: 2026-09-01
Date last modified: 2026-09-01

# Register, Login, and Logout - Technical PRD

## Overview/Problem

QuizMaker is a greenfield application for teachers who want to collaborate on a shared test bank of multiple-choice questions. Before any of that collaboration can happen, each teacher needs their own account. Today the starter has no users, no database, and no way to register, log in, or log out, so there is nothing to attach later quiz work to.

This first phase builds only that baseline: a user record, hashed-password authentication over HTTP, and a stub page to land on after a successful register or login. Multiple-choice question capabilities are explicitly deferred.

---

## Hypothesis

We believe that giving teachers a simple register, login, and logout flow will let multiple users start using QuizMaker independently and give later sprints a user identity to attach the shared MCQ test bank to.

---

## Scope

### In Scope

- A `users` table with primary key, first name, last name, username, email, and hashed password
- Username and email may be the same value for a given user
- A D1 migration that creates the `users` table
- A user service with create, update, and delete (plus the reads login needs)
- HTTP POST endpoints for register, login, and logout
- Register and login call the user service to write or read user rows
- Client hashes the password before it is sent on the register and login POST bodies
- Server stores only the hashed password and compares hashes on login
- Register and login pages that collect the fields above
- After a successful register or login, redirect to a stub MCQ page
- Logout returns the user to the login page
- A stub `/mcqs` page with no question-bank behavior
- Test-driven implementation with **Vitest**: each phase starts with failing unit tests, then implementation until those tests pass

### Out of Scope

- Multiple-choice question create, edit, list, or collaboration
- Social logins (Google, GitHub, or any OAuth provider)
- Tokens (JWT, API tokens, refresh tokens)
- Session management of any kind (cookies, server sessions, session tables)
- Email verification, password reset, or account recovery
- Roles, permissions, or admin vs teacher distinction
- Remember-me, multi-device logout, or "logged in" persistence across refresh

### Cut

- Cookies and session tables — this phase is a credential check plus redirect only; logged-in state is not persisted
- Auth libraries (Better Auth, Auth.js, Lucia) — extra dependency cost for a teaching baseline
- Separate username-only or email-only login — both fields exist on the user; login will accept username
- Rate limiting and lockout — deferred until the auth surface is real
- `@cloudflare/vitest-pool-workers` — unit tests mock D1 and route collaborators; do not change how the whole suite runs

---

## Testing Approach (TDD with Vitest)

Every implementation phase follows red → green. A phase is not complete because the code looks right; it is complete when that phase's Vitest suite is green **and** the matching acceptance criteria hold.

### Harness (install once, before Phase 1 tests)

Vitest is not in the starter. Add it with the project's testing skill:

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event jsdom vite-tsconfig-paths
```

- Config: `vitest.config.ts` at the repo root (`jsdom`, `globals: true`, `vite-tsconfig-paths` so `@/` resolves)
- Scripts: `"test": "vitest run"` and `"test:watch": "vitest"`
- Colocate tests: `src/lib/services/user-service.ts` is tested by `src/lib/services/user-service.test.ts`
- Assert observable behavior and failure paths. No `expect(true).toBe(true)`.
- Mock at the module boundary. Unit tests never reach a real D1 database, a real network, or a live Worker.
- Mock `getCloudflareContext()` and `server-only`. Keep D1 behind `src/lib/` so tests stub that module rather than the prepared-statement chain.
- Reset mocks in `beforeEach` with `vi.clearAllMocks()`.
- Server Components are not rendered by Testing Library. Test data logic as functions; render only client components.

### Phase gate

1. Write the phase's tests first and run `npm test` — expect **RED** (fail to import, missing exports, or failed assertions).
2. Implement the minimum code for those tests.
3. Run `npm test` again — expect **GREEN**.
4. Only then move to the next phase. Do not write the next phase's production code while earlier tests are red.

---

## Technical Requirements

### Database Schema

One table. No session table.

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_email ON users (email);
```

- `id` is a generated text primary key (D1 / SQLite convention for this project).
- `username` and `email` are both required and unique. They may hold the same string.
- `password` stores a hash only. Plaintext must never be written.
- Apply the migration locally only (`npx wrangler d1 migrations apply <db> --local`). Do not apply remotely.

### API Endpoints

These are App Router route handlers. Register and login use the user service to reach D1. There is no token in any response and no `Set-Cookie` header.

#### POST /api/register

Creates a user and returns the created record without the password hash.

**Request Body:**

```json
{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "username": "ada@school.edu",
  "email": "ada@school.edu",
  "password": "<client-hashed-password>"
}
```

**Response:**
- Success (201): `{ "id": "...", "firstName": "Ada", "lastName": "Lovelace", "username": "...", "email": "..." }`
- Error (400): validation failure (missing fields, invalid email, password hash missing)
- Error (409): username or email already exists
- Error (500): server or database error

#### POST /api/login

Looks up the user by username through the user service and compares the submitted password hash to the stored hash.

**Request Body:**

```json
{
  "username": "ada@school.edu",
  "password": "<client-hashed-password>"
}
```

**Response:**
- Success (200): `{ "id": "...", "firstName": "Ada", "lastName": "Lovelace", "username": "...", "email": "..." }`
- Error (400): validation failure
- Error (401): username not found or hash does not match (same message for both)
- Error (500): server or database error

Do not return the stored password hash. Do not issue a session or token.

#### POST /api/logout

No session exists to destroy. This endpoint exists so the UI has a single logout action.

**Request Body:** none

**Response:**
- Success (200): `{ "ok": true }`

The client then navigates to `/login`.

### User Interface Requirements

#### Register (`/register`)

- Fields: first name, last name, username, email, password
- Username and email may be identical
- Client-side required-field checks before submit
- Password is hashed in the browser, then sent as the `password` field on `POST /api/register`
- On 201: redirect to `/mcqs`
- On 400/409: show the error next to the form; do not redirect
- Link to `/login` for users who already have an account

#### Login (`/login`)

- Fields: username, password
- Password is hashed in the browser, then sent as the `password` field on `POST /api/login`
- On 200: redirect to `/mcqs`
- On 401: show a generic "Invalid username or password" message
- Link to `/register` for new users

#### Logout

- Available on the `/mcqs` stub (button or link)
- Calls `POST /api/logout`, then navigates to `/login`
- No cookie or local session to clear beyond leaving the page

#### MCQ stub (`/mcqs`)

- Placeholder page only: title and short copy that this is where the test bank will live
- Logout control
- No question forms, lists, or APIs

#### Home (`/`)

- Point unauthenticated visitors toward `/login` and `/register`
- Do not build quiz features here

---

## Implementation Phases

### Phase 0: Vitest harness - COMPLETED

**Objective**: `npm test` runs an empty-but-working Vitest suite so later phases can start red for the right reason.

**Tasks**:
1. Install Vitest and the packages listed in Testing Approach (user-approved for this PRD)
2. Add `vitest.config.ts` and the `test` / `test:watch` scripts
3. Add a one-line sanity test only if needed to prove the harness; delete it once a real Phase 1 test exists
4. Run `npm test` and confirm the command exits 0

**Deliverables**:
- `vitest.config.ts`
- `package.json` scripts `test` and `test:watch`

**Phase done when**: `npm test` runs Vitest successfully.

### Phase 1: Database and user service - COMPLETED

**Objective**: Persist users in D1 and expose create, update, delete, and the reads login needs.

**Tests first (expect RED)** — `src/lib/services/user-service.test.ts`, D1 mocked:

1. `create` persists first name, last name, username, and email
2. `create` writes a password hash, not the plaintext the teacher typed
3. `create` allows username and email to be the same string
4. `create` returns a public user with no `password` field
5. `findByUsername` returns the stored hash so login can compare
6. `findByUsername` returns `null` when no row exists
7. `update` changes the requested fields and still omits `password` from the public result
8. `delete` removes the user (`findByUsername` afterward is `null`)
9. Duplicate username or email surfaces a conflict the endpoints can map to 409

Run `npm test` and confirm these fail (missing module or failed assertions).

**Then implement until GREEN**:
1. Add a D1 database binding named `DB` in `wrangler.jsonc` (create the database if it does not exist)
2. Create a migration for the `users` table
3. Apply the migration locally only
4. Add `src/lib/services/user-service.ts` with create, update, delete, and lookup-by-username / lookup-by-id
5. Never return `password` from service methods used by HTTP responses

**Deliverables**:
- D1 binding and local migration
- User service module and colocated Vitest file
- Phase 1 tests green

**Phase done when**: the nine cases above pass and a local migration exists. Do not start route handlers while these are red.

### Phase 2: Register, login, and logout endpoints - PLANNED

**Objective**: HTTP POST handlers that use the user service. No tokens. No cookies.

**Tests first (expect RED)** — colocated next to each route, user service mocked:

1. `POST /api/register` with a valid body returns 201 and a public user (no password)
2. `POST /api/register` with missing or invalid fields returns 400
3. `POST /api/register` when username or email already exists returns 409
4. `POST /api/login` with a matching username and hash returns 200 and a public user
5. `POST /api/login` with an unknown username returns 401
6. `POST /api/login` with a wrong hash returns 401 with the **same** message as unknown username
7. `POST /api/login` with an invalid body returns 400
8. `POST /api/logout` returns 200 `{ "ok": true }`
9. Register and login success bodies have no token field and set no `Set-Cookie` header

Run `npm test` and confirm the new cases fail.

**Then implement until GREEN**:
1. Validate request bodies (Zod is the project convention; propose it before adding)
2. Implement `POST /api/register`
3. Implement `POST /api/login` with hash comparison
4. Implement `POST /api/logout` as a no-op success response
5. Map unique-constraint failures to 409

**Deliverables**:
- `src/app/api/register/route.ts` + `.test.ts`
- `src/app/api/login/route.ts` + `.test.ts`
- `src/app/api/logout/route.ts` + `.test.ts`
- Phase 1 and Phase 2 tests green

**Phase done when**: the nine cases above pass. Do not start pages while these are red.

### Phase 3: Auth pages and MCQ stub - PLANNED

**Objective**: Teachers can register, log in, land on the stub, and log out.

**Tests first (expect RED)** — client components only (Testing Library + `userEvent`); mock `fetch` and navigation:

Password helper (`src/lib/password.test.ts`):
1. `hashPassword` returns a value different from the plaintext
2. The same plaintext hashes to the same value (login can compare)
3. Different plaintext values do not hash to the same value

Register form:
4. Renders first name, last name, username, email, and password fields
5. On submit, `fetch` to `/api/register` sends a hashed `password`, not the typed plaintext
6. On 201, navigates to `/mcqs`
7. On 409, shows an error and does not navigate

Login form:
8. Renders username and password fields
9. On submit, `fetch` to `/api/login` sends a hashed `password`, not plaintext
10. On 200, navigates to `/mcqs`
11. On 401, shows "Invalid username or password" and does not navigate

MCQ stub / logout:
12. `/mcqs` stub copy is present; no question create/list controls
13. Logout calls `POST /api/logout` and then navigates to `/login`

Run `npm test` and confirm the new cases fail.

**Then implement until GREEN**:
1. Build `/register` and `/login` with existing shadcn `field`, `input`, `button`, and `card`
2. Hash the password in the browser before each POST
3. Redirect to `/mcqs` on success
4. Build the `/mcqs` stub with a logout control
5. Wire home page links to register and login

**Deliverables**:
- Register, login, and MCQ stub pages
- Client password hashing helper and its tests
- Client form tests
- Phases 1–3 tests green

**Phase done when**: the thirteen cases above pass.

### Phase 4: Verify - PLANNED

**Objective**: Confirm the feature is done: full Vitest suite green, plus lint, build, and a browser walkthrough.

**Tests first**:
- No new product tests unless Phase 4 finds a gap. If a walkthrough fails, add a failing Vitest case that describes the bug, then fix until green (same red → green rule).

**Then verify**:
1. Run `npm test` — entire suite green. Record the count in Current Status
2. Run `npm run lint` and `npm run build` and record the result
3. Walk register → `/mcqs` → logout → login → `/mcqs` in the browser
4. Confirm a wrong password stays on `/login` and a duplicate username/email returns 409

**Deliverables**:
- `npm test`, lint, and build results in Current Status
- Acceptance criteria checked off only after tests are green **and** the walkthrough passes

**Phase done when**: `npm test`, `npm run lint`, and `npm run build` succeed, and the browser walkthrough matches the acceptance criteria.

---

## Technical Implementation Details

### Key Files

- `migrations/0001_create_users.sql` — `users` table (applied locally)
- `src/lib/db.ts` — `getDb()` via `getCloudflareContext({ async: true })`
- `src/lib/services/user-service.ts` — create, update, deleteUser, findByUsername, findById
- `src/lib/services/user-service.test.ts` — Phase 1 user-service tests (9 passing)
- `src/test/server-only-stub.ts` — Vitest alias target for `server-only`
- `wrangler.jsonc` — D1 `DB` binding to database `quizmaker` (`29f71fd6-dca2-40f9-8d43-aa09f99a0360`)
- `vitest.config.ts` — Vitest harness
- `src/lib/password.ts` — Phase 3: client hash helper (not created yet)
- `src/app/api/register/route.ts` — Phase 2
- `src/app/api/login/route.ts` — Phase 2
- `src/app/api/logout/route.ts` — Phase 2
- `src/app/register/page.tsx` — Phase 3
- `src/app/login/page.tsx` — Phase 3
- `src/app/mcqs/page.tsx` — Phase 3

### Implementation Patterns

```typescript
// User service is the only module that talks to env.DB.
// Route handlers call the service; they do not write SQL.

type NewUser = {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  passwordHash: string;
};

// create(user: NewUser): Promise<PublicUser>
// update(id: string, patch: Partial<NewUser>): Promise<PublicUser>
// delete(id: string): Promise<void>
// findByUsername(username: string): Promise<UserRecord | null>  // includes hash, server-only
```

```typescript
// Client: hash before POST. Do not send plaintext.
const password = await hashPassword(plaintext);
await fetch("/api/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, password }),
});
```

```sql
-- D1 queries use numbered placeholders, not string concatenation.
SELECT id, first_name, last_name, username, email, password
FROM users
WHERE username = ?1;
```

### Important Notes

- This phase does **not** keep the user logged in. Refreshing `/mcqs` does not prove identity. That is intentional.
- Logout is a navigation contract (`POST /api/logout` then `/login`), not session destruction.
- Hash the password in the browser with Web Crypto (`SubtleCrypto`). Use the same algorithm on register and login so the stored value and the login value can be compared.
- The server must still refuse to persist a body that looks like plaintext if a later change forgets the client hash — treat an empty password as invalid.
- Centralize D1 access in `src/lib/`. Do not import the database module into `'use client'` components.
- Ask before adding npm dependencies. Zod is the validation convention in `.cursor/rules/nextjs.mdc` but is not installed yet.
- Do not deploy. Do not apply D1 migrations with `--remote`.
- `npm run preview` is required for anything that depends on `env.DB`. `npm run dev` runs on Node and will not see Workers bindings the same way.
- Implement test-first. If `npm test` is already green for a phase before production code exists, the tests are not asserting real behavior — rewrite them.
- Do not mock away the behavior under test (for example, do not mock `hashPassword` in the password helper's own tests).

---

## Acceptance Criteria

- [ ] A teacher can register with first name, last name, username, email, and password
- [ ] Username and email may be the same value and both persist (user service)
- [ ] The value stored in `users.password` is a hash, not the plaintext the teacher typed (user service stores the provided hash)
- [ ] The register and login POSTs send a hashed password, not plaintext
- [ ] A successful register returns 201 and the UI redirects to `/mcqs`
- [ ] A successful login returns 200 and the UI redirects to `/mcqs`
- [ ] A wrong password or unknown username returns 401 with a generic error and does not redirect
- [x] A duplicate username or email surfaces `UserConflictError` (endpoints will map this to 409 in Phase 2)
- [ ] Logout calls `POST /api/logout` and returns the teacher to `/login`
- [ ] `/mcqs` is a stub only — no MCQ create/list/edit
- [ ] No cookies, session rows, or tokens are created
- [ ] No social login UI or provider config exists
- [x] Phase 1 has colocated Vitest coverage written before the production code
- [x] `npm test` (Vitest) is green for Phase 1 (9 tests)
- [ ] `npm run lint` and `npm run build` succeed

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| A second teacher can create a distinct account | Two rows in `users` with different usernames | Local D1 query after two registrations |
| Time to reach the MCQ stub from a cold visit | Under 2 minutes for register or login | Manual walkthrough |
| Password plaintext in transit (request body) | Zero plaintext password fields | Inspect register/login POST bodies |
| Password plaintext at rest | Zero plaintext values in `users.password` | Local D1 query of created rows |
| Vitest suite | All phase tests green | `npm test` |

---

## Dependencies

### External Dependencies

- Cloudflare D1 — `users` table
- Wrangler — create DB, write migration, apply locally

### Internal Dependencies

- `src/lib/services/user-service.ts` — database access for users
- Next.js App Router route handlers — `/api/register`, `/api/login`, `/api/logout`
- shadcn/ui `card`, `field`, `input`, `button` — already installed
- Zod — proposed for request validation (not installed; ask before adding)
- Vitest + Testing Library + jsdom + vite-tsconfig-paths — unit tests (approved for this PRD; install in Phase 0)

### Environment

- D1 binding `DB` in `wrangler.jsonc`
- No auth secrets required this phase (no tokens, no signed cookies)
- If a variable is added later, put the real value in `.dev.vars` and an empty placeholder in `.dev.vars.example`

---

## Risks and Mitigation

### Technical Risks

- **Risk**: Client-side hashing without a server salt is weaker than a salted server hash, and a captured hash can be replayed as a login.
- **Mitigation**: Accept that for this baseline. Never store plaintext. Same algorithm on register and login. Do not add tokens or cookies to "fix" this in this phase.

- **Risk**: `npm run dev` will not exercise D1 the same way as Workers.
- **Mitigation**: Verify register/login against D1 with `npm run preview` once the binding exists.

- **Risk**: Unique username/email collisions surface as raw D1 errors.
- **Mitigation**: Catch unique-constraint failures in the user service or route handler and return 409. Cover this with a failing 409 test before implementing the mapping.

- **Risk**: Tests stay green by mocking the unit under test or asserting nothing.
- **Mitigation**: Follow `.cursor/skills/testing/SKILL.md`. A phase that starts green without new production code is a signal to rewrite the tests.

### User Experience Risks

- **Risk**: Teachers refresh `/mcqs` and assume they are still "logged in"; the next sprint may surprise them.
- **Mitigation**: Keep the stub copy honest. Do not fake a session in the UI.

- **Risk**: Logout feels like it does nothing because there is no session to clear.
- **Mitigation**: Always navigate to `/login` after the logout POST so the teacher leaves the stub.

---

## Troubleshooting Guide

### Vitest cannot resolve `server-only`
**Problem**: `Failed to resolve import "server-only"` when loading `user-service.ts`.
**Cause**: Next compiles `server-only` under `next/dist/compiled/server-only`; Vite does not resolve that bare specifier, and `vi.mock("server-only")` still needs a resolvable module.
**Solution**: Alias `server-only` in `vitest.config.ts` to `src/test/server-only-stub.ts`.
**Code Reference**: `vitest.config.ts:10`

### Wrangler asked to create the migrations folder
**Problem**: `npx wrangler d1 migrations create` prompts for a missing `migrations/` directory.
**Cause**: The starter had no migrations folder.
**Solution**: Accept the default `migrations/` path. Non-interactive Wrangler chose yes.

---

## Notes for AI Agents

When working with this PRD:

1. Start by reading the Problem and Hypothesis to understand intent
2. Use Scope (In/Out/Cut) to determine boundaries — do not build out-of-scope items
3. Update phase status markers as work progresses
4. Add implementation details under "Technical Implementation Details" as code is written
5. Mark acceptance criteria as complete when features work
6. Add troubleshooting entries when bugs are found and fixed
7. Keep all sections current — remove outdated information
8. Use code references format: `filepath:line-number` when citing code
9. Do not build MCQ features, social login, tokens, cookies, or session tables
10. Ask before adding any npm dependency
11. Do not deploy and do not apply remote D1 migrations
12. Use Vitest and follow TDD: write that phase's tests first (RED), implement until GREEN, then stop. Do not skip ahead
13. Follow `.cursor/skills/testing/SKILL.md` for harness, colocation, mocking, and what makes a test worth writing

---

## Current Status

**Last Updated**: 2026-09-01
**Current Phase**: Phase 1 - Database and user service
**Status**: COMPLETED — stopped for review before Phase 2
**Verification**:
- `npm test`: 9 passed
- `npm run lint`: passed
- `npm run build`: passed (Next.js 16.2.12)
**Next Steps**: After review, Phase 2 TDD — failing register/login/logout route tests, then handlers
