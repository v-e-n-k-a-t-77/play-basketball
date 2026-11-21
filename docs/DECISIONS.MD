# Decisions

Short notes on why Play Basketball is built the way it is.

## 1. TypeScript instead of JavaScript
**Decision:** TypeScript with `strict: true` on both server and client.
**Why:** Catches mistakes before running the code, gives autocomplete, and is what most companies expect. The original spec said JavaScript, and this was changed on purpose.

## 2. TypeScript 6, not 7 (for now)
**Decision:** `typescript` is pinned to `~6.0.3`.
**Why:** `typescript-eslint` did not support TypeScript 7 when this was set up, and forcing the install caused errors. Revisit when `typescript-eslint` supports 7.

## 3. Raw SQL with `pg`, no ORM
**Decision:** SQL lives only in repository files, run through `pg`.
**Why:** The join logic needs explicit control of transactions and row locks (`SELECT ... FOR UPDATE`). An ORM would hide exactly the parts worth learning and explaining.

## 4. PostgreSQL + PostGIS
**Decision:** Relational database with the PostGIS extension.
**Why:** Strong transactions for slot safety, and indexed radius search (`ST_DWithin` + GiST) for nearby games.

## 5. Database enforces the important rules
**Decision:** CHECK constraints, a unique constraint and an exclusion constraint back up the application code.
**Why:** If a bug lets bad data through, Postgres still rejects it. Examples: `chk_capacity` (never overfill a game), `excl_host_overlap` (a host cannot run two overlapping games), `uq_participant` (no duplicate join rows).

## 6. Max players means the whole roster
**Decision:** `max_players` defaults are 8 for 3v3, 24 for 5v5 and 30 for open run.
**Why:** Real basketball rosters include substitutes (about 2 teams x 4 for 3x3, 2 teams x 12 for 5v5). 30 is the database limit.

## 7. Vite + React, not Next.js
**Decision:** Single-page app built with Vite.
**Why:** Access token in memory plus a refresh cookie, and live Socket.IO connections, are simpler without server rendering. Next.js is for a later project.

## 8. Free services only
**Decision:** Vercel, Render, Neon, Upstash and Cloudinary, all on free plans. AWS only as a bonus copy at the end.
**Why:** The project must stay online and working for months during placements. The AWS free plan closes after 6 months, so it cannot host the main link.

## 9. In-memory test database
**Decision:** A second Postgres container (`db_test`) stores its data in RAM.
**Why:** Fast, and tests can never touch development data. A safety check refuses to run tests unless `DATABASE_URL` contains `_test`. `npm test` migrates the test database automatically (`pretest`).

## 10. Dev-only warnings left alone
**Decision:** The `minimatch` audit warnings (inside `typescript-eslint`) and unapproved install scripts (`esbuild`) are ignored.
**Why:** They affect development tools only, and `npm audit --omit=dev` reports 0 vulnerabilities. `npm audit fix --force` would downgrade packages and break the setup.

## 11. App factory
**Decision:** `createApp()` builds the Express app without listening on a port.
**Why:** Supertest can call the app directly in tests.