# TASK

## Project

WACRM is a fork of the open-source `ArnasDon/wacrm` WhatsApp CRM template. It is a self-hostable Next.js 16 + Supabase CRM with shared inbox, contacts, pipelines, broadcasts, automations, flows, AI replies, account sharing, public API, and MCP support.

## Current Objective

Apply the Conversa / Conversa CRM brand while preserving technical compatibility and the ongoing Companies workspace work.

The next increment should:

1. run visual QA in a real authenticated session for dashboard sidebar/header and Companies routes;
2. verify light-mode brand assets through the real UI mode toggle;
3. document and reduce remaining legacy `contacts.company` compatibility consumers.

Do not deploy, push, commit, or run production migrations unless explicitly requested.

## Repository State

- Repository: `/home/samuca/Documentos/projetos_ai/projetos/apps/wacrm`
- Branch: `chore/setup-supabase`
- Upstream lineage: `ArnasDon/wacrm`
- Latest company/follow-up work committed as a local checkpoint.
- Existing full-suite failures remain limited to two pre-existing tests in `src/lib/dashboard/date-utils.test.ts`.

## Relevant Technical Context

- Next.js 16 App Router.
- React 19.
- TypeScript 6.
- Tailwind CSS v4.
- shadcn-style UI primitives.
- Lucide icons.
- Supabase Auth, Postgres, Storage, Realtime, RLS, and service-role clients for trusted backend paths.
- Existing i18n uses `next-intl` through `src/i18n/request.ts`, `NextIntlClientProvider`, and locale dictionaries.
- Locale is selected by `NEXT_PUBLIC_APP_LOCALE`, not URL routing.
- Local `AGENTS.md` requires reading `node_modules/next/dist/docs/` before Next.js code changes.

## Completed Work

### 1. Brazilian Portuguese localization

- Created `messages/pt-BR.json` using the structure of `messages/en.json`.
- Preserved technical terms such as `WhatsApp`, `Meta`, `API`, `URL`, `Email`, `Dashboard`, `Inbox`, `Pipelines`, `Template`, `Tags`, and `Admin`.
- Configured `.env.local` with:

```env
NEXT_PUBLIC_APP_LOCALE=pt-BR
```

- Documented `NEXT_PUBLIC_APP_LOCALE` in `.env.local.example`.
- Preserved `messages/en.json` and `messages/ko.json`.

### 2. Commercial follow-up foundation

Implemented the first operational follow-up batch for Pipelines.

#### Database

Added:

```text
supabase/migrations/20260731032242_commercial_follow_ups.sql
```

The migration introduced:

- `deals.closed_reason`;
- `deals.closed_at`;
- `follow_ups`;
- `follow_up_events`;
- account-scoped RLS;
- context links to contacts, deals, and conversations;
- activity type;
- channel;
- priority;
- due date;
- owner;
- lifecycle status;
- result;
- completion metadata;
- reschedule relationships;
- indexes;
- one-active-primary constraints;
- update triggers;
- event history.

#### Application

Added or updated:

- shared follow-up types in `src/types/index.ts`;
- follow-up rules and centralized configuration in `src/lib/follow-ups.ts`;
- focused tests in `src/lib/follow-ups.test.ts`;
- `src/components/pipelines/follow-up-workspace.tsx`;
- pipeline agenda buckets;
- overdue, today, and upcoming views;
- no-next-action view;
- reactivation candidates;
- create, complete, reschedule, and cancel actions;
- follow-up event history;
- next-action and no-next-action indicators on deal cards;
- i18n keys in English, Brazilian Portuguese, and Korean.

#### Confirmed behavior

- Pipeline cards continue to represent deals/opportunities, not companies.
- Follow-up buckets `overdue`, `today`, and `upcoming` are derived from `due_at`.
- Persisted follow-up statuses remain lifecycle states:
  - `pending`;
  - `completed`;
  - `cancelled`;
  - `rescheduled`.
- No automatic customer messages were added.
- No fake purchase or order data was created.
- Purchase-based indicators remain unavailable until a real source is integrated.

### 3. Companies as a central commercial entity

Implemented the first relational Companies batch.

#### Database

Added:

```text
supabase/migrations/20260731033925_companies.sql
```

Created `companies` with:

- `account_id`;
- legal name;
- trade name;
- normalized name;
- tax ID;
- commercial status;
- segment;
- website;
- primary phone;
- primary email;
- address fields;
- owner/responsible references;
- notes;
- archive timestamp;
- creation/update timestamps;
- indexes;
- update trigger;
- RLS;
- no client-side hard-delete policy.

