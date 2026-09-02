Date created: 2026-09-02
Date last modified: 2026-09-02

# MCQ Create, Update, and Delete - Technical PRD

## Overview/Problem

QuizMaker already lets teachers register, log in, and land on `/mcqs`, but that page is still a stub. Teachers have no way to build the shared multiple-choice test bank the product exists for: they cannot create a question, list existing ones, edit them, preview them as a taker would, or delete them.

This phase expands the stub into a working MCQ bank. Teachers can list questions in a table, create and edit a question plus its choices on a dedicated form page, preview a question and record an attempt, and delete a question. Persistence uses three D1 tables (questions, choices, attempts) behind a service layer, the same pattern as users.

---

## Hypothesis

We believe that giving teachers a table-based test bank with create, edit, preview, and delete — and recording each preview attempt against a specific choice — will turn the `/mcqs` landing page into the first real QuizMaker workflow and give later sprints a question bank to collaborate on.

---

## Scope

### In Scope

- Three D1 tables: `mcqs`, `mcq_choices`, and `mcq_attempts`, created by a local migration
- An MCQ service that is the only module that talks to D1 for these tables (create, update, delete, list, find-by-id, including choices)
- An attempt service (or attempt methods on the MCQ service) that records which choice was selected and whether it was correct
- HTTP route handlers for listing, creating, reading, updating, and deleting MCQs, and for recording an attempt on an MCQ
- `mcqs` columns: `id`, `name`, `question`, `created_by_user_id` (FK to `users`), `created_at`, `updated_at`. There is no `description` column; the prompt lives in `question`.
- `/mcqs` becomes a list page: shadcn `Table` of all questions (name, question, actions) plus a button to create a new question; logout stays available
- Row actions via a three-vertical-ellipsis trigger that opens a dropdown: Edit, Preview, Delete
- A shared create/edit page with Save and Cancel; the create form starts with two choices and allows adding up to six
- A preview surface that shows the question and its choices, lets the teacher pick one, submits an attempt, and shows correct/incorrect
- Delete confirmation (shadcn `Dialog`) before the DELETE call
- Continue using existing shadcn components (`table`, `button`, `card`, `field`, `input`, `dialog`, `label`). Propose adding `dropdown-menu`, `textarea`, and `radio-group` before installing them
- Test-driven implementation with **Vitest**: each phase starts with failing unit tests, then implementation until those tests pass
- Replace the stub-only assertions in `mcq-stub.test.tsx`; logout behavior on `/mcqs` must still hold
- On successful register/login, store the returned user `id` in `sessionStorage` so create can send `createdByUserId`; logout clears it. This is not a server session.

### Out of Scope

- Sessions, cookies, tokens, or gating `/mcqs` behind a logged-in user (still none from the auth phase). `created_by_user_id` is attribution, not an access-control check
- `user_id` on `mcq_attempts` (who took the preview is not recorded this phase)
- Collaboration, sharing, roles, or authorization based on who created the question
- Quizzes/exams made of multiple questions
- AI-generated questions
- Search, filters, sort controls, or pagination
- Images, rich text, or media on questions or choices
- Multiple correct answers on one question
- An attempts history / gradebook UI (recording an attempt on preview is in scope; listing past attempts is not)
- Reordering choices by drag-and-drop
- Soft delete

### Cut

- Server Actions for these mutations — the auth phase already uses App Router route handlers plus client `fetch`; keep that pattern so the table and form stay client components
- `updated_by_user_id` — only the original creator is stored (`created_by_user_id`); edits do not record who saved
- Pagination — the first bank will be small; list all rows ordered by `created_at DESC`
- A separate choices CRUD API — choices are always written with the parent MCQ on create/update
- `@cloudflare/vitest-pool-workers` — unit tests mock D1; do not change how the suite runs
- `react-hook-form` — use shadcn `field` plus component state, same as register/login

---

## Testing Approach (TDD with Vitest)

Vitest is already installed. Do not reinstall the harness. Follow `.cursor/skills/testing/SKILL.md`.

Every implementation phase follows red → green. A phase is not complete because the code looks right; it is complete when that phase's Vitest suite is green **and** the matching acceptance criteria hold.

### Harness (already in place)

- Config: `vitest.config.ts` at the repo root (`jsdom`, `globals: true`, `vite-tsconfig-paths` so `@/` resolves, `server-only` aliased to `src/test/server-only-stub.ts`)
- Scripts: `"test": "vitest run"` and `"test:watch": "vitest"`
- Colocate tests: `src/lib/services/mcq-service.ts` is tested by `src/lib/services/mcq-service.test.ts`
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

