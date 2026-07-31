# Codebase Audit

## Scope And Baseline

This repository is a fork of `ArnasDon/wacrm`, a self-hostable CRM template for WhatsApp. The current branch is `chore/setup-supabase`, with a clean working tree at the start of this audit. No application source files were modified for this assessment.

The app is built as a Next.js 16 App Router product, not a library. The upstream README explicitly frames it as a fork-and-customize template, which makes local branding and workflow changes expected, but also means future upstream merges can conflict with broad edits across core files.

## 1. Application Architecture, Stack, Routing, And Data Flow

### Stack

- Next.js `16.2.6` App Router, React `19.2.4`, TypeScript `6`, Node `>=20`.
- `next-intl` for message dictionaries and client/server translation access.
- Supabase via `@supabase/ssr` and `@supabase/supabase-js`.
- Tailwind CSS v4, shadcn-style local UI primitives in `src/components/ui`, lucide icons, Recharts, React Flow (`@xyflow/react`), dnd-kit, date-fns.
- Vitest for unit tests.
- Supabase CLI/migrations included under `supabase/migrations`.

### Routing Shape

Routing is file-system based through `src/app`, matching Next.js App Router conventions.

- `src/app/page.tsx` redirects `/` to `/dashboard`.
- `src/app/(auth)` contains public auth routes: `/login`, `/signup`, `/forgot-password`.
- `src/app/(dashboard)` contains authenticated app routes: `/dashboard`, `/inbox`, `/notifications`, `/contacts`, `/pipelines`, `/broadcasts`, `/automations`, `/flows`, `/agents`, `/settings`.
- `src/app/join/[token]` handles invitation acceptance outside the standard auth layout.
- `src/app/api` contains internal dashboard API routes, public `/api/v1` routes, WhatsApp routes, AI routes, automations/flows execution routes, invitation routes, account/member routes, and quick-reply routes.

### Render And Provider Model

- `src/app/layout.tsx` is the root server layout. It loads locale/messages via `next-intl/server`, wraps the tree in `NextIntlClientProvider`, and adds `ThemeProvider` plus `ThemedToaster`.
- `src/app/(dashboard)/layout.tsx` remains a server layout for metadata/noindex.
- `src/app/(dashboard)/dashboard-shell.tsx` is the authenticated client shell. It wraps dashboard pages in `AuthProvider`, renders `Sidebar`, `Header`, and `PresenceHeartbeat`, and redirects unauthenticated users to `/login`.
- `src/middleware.ts` refreshes Supabase auth cookies, redirects signed-in users away from auth pages, protects dashboard paths, and returns JSON `Unauthorized` for selected protected WhatsApp API paths.

### Data Flow

The data model is a hybrid of direct Supabase client reads/writes and API route adapters.

- Client-heavy dashboard pages and components often call `createClient()` from `src/lib/supabase/client.ts` and rely on Supabase RLS for account scoping.
- Server routes use `src/lib/supabase/server.ts` for cookie-authenticated SSR/RLS access.
- Trusted background and webhook paths use lazy service-role Supabase clients in `src/lib/flows/admin-client.ts`, `src/lib/automations/admin-client.ts`, `src/lib/ai/admin-client.ts`, and locally in the WhatsApp webhook route.
- Shared domain logic lives under `src/lib/*`, for example WhatsApp send logic, automation engines, flow engines, AI reply generation, public API auth, and webhook delivery.
- Realtime state is client-driven through hooks such as `use-realtime`, `use-total-unread`, `use-unread-notifications`, and `use-presence`.

## 2. Existing Modules And Purpose

### App Route Modules

- `(auth)`: login, signup, password reset.
- `(dashboard)/dashboard`: metrics, activity feed, charts, quick actions.
- `(dashboard)/inbox`: shared WhatsApp inbox, conversation list/thread, composer, templates, AI assistance, reactions, quick replies.
- `(dashboard)/contacts`: contacts, tags, custom fields, CSV import, detail drawer/view, notes, contact-linked deals.
- `(dashboard)/pipelines`: Kanban sales pipelines, stages, deals, analytics, settings.
- `(dashboard)/broadcasts`: broadcast list, wizard, detail/status funnel, recipient tracking.
- `(dashboard)/automations`: no-code automation list, editor, logs, engine endpoints.
- `(dashboard)/flows`: visual conversation flows, flow editor, runs/logs, templates.
- `(dashboard)/agents`: AI playground and usage/config experience.
- `(dashboard)/notifications`: account/user notifications, especially assignment notifications.
- `(dashboard)/settings`: profile, security, appearance, WhatsApp config, templates, quick replies, fields/tags, deals/currency, members, API keys.
- `join/[token]`: invitation peek/redeem user experience.