Added:

- `company_id` to `contacts`;
- `company_id` to `deals`;
- `company_id` to `follow_ups`;
- `job_title` to contacts;
- `commercial_role` to contacts;
- `is_primary_company_contact` to contacts.

Added database protections for:

- cross-account company assignments;
- one primary contact per company;
- automatic cleanup of primary-contact state when `company_id` is removed;
- synchronization of `contacts.company` from the linked company;
- synchronization after company rename;
- company-scoped follow-ups;
- account-aware relationships.

#### Backfill

The migration:

- creates companies from distinct non-empty legacy `contacts.company` values;
- normalizes case, accents, punctuation, and spacing;
- deduplicates safe variants within the same account;
- does not merge similar but distinct names;
- keeps homonymous companies separate across accounts;
- links contacts when matching is unambiguous;
- backfills `deals.company_id` and `follow_ups.company_id` from their contacts.

#### Application

Added:

- `src/lib/companies.ts`;
- `src/lib/companies.test.ts`;
- shared `Company` types;
- shared commercial status types;
- shared contact commercial-role types;
- company selection/creation in contact create/edit/detail flows;
- company support in CSV contact import;
- company context in pipeline and follow-up loading;
- company context in deal creation;
- additive API v1 support for:
  - `company_id`;
  - `company_record`;
- preservation of the legacy `company` string contract;
- new i18n keys in English, Brazilian Portuguese, and Korean.

## Stabilization Results

### Root cause of local Supabase failures

The original `LegacyDbConnectError` was caused by inconsistent local Supabase state.

The CLI expected:

```text
supabase_db_wacrm
```

but the database container was missing or unavailable.

A second issue appeared during recovery:

- Fedora SELinux was in `Enforcing`;
- the local Supabase secret path had the wrong context;
- Postgres could not read `pgsodium_root.key`;
- the container looped with:

```text
FATAL: invalid secret key
```

### Local environment recovery

Recovery used Podman, not remote Supabase.

Actions performed:

- corrected the SELinux label of the local Supabase secret to `container_file_t`;
- removed the broken local database container and volume;
- enabled `podman.socket`;
- used Docker-compatible Podman access with:

```bash
DOCKER_HOST=unix:///run/user/1000/podman/podman.sock
```

Database-only validation works with:

```bash
npx supabase start   --exclude gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
```

Full `supabase start` remains limited in this environment because some non-database services still attempt to use:

```text
/var/run/docker.sock
```

This does not block local database migration validation.

### Empty database validation

Validated successfully:

- all migrations applied from zero;
- migration order is correct;
- `20260731032242_commercial_follow_ups.sql` applies before `20260731033925_companies.sql`;
- company schema objects were created successfully;
- no old migration files were modified.

### Legacy upgrade validation

Validated successfully:

1. reset the local database to `20260731032242`;
2. inserted representative legacy fixtures;
3. applied only `20260731033925_companies.sql`;
4. verified upgrade behavior.

Fixtures included:

- contacts without companies;
- blank company values;
- case variants;
- accent variants;
- punctuation variants;
- spacing variants;
- similar but distinct company names;
- homonymous companies across accounts;
- an existing deal;
- an existing follow-up.

Confirmed:

- safe variants deduplicate in the same account;
- similar but distinct companies are not merged;
- homonymous companies remain separate across accounts;
- linked deals inherit `company_id`;
- linked follow-ups inherit `company_id`;
- legacy contacts remain preserved.

### SQL fixes found through real execution

The company migration was corrected after actual local execution.

Fixes included:

- replaced invalid `min(user_id)` over UUID with deterministic:

```sql
(array_agg(user_id ORDER BY created_at, id))[1]
```

- replaced ambiguous `ON CONFLICT DO NOTHING` against a partial unique index with `WHERE NOT EXISTS`;
- corrected normalization so punctuation-generated trailing spaces are removed;
- corrected backfill linking to count distinct candidate companies rather than contact rows;
- added explicit grants;
- added account-aware relational constraints;
- added triggers for legacy projection and rename synchronization;
- added database invariants for primary contacts.

### Account isolation

Validated that cross-account links are rejected for:

- contacts;
- deals;
- follow-ups.

Confirmed zero cross-account links after backfill.

### RLS and grants

Validated locally:

- authenticated members cannot read another account's companies;
- same-account authorized users can insert and update companies;
- cross-account inserts are blocked;
- client-side delete is blocked;
- company removal remains archive-oriented;
- `anon` and `PUBLIC` do not have grants on `companies`;
- `authenticated` has `SELECT`, `INSERT`, and `UPDATE`;
- `service_role` has operational access.

