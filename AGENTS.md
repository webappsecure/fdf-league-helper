# AGENTS.md

Instructions for AI coding agents working in this project.

AI tools must not add AI attribution to commits or pull requests, including AI
`Co-Authored-By` trailers or generated-by signatures. Preserve genuine human
attribution.

## What this is

`fdf-league-helper` - a Next.js web app.

> TODO: replace with the project's purpose once it is defined.

## Proportional engineering

Build for established requirements, not hypothetical scale, threats, or future
flexibility. Reuse existing code, the standard library, native platform features,
and installed dependencies before adding machinery.

- Unknown scale or extensibility defaults to the smaller reversible design. Do
  not infer enterprise, multi-tenant, hostile-user, or compliance requirements.
- Derive trust and data-integrity boundaries from actual reachability: untrusted
  input, auth/session/ownership, shared persisted data, destructive operations,
  payments, secrets, and sensitive data.
- Ask only when an unknown materially changes behavior, architecture, persisted
  data, interoperability, a real security boundary, or cost. Otherwise choose the
  simplest repository-native implementation.
- Add an abstraction, dependency, service, configuration surface, compatibility
  layer, or security mechanism only for a current requirement.
- Simplicity never removes real trust-boundary validation, data-loss prevention,
  accessibility, explicit security requirements, configured tests, or project rules.
- Stack-specific template standards apply only when the project uses that stack.

## Stack and conventions

- Next.js 16 (App Router, Turbopack), React 19, TypeScript in strict mode
- Tailwind CSS v4 with CSS-first config in `app/globals.css`
- No `src/` directory; routes live in `app/` and the `@/*` alias maps to the
  project root
- Server components by default; add `'use client'` only when needed
- No database, auth provider, or component library is installed yet

## Commands

Package manager: npm (`package-lock.json`).

- Dev server: `npm run dev` (http://localhost:3000)
- Build: `npm run build`
- Production server: `npm run start`
- Lint: `npm run lint`
- Test: `npm test` (Vitest, runs once)
- Test watch: `npm run test:watch`
- Browser tests: `npm run test:browser` (Playwright, Chromium; starts or reuses the dev server on port 3000)

Unit tests live next to the code they cover as `*.test.ts`. Browser tests live in
`e2e/` as `*.spec.ts`. No typecheck, format, or `Verify` command is configured,
and there are no GitHub workflows.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