Existing auth tests must stay green. The current `McqStub` test that forbids create/list controls will go red on purpose in the UI phases; replace it with list-page assertions rather than deleting logout coverage.

---

## Technical Requirements

### Database Schema

Three tables. Apply the migration locally only (`npx wrangler d1 migrations apply quizmaker --local`). Do not apply remotely.

`is_correct` lives on **choices** so the form can mark the right answer, and is **copied onto the attempt** at submit time so later edits to the question do not rewrite history.

```sql
CREATE TABLE mcqs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  question TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE INDEX idx_mcqs_created_by_user_id ON mcqs (created_by_user_id);

CREATE TABLE mcq_choices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  label TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  position INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE
);

CREATE INDEX idx_mcq_choices_mcq_id ON mcq_choices (mcq_id);

CREATE TABLE mcq_attempts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  choice_id TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE,
  FOREIGN KEY (choice_id) REFERENCES mcq_choices(id) ON DELETE CASCADE
);

CREATE INDEX idx_mcq_attempts_mcq_id ON mcq_attempts (mcq_id);
CREATE INDEX idx_mcq_attempts_choice_id ON mcq_attempts (choice_id);
```

- `id` is a generated text primary key (same D1 / SQLite convention as `users`).
- `mcqs.name` is the short title shown in the table.
- `mcqs.question` is the required prompt the taker sees (the old `description` idea, renamed and required).
- `mcqs.created_by_user_id` is a required FK to `users.id`. It is set on create and **not** changed on update. There is still no server session, so the client sends this id (from the register/login response, kept in `sessionStorage` for the tab). That is attribution, not proof of identity.
- `created_at` / `updated_at` are timestamps. `updated_at` changes on edit; `created_by_user_id` does not.
- `mcq_choices.label` is the choice text the taker sees. `position` is 1-based display order (1..n).
- `mcq_choices.is_correct` is `0` or `1`. Exactly one choice per MCQ must be `1` at save time (enforced in the service, not only in the UI).
- A question has **at least 2** and **at most 6** choices (enforced in the service).
- `mcq_attempts.is_correct` is a snapshot of whether the selected choice was correct when the attempt was recorded. Attempts have no `updated_at`; they are immutable.
- Deleting an MCQ cascades to its choices and attempts. Deleting a choice cascades to attempts against that choice.
- Enable foreign keys for this connection if they are not already on (`PRAGMA foreign_keys = ON` is the D1 default for migrations; confirm in local apply).

### API Endpoints

App Router route handlers. Handlers call the service; they do not write SQL. Validate bodies with Zod. Continue the auth-phase JSON + `fetch` pattern. No cookies, no tokens. Create requires `createdByUserId`; that is not a session.

List responses omit choice correctness is fine to include for the edit GET; the preview UI must not display it until after submit.

#### GET /api/mcqs

Lists all questions for the table. No choices in the list payload.

**Response:**
- Success (200): `{ "mcqs": [ { "id": "...", "name": "...", "question": "...", "createdByUserId": "...", "createdAt": "...", "updatedAt": "..." } ] }`
- Error (500): server or database error

Order: `created_at DESC`.

#### POST /api/mcqs

Creates a question and its choices in one request.

**Request Body:**

```json
{
  "name": "Photosynthesis",
  "question": "Which gas do plants absorb?",
  "createdByUserId": "<users.id from register/login>",
  "choices": [
    { "label": "Oxygen", "isCorrect": false },
    { "label": "Carbon dioxide", "isCorrect": true }
  ]
}
```

`question` is required. `createdByUserId` is required and must match an existing `users.id`. Do not send `position`; the server assigns it from array order (index + 1).

**Response:**
- Success (201): the created MCQ including `id`, `name`, `question`, `createdByUserId`, `createdAt`, `updatedAt`, `choices` (each with `id`, `label`, `isCorrect`, `position`)
- Error (400): validation failure (missing name, missing question, missing `createdByUserId`, fewer than 2 or more than 6 choices, empty choice labels, zero or more than one correct choice)
- Error (400): `createdByUserId` does not match an existing user
- Error (500): server or database error

#### GET /api/mcqs/[id]

Returns one question with its choices, for edit and preview.

**Response:**
- Success (200): `{ "id": "...", "name": "...", "question": "...", "createdByUserId": "...", "createdAt": "...", "updatedAt": "...", "choices": [ { "id": "...", "label": "...", "isCorrect": true, "position": 1 } ] }`
- Error (404): unknown id
- Error (500): server or database error

Choices ordered by `position ASC`.