Supabase advisors returned no warnings related to `companies`.

### Primary company contact

Validated:

- a contact without `company_id` cannot remain primary;
- only one primary contact can exist per company;
- removing `company_id` clears the primary flag;
- removing `company_id` clears legacy `contacts.company`;
- renaming a company updates legacy `contacts.company` for linked contacts.

### Source of truth

Confirmed:

```text
company_id = source of truth
contacts.company = temporary compatibility projection
```

New internal flows must use `company_id`.

The legacy string remains temporarily for:

- API compatibility;
- broadcasts;
- flows;
- automations;
- Inbox compatibility;
- existing contact-field consumers.

These surfaces must not independently overwrite company identity when a relational company exists.

## Confirmed Architecture Decisions

- `companies` is a central commercial entity.
- Companies do not replace contacts.
- Companies do not replace opportunities.
- Pipeline cards remain deals.
- A company may have zero, one, or many deals.
- A contact may have zero or one primary company.
- No many-to-many contact-company model exists yet.
- Conversations remain contact-centered.
- Company pages may aggregate related conversations later without changing message ownership.
- `company_id` is the relational source of truth.
- `contacts.company` is temporary compatibility data.
- Commercial status belongs to `companies.commercial_status`.
- Customer status must not be inferred merely from contact existence.
- No purchase metrics should appear until a real order/purchase source exists.
- Companies use logical archiving through `archived_at`.
- No client-side hard-delete flow should be introduced.
- Existing upstream architecture should remain updateable through additive changes and thin integration layers.

## Current Known Limitations

### 1. Tag-filtered contact queries

The normal contact query includes `company_record`, but the tag-filtered RPC/list path may still return only the legacy company string.

Required correction:

- return `company_id`;
- return legacy `company`;
- return relational `company_record`;
- preserve account isolation;
- preserve pagination and filtering behavior.

### 2. CSV import automated coverage

CSV import currently normalizes and reuses companies within the current account.

Still missing:

- dedicated automated reimport test;
- explicit idempotency test;
- ambiguous company-case test;
- partial failure test;
- archived-company behavior test.

### 3. Legacy compatibility surfaces

The following still depend on `contacts.company`:

- Inbox filters;
- contact sidebar;
- broadcast personalization;
- flows;
- automation contact fields;
- some embedded contact payloads.

This is currently accepted as compatibility behavior.

These surfaces may remain temporarily provided:

- relational `company_id` remains authoritative;
- the legacy value is projected from the linked company;
- new code does not write conflicting text independently;
- future migration work is documented.

### 4. Full Supabase local stack

Database-only validation works.

Full local Supabase startup still has a Podman/Docker socket incompatibility for some non-database services.

This is an environment limitation, not a database migration failure.

### 5. Existing test failures

The full test suite still has two pre-existing failures in:

```text
src/lib/dashboard/date-utils.test.ts
```

They concern Monday-index and Sunday-label mapping.

These failures predate the company/follow-up work and are not treated as regressions from this batch.

## Latest Validation Snapshot

### 2026-08-02 state analysis

Revalidated the current repository state without code changes.

```text
npm run typecheck
Result: passed
```

```text
npm run lint
Result: passed, 37 warnings, 0 errors
```

```text
npm run build
Result: passed
```

```text
npm run test -- src/lib/companies.test.ts src/lib/api/v1/contacts.test.ts src/lib/follow-ups.test.ts
Result: passed, 15 tests
```

```text
npm run test
Result: 658 passed, 2 pre-existing failures in src/lib/dashboard/date-utils.test.ts
```

### 2026-08-02 tag-filtered contact consistency

Completed Priority 1 for contact query consistency.

Added:

- `supabase/migrations/20260802000100_filter_contacts_by_tags_company_record.sql`;
- `src/lib/contacts/tag-filtered-rpc.ts`;
- `src/lib/contacts/tag-filtered-rpc.test.ts`.

Updated:

- `src/app/(dashboard)/contacts/page.tsx`.

The tag-filtered contacts RPC now returns a JSONB contact payload with:

- `company_id`;
- legacy `company`;
- relational `company_record`.

The normal contact list path and tag-filtered list path now share the same company display contract in the frontend.

Validation:

```text
npm run test -- src/lib/contacts/tag-filtered-rpc.test.ts src/lib/companies.test.ts src/lib/api/v1/contacts.test.ts src/lib/follow-ups.test.ts
Result: passed, 17 tests
```

