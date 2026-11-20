# Build phases

20 small phases, each one Codex thread, each ending green (`lint`, `typecheck`, `test`) and committed. Backend logic lands before the screens that use it, so every UI phase builds on tested endpoints.

## Models (Codex desktop app, ChatGPT Plus, checked November 2026)

| Model | Slug | Use it for | Plus allowance per 5 h (OpenAI's estimate) |
|---|---|---|---|
| GPT-6.2 Astra | `gpt-6.2-astra` | The 4 phases where a logic mistake is expensive: access control, the lifecycle rules, fulfilment, and the final review | 6–50 local messages |
| GPT-6.2 Sol | `gpt-6.2-sol` | Everyday building: most API and UI phases | 17–180 local messages |
| GPT-6 Luna | `gpt-6-luna` | Mechanical, well-specified work: import/export, superadmin tools | 350–3,000 local messages |

Reasoning effort: **High** for logic-heavy phases, **Medium** for the rest. Don't use Max or Ultra on Plus; Ultra runs subagents and drains the allowance fast. If Astra runs out mid-phase, continue the same phase on GPT-6.2 Sol at **Extra High**.

## Phases

| # | Phase | Model | Effort | Prompt |
|---|---|---|---|---|
| P00 | Monorepo scaffold, tooling, CI, Docker dev DB | Sol | Medium | `prompts/P00-scaffold.md` |
| P01 | Access control core: users, sessions, dynamic roles, permission registry, site scope, sites API, audit log | **Astra** | High | `prompts/P01-access-control.md` |
| P02 | Web foundation: tokens, Cairo, RTL, primitives, shells, login, guards, `useCan` | Sol | High | `prompts/P02-web-foundation.md` |
| P03 | Admin console: users, role editor, settings | Sol | Medium | `prompts/P03-admin-console.md` |
| P04 | Catalog and master-data API: tree, attributes, units, items, codes, suppliers, search | Sol | High | `prompts/P04-catalog-api.md` |
| P05 | التكويدات UI and the folder explorer | Sol | High | `prompts/P05-master-data-ui.md` |
| P06 | Catalog images, carousel, «عرض للعميل» | Sol | Medium | `prompts/P06-images.md` |
| P07 | Lifecycle core (pure, shared): statuses, item states, every transition, stage derivation, aging | **Astra** | High | `prompts/P07-lifecycle-core.md` |
| P08 | Requests API: drafts, submit, manager decisions, edits, events, notification rows, copy, recent items | Sol | High | `prompts/P08-requests-api.md` |
| P09 | Request UI: new request flow, picker, request page, stage rail, manager actions | Sol | High | `prompts/P09-requests-ui.md` |
| P10 | Purchasing API: batches, WhatsApp text, pricing, unavailable, delivery fee, pause/return, submit pricing | Sol | High | `prompts/P10-purchasing-api.md` |
| P11 | Purchasing UI (phone first) | Sol | High | `prompts/P11-purchasing-ui.md` |
| P12 | Fulfilment API: approval rounds, supply orders, receipt, remaining items, cancel, completion, catalog prices | **Astra** | High | `prompts/P12-fulfilment-api.md` |
| P13 | Fulfilment UI: approval, supply orders, receipt, remaining, cancel | Sol | Medium | `prompts/P13-fulfilment-ui.md` |
| P14 | Timeline UI, notifications + SSE, home inbox, «متأخر» | Sol | High | `prompts/P14-timeline-notifications.md` |
| P15 | Reports and records | Sol | Medium | `prompts/P15-reports.md` |
| P16 | Import and export | Luna | High | `prompts/P16-import-export.md` |
| P17 | Superadmin tools: audit log viewer, maintenance | Luna | High | `prompts/P17-superadmin-tools.md` |
| P18 | Production Docker image, Dokploy, R2, backups | Sol | Medium | `prompts/P18-deploy.md` |
| P19 | Full-lifecycle tests, security and accessibility pass | **Astra** | High | `prompts/P19-hardening.md` |

## How to run a phase

1. Start a **new thread** in the Codex desktop app on the repo (Local mode). Pick the model and effort from the table.
2. Create the branch named in the prompt (or let Codex create a worktree for it).
3. Paste the prompt (everything under the `---` line in the prompt file).
4. When it finishes: read the diff, run `pnpm lint && pnpm typecheck && pnpm test` yourself, try the feature in the browser (phone width for operational screens), then merge.
5. If you hit the 5-hour limit mid-phase: wait for the reset, open a new thread on the same branch, and send: `Continue phase Pxx. Read docs/PROGRESS.md and the phase prompt in prompts/, check what's done, and finish the rest.`

## Keeping usage low

- One phase per thread; never continue a finished thread into the next phase.
- Prompts point to specific spec sections instead of whole files. Don't paste spec text into the chat.
- Keep `AGENTS.md` files short. Put phase-specific detail in the prompt, not in `AGENTS.md`.
- Turn off MCP servers you don't need for this project.

## Before you start

- Read `docs/spec/09-assumptions.md` and veto anything you disagree with now.
- The R2 public/private decision (O-1) is only needed before P18.
- Create an empty GitHub repo, copy this kit into it, commit, then run P00.
