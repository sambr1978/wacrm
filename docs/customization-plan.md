# Customization Plan

## Objective

Adapt this wacrm fork for pt-BR users while minimizing changes to the upstream core. The preferred customization boundary is the existing `next-intl` setup plus small, explicit configuration files for branding/defaults when needed.

## Non-Goals

- Do not rewrite authentication, RLS, account roles, public API contracts, or WhatsApp integration as part of localization.
- Do not edit already-applied Supabase migrations for translation-only work.
- Do not replace English strings manually throughout the codebase when they can be moved into centralized message dictionaries.
- Do not localize machine-readable enum values, API scopes, headers, route paths, environment variables, or webhook payload fields.

## Current i18n Baseline

The application already uses:

- `next-intl`
- `src/i18n/request.ts`
- `NextIntlClientProvider` in `src/app/layout.tsx`
- `messages/en.json`
- `messages/ko.json`

The locale is currently selected by `NEXT_PUBLIC_APP_LOCALE`, with fallback to English. This is sufficient for a fixed Brazilian deployment and avoids route/middleware churn.

## Recommended Strategy

### 1. Use `messages/pt-BR.json` As The Main Translation Surface

Create `messages/pt-BR.json` with the same key structure as `messages/en.json`.

Advantages:

- Additive file, low upstream conflict risk.
- Fits the existing architecture.
- Easy rollback: set `NEXT_PUBLIC_APP_LOCALE=en`.
- Keeps future upstream dictionary updates reviewable as key diffs.

### 2. Migrate Hardcoded UI Text By Namespace

For each UI module, move visible text into `messages/en.json` first, then provide pt-BR values in `messages/pt-BR.json`.

Recommended namespace additions:

- `SignupPage`
- `ForgotPasswordPage`
- `JoinPage`
- `Notifications`
- `Settings.sections`
- `TemplateStatus`
- `AutomationTemplates`
- `AutomationTriggers`
- `FlowRunStatus`
- `FlowBuilder.defaults`
- `Common` for repeated terms such as loading, unknown, save, delete, cancel, read-only.

Keep existing namespaces where they already exist, for example `Dashboard`, `Inbox`, `Contacts`, `Pipelines`, `Broadcasts`, `Automations`, `Flows`, and `Settings`.

### 3. Separate UI Messages From API Contracts

For internal dashboard APIs, English `{ error: "..." }` responses may be displayed by client components today. Prefer this migration path:

- Keep API responses stable for now.
- In UI catch blocks, map known error codes or fallback errors to translated messages.
- For future changes, introduce structured errors such as `{ code: "unauthorized", message: "Unauthorized" }` only where backward compatibility is understood.

For public `/api/v1`, keep response shapes and machine-readable errors stable. Public API consumers should not receive localized strings by default.

### 4. Centralize Custom Defaults

Do not bury Portuguese business defaults inside feature files. When defaults need localization or branding, prefer one of:

- i18n dictionaries for visible labels.
- `src/config/branding.ts` for product name, app title, support links, and deployment-specific identity.
- `src/config/defaults.ts` for non-sensitive product defaults that are not database schema.

Examples:

- App title and metadata.
- Sidebar product name.
- New account starter pipeline/stage names.
- Automation template display names and descriptions.
- Theme labels/taglines.

### 5. Preserve Supabase And Role Boundaries

Localization should avoid:

- RLS policy changes.
- Account role hierarchy changes.
- Service-role client behavior changes.
- Public API scope changes.
- WhatsApp webhook payload logic.

Any future customization touching these areas must be treated as a separate security-sensitive implementation.

## Phased Implementation Order

### Phase 0: Baseline And Guardrails