```text
npm run typecheck
Result: passed
```

```text
npm run lint
Result: passed, 37 warnings, 0 errors
```

```text
npm run build
Result: passed
```

```text
npm run test
Result: 660 passed, 2 pre-existing failures in src/lib/dashboard/date-utils.test.ts
```

Local Supabase migration validation was attempted with database-only startup, but the local container remained blocked by:

```text
FATAL: invalid secret key
/etc/postgresql-custom/pgsodium_root.key: Read-only file system
```

No local reset, volume removal, production migration, commit, push, or deployment was performed.

### 2026-08-02 CSV import Companies coverage

Completed the CSV contact import coverage phase for Companies without migrations, UI screens, deployment, commit, or push.

Audited before changing:

- `src/components/contacts/import-modal.tsx`;
- `src/lib/contacts/parse-contact-csv.ts`;
- `src/lib/contacts/dedupe.ts`;
- `src/lib/contacts/resolve-import-tags.ts`;
- `src/lib/companies.ts`;
- existing nearby tests for CSV parsing, dedupe, tags, and company normalization.

Changed files:

- `src/lib/contacts/import-contacts-with-companies.ts`;
- `src/lib/contacts/import-contacts-with-companies.test.ts`;
- `src/components/contacts/import-modal.tsx`;
- `TASK.md`.

Implementation:

- extracted the operational contact/company import flow from the React modal into `importContactsWithCompanies`;
- kept existing contact dedupe semantics through `dedupeByPhone`, `normalizeKey`, and DB unique-violation fallback;
- preserved the modal's tag flow, using returned inserted contact/source pairs for tag assignment;
- kept `company_id` as the authoritative relational link;
- preserved legacy `contacts.company` projection data in inserted rows.

Covered cases:

- new company creation;
- active company reuse;
- normalization across case, accents, punctuation, and repeated spaces;
- reimport of the same file without duplicate contacts or companies;
- duplicate rows in the same file;
- same company name in different accounts;
- contact without company;
- archived company not reused;
- ambiguous active company match keeps legacy `company` text but avoids `company_id`;
- partial batch failure retries valid rows individually;
- `company_id` remains the source of truth for linked imports;
- `contacts.company` remains compatible legacy text.

Limitations:

- tests use an in-memory Supabase-like fake focused on the import queries and side effects, not a live Postgres/Supabase instance;
- local Supabase DB validation was not repeated for this phase because no migrations were changed and prior local DB startup is blocked by the documented `pgsodium_root.key` issue;
- tag auto-creation and tag assignment remain covered by their existing helper flow and were not expanded in this Companies-specific pass;
- ambiguous company matching is covered as a defensive inconsistent-query scenario; normal database constraints should prevent duplicate active `normalized_name` rows per account.

Validation:

```text
npm run test -- src/lib/contacts/import-contacts-with-companies.test.ts src/lib/contacts/parse-contact-csv.test.ts src/lib/contacts/dedupe.test.ts src/lib/companies.test.ts
Result: passed, 29 tests
```

```text
npm run typecheck
Result: passed
```

```text
npm run lint
Result: passed, 37 warnings, 0 errors
```

```text
npm run build
Result: passed
```

```text
npm run test
Result: 668 passed, 2 pre-existing failures in src/lib/dashboard/date-utils.test.ts
```

Pre-existing full-suite failures remain:

- `src/lib/dashboard/date-utils.test.ts` — `mondayIndex` maps Monday to `6` instead of expected `0`;
- `src/lib/dashboard/date-utils.test.ts` — `DOW_SHORT_MON_FIRST[mondayIndex(...)]` resolves to `Sun` instead of expected `Mon`.

### 2026-08-02 Companies workspace MVP

Implemented the first operational Companies workspace without migrations, deployment, commit, or push.

Architecture used:

- client-side App Router pages inside `(dashboard)`, matching the existing Contacts and Pipelines surfaces;
- account-scoped Supabase queries with explicit `.eq("account_id", accountId)` filters;
- database RLS remains the backend authority;
- list aggregation is done from account-scoped company, contact, deal, follow-up, and profile queries;
- shared testable logic lives in `src/lib/companies-workspace.ts`;
- existing `ContactForm` is reused for creating contacts from a company by passing a default relational company.

Routes created:

- `/companies`;
- `/companies/new`;
- `/companies/[id]`;
- `/companies/[id]/edit`.

Components and files added:

