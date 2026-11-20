# P14 — Timeline, notifications, home inbox, «متأخر»

- **Model:** GPT-6.2 Sol (`gpt-6.2-sol`)
- **Reasoning:** High
- **Branch:** `p14-timeline-notifications`
- **Depends on:** P13

Paste everything below the line into a new Codex thread.

---

Phase P14 of Purchasing+: the timeline as a headline feature, live notifications, and each user's home inbox. The client cares about the timeline's UI and UX more than almost anything else — make it clear, calm and beautiful. `AGENTS.md` and both app `AGENTS.md` files apply.

## Read first
- `docs/PROGRESS.md`
- `docs/spec/05-timeline-notifications.md` — all of it
- `docs/spec/02-request-lifecycle.md` — "Queues", "Aging"
- `docs/spec/07-ui-design.md` — "Identity", "Tokens", "Motion", "Don'ts"
- `docs/DESIGN_SYSTEM.md` — §3.3 (status tabs with counts), §13, §20

## Build
1. **Timeline tab** (replaces the P09 placeholder), exactly as spec 05 "Timeline body": grouped by stage with holder and duration headers; vertical gaps that grow with elapsed time on a compressed scale, with the duration printed in the gap; event rows (initials, name, role, sentence from `describeEvent`, absolute + relative Cairo time); inline diffs; batch events expandable to suppliers and items; bold attribution for approvals, rejections and «اتحل من المهندس»; filter chips; ordered-list semantics with `<time>`; loading/empty/error states; reduced motion respected. Works beautifully at 360 px.
2. **SSE backend:** `POST /api/v1/events/ticket` (single-use, 30 s), `GET /api/v1/events/stream?ticket=` with `Last-Event-ID` replay from notification rows, 25 s heartbeat, `X-Accel-Buffering: no`. An `EventBus` interface with an in-memory implementation. After each committed transition, publish the user notifications and a `request.changed` signal (request id) to everyone who can see that request.
3. **SSE client:** one connection per tab, reconnect with backoff, new ticket on reconnect; on `request.changed` invalidate the matching TanStack queries (request page, lists, inbox counts); on a notification, bump the bell count.
4. **Bell:** unread count, dropdown list (30 per page, newest first), each item opens the request and marks itself read, «تعليم الكل كمقروء». No sound, no browser push.
5. **Purge job:** daily removal of notifications older than 90 days (simple interval timer started with the server; idempotent).
6. **Home inbox:** `GET /api/v1/inbox` returns the viewer's queues (spec 02) with counts and the first page of each, sorted by urgency then time in stage. Home page: status tabs with counts (default = first non-empty), rows per spec 05, «طلب جديد», then the hub tiles. Empty state «مفيش حاجة مستنياك دلوقتي.»
7. **«متأخر»** badges using `settings.agingDays` and the shared `isAging`, on inbox rows, lists and the request header.

## Tests
- Timeline: groups and durations, gap scale monotonic and capped, diff rendering, batch expansion, filters, redacted payloads rendered without amounts/supplier names.
- SSE: ticket single-use and expiry, replay after `Last-Event-ID`, heartbeat, publish only after commit (a rolled-back transaction publishes nothing).
- Inbox: queue membership per permission and scope; counts; sort.
- Bell: count updates on a pushed notification; mark read.
- Aging across a Cairo day boundary.

## Not in this phase
Reports (P15).

## Done when
- [ ] Green lint, typecheck, tests
- [ ] With two browsers signed in as engineer and manager, a submit appears on the manager's home and bell within two seconds
- [ ] `docs/PROGRESS.md` P14 section
- [ ] Commit `P14: timeline and notifications`