### Component Modules

- `components/layout`: shell navigation, account menu, mode/theme controls.
- `components/ui`: local UI primitives used throughout the app.
- `components/dashboard`: chart cards, feed, empty states, metrics.
- `components/inbox`: conversation UX, composer, templates, AI banner, quick replies, reactions, contact sidebar.
- `components/contacts`: form/detail/import/custom-field management.
- `components/pipelines`: board, deal cards/forms, settings, analytics.
- `components/broadcasts`: wizard steps.
- `components/automations`: visual automation builder.
- `components/flows`: flow builder/canvas/editor state/forms/validation.
- `components/settings`: settings panels and account/workspace admin screens.
- `components/agents`: AI playground/usage.
- `components/presence`: heartbeat and presence indicators.
- `components/interactive`: WhatsApp interactive message builder/preview.
- `components/tremor`: chart utility components.

### Library Modules

- `lib/auth`: account context, role hierarchy, invitations, public API auth context.
- `lib/account`: member mapping helpers.
- `lib/api-keys`: public API key generation, hashing, scope checks, storage.
- `lib/api/v1`: public API responders, contacts/conversations pagination logic.
- `lib/whatsapp`: Meta API calls, message sending, template validation/sync/lifecycle, webhook signature, encryption, phone normalization, interactive messages, broadcast core.
- `lib/automations`: automation engine, templates, validation, trigger metadata, send integration.
- `lib/flows`: flow engine, validation, templates, layouts, Meta send integration.
- `lib/ai`: AI config, providers, knowledge retrieval/chunking, embeddings, reply generation, usage, handoff.
- `lib/contacts`: CSV parsing, dedupe, tag resolution/write/event helpers.
- `lib/dashboard`: analytics query and date helpers.
- `lib/webhooks`: custom webhook endpoints, event signing, dispatch, SSRF guard.
- `lib/storage`: account media upload/delete.
- `lib/supabase`: browser/server Supabase client factories.
- `lib/themes`, `lib/currency`, `lib/rate-limit`, `lib/template-status`: shared UI/domain utilities.

### Hooks

- `use-auth`: session, profile, account summary, account role/capability derivation.
- `use-can`: typed client capability checks.
- `use-realtime`: Supabase realtime channel helper.
- `use-presence`: member presence state.
- `use-total-unread`, `use-unread-notifications`: live counters.
- `use-broadcast-sending`: broadcast audience resolution and send progress.
- `use-theme`: persisted theme and display mode.

## 3. Authentication, Permissions, Database, And Supabase Integration

### Authentication

- Supabase Auth is the primary human auth provider.
- Browser client is a singleton in `src/lib/supabase/client.ts` to avoid Supabase auth lock contention.
- Server client in `src/lib/supabase/server.ts` reads and writes auth cookies via `next/headers`.
- Middleware calls `supabase.auth.getUser()` and carefully copies refreshed cookies onto redirects/JSON responses.
- Auth pages redirect authenticated users to `/dashboard` or `/join/<token>` when an invitation token is present.

### Account And Role Model

The app has moved from single-user ownership toward account-based tenancy.

- `profiles` contain `account_id` and `account_role`.
- Roles are `owner`, `admin`, `agent`, `viewer`.
- `src/lib/auth/roles.ts` is the TypeScript source of truth for role ranks and capabilities:
  - admin+: manage members, edit account settings.
  - agent+: send messages and edit operational data.
  - owner only: account deletion/ownership transfer.
- Server-side routes can use `getCurrentAccount()` and `requireRole(min)` from `src/lib/auth/account.ts`.
- Client UI uses `AuthProvider`, `RequireRole`, `useCan`, and gated buttons/tooltips.

### Database And RLS

Supabase migrations define the product schema. Major tables include:

- Identity/account: `profiles`, `accounts`, `account_invitations`, `member_presence`, `notifications`.
- CRM: `contacts`, `tags`, `contact_tags`, `custom_fields`, `contact_custom_values`, `contact_notes`.
- Inbox: `conversations`, `messages`, `message_reactions`.
- WhatsApp/config: `whatsapp_config`, `message_templates`, storage buckets for avatars, flow media, chat media.
- Sales: `pipelines`, `pipeline_stages`, `deals`.
- Broadcasts: `broadcasts`, `broadcast_recipients`.
- Automations: `automations`, `automation_steps`, `automation_logs`, `automation_pending_executions`.
- Flows: `flows`, `flow_nodes`, `flow_runs`, `flow_run_events`.
- Public API/webhooks: `api_keys`, `webhook_endpoints`.
- AI: `ai_configs`, `ai_knowledge_documents`, `ai_knowledge_chunks`, `ai_usage_log`.
- Interactive messages: `quick_replies`.

RLS is enabled broadly. Migration `017_account_sharing.sql` rewrites many policies around `is_account_member(account_id, min_role)`, replacing earlier `auth.uid() = user_id` ownership policies. This is a critical boundary for customization: schema or query changes must preserve account scoping.

### Service Role Use

Service-role Supabase clients are used where there is no human session or where background/server operations need cross-row access:

- WhatsApp webhook processing.
- Automations engine/admin work.
- Flows engine/admin work.
- AI auto-reply and knowledge processing.
- Public API key auth resolves a key to account context, then every query must be explicitly filtered by `accountId` because service role bypasses RLS.

This is powerful but high-risk. Any customization touching these paths must maintain explicit account filters and avoid leaking cross-account data.

## 4. Main Pages, Components, Actions, Services, And API Routes

### Main Pages

- `/dashboard`: aggregate metrics, charts, activity feed.
- `/inbox`: realtime conversation operations and outbound messaging.
- `/contacts`: contact list/detail, tags, custom fields, import.
- `/pipelines`: pipeline/stage/deal Kanban and CRUD.
- `/broadcasts` and `/broadcasts/new`: campaigns and wizard.
- `/broadcasts/[id]`: broadcast detail, funnel, recipients, deletion rules.
- `/automations`, `/automations/new`, `/automations/[id]/edit`, `/automations/[id]/logs`: automation lifecycle.
- `/flows`, `/flows/[id]`, `/flows/[id]/runs`: flow lifecycle and run inspection.
- `/agents`: AI assistant playground and usage.
- `/settings`: multi-section settings workspace.
- `/notifications`: notification list/read state.
- `/join/[token]`: invitation flow.

### Internal API Routes

- Account: `/api/account`, `/members`, `/invitations`, `/transfer-ownership`, `/api-keys`.
- AI: `/api/ai/config`, `/draft`, `/playground`, `/test`, `/usage`, `/knowledge`, `/autoreply/[conversationId]`.
- Automations: `/api/automations`, `/:id`, `/:id/duplicate`, `/engine`, `/cron`.
- Flows: `/api/flows`, `/:id`, `/:id/activate`, `/:id/runs`, `/templates`, `/cron`.
- WhatsApp: `/api/whatsapp/config`, `/send`, `/broadcast`, `/webhook`, `/media/[mediaId]`, `/react`, `/templates/*`.
- Contacts helper: `/api/contacts/[id]/tags`.
- Invitations: `/api/invitations/[token]/peek`, `/redeem`.
- Quick replies: `/api/quick-replies`, `/:id`.

### Public API Routes

Public machine-to-machine API lives under `/api/v1`:

- `/api/v1/me`
- `/api/v1/contacts`, `/contacts/[id]`
- `/api/v1/conversations`, `/conversations/[id]`, `/conversations/[id]/messages`
- `/api/v1/messages`
- `/api/v1/broadcasts`, `/broadcasts/[id]`
- `/api/v1/webhooks`, `/webhooks/[id]`

These routes use scoped API keys through `src/lib/auth/api-context.ts` and shared response helpers in `src/lib/api/v1/respond.ts`.

### Services And Domain Actions

There is no single server-action layer. Business actions are split among:

- Client components making direct Supabase calls.
- API route handlers for authenticated writes/integrations.
- Domain services in `src/lib/*`.
- Background processing through WhatsApp webhook `after()`, automation cron/engine routes, and flow cron/engine routes.

## 5. Where User-Facing Texts Are Currently Defined

User-facing text currently exists in several places:

- Central dictionaries: `messages/en.json` and `messages/ko.json`.
- Translation calls: many pages/components use `useTranslations(...)`.
- Static metadata: `src/app/layout.tsx` title/description.
- Navigation metadata: some labels still exist as keys, while translation values are in dictionaries.
- UI constants: `src/components/settings/settings-sections.ts`, `src/lib/themes.ts`, `src/lib/template-status.ts`, `src/lib/automations/templates.ts`, `src/lib/automations/trigger-meta.ts`, flow/editor defaults.
- Inline JSX strings in client pages/components.
- Toasts and error messages in client components.
- API JSON error messages in route handlers.
- Validation errors in domain libraries such as WhatsApp template validators, media upload, send-message, AI config, public API responders.
- Database-seeded/default content in code paths such as pipeline default stage names and automation/flow templates.

## 6. Existing Internationalization System

The application already has an internationalization system.

- Dependency: `next-intl`.
- Config: `next.config.ts` wraps Next config with `createNextIntlPlugin("./src/i18n/request.ts")`.
- Request config: `src/i18n/request.ts`.
- Provider: `NextIntlClientProvider` in `src/app/layout.tsx`.
- Dictionaries: `messages/en.json` and `messages/ko.json`.
- Locale selection: `NEXT_PUBLIC_APP_LOCALE || "en"`.
- Fallback: missing locale files fall back to English.

Limitations:

- Locale is environment-selected, not route-selected.
- There is no `messages/pt-BR.json` yet.
- Several user-facing strings remain outside message dictionaries.
- Some translated namespaces are already extensive, but coverage is uneven.
- API errors are not localized and may be consumed by both UI and public API clients.

## 7. Hardcoded English Texts Requiring pt-BR Adaptation

High-priority hardcoded text areas:

- `src/app/(auth)/signup/page.tsx`: signup headings, errors, placeholders, submit states, invite variants.
- `src/app/(auth)/forgot-password/page.tsx`: reset-password copy and button states.
- `src/app/join/[token]/page.tsx`: invite status cards, role labels, buttons, success/error toasts.
- `src/app/(dashboard)/dashboard-shell.tsx`: loading state.
- `src/app/(dashboard)/notifications/page.tsx`: title, labels, toast errors, unread labels.
- `src/app/(dashboard)/pipelines/page.tsx`: default stage names and default `"Sales Pipeline"` seed.
- `src/app/(dashboard)/broadcasts/[id]/page.tsx`: local chart/funnel labels and fallback names such as `"Unknown"`.
- `src/app/(dashboard)/flows/[id]/runs/page.tsx`: run status labels and date formatting strings.
- `src/components/settings/settings-sections.ts`: section labels and group labels.
- `src/components/flows/forms/node-config-form.tsx`: labels such as `"Body text"`, `"Option"`, upload toasts, remove labels.
- `src/components/flows/flow-editor-state.tsx`: default labels such as `"View options"`, `"Option 1"`, save/status/delete fallback errors.
- `src/lib/template-status.ts`: template status labels.
- `src/lib/automations/templates.ts` and `src/lib/automations/trigger-meta.ts`: default automation names/descriptions and trigger labels.
- API routes under `src/app/api/**`: JSON errors such as `"Unauthorized"`, `"Invalid JSON"`, `"Failed to..."`.
- Domain validators such as `src/lib/whatsapp/template-validators.ts`, `src/lib/storage/upload-media.ts`, `src/lib/rate-limit.ts`, and AI routes.
- Metadata in `src/app/layout.tsx`.

Texts that probably should not be translated blindly:

- WhatsApp/Meta API status enums, HTTP headers, API scope names, machine-readable public API errors, database enum values, route paths, environment variable names, and audit/debug logs.
- Tests and comments unless they become part of generated user documentation.

## 8. Fork Modification Risks And Future Upstream Conflicts

Main risks:

- Broad manual text edits across many upstream files will create persistent merge conflicts.
- Replacing strings inline hides localization work inside unrelated feature files, making future upstream bugfixes harder to adopt.
- Changing Supabase migrations already present upstream can make local/staging/prod database state diverge from upstream.
- RLS and service-role paths are security-sensitive; small account-scoping mistakes can leak data between accounts.
- Client direct-Supabase writes rely on RLS. Moving logic to API routes or wrappers without preserving role checks can change permissions.
- Public API error shapes and scope names may be contracts; localizing them can break integrations.
- WhatsApp template content has Meta-specific requirements and may be business/customer-specific, not just UI text.
- Locale strategy via environment variable is simple but limited; introducing URL locale routing would touch routing/middleware and increase upstream conflict potential.
- Default seeded names such as pipeline stages and automation templates can affect existing data expectations.
- Next.js 16 local docs warn that conventions/APIs may differ; code changes should follow repo-local Next docs, not assumptions from older Next versions.