- `src/app/(dashboard)/companies/page.tsx`;
- `src/app/(dashboard)/companies/new/page.tsx`;
- `src/app/(dashboard)/companies/[id]/page.tsx`;
- `src/app/(dashboard)/companies/[id]/edit/page.tsx`;
- `src/components/companies/company-form.tsx`;
- `src/lib/companies-workspace.ts`;
- `src/lib/companies-workspace.test.ts`.

Files updated:

- `src/components/layout/sidebar.tsx`;
- `src/components/layout/header.tsx`;
- `src/components/contacts/contact-form.tsx`;
- `messages/en.json`;
- `messages/pt-BR.json`;
- `messages/ko.json`;
- `TASK.md`.

Implemented capabilities:

- Companies menu item near Contacts;
- company list with search, status, owner, segment, primary-contact, next-follow-up, overdue, active/archived filters;
- company creation and editing;
- archive and restore;
- company detail overview;
- linked contacts and primary contact;
- link existing contact;
- unlink contact;
- create contact already linked to the company;
- open and closed deal display;
- create deal with `company_id`;
- company follow-up display;
- create company/contact/deal-scoped follow-up;
- complete, reschedule, and cancel follow-ups;
- lightweight activities based on real follow-up data only.

Security and data rules:

- all company workspace data loads are scoped by `account_id`;
- direct company ID access checks both `id` and `account_id`;
- contact linking verifies the selected contact belongs to the current account;
- deal creation verifies the optional selected contact belongs to the current account;
- follow-up creation verifies selected contact/deal account ownership before insert;
- `company_id` is the source of truth;
- `contacts.company` is only populated from the linked company display name for legacy compatibility;
- no purchase/order data, customer scoring, automatic reactivation classification, automatic messaging, many-to-many contact-company relations, or full omnichannel timeline were added.

Legacy compatibility points:

- `contacts.company` remains present for existing API, broadcast, flow, automation, and Inbox consumers;
- new Companies UI reads from relational `companies` and linked `company_id`;
- when linking contacts from Companies, the legacy `company` string is projected from `buildCompanyDisplayName(company)`.

Validation:

```text
npm run test -- src/lib/companies-workspace.test.ts src/lib/companies.test.ts
Result: passed, 8 tests
```

```text
npm run typecheck
Result: passed
```

```text
npm run lint
Result: passed, 37 warnings, 0 errors
```

```text
npm run build
Result: passed; routes include /companies, /companies/new, /companies/[id], /companies/[id]/edit
```

```text
npm run test
Result: 672 passed, 2 pre-existing failures in src/lib/dashboard/date-utils.test.ts
```

Limitations:

- Companies page body copy is currently mostly inline English; only navigation labels were added to locale files;
- operational UI is dense and functional but still needs browser-based visual QA;
- local live Supabase validation was not run in this phase because prior DB startup was blocked by the documented local `pgsodium_root.key` issue;
- activity aggregation is intentionally limited to existing follow-up data;
- follow-up event history is preserved at the data model level, but the Company detail MVP does not yet render the full event log per follow-up.

### 2026-08-02 Companies pt-BR labels pass

Corrected visible labels and operational messages in the new Companies CRUD/workspace to Brazilian Portuguese.

Changed:

- list page labels, filters, empty states, table headings, and fallback text;
- company form headings, field labels, buttons, status labels, and toast messages;
- company detail headings, metrics, actions, dialogs, prompts, fallbacks, and toast messages;
- shared Companies workspace validation/error messages;
- focused test expectation for the localized cross-account company error.

Validation:

```text
npm run test -- src/lib/companies-workspace.test.ts src/lib/companies.test.ts
Result: passed, 8 tests
```

```text
npm run typecheck
Result: passed
```

```text
npm run lint
Result: passed, 37 warnings, 0 errors
```

```text
npm run build
Result: passed
```

Follow-up:

- this inline-copy limitation was resolved by the Companies i18n dictionary pass below.

### 2026-08-02 Companies i18n dictionary pass

Moved the new Companies workspace copy out of page/component inline strings and into locale dictionaries.

Changed files:

- `messages/en.json`;
- `messages/pt-BR.json`;
- `messages/ko.json`;
- `src/app/(dashboard)/companies/page.tsx`;
- `src/app/(dashboard)/companies/[id]/page.tsx`;
- `src/components/companies/company-form.tsx`;
- `TASK.md`.

Implemented:

- added a `Companies` namespace in all locale dictionaries;
- localized list page titles, filters, table headings, empty states, fallbacks, and status labels;
- localized company form titles, sections, fields, buttons, status labels, and toasts;
- localized company detail metrics, overview labels, contact/deal/follow-up panels, dialogs, prompts, options, fallbacks, and toasts;
- kept technical terms such as `Email`, `Website`, `WhatsApp`, `Pipeline`, and `Follow-up` where they match existing product language.