#### PUT /api/mcqs/[id]

Replaces name, question, and the choice set. Does **not** change `created_by_user_id`.

**Request Body:** `{ "name", "question", "choices" }` — same choice rules as POST. Do not send `createdByUserId` on update; if it is present, ignore it. Existing choices may include `"id"` so the service can update in place; new choices omit `id`. Choice ids present in the database for this MCQ but absent from the body are deleted.

**Response:**
- Success (200): the updated MCQ with choices (same shape as GET)
- Error (400): same validation as POST
- Error (404): unknown id
- Error (500): server or database error

#### DELETE /api/mcqs/[id]

Deletes the question. Choices and attempts cascade.

**Request Body:** none

**Response:**
- Success (204): empty body
- Error (404): unknown id
- Error (500): server or database error

#### POST /api/mcqs/[id]/attempts

Records an attempt against one choice of that question. The service looks up the choice, confirms it belongs to the MCQ, copies `is_correct` onto the attempt row, and returns the result.

**Request Body:**

```json
{
  "choiceId": "..."
}
```

**Response:**
- Success (201): `{ "id": "...", "mcqId": "...", "choiceId": "...", "isCorrect": true }`
- Error (400): missing `choiceId`
- Error (404): unknown MCQ, or the choice does not belong to this MCQ
- Error (500): server or database error

There is no GET-attempts endpoint this phase.

### User Interface Requirements

All new UI uses shadcn. Prefer `@/components/ui` over raw `<table>` / `<button>`. Lucide `EllipsisVertical` for the row-actions trigger.

Proposed shadcn adds (not npm packages; ask before running). Always use the `@shadcn/` namespace:

```bash
npx shadcn@latest add @shadcn/dropdown-menu
npx shadcn@latest add @shadcn/textarea
npx shadcn@latest add @shadcn/radio-group
```

`dialog` is already installed and should be used for delete confirmation.

#### MCQ list (`/mcqs`)

- Replace `McqStub` copy with a test-bank list page. Keep logout.
- Wider layout than the auth cards (`max-w-4xl` or similar, not `max-w-sm`).
- Page title (e.g. "Test bank") and a primary **Create question** button that navigates to `/mcqs/new`.
- shadcn `Table` columns:
  - **Name** — `mcqs.name`
  - **Question** — `mcqs.question`
  - **Actions** — icon button, three vertical ellipses, `aria-label` includes the question name (e.g. "Actions for Photosynthesis")
- Actions dropdown items, in this order: **Edit**, **Preview**, **Delete**
  - Edit → `/mcqs/[id]/edit`
  - Preview → `/mcqs/[id]/preview`
  - Delete → open confirm dialog; on confirm, `DELETE /api/mcqs/[id]`, then refresh the list
- Empty state: table (or a clear empty message) with no rows, Create button still visible
- Load list with `GET /api/mcqs` on mount. Show a simple error if the request fails.
- Logout still calls `POST /api/logout` then navigates to `/login`

#### Create / edit (`/mcqs/new` and `/mcqs/[id]/edit`)

- Same form component, two routes. Create has empty fields and **two** blank choices. Edit loads `GET /api/mcqs/[id]` and fills the form. Unknown id → not-found copy and a way back to `/mcqs`.
- Fields:
  - Name (required) — short title
  - Question (required, textarea if that component is added) — the prompt
  - Choices: each row is a label input plus a control to mark **the** correct answer (radio group, exactly one)
- Create sends `createdByUserId` from `sessionStorage` (set on successful register/login). If it is missing, show an error and do not POST. Logout clears that key.
- **Add choice** — enabled while there are fewer than 6 choices
- **Remove choice** — enabled while there are more than 2 choices (per-row or equivalent)
- **Save** — create: `POST /api/mcqs`; edit: `PUT /api/mcqs/[id]`. On 201/200, navigate to `/mcqs`. On 400, show the error and stay on the page.
- **Cancel** — navigate to `/mcqs` with no POST/PUT
- Client-side checks before submit: name non-empty, question non-empty, 2–6 choices, every label non-empty, exactly one choice marked correct. Do not call the API when those fail; show `FieldError`.

#### Preview (`/mcqs/[id]/preview`)

- Loads `GET /api/mcqs/[id]`
- Shows name, question (the prompt), and choices as selectable options. Do **not** reveal which choice is correct before submit.
- Submit sends `POST /api/mcqs/[id]/attempts` with the selected `choiceId`
- After 201, show whether the attempt was correct or incorrect
- A way back to `/mcqs` (link or button). No Save for the question itself on this page.
- If the teacher has not selected a choice, do not POST

