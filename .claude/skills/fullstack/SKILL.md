---
name: fullstack
description: Implement a full-stack feature across backend, shared types, and frontend with build verification.
argument-hint: [feature description]
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(*), Task
---

# Full-Stack Feature Implementation

Implement the following feature: **$ARGUMENTS**

## Dynamic context

Current branch and working tree:
!`git status --short && echo "---" && git log --oneline -3`

Backend package structure:
!`ls packages/backend/src/`

Frontend views and stores:
!`ls packages/frontend/src/views/ packages/frontend/src/store/`

Shared package exports:
!`ls packages/shared/src/`

## Workflow

Follow these steps **in order**. Do not skip steps.

### Step 1 — Plan

Before writing any code, produce a numbered plan covering:
- Which files will be created or modified in each package (backend, shared, frontend)
- Database schema changes if needed (SQLite migrations in sqliteStore.ts)
- API endpoints to add or change (routes in `packages/backend/src/api/routes/`)
- Frontend components, stores, or views to add or change
- Any shared types or utilities needed in `packages/shared/`

**Wait for user approval before proceeding.**

### Step 2 — Shared types

If the feature needs new types, interfaces, or utilities shared between backend and frontend, implement them first in `packages/shared/src/`. This ensures both sides agree on the contract.

### Step 3 — Backend

Implement backend changes in this order:
1. Database schema changes (if any) — use idempotent `try/catch ALTER TABLE` pattern
2. Service logic in `packages/backend/src/services/`
3. API routes in `packages/backend/src/api/routes/`
4. Wire up routes in `packages/backend/src/index.ts` if new

All code must be TypeScript with proper types. No `any` unless absolutely unavoidable.

### Step 4 — Frontend

Implement frontend changes:
1. Pinia store (if needed) in `packages/frontend/src/store/`
2. Vue components/views using Composition API (`<script setup>`)
3. Wire up routes in the router if new views are added

Use Vuetify 3 components. Use BigNumber.js for any financial math.

### Step 5 — Build verification

Run the Docker build to verify everything compiles:

```
docker compose build
```

If the build fails, fix the errors and re-run until it passes. Do not proceed to commit with a broken build.

### Step 6 — Commit

Create a single commit covering all changes with a descriptive message explaining the feature. Use the standard HEREDOC format:

```
git commit -m "$(cat <<'EOF'
Short summary of the feature

Longer description of what was added/changed and why.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

## Rules

- **Never install npm packages on the host** — all dependency changes go through Docker
- **No PII** in committed code — the PII hook will block it, but avoid it proactively
- **Commit incrementally** if implementing multiple independent pieces — don't accumulate unrelated changes
- **Conservative defaults** for any RPC, blockchain, or Docker networking parameters