Limitations:

- validation/errors returned by shared business helpers remain plain strings for now;
- no browser visual QA was run in this pass;
- no live Supabase data validation was run in this pass.

Validation:

```text
npm run test -- src/lib/companies-workspace.test.ts src/lib/companies.test.ts
Result: passed, 8 tests
```

```text
npm run typecheck
Result: passed
```

```text
npm run lint
Result: passed, 37 warnings, 0 errors
```

```text
npm run build
Result: passed
```

```text
npm run test
Result: 672 passed, 2 pre-existing failures in src/lib/dashboard/date-utils.test.ts
```

Pre-existing full-suite failures remain separate:

- `src/lib/dashboard/date-utils.test.ts` — `mondayIndex` maps Monday to `6` instead of expected `0`;
- `src/lib/dashboard/date-utils.test.ts` — `DOW_SHORT_MON_FIRST[mondayIndex(...)]` resolves to `Sun` instead of expected `Mon`.

Recommended next step:

- run the app locally with `NEXT_PUBLIC_APP_LOCALE=pt-BR`, perform browser QA on `/companies`, `/companies/new`, `/companies/[id]`, and `/companies/[id]/edit`, then fix any layout or copy regressions found with real data.

### 2026-08-02 Companies local QA attempt and responsive list fix

Continued with the recommended Companies QA step.

Changed files:

- `src/app/(dashboard)/companies/page.tsx`;
- `TASK.md`.

What was checked:

- confirmed `.env.local` has `NEXT_PUBLIC_APP_LOCALE=pt-BR`;
- started the local app with `npm run dev` on `http://localhost:3001`;
- confirmed `/companies` returns `200 OK` and renders with `<html lang="pt-BR">`;
- generated headless Chrome screenshots at desktop and mobile sizes.

Limitation:

- the headless screenshots only reached the app's authenticated client loading state because no browser session/local Supabase-authenticated user was available in this environment;
- therefore, full visual QA with real company data remains pending.

Fix applied:

- updated the Companies list table wrapper to use horizontal overflow on small screens;
- added a stable minimum table width so the seven-column operational table keeps readable columns instead of compressing or overlapping on mobile.

Validation:

```text
npm run test -- src/lib/companies-workspace.test.ts src/lib/companies.test.ts
Result: passed, 8 tests
```

```text
npm run typecheck
Result: passed
```

```text
npm run lint
Result: passed, 37 warnings, 0 errors
```

```text
npm run build
Result: passed
```

Recommended next step:

- open the running app in a real authenticated browser session, validate `/companies`, `/companies/new`, `/companies/[id]`, and `/companies/[id]/edit` with representative account data, then address any actual visual/data-state findings.

### 2026-08-02 Conversa branding pass

Renamed visible product branding from WACRM/wacrm-facing copy to Conversa / Conversa CRM without changing package names, database objects, migrations, env vars, API key prefixes, MCP identifiers, storage keys, or upstream documentation.

Asset source audit:

- checked `/home/samuca/Imagens/brand`: found all expected PNG files;
- checked `/home/Samuca/Imagens/brand`: no files found;
- `orientacao.png` was inspected as reference only and was not copied into the app.

Assets added:

- `public/brand/conversa-symbol-dark.png` from `logo_dark.png`;
- `public/brand/conversa-symbol-light.png` from `logo_ligth.png`;
- `public/brand/conversa-logo-dark.png` from `logomarca_dark.png`;
- `public/brand/conversa-logo-light.png` from `logomarca.png`;
- `public/brand/conversa-wordmark-dark.png` from `name_dark.png`;
- `public/brand/conversa-wordmark-light.png` from `name_ligth.png`;
- `src/app/icon.png` generated from the light symbol asset at 512x512;
- `src/app/apple-icon.png` generated from the light symbol asset at 180x180.

Changed files:

- `src/components/brand/brand-logo.tsx`;
- `src/app/globals.css`;
- `src/app/layout.tsx`;
- `src/app/icon.tsx` removed in favor of static app icons;
- `src/app/(auth)/login/page.tsx`;
- `src/app/(auth)/signup/page.tsx`;
- `src/app/(auth)/forgot-password/page.tsx`;
- `src/app/(dashboard)/dashboard-shell.tsx`;
- `src/components/layout/sidebar.tsx`;
- `src/components/layout/header.tsx`;
- `src/app/join/[token]/page.tsx`;
- `src/components/settings/invite-member-dialog.tsx`;
- `src/app/api/whatsapp/config/route.ts`;
- `messages/en.json`;
- `messages/pt-BR.json`;
- `messages/ko.json`;
- `TASK.md`.