#### Home (`/`)

- Unchanged: point visitors at `/login` and `/register`. Do not add quiz authoring here.

---

## Implementation Phases

### Phase 1: Database and MCQ service - COMPLETED

**Objective**: Persist questions and choices in D1 and expose list, get, create, update, and delete through a service. No HTTP yet.

**Schema slice (done)**:
1. Schema contract tests in `src/lib/mcq-schema.contract.test.ts` went RED (no `0002` file), then GREEN after the migration SQL was written
2. `migrations/0002_create_mcqs.sql` creates `mcqs`, `mcq_choices`, and `mcq_attempts`
3. Applied locally only (`npx wrangler d1 migrations apply quizmaker --local`) — 8 commands, status ✅. Not applied remotely

**Tests first (expect RED)** — `src/lib/services/mcq-service.test.ts`, D1 mocked:

1. `create` persists name, question, and `createdByUserId` and returns an id
2. `create` with two choices stores both, assigns `position` 1 and 2 from array order, and returns them
3. `create` with fewer than 2 choices is rejected
4. `create` with more than 6 choices is rejected
5. `create` with zero or more than one `isCorrect: true` is rejected
6. `create` with an empty name, empty question, or empty choice label is rejected
7. `create` without `createdByUserId` (or with an unknown user id) is rejected
8. `list` returns questions without requiring callers to know SQL, newest first
9. `findById` returns the MCQ (including `question` and `createdByUserId`) and its choices ordered by `position`
10. `findById` returns `null` when no row exists
11. `update` changes name/question and updates existing choices by id; `createdByUserId` is unchanged
12. `update` inserts choices that have no id and deletes choices omitted from the payload
13. `deleteMcq` removes the question (`findById` afterward is `null`)

Run `npm test` and confirm these fail (missing module or failed assertions).

**Then implement until GREEN**:
1. ~~Create a D1 migration for `mcqs`, `mcq_choices`, and `mcq_attempts`~~
2. ~~Apply the migration locally only~~
3. ~~Add `src/lib/services/mcq-service.ts` with create, update, deleteMcq, list, findById~~
4. ~~Map rows to camelCase public types; never expose raw `is_correct` integers on the public type (use boolean `isCorrect`)~~
5. ~~Use numbered placeholders and prepared statements only~~

**Deliverables**:
- ~~Local migration for the three tables~~ (`migrations/0002_create_mcqs.sql`, applied locally)
- ~~MCQ service module and colocated Vitest file~~ (`src/lib/services/mcq-service.ts` + `.test.ts`, 13 passing)
- ~~Phase 1 tests green~~ (`npm test`: 51 passed)

**Phase done when**: the thirteen cases above pass and a local migration exists. Do not start attempt logic or route handlers while these are red.

### Phase 2: Attempt service - COMPLETED

**Objective**: Record an attempt against a choice and snapshot correctness.

**Tests first (expect RED)** — `src/lib/services/attempt-service.test.ts` (or the attempt section of the MCQ service tests), D1 mocked:

1. `createAttempt` stores `mcqId`, `choiceId`, and `isCorrect` copied from that choice
2. `createAttempt` returns `isCorrect: true` when the selected choice is the correct one
3. `createAttempt` returns `isCorrect: false` when the selected choice is not
4. `createAttempt` with a choice that does not belong to the MCQ is rejected (not-found)
5. `createAttempt` with an unknown MCQ id is rejected (not-found)

Run `npm test` and confirm the new cases fail.

**Then implement until GREEN**:
1. ~~Add `src/lib/services/attempt-service.ts`~~
2. ~~Look up the choice, verify `mcq_id` matches, insert into `mcq_attempts`~~

**Deliverables**:
- ~~Attempt service module and colocated tests~~ (`src/lib/services/attempt-service.ts` + `.test.ts`, 5 passing)
- ~~Phase 1 and Phase 2 tests green~~ (`npm test`: 56 passed)

**Phase done when**: the five cases above pass. Do not start route handlers while these are red.

### Phase 3: MCQ and attempt endpoints - COMPLETED

**Objective**: HTTP handlers that use the services. No pages yet beyond what already exists.

**Tests first (expect RED)** — colocated next to each route, services mocked:

