# TASK

## Project

wacrm is a fork of the open-source `ArnasDon/wacrm` WhatsApp CRM template. It is a self-hostable Next.js 16 + Supabase CRM with shared inbox, contacts, pipelines, broadcasts, automations, flows, AI replies, account sharing, public API, and MCP support.

## Current Objective

Implement the first localization batch only:

- create `messages/pt-BR.json` with the same key structure as `messages/en.json`;
- translate existing dictionary values into Brazilian Portuguese;
- configure local default locale through `NEXT_PUBLIC_APP_LOCALE=pt-BR`;
- document the locale variable in the environment example;
- do not modify React components, routes, APIs, business rules, database schema, Supabase migrations, RLS, roles, service-role code, persisted data, commits, or pushes.

## Repository State

- Repository: `/home/samuca/Documentos/projetos_ai/projetos/apps/wacrm`
- Branch: `chore/setup-supabase`
- Upstream lineage: `ArnasDon/wacrm`
- Working tree at start: clean
- Latest observed commit: `5f5ce5e configure Supabase local setup`

## Relevant Technical Context

- Next.js 16 App Router; local `AGENTS.md` requires reading `node_modules/next/dist/docs/` before Next code changes.
- React 19, TypeScript 6, Tailwind v4, shadcn-style UI primitives, lucide icons.
- Supabase Auth, Postgres, Storage, Realtime, RLS, service-role admin clients for trusted backend paths.
- Existing i18n uses `next-intl` via `src/i18n/request.ts`, `NextIntlClientProvider`, `messages/en.json`, and `messages/ko.json`.
- Locale is currently selected by `NEXT_PUBLIC_APP_LOCALE`, not by URL routing.

## Completed Work

- Created `messages/pt-BR.json` from the `messages/en.json` structure.
- Translated all existing dictionary values into Brazilian Portuguese while preserving technical terms such as `WhatsApp`, `Meta`, `API`, `URL`, `Email`, `Dashboard`, `Inbox`, `Pipelines`, `Template`, `Tags`, `Admin`, and machine-like examples/placeholders where appropriate.
- Compared `messages/en.json` and `messages/ko.json` before creation:
  - `en.json`: 1428 leaf keys.
  - `ko.json`: 1426 leaf keys.
  - `ko.json` is missing `Contacts.detailView.tabs.tags` and `Settings.sections.quick-replies`.
  - No extra KO keys and no type mismatches.
- Configured `.env.local` with `NEXT_PUBLIC_APP_LOCALE=pt-BR`.
- Documented `NEXT_PUBLIC_APP_LOCALE` in `.env.local.example` and set the example default to `pt-BR`.
- Preserved `messages/en.json` and `messages/ko.json`.

## Confirmed Decisions

- Do not modify React components or application logic in this batch.
- Prefer centralized i18n translation structure over manual string replacement.
- Preserve upstream core where possible; use additive files and thin wrapper/customization layers.

## Constraints

- Do not deploy, push, commit, or run production migrations.
- Do not expose `.env` values or secrets.
- Preserve fork updateability.
- Keep code/config files in English unless explicitly requested otherwise.

## Validation

- `messages/pt-BR.json` validation:
  - 1428 leaf keys.
  - No missing keys versus `messages/en.json`.
  - No extra keys versus `messages/en.json`.
  - No type mismatches.
- Placeholder/tag validation completed. Remaining differences are expected translated ICU plural text, not missing interpolation variables.
- `npm run lint`: passed with exit 0; existing warnings remain.
- `npm run typecheck`: passed with exit 0.
- `npm run test`: failed with 2 existing failures in `src/lib/dashboard/date-utils.test.ts` (`mondayIndex` Monday/Sunday mapping and label alignment); 646 tests passed.
- `npm run build`: passed with exit 0.

## Next Exact Action

Stop after this first localization batch. If approved later, begin Phase 2 from `docs/customization-plan.md`: migrate high-visibility hardcoded auth, shell, navigation, invitation, and settings-section strings into the centralized dictionaries.