Applied brand surfaces:

- login card uses the full Conversa CRM logomarca;
- signup card uses the full Conversa CRM logomarca;
- forgot-password card uses the full Conversa CRM logomarca;
- public invitation page uses the full Conversa CRM logomarca;
- dashboard loading/splash uses the Conversa symbol;
- sidebar open state uses the full Conversa CRM logomarca;
- mobile header/menu affordance uses the Conversa symbol;
- Next metadata title/template/description/Open Graph use Conversa CRM;
- browser icons use the isolated Conversa symbol;
- visible invitation, WhatsApp registration, template deletion, AI settings, and account fallback copy now refer to Conversa.

Theme behavior:

- `BrandLogo` renders separate light/dark assets and switches via the existing `html[data-mode]` theme state;
- no new theme system was introduced;
- assets are rendered with `object-contain` and without filters, recoloring, crop, shadow, border, or background added by the app.

References intentionally preserved as technical:

- `package.json` package name, repository URLs, and upstream package metadata;
- `wacrm_live_` API key prefix and related tests/comments;
- `WACRM_*` MCP/server env vars and identifiers;
- `wacrm.theme`, `wacrm.mode`, `wacrm.flowEditor.view`, and other localStorage keys;
- migration comments and database-related identifiers;
- fallback `https://wacrm.tech` behavior in invitation URL construction;
- README, CHANGELOG, docs, and MCP documentation references to the upstream project.

Validation:

```text
npm run typecheck
Result: passed
```

```text
npm run lint
Result: passed, 37 warnings, 0 errors
```

```text
npm run build
Result: passed; /icon.png and /apple-icon.png generated as App Router routes
```

```text
npm run test
Result: 672 passed, 2 pre-existing failures in src/lib/dashboard/date-utils.test.ts
```

```text
Final visible-brand search in src/messages/public/package.json
Result: remaining wacrm/WACRM references are technical/package/upstream/internal references only
```

Manual visual QA:

- started `npm run dev` locally;
- captured login desktop, login mobile, and signup desktop in dark mode with Chrome headless;
- confirmed the Conversa mark is visible, centered, proportionate, and not distorted;
- mode-light screenshot could not be forced reliably in headless localStorage setup, so light-mode brand QA remains pending in a real browser session.

Pre-existing test failures remain separate:

- `src/lib/dashboard/date-utils.test.ts` — `mondayIndex` maps Monday to `6` instead of expected `0`;
- `src/lib/dashboard/date-utils.test.ts` — `DOW_SHORT_MON_FIRST[mondayIndex(...)]` resolves to `Sun` instead of expected `Mon`.

Recommended next step:

- open the app in a real browser session, toggle light/dark mode, validate sidebar/header/auth/invite/Companies screens visually, then decide whether any source brand PNGs need transparent-background exports from design.

### 2026-08-02 Conversa remodeled brand assets pass

Reapplied the Conversa brand after the source images were remodeled.

Asset source audit:

- checked `/home/samuca/Imagens/brand`: found updated PNG files with new timestamps and smaller UI-oriented dimensions;
- checked `/home/Samuca/Imagens/brand`: no files found;
- `orientacao.png` remained reference-only and was not copied into the app.

Updated source dimensions:

- `logo_dark.png`: 917x921;
- `logo_ligth.png`: 908x904;
- `logomarca.png`: 1186x359;
- `logomarca_dark.png`: 1225x356;
- `name_dark.png`: 819x300;
- `name_ligth.png`: 836x285.

Changed files:

- `public/brand/conversa-symbol-dark.png`;
- `public/brand/conversa-symbol-light.png`;
- `public/brand/conversa-logo-dark.png`;
- `public/brand/conversa-logo-light.png`;
- `public/brand/conversa-wordmark-dark.png`;
- `public/brand/conversa-wordmark-light.png`;
- `src/app/icon.png`;
- `src/app/apple-icon.png`;
- `src/components/brand/brand-logo.tsx`;
- auth/join/sidebar files using `BrandLogo` sizing;
- `TASK.md`.

Implementation notes:

- replaced all copied production brand assets with the remodeled versions;
- regenerated exact 512x512 and 180x180 App Router icon files from the light symbol asset;
- updated intrinsic dimensions in `BrandLogo`;
- adjusted displayed logo sizing now that the source files have less excess canvas;
- preserved all prior brand text/metadata changes and technical `wacrm` compatibility references.