1. `GET /api/mcqs` returns 200 and a list payload
2. `POST /api/mcqs` with a valid body returns 201 and the created MCQ with choices
3. `POST /api/mcqs` with invalid body (1 choice, two correct answers, missing name, missing question, missing `createdByUserId`) returns 400
4. `GET /api/mcqs/[id]` returns 200 with choices when the row exists
5. `GET /api/mcqs/[id]` returns 404 when it does not
6. `PUT /api/mcqs/[id]` returns 200 with the updated question
7. `PUT /api/mcqs/[id]` returns 404 for an unknown id
8. `DELETE /api/mcqs/[id]` returns 204
9. `DELETE /api/mcqs/[id]` returns 404 for an unknown id
10. `POST /api/mcqs/[id]/attempts` with a valid `choiceId` returns 201 `{ id, mcqId, choiceId, isCorrect }`
11. `POST /api/mcqs/[id]/attempts` with a choice that does not belong to the MCQ returns 404
12. `POST /api/mcqs/[id]/attempts` with a missing body returns 400

Run `npm test` and confirm the new cases fail.

**Then implement until GREEN**:
1. ~~Add Zod schemas for MCQ create/update and attempt bodies (`src/lib/mcq-schemas.ts`)~~
2. ~~Implement `GET`/`POST` `/api/mcqs`~~
3. ~~Implement `GET`/`PUT`/`DELETE` `/api/mcqs/[id]`~~
4. ~~Implement `POST` `/api/mcqs/[id]/attempts`~~
5. ~~Map service not-found to 404 and validation errors to 400~~

**Deliverables**:
- ~~`src/app/api/mcqs/route.ts` + `.test.ts`~~
- ~~`src/app/api/mcqs/[id]/route.ts` + `.test.ts`~~
- ~~`src/app/api/mcqs/[id]/attempts/route.ts` + `.test.ts`~~
- ~~Phases 1–3 tests green~~ (`npm test`: 68 passed)

**Phase done when**: the twelve cases above pass. Do not start list/form pages while these are red.

### Phase 4: List page - PLANNED

**Objective**: `/mcqs` lists questions in a shadcn table with create and row actions. Logout still works.

**Tests first (expect RED)** — client components (Testing Library + `userEvent`); mock `fetch` and navigation:

1. Renders a Create question button that navigates to `/mcqs/new`
2. After a successful `GET /api/mcqs`, renders a row for each question name (and the question prompt)
3. Empty list still shows the Create button and no data rows
4. The actions trigger is a button whose accessible name includes the question name
5. Opening actions shows Edit, Preview, and Delete
6. Edit navigates to `/mcqs/[id]/edit`
7. Preview navigates to `/mcqs/[id]/preview`
8. Delete opens a confirm dialog; confirming calls `DELETE /api/mcqs/[id]`
9. Logout still calls `POST /api/logout` then navigates to `/login`

Run `npm test` and confirm the new cases fail. Rewrite or replace `mcq-stub.test.tsx` so it no longer requires the stub-only copy.

**Then implement until GREEN**:
1. Ask, then add `dropdown-menu` if not already added
2. Replace `McqStub` with a list component (new file under `src/components/mcqs/`; do not keep a stub that lies)
3. Widen `/mcqs` page layout
4. Wire Create, table, dropdown, delete dialog, logout

**Deliverables**:
- List page and row-actions component
- List/component tests
- Phases 1–4 tests green

**Phase done when**: the nine cases above pass.

### Phase 5: Create/edit form - PLANNED

**Objective**: Teachers can create and edit a question plus 2–6 choices, then save or cancel.

**Tests first (expect RED)**:

1. Create form renders name, question, and two choice inputs
2. Add choice adds a third input; after six choices, Add is disabled or does not add a seventh
3. Remove is unavailable (or no-ops) when only two choices remain
4. Submit with empty name or empty question does not `fetch`
5. Submit with no correct choice marked does not `fetch`
6. Valid create submits `POST /api/mcqs` with name, question, `createdByUserId`, and choices (`isCorrect` booleans), then navigates to `/mcqs`
7. Cancel navigates to `/mcqs` without `fetch`
8. Edit form loads `GET /api/mcqs/[id]` and fills name, question, and choice labels
9. Valid edit submits `PUT /api/mcqs/[id]` then navigates to `/mcqs` (no `createdByUserId` in the body)
10. 400 from save shows an error and does not navigate

Run `npm test` and confirm the new cases fail.

**Then implement until GREEN**:
1. Ask, then add `textarea` and `radio-group` if needed
2. Build `McqForm` and pages `/mcqs/new` and `/mcqs/[id]/edit`
3. Save and Cancel as specified
4. On register/login 201/200, write the returned user `id` to `sessionStorage`; logout removes it; create reads it as `createdByUserId`

**Deliverables**:
- Create/edit pages and form tests
- Phases 1–5 tests green