## 9. Recommended Customization Strategy

Use the existing `next-intl` system as the customization boundary.

Recommended approach:

- Add `messages/pt-BR.json` by copying the full key structure from `messages/en.json`.
- Keep `messages/en.json` and `messages/ko.json` intact for upstream compatibility.
- Set `NEXT_PUBLIC_APP_LOCALE=pt-BR` for Brazilian deployments.
- Migrate remaining hardcoded UI strings into existing or new `next-intl` namespaces.
- Keep machine-readable API error codes stable and, where needed, localize only UI display messages.
- For public API responses, prefer stable English/code identifiers unless a separate presentation layer maps them for the dashboard.
- Centralize status/default-label maps into translation-aware helpers instead of embedding Portuguese strings in domain constants.
- Avoid changing old migrations. Add new migrations only when product customization truly requires schema changes.
- Keep business-specific defaults in additive configuration files where practical, for example `src/config/branding.ts`, `src/config/defaults.ts`, or new i18n namespaces, instead of editing deep product modules repeatedly.
- Prefer thin wrappers/adapters around upstream components for branding or pt-BR behavior when feasible.

## 10. Phased Implementation Plan

1. Baseline and inventory:
   - Freeze current upstream reference and branch state.
   - Add `messages/pt-BR.json`.
   - Produce a hardcoded-string checklist grouped by module.
   - Decide whether pt-BR is fixed by environment or selectable by user.

2. High-visibility localization:
   - Translate auth, dashboard shell, sidebar/header, settings, contacts, inbox, dashboard, pipelines, broadcasts.
   - Replace obvious inline UI strings with `useTranslations`.
   - Keep public API contracts unchanged.

3. Workflow localization:
   - Localize automations, flows, AI agents, notifications, WhatsApp templates UI, quick replies, invitations.
   - Move default labels/status maps into i18n-aware functions where required.

4. Validation and formatting:
   - Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`.
   - Exercise primary routes manually in pt-BR.
   - Validate long Portuguese labels in desktop/mobile layouts.

5. Customization hardening:
   - Add lightweight documentation for localization conventions.
   - Create or update `docs/decisions.md` if this becomes a long-term product fork decision.
   - Keep future upstream merges small and frequent.

## Analyzed Modules

- Root configuration: `package.json`, `next.config.ts`, `src/middleware.ts`, `src/app/layout.tsx`.
- Route groups: `src/app/(auth)`, `src/app/(dashboard)`, `src/app/join`, `src/app/api`.
- UI modules: `src/components/layout`, `dashboard`, `inbox`, `contacts`, `pipelines`, `broadcasts`, `automations`, `flows`, `settings`, `agents`, `presence`, `interactive`, `ui`.
- State/hooks: `src/hooks`.
- Domain services: `src/lib/auth`, `account`, `api-keys`, `api/v1`, `whatsapp`, `automations`, `flows`, `ai`, `contacts`, `dashboard`, `storage`, `webhooks`, `supabase`.
- i18n: `src/i18n/request.ts`, `messages/en.json`, `messages/ko.json`.
- Database: `supabase/migrations/001_initial_schema.sql` through `036_conversation_contact_dedup.sql`.

## Important Architectural Findings

- The app is already localization-ready but not fully localized.
- The security model depends heavily on Supabase RLS plus role predicates mirrored between SQL and TypeScript.
- The app is account-scoped, not simply user-scoped.
- Service-role paths are necessary but require explicit account filters.
- Many major modules are client-side Supabase consumers, so RLS changes can have wider impact than component changes suggest.
- The fork is designed for customization, but the safest path is additive i18n/config layering, not broad core rewrites.

## Risks And Unresolved Questions

- What exact upstream branch/tag should this fork track after local customization?
- Should pt-BR be the only deployment locale or user-selectable?
- Should public API errors remain English/stable or expose localized messages for dashboard consumption?
- Should default seeded entities, such as pipeline stages and automation templates, be localized for new accounts only or migrated for existing accounts?
- Are WhatsApp template examples/copy part of product UI localization or client-specific business copy?
- Are there brand/product naming decisions beyond translation, for example replacing `wacrm` and `"CRM Template for WhatsApp"`?