Validation:

```text
npm run typecheck
Result: passed
```

```text
npm run lint
Result: passed, 37 warnings, 0 errors
```

```text
npm run build
Result: passed
```

Manual visual QA:

- started local Next dev server on port 3001;
- captured `/login` in Chrome headless mobile and desktop;
- confirmed the remodeled logomarca renders without distortion and fits the auth card;
- removed temporary screenshot files afterward.

Recommended next step:

- validate the remodeled assets in a real authenticated browser session, especially sidebar open/mobile header and light/dark mode switching.

### 2026-08-02 Base UI Button link semantics fix

Fixed the Base UI runtime error on the Companies page:

```text
A component that acts as a button expected a native <button> because the nativeButton prop is true.
```

Cause:

- `Button` from `src/components/ui/button.tsx` wraps Base UI's button primitive;
- Companies screens used `Button render={<Link ... />}` to render anchors with button styling;
- Base UI expected a native `<button>` unless `nativeButton={false}` is set.

Changed files:

- `src/app/(dashboard)/companies/page.tsx`;
- `src/app/(dashboard)/companies/[id]/page.tsx`;
- `src/components/companies/company-form.tsx`;
- `TASK.md`.

Solution:

- added `nativeButton={false}` only to `Button` instances that render Next `Link`;
- did not change the global `Button` default;
- preserved current visual styling and navigation behavior.

Equivalent scan:

- searched for `Button` rendering `Link` or anchor-like elements;
- equivalent `Button render={<Link ... />}` cases were limited to the Companies surface and were all regularized.

Validation:

```text
npm run test -- src/lib/companies-workspace.test.ts src/lib/companies.test.ts
Result: passed, 8 tests
```

```text
npm run typecheck
Result: passed
```

```text
npm run lint
Result: passed, 37 warnings, 0 errors
```

```text
npm run build
Result: passed
```

### Application

```text
Focused tests:
npm run test -- src/lib/companies.test.ts src/lib/api/v1/contacts.test.ts src/lib/follow-ups.test.ts
Result: passed, 15 tests
```

```text
npm run lint
Result: passed, 37 warnings, 0 errors
```

```text
npm run typecheck
Result: passed
```

```text
npm run build
Result: passed
```

```text
npm run test
Result: 658 passed, 2 pre-existing failures
```

### Database

```text
Empty database migration application:
Passed
```

```text
Legacy upgrade migration:
Passed
```

```text
npx supabase db lint --local
Result: passed with 1 pre-existing warning
```

The remaining warning is in:

```text
public.transfer_account_ownership
```

for an unused variable:

```text
v_target_role
```

```text
npx supabase db advisors --local
Result: no advisor findings related to companies
```

### Localization

- `messages/pt-BR.json` has no missing or extra keys compared with `messages/en.json`.
- `messages/ko.json` retains two pre-existing missing keys:
  - `Contacts.detailView.tabs.tags`;
  - `Settings.sections.quick-replies`.
- No new company or follow-up translation gaps were introduced.

## Next Exact Action

Run a focused Companies polish and verification pass.

### Priority 1 — Browser QA and UX polish

Validate `/companies`, `/companies/new`, `/companies/[id]`, and `/companies/[id]/edit` in a browser with representative data.

Check:

- responsive table behavior on mobile;
- empty states;
- form validation errors;
- archive and restore flows;
- contact linking/unlinking;
- primary contact;
- company-scoped deal creation;
- company/contact/deal-scoped follow-up creation.

### Priority 2 — Companies i18n structure

Move Companies page/form/detail copy into `messages/en.json`, `messages/pt-BR.json`, and `messages/ko.json` instead of keeping page-level copy inline.

### Priority 3 — Legacy migration map

Keep a documented list of remaining `contacts.company` consumers.

They may stay temporarily as compatibility-only surfaces, but they must not become new sources of truth.

## Constraints

- Do not expose `.env` values or secrets.
- Do not alter already-applied migrations.
- Do not remove the public API v1 `company` string.
- Do not create many-to-many contact-company relations without a proven need.
- Do not create duplicate companies for case, accent, punctuation, or spacing variants.
- Do not invent purchase/order data.
- Do not add automatic follow-up messages in the current phase.
- Preserve account-scoped access and role boundaries.
- Preserve fork updateability.
- Keep code and configuration files in English unless explicitly requested otherwise.
- Do not deploy, push, commit, or run production migrations unless explicitly requested.