**Phase done when**: the ten cases above pass.

### Phase 6: Preview and verify - PLANNED

**Objective**: Preview records an attempt and shows correct/incorrect. Then confirm the suite, lint, and build.

**Tests first (expect RED)**:

1. Preview renders the MCQ name, the question prompt, and choice labels, and does not show which choice is correct before submit
2. Submit without a selected choice does not `fetch`
3. Submit calls `POST /api/mcqs/[id]/attempts` with `{ choiceId }`
4. On 201 with `isCorrect: true`, the teacher sees that the answer was correct
5. On 201 with `isCorrect: false`, the teacher sees that the answer was incorrect

**Then implement until GREEN**:
1. Build `/mcqs/[id]/preview`
2. Keep a back-to-list control

**Then verify**:
1. Run `npm test` — entire suite green. Record the count in Current Status
2. Run `npm run lint` and `npm run build` and record the result
3. Browser walkthrough if tools are available: create (2 choices) → list row appears → edit (add a choice, save) → preview (wrong then right attempt) → delete → row gone; logout still returns to `/login`. Confirm the row stores `question` (not `description`) and `created_by_user_id`. Otherwise record that it was not run
4. Anything that depends on `env.DB` should be checked with `npm run preview` when run locally; Cloud agents cannot do that

**Deliverables**:
- Preview page and tests
- `npm test`, lint, and build results in Current Status

**Phase done when**: `npm test`, `npm run lint`, and `npm run build` succeed. A live browser click-through is recorded if tools are available.

---

## Technical Implementation Details

### Key Files

*Fill in with real paths as they are created. Intended layout:*

- `migrations/0002_create_mcqs.sql` — `mcqs`, `mcq_choices`, `mcq_attempts` (applied locally 2026-09-02)
- `src/lib/mcq-schema.contract.test.ts` — schema contract tests for migration 0002 (5 passing)
- `src/lib/services/mcq-service.ts` — list, findById, create, update, deleteMcq (D1 via `getDb()`, `batch()` for writes)
- `src/lib/services/mcq-service.test.ts` — Phase 1 service tests (13 passing)
- `src/lib/services/attempt-service.ts` — `createAttempt`; snapshots `isCorrect` from the choice; unknown MCQ or foreign choice throws `McqNotFoundError`
- `src/lib/services/attempt-service.test.ts` — Phase 2 tests (5 passing)
- `src/lib/mcq-schemas.ts` — Zod for MCQ create/update and attempt bodies
- `src/app/api/mcqs/route.ts` + `route.test.ts` — GET list, POST create
- `src/app/api/mcqs/[id]/route.ts` + `route.test.ts` — GET, PUT, DELETE
- `src/app/api/mcqs/[id]/attempts/route.ts` + `route.test.ts` — POST attempt
- `src/components/mcqs/` — list table, row actions, form, preview, delete dialog
- `src/app/mcqs/page.tsx` — list page (replaces stub)
- `src/app/mcqs/new/page.tsx` — create
- `src/app/mcqs/[id]/edit/page.tsx` — edit
- `src/app/mcqs/[id]/preview/page.tsx` — preview
- `src/lib/db.ts` — existing `getDb()`; reuse, do not duplicate
- `src/components/auth/logout-button.tsx` — remains on the list page

### Implementation Patterns

```typescript
// Services are the only modules that talk to env.DB.
// Route handlers call the service; they do not write SQL.

type McqChoiceInput = {
  id?: string;
  label: string;
  isCorrect: boolean;
};

type NewMcq = {
  name: string;
  question: string;
  createdByUserId: string;
  choices: McqChoiceInput[];
};

type UpdateMcq = {
  name: string;
  question: string;
  choices: McqChoiceInput[];
};

// create(input: NewMcq): Promise<McqWithChoices>
// update(id: string, input: UpdateMcq): Promise<McqWithChoices>
// deleteMcq(id: string): Promise<void>  // throw not-found if zero rows
// list(): Promise<McqListItem[]>
// findById(id: string): Promise<McqWithChoices | null>
// createAttempt(mcqId: string, choiceId: string): Promise<Attempt>
```

```typescript
// Client: list and mutate through fetch, same as register/login.

await fetch("/api/mcqs", { method: "GET" });
await fetch("/api/mcqs", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name, question, createdByUserId, choices }),
});
await fetch(`/api/mcqs/${id}/attempts`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ choiceId }),
});
```

