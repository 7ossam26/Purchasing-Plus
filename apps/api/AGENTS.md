# apps/api — local rules

- All routes live under `/api/v1` (except `/api/health`). Paths in phase prompts are relative to that prefix.
- Layout per area: `src/modules/<area>/{routes,service,repo,schemas}.ts` + tests next to them. Routes parse input and call the service; services hold the logic and call repos; repos are the only place that touches Prisma.
- Every route: `requireSession` → `requirePermission(...keys)` → (request routes) `loadRequestInScope` → handler. 404 for a request outside the user's scope (don't leak existence).
- Validate input with the Zod schemas from `@purchasing-plus/shared`. Return DTOs built by a `toDto(entity, viewer)` function that applies redaction (prices, supplier names, timeline).
- Transitions: call the shared lifecycle guard, then do state + `RequestEvent` + `AuditLog` + `Notification` rows inside one `prisma.$transaction`. Check `version` and increment it. Publish to the event bus after commit.
- Errors: throw `AppError(status, code, messageAr, fixAr?)`; the error middleware renders `{ error, message, fix }`. Never leak stack traces or SQL.
- Raw SQL only through `Prisma.sql` tagged templates.
- Time: store UTC; compute Cairo day boundaries with the shared time helpers.
- Tests: `supertest` against `createApp()`; use `src/test/factories.ts` to build users with specific permission keys and site scope (no role names). Truncate tables between files. Each route gets happy path, 403, scope, 422, and 409 where relevant.