1. Confirm upstream remote and target tracking strategy.
2. Run baseline checks before localization:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`
3. Add `messages/pt-BR.json` from `messages/en.json`.
4. Set `NEXT_PUBLIC_APP_LOCALE=pt-BR` locally or in deployment env.
5. Add a short localization convention note to project docs if implementation proceeds.

### Phase 1: Existing Dictionary Translation

Translate all existing keys from `messages/en.json` into `messages/pt-BR.json` without changing components.

Expected changed files:

- `messages/pt-BR.json`
- Possibly `.env.local.example` only if documenting locale usage is approved.

Validation:

- `npm run typecheck`
- `npm run build`
- Manual smoke test of main dashboard routes.

### Phase 2: Auth, Shell, And Navigation Hardcoded Text

Move high-visibility hardcoded strings into dictionaries:

- `src/app/(auth)/signup/page.tsx`
- `src/app/(auth)/forgot-password/page.tsx`
- `src/app/join/[token]/page.tsx`
- `src/app/(dashboard)/dashboard-shell.tsx`
- `src/app/layout.tsx`
- `src/components/settings/settings-sections.ts`

Expected dictionary updates:

- `messages/en.json`
- `messages/pt-BR.json`

Validation:

- Signup/login/reset/invite flows.
- Dashboard loading and navigation states.

### Phase 3: Core CRM Workflows

Localize hardcoded strings and default labels in:

- `src/app/(dashboard)/notifications/page.tsx`
- `src/app/(dashboard)/pipelines/page.tsx`
- `src/app/(dashboard)/broadcasts/[id]/page.tsx`
- `src/app/(dashboard)/flows/[id]/runs/page.tsx`
- `src/components/flows/forms/node-config-form.tsx`
- `src/components/flows/flow-editor-state.tsx`
- `src/lib/template-status.ts`

Handle default entity names carefully:

- For new records, use translated display defaults.
- Do not rename existing database rows automatically unless explicitly approved.

Validation:

- Main CRUD paths for contacts, deals, broadcasts, flows, notifications.
- Visual review for longer pt-BR labels.

### Phase 4: Automation, Flow, AI, And Settings Polish

Move remaining visible labels from:

- `src/lib/automations/templates.ts`
- `src/lib/automations/trigger-meta.ts`
- `src/components/automations`
- `src/components/flows`
- `src/components/settings`
- `src/components/agents`
- AI and WhatsApp settings surfaces.

Validation:

- Create/edit automation.
- Create/edit flow.
- AI config/test/playground.
- WhatsApp template manager.

### Phase 5: Error Presentation And Public Contract Review

1. Inventory API errors currently surfaced directly to UI.
2. Add UI-side translation mapping for common internal errors.
3. Leave `/api/v1` stable unless a versioned contract change is approved.
4. Document which errors remain intentionally English/machine-readable.

Validation:

- Failed auth.
- Failed send message.
- Failed AI config/test.
- Failed WhatsApp config/template operations.

### Phase 6: Final Verification

Run:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

Manual browser review:

- Desktop-first dashboard workflow.
- Mobile navigation/sidebar.
- Auth/signup/reset/invite.
- Inbox send/template/quick reply.
- Contacts import/detail.
- Pipelines.
- Broadcast wizard.
- Automations and flows.
- Settings.

## Files Likely To Be Changed

Primary:

- `messages/pt-BR.json`
- `messages/en.json`
- `src/i18n/request.ts` only if locale strategy changes.
- `src/app/layout.tsx`
- `src/app/(auth)/signup/page.tsx`
- `src/app/(auth)/forgot-password/page.tsx`
- `src/app/join/[token]/page.tsx`
- `src/app/(dashboard)/dashboard-shell.tsx`
- `src/app/(dashboard)/notifications/page.tsx`
- `src/app/(dashboard)/pipelines/page.tsx`
- `src/app/(dashboard)/broadcasts/[id]/page.tsx`
- `src/app/(dashboard)/flows/[id]/runs/page.tsx`
- `src/components/settings/settings-sections.ts`
- `src/components/flows/forms/node-config-form.tsx`
- `src/components/flows/flow-editor-state.tsx`
- `src/lib/template-status.ts`
- `src/lib/automations/templates.ts`
- `src/lib/automations/trigger-meta.ts`

Possible additive files:

- `src/config/branding.ts`
- `src/config/defaults.ts`
- `docs/localization.md`

Files to avoid unless a separate feature requires them:

- Existing Supabase migrations under `supabase/migrations`.
- RLS/role logic in `src/lib/auth/roles.ts` and `src/lib/auth/account.ts`.
- Service-role clients and webhook processors.
- Public API contracts under `src/app/api/v1`.

## Risk Controls

- Keep localization commits small and module-scoped.
- Add pt-BR dictionary first; migrate hardcoded strings in batches.
- Do not combine text migration with visual redesign or behavior changes.
- Preserve English dictionary keys and source text for upstream diffing.
- Run checks after each batch.
- Prefer stable message keys over long phrase-derived keys.
- For upstream merges, resolve dictionary changes separately from code changes.

## Unresolved Questions

- Should the deployment be permanently pt-BR via `NEXT_PUBLIC_APP_LOCALE=pt-BR`, or should users switch locale?
- What should the app/product be called in Portuguese deployments: keep `wacrm`, use a client brand, or generic CRM wording?
- Should existing seeded database rows be translated, or only defaults for new rows?
- Should public API documentation stay English or have a separate Portuguese guide?
- Are WhatsApp message templates part of app localization or customer-specific copywriting?
- Which upstream cadence is desired: periodic manual merges or a frozen fork?

## Proposed First Implementation Batch

1. Add `messages/pt-BR.json`.
2. Translate existing dictionary keys.
3. Set local/deployment locale to `pt-BR`.
4. Migrate `signup`, `forgot-password`, `join`, `dashboard-shell`, and `settings-sections`.
5. Run lint, typecheck, tests, and build.
6. Review auth/settings/dashboard shell visually before proceeding to deeper workflows.