```sql
-- D1 queries use numbered placeholders, not string concatenation.
-- Create question + choices in one batch so a failed choice insert cannot leave an orphan MCQ.

INSERT INTO mcqs (name, question, created_by_user_id)
VALUES (?1, ?2, ?3)
RETURNING id, name, question, created_by_user_id, created_at, updated_at;
```

Use `db.batch([...])` (D1) for create/update of the parent plus its choices so the write is atomic.

### Important Notes

- This phase still does **not** keep the teacher logged in. `/mcqs` is not an auth wall. That is intentional and unchanged from the register/login PRD.
- `created_by_user_id` is required attribution. The client sends the id from register/login (`sessionStorage`). Anyone who can POST can send any existing user id; do not treat this as authorization. Do not add cookies or a session table to "fix" that here.
- Do not add `user_id` on `mcq_attempts`. Do not add `updated_by_user_id`.
- Centralize D1 access in `src/lib/`. Do not import the database module into `'use client'` components.
- Ask before adding npm dependencies. shadcn components are copied source files; still ask before `npx shadcn@latest add`.
- Zod is already in the project; use it for these endpoints.
- Do not deploy. Do not apply D1 migrations with `--remote`.
- `npm run preview` is required for anything that depends on `env.DB`. `npm run dev` runs on Node and will not see Workers bindings the same way.
- Implement test-first. If `npm test` is already green for a phase before production code exists, the tests are not asserting real behavior — rewrite them.
- Do not mock away the behavior under test.
- Update `AGENTS.md` project description once this bank exists so later agents do not still say MCQ features are unbuilt.
- The previous PRD's stub-only rule is superseded for `/mcqs` by this document.

---

## Acceptance Criteria

- [x] A local D1 migration creates `mcqs`, `mcq_choices`, and `mcq_attempts`
- [ ] A teacher can create an MCQ with a name, a required question prompt, `created_by_user_id`, and 2–6 choices
- [ ] The create form starts with two choice fields and cannot save with fewer than two or more than six
- [ ] Exactly one choice is marked correct on create and on update; otherwise the request is rejected
- [ ] `/mcqs` lists questions in a shadcn table (name, question, actions)
- [ ] Create question navigates to `/mcqs/new`
- [ ] Each row's actions control is three vertical ellipses and opens Edit, Preview, and Delete
- [ ] Edit opens `/mcqs/[id]/edit` with the existing name, question, and choices
- [ ] Save on create returns 201 and returns the teacher to `/mcqs` with the new row visible
- [ ] Save on edit returns 200 and returns the teacher to `/mcqs` with the changes visible; `created_by_user_id` is unchanged
- [ ] Cancel on create/edit returns to `/mcqs` without writing a row
- [ ] Delete asks for confirmation, then removes the question (and cascaded choices/attempts) from the list
- [ ] Preview shows the question prompt and choices without revealing the correct answer until an attempt is submitted
- [ ] Submitting a preview answer writes `mcq_attempts` with the selected `choice_id` and a snapshot `is_correct`
- [ ] Preview then tells the teacher whether the attempt was correct or incorrect
- [x] Unknown MCQ id on GET/PUT/DELETE/attempt returns 404
- [x] Invalid create/update bodies return 400 (including missing `question` or `createdByUserId` on create)
- [ ] Logout on `/mcqs` still calls `POST /api/logout` and navigates to `/login`, and clears the stored user id
- [ ] No cookies, session rows, or tokens are added. `created_by_user_id` is the only user FK on `mcqs`
- [ ] Each phase has colocated Vitest coverage written before or with the production change
- [ ] `npm test` (Vitest) is green
- [ ] `npm run lint` and `npm run build` succeed

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Teacher can add a question to the bank | One `mcqs` row (`name`, `question`, `created_by_user_id`) plus 2–6 `mcq_choices` after Save | Local D1 query after create |
| Round-trip edit | Name/choice change visible in the table after Save | Manual walkthrough + GET list |
| Delete removes the graph | Zero choices and attempts left for that `mcq_id` | Local D1 query after DELETE |
| Preview attempt is stored | One `mcq_attempts` row with matching `choice_id` and snapshot `is_correct` | Local D1 query after preview submit |
| Time to first saved question from `/mcqs` | Under 2 minutes | Manual walkthrough |
| Vitest suite | All phase tests green, including existing auth tests | `npm test` |

---

## Dependencies

### External Dependencies

- Cloudflare D1 — `mcqs`, `mcq_choices`, `mcq_attempts` (existing `DB` binding, database `quizmaker`)
- Wrangler — write migration, apply locally

### Internal Dependencies

- `src/lib/db.ts` — `getDb()` via `getCloudflareContext({ async: true })`
- `src/lib/services/user-service.ts` — pattern to follow; `created_by_user_id` must reference `users.id` (reject unknown ids on create). Attempts stay unattributed.
- Next.js App Router route handlers under `/api/mcqs`
- shadcn/ui `table`, `button`, `card`, `field`, `input`, `dialog`, `label` — already installed
- shadcn/ui `dropdown-menu`, `textarea`, `radio-group` — proposed adds
- Zod — request validation
- Vitest + Testing Library + jsdom + vite-tsconfig-paths — unit tests
- Lucide `EllipsisVertical` (or equivalent) — row actions trigger

### Environment

- D1 binding `DB` in `wrangler.jsonc` (already present)
- No new secrets this phase
- If a variable is added later, put the real value in `.dev.vars` and an empty placeholder in `.dev.vars.example`

---

## Risks and Mitigation

### Technical Risks

- **Risk**: Creating the parent MCQ then inserting choices as separate statements leaves an orphan question if a later insert fails.
- **Mitigation**: Use D1 `batch()` for create/update. Cover failure-path validation in the service before any write when possible.

- **Risk**: `npm run dev` will not exercise D1 the same way as Workers.
- **Mitigation**: Verify MCQ CRUD against D1 with `npm run preview` once the migration is applied locally.

- **Risk**: Updating choices by delete-and-reinsert would cascade-delete historical attempts.
- **Mitigation**: Update existing choices by `id`, insert new ones, delete only omitted ids. Document that removing a choice still cascades its attempts.

- **Risk**: Tests stay green by mocking the unit under test or asserting nothing.
- **Mitigation**: Follow `.cursor/skills/testing/SKILL.md`. A phase that starts green without new production code is a signal to rewrite the tests.

- **Risk**: `created_by_user_id` is client-supplied because there is no server session, so it is not proof of who created the row.
- **Mitigation**: Store it as attribution only. Validate that the id exists in `users`. Do not add cookies, JWT, or a session table in this phase to make it "real" auth.

- **Risk**: Foreign keys silently do nothing if they are off.
- **Mitigation**: Rely on D1's default; still delete through the service by MCQ id and assert cascade behavior in service tests against the mock (and locally with SQL after preview, if checking by hand).

### User Experience Risks

- **Risk**: Teachers refresh `/mcqs` and assume they are still logged in.
- **Mitigation**: Do not fake a session. Keep logout as navigation to `/login`. Do not add "Signed in as…" chrome.

- **Risk**: Preview that shows the correct answer up front makes attempts pointless.
- **Mitigation**: Hide correctness until after `POST .../attempts` returns.

- **Risk**: Accidental delete from a one-click dropdown item.
- **Mitigation**: Confirm in a `Dialog` before `DELETE`.

- **Risk**: The list looks empty with no explanation after a failed GET.
- **Mitigation**: Show an error state distinct from the genuine empty bank.

---

## Troubleshooting Guide

*Add entries as bugs are found and fixed during implementation.*

### Common Issue Name
**Problem**: [What goes wrong]
**Cause**: [Why it happens]
**Solution**: [How to fix it]
**Code Reference**: `file.ts:line-number`

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
9. Do not add sessions, cookies, tokens, social login, AI generation, or multi-question quizzes. Do add `created_by_user_id` on `mcqs` as specified. Do not add `user_id` on attempts.
10. Ask before adding any npm dependency and before adding shadcn components
11. Do not deploy and do not apply remote D1 migrations
12. Use Vitest and follow TDD: write that phase's tests first (RED), implement until GREEN, then stop. Do not skip ahead
13. Follow `.cursor/skills/testing/SKILL.md` for colocation, mocking, and what makes a test worth writing
14. Follow `.cursor/rules/d1.mdc` (numbered placeholders, `all()` + `results`, local migrations only) and `.cursor/rules/shadcn.mdc` (`@shadcn/` namespace, do not hand-edit `src/components/ui/`)
15. Reuse `getDb()`; do not open a second D1 access path
16. The register/login PRD still governs auth. This PRD governs the test bank. Where they conflict on `/mcqs` (stub vs table), this document wins

---

## Current Status

**Last Updated**: 2026-09-02
**Current Phase**: Phase 4 - List page
**Status**: Phase 3 COMPLETED — MCQ and attempt HTTP routes green. List UI not started
**Verification**:
- Route tests: RED (missing handlers), then GREEN (12 passing)
- `npm test`: 68 passed (14 files)
**Next Steps**: Phase 4 — write list-page tests first (RED), then replace the `/mcqs` stub with the table UI. Ask before adding `dropdown-menu`.
