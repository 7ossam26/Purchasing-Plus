# UX Design System: Multi-Role Workflow App (Brand-Independent)

> This document describes the **user-experience architecture** of a working, mobile-first, multi-role workflow application, so you can reuse it in a different product.
>
> It covers **structure and behavior only**: how the app is organized, what each screen shows when it opens, where every element sits, how users move between screens, how components are separated, and how the system responds to users.
>
> It contains **no branding**: no colors, typefaces, logos, imagery, product names or styling values. Where a visual difference matters for usability (for example, "these two actions must never look alike"), the document names a **role** ("primary", "danger", "success tone") instead of a color. Apply your own visual identity on top.
>
> Notes marked *In the source:* show how a pattern was used in the original system (a purchase-request workflow for a contractor's job sites). They are examples, not requirements.

---

## Contents

**Part I: Foundations**
1. [Vocabulary](#1-vocabulary)
2. [UX principles](#2-ux-principles)
3. [Information architecture](#3-information-architecture)
4. [Navigation logic](#4-navigation-logic)
5. [Application shells](#5-application-shells)
6. [Page anatomy and layering](#6-page-anatomy-and-layering)

**Part II: Pages**
7. [Page archetypes](#7-page-archetypes)
8. [Choosing an archetype](#8-choosing-an-archetype)

**Part III: Flows and workflow model**
9. [The workflow model](#9-the-workflow-model)
10. [Core user flows](#10-core-user-flows)
11. [The action model: how buttons are chosen and placed](#11-the-action-model-how-buttons-are-chosen-and-placed)

**Part IV: Components**
12. [Component architecture and separation](#12-component-architecture-and-separation)
13. [Component catalog](#13-component-catalog)

**Part V: Interaction**
14. [Interaction patterns](#14-interaction-patterns)
15. [Saving model: autosave, edit modes, conflicts](#15-saving-model-autosave-edit-modes-conflicts)
16. [State design](#16-state-design)
17. [Feedback and safeguard ladder](#17-feedback-and-safeguard-ladder)
18. [Permissions and context-aware UI](#18-permissions-and-context-aware-ui)
19. [Live updates and notifications](#19-live-updates-and-notifications)
20. [Keyboard, focus and accessibility](#20-keyboard-focus-and-accessibility)
21. [Responsive adaptation](#21-responsive-adaptation)
22. [Data presentation rules](#22-data-presentation-rules)
23. [Copy rules](#23-copy-rules)
24. [Motion](#24-motion)
25. [Direction-independent layout](#25-direction-independent-layout)

**Part VI: Reuse**
26. [Reuse kit and checklists](#26-reuse-kit-and-checklists)

---

# Part I: Foundations

## 1. Vocabulary

The source system is a purchase-request pipeline. This document describes it in generic terms so the patterns carry over to any workflow where records pass between several roles.

| Generic term | Meaning | *In the source* |
|---|---|---|
| **Work item** | The record that moves through the pipeline | A purchase request |
| **Line** | A child row of a work item; each line has its own state | A requested material with quantity and unit |
| **Stage** | Where the work item is now; who is expected to act | Draft, awaiting manager, at purchasing, … |
| **Requester** | Creates and edits work items | Site engineer |
| **Approver** | Approves, rejects or returns them | Site manager |
| **Processor** | Does the main work on approved items | Purchasing officer |
| **Second approver** | Approves the processor's output | Pricing approver |
| **Receiver** | Confirms the outcome in the field | Engineer recording delivery |
| **Scope unit** | The partition users are assigned to; data is filtered by it | A job site |
| **Library** | A hierarchical reference catalog that lines are picked from | Material catalog (category → groups → items) |
| **External party** | Someone outside the system who is contacted manually | Supplier, contacted through a chat app |
| **Master data** | The reference entities the workflow uses | Units, attributes, suppliers, sites, catalog tree |

Roles are **not** hard-coded anywhere. A "role" is just a named bundle of permissions created by an administrator. The UI always asks "does this user hold permission X on scope unit Y?" (see [§18](#18-permissions-and-context-aware-ui)).

---

## 2. UX principles

These principles explain almost every decision in the system. Use them to settle design arguments.

| # | Principle | What it means in practice |
|---|---|---|
| P1 | **Start with "what needs me"** | Home opens on the user's **personal inbox**: the queues of work items they can act on now, with counts. Navigation tiles come second. |
| P2 | **Phone first, one thumb** | Every screen is designed at 360 px wide, then widened. Primary actions sit in a **sticky bottom action bar**. Pickers and confirmations open as **bottom sheets** on phones. |
| P3 | **You only see what you can do** | Destinations, tabs, buttons, prices and names the user lacks permission for are **absent**, not disabled. The interface shrinks to fit the person. |
| P4 | **The workflow decides the buttons** | Which actions appear on a work item comes from one shared rules module, the same one the server uses to enforce them. No screen invents its own "can I do this?" logic. |
| P5 | **Never disable silently** | When an allowed action can't run yet (no lines, invalid quantity, unsaved changes), the button stays visible and a line under it **says why**. |
| P6 | **Always one step from safety** | Every page has Back and Home in a fixed top bar; every overlay closes with Esc, its close button, or a backdrop tap; error pages always offer two exits. |
| P7 | **Nothing is lost** | Drafts autosave, a status line says "saving / unsaved / saved", and leaving with unsaved work asks first. |
| P8 | **Protection scales with risk** | A toast for routine actions, a confirmation for consequential ones, a required reason for decisions that affect someone else, a typed phrase plus password for system-wide destruction. |
| P9 | **Time is visible** | Every work item shows its stage, how long it has been there, and an "overdue" badge when it has waited too long. The history view turns waiting time into vertical space. |
| P10 | **Who did it is always clear** | Approvals, rejections and external resolutions show the actor's name and role prominently, in the header and in the history. |
| P11 | **Quiet notifications** | Notifications go only to people who can take the next step. There are no sounds and no push messages: a bell with a count, and lists that update live. |
| P12 | **Numbers explain themselves** | Every metric states what it measures and whether it is a point-in-time value or a total over the period. Derived values (such as a unit price) are shown next to what the user typed. |

---

## 3. Information architecture

### 3.1 Module registry

Every navigable area is declared **once** in a shared module registry:

```
{ id, label, description, icon, path, kind, parent?, anyOf: [permissionKeys], children?: [{ path, anyOf }] }
```

- `kind` sorts modules into five groups: **operations**, **master data**, **reports**, **admin**, **support** (system-owner tools).
- `anyOf` lists the permission keys that unlock the module; holding any one of them is enough.
- `parent` marks modules that live inside another hub (for example, "Sites" lives under the master-data hub). Modules with a parent don't appear on Home.
- The router builds routes from the registry, Home builds its tiles from it, and the admin sidebar builds its links from it. **Adding a module means one registry entry plus one page component.**

### 3.2 Module kinds

| Kind | Purpose | Reached from | Shell | *In the source* |
|---|---|---|---|---|
| **Operations** | Daily work on work items | Home tiles | Standard | Requests, purchasing queue, catalog |
| **Master data** | Reference entities the workflow uses | One "Master data" tile → hub | Standard | Catalog tree, attributes, units, suppliers, sites |
| **Reports** | Read-only analysis and record logs | One "Reports" tile → hub | Standard | Spending, price history, request overview; logs of requests, receipts, approvals |
| **Admin** | People, roles, settings, data transfer | Home tiles → console | Admin console | Users, roles, settings, import/export |
| **Support** | Owner-only system tools | Console sidebar, owner only | Admin console | Audit log, maintenance, owner accounts |

### 3.3 Depth model

```
Level 0   Login
Level 1   Home  =  Inbox (queues)  +  Module tiles
Level 2     ├── Work-item list            (filters, pagination)
            ├── Processor queue           (pre-filtered list)
            ├── Work item ──────────────► Level 3: sub-routes of the same work item
            │                                ├── review / submit
            │                                ├── pick lines from the library
            │                                └── convert a free-text line into a library item
            ├── Library explorer ───────► Level 3+: folder → folder → … → item → edit
            ├── Master-data hub ────────► Level 3: record managers
            └── Reports hub ────────────► Level 3: report / record log
Separate    Admin console (own shell, own sidebar)
```

- Most work happens at **level 2**, on the work item itself.
- Inside a work item, sub-areas are **tabs** (for mode switches) or **sub-routes** (for full-screen tasks such as picking lines). Sub-routes share the parent's loaded data and edit state (see [§12.4](#124-the-work-item-workspace-pattern)).
- Library depth is unlimited but always navigable through a sticky breadcrumb.

### 3.4 Route map (generic)

| Route | Page | Gate |
|---|---|---|
| `/login` | Login | Public |
| `/` | Home (inbox + tiles) | Signed in |
| `/items` | Work-item list | view work items |
| `/items/:id` | Work-item detail (tabs) | view work items |
| `/items/:id/review` | Review and submit a draft | Rules module allows draft edits |
| `/items/:id/add/node/:nodeId` | Pick lines from the library | view library |
| `/items/:id/convert/:lineId` | Turn a free-text line into a library item | create library items |
| `/queue` | Processor queue | any processing permission |
| `/library` | Library root (categories) | view library |
| `/library/node/:nodeId` | Folder | view library |
| `/library/node/:nodeId/new` | New item (workspace overlay over the folder) | create library items |
| `/library/item/:itemId` | Item detail | view library |
| `/library/item/:itemId/edit` | Edit item (workspace overlay over the item) | edit library items |
| `/master-data` | Master-data hub | view master data |
| `/master-data/<entity>` | Record manager | view that entity |
| `/reports`, `/reports/:id`, `/reports/records/:id` | Reports hub, report, record log | per report |
| `/admin/<section>` | Admin console sections | per section |
| `*` | Not found | Public |

**URL holds the state that should survive reload or sharing**: the folder id, list filters and page number, the work-item tab (`?tab=…`). Transient UI (open sheets, selections) does not go in the URL.

---

## 4. Navigation logic

### 4.1 The navigation contract

Every page in the standard shell guarantees:

| Control | Position | Behavior |
|---|---|---|
| **Back** | Top bar, start side | History back. **If there is no in-app history** (the page was opened from a link), it goes to Home instead of leaving the app. |
| **Home** | Next to Back | Goes to Home. |
| **Product mark** | Top bar, center | Also goes to Home (a second, larger target). |
| **Notification bell** | Top bar, end side | Unread count badge; opens a notifications panel. Shown only to users who can view work items. |
| **Account menu** | Top bar, far end | Name and role, **Change password**, **Log out** (confirmed). |
| **Esc** | Keyboard | Closes the top overlay only. On record-manager pages with no overlay open, it goes to the parent hub. |
| **In-page exit** | Page header, end side | A close ✕ or "Back to {parent}" link that goes to a **fixed parent**, not history. |

Two kinds of "back" exist on purpose:
- **History back** (top bar) returns to wherever the user came from.
- **Structural back** (in-page ✕ or "Back to reports") always returns to the logical parent hub, which matters when the user arrived through a deep link.

### 4.2 Entry and access rules

```
User opens any URL
   │
   ├─ session still loading ─────► centered skeleton card (no flash of the login page)
   ├─ session check failed ──────► "Couldn't load session" + error + fix hint + [Retry]
   ├─ not signed in ─────────────► Login (remembers the requested URL as ?returnTo=)
   │                                 └─ success ─► requested URL (validated same-origin), or Home
   ├─ signed in, opens Login ────► redirect to returnTo or Home
   ├─ lacks permission ──────────► "Access denied" page ── [Go home] [Back]
   ├─ unknown URL ───────────────► "Not found" page ────── [Go home] [Back]
   ├─ unexpected crash ──────────► "Something went wrong" ─ [Go home] [Back]
   └─ allowed ───────────────────► page
```

- A route can require **any one of several** permissions (`anyOf`). Nested routes add their own gate: viewing an item needs "view", its `/edit` child needs "edit".
- **Permissions refresh quietly on navigation**, at most once every 10 seconds, so role changes apply without signing in again.
- The `returnTo` value is validated (same origin, starts with `/`, not `//`, never the login page itself) so the redirect can't be abused.

### 4.3 Deep links land in the right place

- An inbox row opens the work item **on the tab that matches the queue** (a processing queue row opens the processing tab, a receipt queue row opens the receipt tab).
- A notification opens the work item and marks the notification read.
- Tapping the stage rail on a work item switches to the history tab and **scrolls to and focuses** the entry that started the current stage.

### 4.4 In-page navigation patterns

| Pattern | Use when | Changes URL? | *In the source* |
|---|---|---|---|
| **Segmented tabs** | Different modes of the same subject | No (initial tab may come from `?tab=`) | Work item: Lines / Processing / Receipt / History |
| **Segmented tabs with counts** | A queue split by type | No | Home inbox queues |
| **Nested segmented tabs** | Two modes inside one tab | No | Processing tab: Outreach / Pricing |
| **Route tabs** | Sibling pages people switch between | Yes | Available in the primitive; not heavily used |
| **Sticky breadcrumb** | Deep hierarchy | Yes (node id) | Library explorer |
| **Sub-route of a record** | A full-screen task that belongs to one record | Yes | Picking lines, reviewing a draft |
| **Two-step sheet** | A short ordered task inside an overlay | No | Choose external parties → write message |
| **Filter chips** | Narrowing a long list in place | No | History filter: all / status / edits / processing / receipt |

### 4.5 Scope handling (no global switcher)

The source deliberately has **no global scope switcher**. Instead:
- Users are assigned to one or more scope units, or to **all** of them.
- Lists, queues and reports **filter by scope unit** with a normal filter control ("All sites" plus each permitted site).
- When creating a work item, the scope unit is a **chip choice**, and the step is **skipped entirely** when the user has only one.
- A role's scope is shown as two **selectable cards**: "Assigned units only" / "All units".

This removes a hidden global mode. The scope of any list is always visible in its own filter.

---

## 5. Application shells

A **shell** is the persistent frame around page content. Each route declares its shell. There are three.

### 5.1 Standard shell (all operational pages)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Back] [Home]               [ PRODUCT MARK ]            [Bell ③] [Account] │  TOP BAR: fixed, full width,
├──────────────────────────────────────────────────────────────────────────┤  3-column grid (start | center | end)
│                                                                          │
│            ┌─────────────── centered content column ───────────────┐     │  CONTENT: wide max width,
│            │                                                       │     │  padding grows: phone → tablet → desktop
│            │     page (each page sets its own narrower max width)   │     │
│            │                                                       │     │
│            └───────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────┘
```

- The top bar is **fixed**; content is offset by its height (one shared layout variable, reused by every sticky element below it).
- On phones, Back and Home show **icons only**; labels appear on wide screens. The account button shows only an icon on phones and the user's name on wider screens.
- The center mark is a link home, so phones get a large tap target there.
- No footer. Pages end where content ends.

### 5.2 Admin console shell

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [☰ phone] [Back] [Home]         [ PRODUCT MARK ]         [Bell] [Account] │  same top bar
├────────────────┬─────────────────────────────────────────────────────────┤
│ product mark   │                                                         │
│ ADMINISTRATION │                                                         │
│ ▸ Users        │            content column (medium max width)            │
│   Roles        │                                                         │
│   Settings     │                                                         │
│   Data         │                                                         │
│ ── Master data │                                                         │
│   Sites        │                                                         │
│ ── Support     │  (owner only)                                           │
│   Audit log    │                                                         │
│   Maintenance  │                                                         │
│   Owner accts  │                                                         │
└────────────────┴─────────────────────────────────────────────────────────┘
```

- **Persistent sidebar** on desktop (sticky under the top bar), because administrators move between a few sibling sections. On phones it becomes a **slide-in drawer** opened from a ☰ button in the top bar; picking a link closes it.
- The sidebar is **built from the registry**: admin-kind modules, then a "Master data" group with the one master-data module administrators also manage (sites), then a "Support" group visible **only to the system owner**.
- The active section is marked with `aria-current="page"` and a distinct treatment.
- **The console must look clearly different from the operational app** (for example, a contrasting sidebar), so people always know they are somewhere system-wide changes happen.

### 5.3 Bare shell

Login, access denied, not found, unexpected error and session loading/error. There is no top bar, just a single **centered card** of narrow width with the content inside.

---

## 6. Page anatomy and layering

### 6.1 Standard page skeleton

Almost every page follows this vertical order:

```
1  PAGE HEADER        title (start)                         primary page action / exit (end)
2  CONTEXT            facts, chips, stage rail, banners explaining unusual state
3  CONTROLS           filters / search / mode tabs
4  CONTENT            list · table · tab panels · form sections (each in its own bordered panel)
5  ACTION BAR         primary + secondary + "More"  (sticky at the bottom on phones)
```

- **Title on the start side, exit or primary action on the end side**, in one wrapping row.
- Each logical section is its **own bordered panel** with an inline heading. Panels stack with a consistent gap. In-page panels are flat; only overlays float above the page.
- Long pages scroll the page itself. **Only tables and overlays scroll internally** (tables have a maximum height with a sticky header).

### 6.2 Page widths

Each page picks a max width that fits its content, centered inside the shell's column:

| Width | Used for |
|---|---|
| Narrow (≈ 28 rem card) | Bare-shell cards (login, errors) |
| Reading (≈ 900 px / 4xl) | Work-item detail, role editor, settings |
| Medium (≈ 5xl) | Home, lists, queues, hubs, item detail |
| Wide (≈ 6xl) | Library explorer, line picker (grids need room) |
| Console (≈ 1150 px) | Admin content area |

### 6.3 Sticky elements and stacking order (bottom → top)

| Layer | Element | Rule |
|---|---|---|
| Page | Content | Scrolls normally |
| Sticky inside page | Table header | Sticks to the top of its scrolling table |
| Sticky in page | Bottom action bar, basket bar, submit bar | Sticks to the viewport bottom on phones; respects the device's safe-area inset; usually static on desktop |
| Sticky under top bar | Library breadcrumb | Sticks right under the top bar |
| Fixed | Top bar | Always visible |
| Overlay | Notifications panel | Over content, under dialogs |
| Overlay | Dialogs, sheets, drawers | Stack in opening order; only the top one reacts to Esc or the backdrop |
| Overlay | Toasts | Top center, above everything, at most 3 visible |

---

# Part II: Pages

Each archetype lists:
- **Purpose**: the job it does.
- **Opens with**: exactly what the user sees on arrival (what's loaded, selected, focused).
- **Layout**: where things sit. Diagrams put the **start side on the left**; mirror them for right-to-left languages.
- **Flow**: the main interaction loop.
- **Rules**: the behaviors that make it work.

## 7. Page archetypes

### A. Home: inbox, then hub

**Purpose:** Answer "what needs me right now?", then "where else can I go?".

**Opens with:** The inbox heading with the **create** action, queue tabs with counts, and the **first queue that has items selected automatically**. Module tiles appear below.

```
 My inbox                                         [+ New work item] [+ Add site]
┌[ My drafts ② ][ Awaiting my approval ⑤ ][ Processing ⓪ ][ Receipt ① ]────────┐  ← only the queues this user can act in
│ WI-2026-00042                                                           ›    │
│ Site A · Category · Created by                                               │
│ [stage chip] [urgency] [edited] [overdue] [3 awaiting receipt] · 2 days ago  │
├──────────────────────────────────────────────────────────────────────────────┤
│ …                                                                            │
└──────────────────────────────────────────────────────────────────────────────┘

 Modules
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ [icon] Title   › │ │ [icon] Title   › │ │ [icon] Title   › │     grid: 1 col → 2 → 3
│        purpose   │ │        purpose   │ │        purpose   │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

**Rules**
- **Queues are computed from permissions and scope, not roles.** A user sees one tab per queue they could ever act in. Queue membership rules live in the shared rules module.
- **Default tab = first non-empty queue.** Users land on work, not on an empty tab.
- **Queue order** inside a tab: highest urgency first, then longest time in the current stage.
- Each row is a full-width link with a trailing chevron: number (or "Draft" if not submitted yet), facts line, chip line (stage, urgency, "edited", "overdue", per-line-state counts), time in stage.
- Create actions sit **in the inbox header**, the place users start work, not inside a module.
- Empty inbox: "Nothing is waiting for you right now." Empty tiles: "No modules available. Contact your administrator."
- Live updates refresh counts and rows in place (see [§19](#19-live-updates-and-notifications)).

---

### B. Hub (launcher)

**Purpose:** Choose a destination inside an area. Used for master data and reports.

**Opens with:** A centered title and one-line description, then a grid of tiles for the destinations this user can open.

```
                         AREA TITLE
                one-line description of the area

 ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
 │ [icon] Title   › │ │ [icon] Title   › │ │ [icon] Title   › │
 │        purpose   │ │        purpose   │ │        purpose   │
 └──────────────────┘ └──────────────────┘ └──────────────────┘
```

**Rules**
- Tile = **icon, title (a noun), one-line purpose (what you do there)**, and a direction chevron. The whole tile is the target.
- Tiles the user can't open are absent. If none remain, the hub shows a "no modules, contact your administrator" empty state.
- **Report hubs use two tile sizes in two titled sections**: large vertical tiles with longer descriptions for **reports** (the choice needs thought), and compact horizontal tiles for **record logs** (more fit on a screen).

---

### C. Work-item list (filterable, paginated)

**Purpose:** Find any work item the user can see.

**Opens with:** All visible work items, newest first, page 1, no filters. Filters reflect the URL.

```
 Work items                                                 [+ New work item]
┌ filter panel ────────────────────────────────────────────────────────────────┐
│ Search by number [                    ]                                      │
│ [Stage ▾]   [Scope unit ▾]   [Category ▾]   [Urgency ▾]       2 cols → 4 cols │
└──────────────────────────────────────────────────────────────────────────────┘
┌ list ─────────────────────────────────────────────────────────────────────────┐
│ number                                                                    ›  │
│ facts · chips · time in stage                                                │
└──────────────────────────────────────────────────────────────────────────────┘
 [‹ Previous]                     2 / 7                              [Next ›]
```

**Rules**
- **Filters apply immediately** and are written to the URL (replacing the history entry, so Back doesn't step through every filter change). Changing a filter resets to page 1.
- Each select starts with an "All …" option.
- Search input restricts typing to the characters a number can contain.
- **Empty vs filtered-to-nothing** are different messages; the filtered one has a **Reset filters** button.
- Pagination shows only the buttons that make sense: no Previous on page 1, no Next on the last page.

### C2. Processor queue

A **pre-filtered list** for one role: only work items waiting for processing. No filters, number + line count + facts per row, and each row deep-links to the processing tab. The empty state names the queue ("No work items are waiting for processing.").

---

### D. Work-item detail (the central screen)

**Purpose:** Everything about one work item: its state, its lines, what each role does next, and its history.

**Opens with:** Header, stage rail, any explanation banners, then the tab from `?tab=` (if the user may see it) or **Lines**. The action bar shows only the actions allowed now.

```
 WI-2026-00042                                                   ← large, tabular number ("Draft" before submit)
 Site A · Category · Creator
 [stage chip] [urgency] [edited] [overdue] [8 awaiting receipt] [2 at processing]
┌ "Approved by Name (Role) — date" ─────────────────────────────────────────────┐  ← decision banner, success or danger tone
┌ STAGE RAIL ───────────────────────────────────────────────────────────────────┐
│ [■■][■■][■■][▓▓ current][  ][  ][  ]                                          │  ← 7 segments: done / current / future
│  labels under segments (hidden on phones)                                      │
│ [current stage chip] 2 days ago                     (whole panel is tappable) │  → jumps to history
└───────────────────────────────────────────────────────────────────────────────┘
┌ "Returned for edits" + reason ┐   ┌ "Paused" + reason + by whom + when ┐       ← only when relevant, distinct tone
┌ Client / unit: …   Note: …  ────────────────────────────────────────────────────┐
[ Lines ⑫ ][ Processing ][ Receipt ][ History ]                                    ← only tabs the user may use
┌ tab panel ─────────────────────────────────────────────────────────────────────┐
│ …                                                                              │
└────────────────────────────────────────────────────────────────────────────────┘
┌ ACTION BAR ────────────────────────────────────────────────────────────────────┐
│ [Primary action]  [Secondary]  [Danger-outline]                      [⋯ More]  │  sticky on phones
│  reason it can't run yet (when blocked)                                         │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Header rules**
- The number is the largest text; it is the identifier people say out loud.
- The facts line lists scope unit, category and creator as plain separate items.
- The chip line combines **stage**, **urgency**, **edited after submit**, **overdue**, and **per-line-state counts** when lines are in more than one state ("8 awaiting receipt", "2 at processing").
- After a second-level decision, a **decision banner** states who decided, in which role, and when.

**Stage rail rules** (see also [§9.3](#93-the-stage-rail))
- Done segments are filled with the success role, the current one with the primary role, future ones outlined.
- "Returned" and "Paused" appear as a **notch marker** on the current segment, not as extra segments.
- "Rejected" and "Cancelled" **cut the rail**: later segments disappear and the current one gets a danger-tone end cap with ✕.
- The caption under the rail shows the current stage chip and relative time ("2 days ago"). The whole panel is a button that jumps to the history entry, but only for users who may see the history.

**Tab rules**
- **Lines**: always present. For second approvers it also shows the pending approval round (see [§7 D3](#d3-processing-and-approval-tabs)).
- **Processing**: only for users with any processing permission.
- **Receipt**: only for users who may record receipt **on this scope unit**.
- **History**: only for users who may view history.
- While the work item is being **edited**, other tabs disappear and the Lines tab turns into the editor (see [§15.3](#153-explicit-edit-mode-revision)).

**Action bar rules:** see [§11](#11-the-action-model-how-buttons-are-chosen-and-placed). When the active tab has its own sticky submit bar (processing, receipt, approval), the page's action bar moves **above the tabs** and stops being sticky, so two sticky bars never compete.

#### D1. Lines tab

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [1]  Line name                                             12.5  unit        │
│      specs in muted text                                                     │
│      [line state chip]  External party  Price 1,250.00  [Add to library]     │  ← party/price only when permitted
│      Rejection reason · …            (when rejected; line is struck through) │
│      Resolved by Name (Role)         (when resolved outside the system)      │
├──────────────────────────────────────────────────────────────────────────────┤
└──────────────────────────────────────────────────────────────────────────────┘
 [Copy rejected lines to a new work item]
 Delivery fee 150.00                                    ← separate line, never added to the total
```

- Line number in a small square, name, specs, quantity + unit at the end.
- Per-line actions appear **inline on the line** and only when valid ("Resolve externally", "Add to library" for free-text lines).

#### D2. Review / submit (sub-route of a draft)

**Opens with:** The draft's lines as editable rows, the request-level fields, an autosave status line, and a full-width **Submit** button at the bottom.

```
 Review                                                          [Back to tabs]
┌ lines ───────────────────────────────────────────────────────────────────────┐
│ Line name                                                              [🗑]  │
│ specs                                                                        │
│ [quantity        ]  [unit ▾]                                                 │
└──────────────────────────────────────────────────────────────────────────────┘
┌ work-item fields ────────────────────────────────────────────────────────────┐
│ Urgency   (Normal) (Urgent) (Very urgent)          ← chips; locked text if raised by a manager
│ Client / unit [                ]
│ ▸ Add a note                                        ← collapsed until needed
└──────────────────────────────────────────────────────────────────────────────┘
 [+ Browse library]
 Saved ✓   /  Unsaved changes  /  Saving…            ← live status line
┌ [            Send for approval             ] ┐    ← full width, sticky
│  "Add at least one line"                     │    ← reason when blocked
└──────────────────────────────────────────────┘
```

- If the work item is no longer a draft, this route **redirects** to the detail page.
- Submit **flushes pending autosaves first**, then submits with the latest version, shows a success toast, and replaces the route with the detail page.

#### D3. Processing and approval tabs

**Processing tab, opens with:** Any unsent dispatch orders, any remaining lines needing a decision, then a mode switch **Outreach | Pricing** (only Outreach when the user can't price; Pricing first when the user can only price).

```
┌ Dispatch orders (one per external party) ────────────────────────────────────┐  ← after approval
│ Party name · lines · [Open chat] [Copy message] [Mark sent] · sent at …      │
┌ Remaining lines ─────────────────────────────────────────────────────────────┐  ← after a partial receipt
│ line · outstanding qty · [Still coming] [Re-price] [Resolved externally]     │
[ Outreach ][ Pricing ]
```

**Outreach mode (request quotes from external parties)**
```
┌ [Select all]                                         3 selected ─────────────┐
┌ ☐ 1  Line name · specs · qty unit                                            │
│      [edited after send] [state chip] [Sent to 3 ⟲]  ← tap: who and when      │
├ ☑ 2  …                                                                       │
└──────────────────────────────────────────────────────────────────────────────┘
┌ Earlier batches ─────────────────────────────────────────────────────────────┐
│ Batch of 4 lines · date                                  [Continue sending]  │
└──────────────────────────────────────────────────────────────────────────────┘
┌ [          Choose external parties          ] ┐  sticky
│  "Select the lines to include"               │
```
Flow: select lines → **sheet step 1**: choose parties (each row shows name, phone with copy button, and "already received N of these lines") → **sheet step 2**: one editable message pre-filled from a settings template plus one line per item → **Send** creates the batch → **send sheet**: one card per party with **Open chat app**, **Copy message**, **Mark sent**, and an optional per-party message edit. If the generated deep link would be too long, a warning says so and **Copy** becomes the primary button.

**Pricing mode**
```
┌ 1  Line name · specs · qty unit                                              │
│    Unavailable  [toggle]          ← asks for an optional note                │
│    External party [Choose ▾]                                                 │
│    Line total [        ]   = 125.00 per unit   ← derived value, muted         │
│    Saved ✓ / Saving… / Unsaved                  ← per line                     │
├──────────────────────────────────────────────────────────────────────────────┤
┌ Total                                     12,450.00 ┐
│ Delivery fee (separate from total) [        ]       │
┌ [          Send for approval          ] ┐ sticky
│  "Prices are still saving" / "Fix the unsaved prices" / "Price at least one line"
```
- Each line **autosaves on its own** (short debounce). The submit bar's reason reflects the **worst save state** across all lines.
- Submit opens a **summary sheet** (priced count, unavailable count, round total, delivery fee marked "separate") with the final confirm.
- A leave guard is active while any line has unsaved or failed changes.

**Approval panel (on the Lines tab, for second approvers)**
```
┌ Round 2 ─────────────────────────────────────────────────────────────────────┐
│ 1  Line · specs · qty unit                                                   │
│    External party                                                            │
│    Line total 1,250.00 · 125.00 per unit                                     │
│    Last price 118.00   ▲ 5.9%            ← change vs last recorded price       │
│ ──────────────────────────────────────                                       │
│ Round total                                                   12,450.00      │
│ Delivery fee · separate from total                               150.00      │
│ [Approve]  [Reject]                                                          │
└──────────────────────────────────────────────────────────────────────────────┘
┌ Earlier rounds ▸ Round 1   (collapsed; loads details when opened)             ┐
```
- Reject asks for a reason. Its **wording changes with the consequence**: if rejecting this round ends the whole work item, the dialog says so and the button reads "Reject finally".

#### D4. Receipt tab

```
┌ 1  Line · specs · qty unit                                                   │
│    [awaiting receipt]  Outstanding 12 unit                                   │
│    [Received it all]              ← one tap fills the outstanding quantity     │
│    Received quantity [     ]      ← validated: > 0 and ≤ outstanding           │
│    Note [               ]                                                    │
├──────────────────────────────────────────────────────────────────────────────┤
┌ Receipt history: who · when · note · lines and quantities ───────────────────┐
┌ "Part of the quantity will go back to processing" ┐   ← inline warning when partial
┌ [            Record receipt            ] ┐  sticky, saves every filled line at once
│  "Enter a quantity for at least one line" │
```

#### D5. History tab (timeline)

```
 (All) (Status changes) (Edits) (Processing) (Receipt)      ← filter chips
┌ [Awaiting approval]                      ⏱ took 1 day 4 h ┐   ← stage group header
│ held by: Approver                                         │
│ ● AB  Name  Role                                          │
│       Approved the work item.                             │
│       field: ~~old~~ → new                                │   ← inline diff
│       Sun 17 Nov, 3:20 PM · 2 hours ago                    │
└───────────────────────────────────────────────────────────┘
        ┆ ⏱ 3 days                                              ← gap grows with waiting time
┌ [At processing]                          ⏱ ongoing 2 days ┐
```
- Events are **grouped by stage**. Each group says who held it and how long it took (or "ongoing" for the current one).
- **Waiting time is drawn as space**: the gap between groups grows on a compressed scale with the elapsed time, and the duration is printed in the gap.
- Each event: initials disc, actor name and role, **one plain past-tense sentence**, inline before → after diff when fields changed, and an expandable block for outreach batches (parties, sent marks, lines).
- **Decision events** (approve, reject, resolve) show the actor in bold with a highlighted disc.
- Absolute time plus relative time; relative times refresh every minute.
- Filter-to-nothing shows "No events for this filter" with an "All" button.

---

### E. Guided creation: from nothing to a submitted work item

**Purpose:** Let a requester on a phone build a work item in a few taps.

```
Step 1  SHEET "New work item"
        Scope unit:  (Site A) (Site B) (Site C)     ← skipped when the user has only one
        Category:    ┌──────┐┌──────┐               ← large tiles with icons, 2 per row
                     │ icon ││ icon │                 tapping one creates the draft immediately
                     │ name ││ name │
                     └──────┘└──────┘
        "Choose a scope unit first"  (until one is chosen)
            │
Step 2  PICKER (library explorer in pick mode, opened at the category root)
        [Recently used ⟶ horizontal strip]   ← at the category root only
        breadcrumb · search · folders · item cards
        [+ Not in the library? Add "Other"]   ← at every folder level
        ┌ 🧺 Basket: 6 lines                      [Review] ┐  sticky bottom bar
            │
Step 3  ITEM SHEET (on tap: tap-then-quantify)
        image carousel · attribute values
        Quantity [−][ 1 ][+]   Unit [▾]
        Specs [pre-filled from attributes, editable]
        [Add to work item]
        ─ if the same item+unit+specs is already in the basket:
          "This item is already in the basket"  [Increase existing] [Add as separate line]
            │
Step 4  REVIEW (archetype D2) → [Send for approval]
```

**Rules**
- **The draft is created on the category tap**, so nothing typed later can be lost; every change after that autosaves.
- Choices with few options are **chips or big tiles**, never dropdowns.
- The basket bar is always visible while picking and announces its count to screen readers.
- Duplicate detection happens **at add time** with two explicit options, instead of silently merging or silently duplicating.
- The same picker is reused when editing a submitted or paused work item, in which case the basket bar's button returns to the work item instead of the review page.

---

### F. Library explorer (hierarchical browse, manage, pick)

**Purpose:** Navigate a deep reference hierarchy like opening drawers of physical samples. One component serves three modes:

| Mode | Who | Differences |
|---|---|---|
| **Browse** | Can view the library only | Read-only |
| **Manage** | Can maintain master data | Per-folder and per-item action menus, active/stopped filter, "Add item" / "Add group" action bar |
| **Pick** | Inside line picking | Tapping an item opens the item sheet; "Add Other" at every level; "Recently used" strip at the root |

**Opens with:** At the root, the list of categories. In a folder, a sticky breadcrumb, the folder title with the category icon, a search field scoped to the category, child folders first, then item cards.

```
┌ Category › Group › Group › Current ─────────────────────────────────────────┐  sticky under top bar
 [icon]  Current folder name                                  [Status: all ▾] (manage, root)
 [🔍 Search in Category                          ]
┌ folder ─────────┐┌ folder ─────────┐┌ folder ─────────┐       phone: full-width rows
│ [thumb stack]   ││                 ││                 │       desktop: 3-column tiles
│ Name     [⋯]  › ││                 ││                 │
│ 4 groups, 37 items                                    │
└─────────────────┘└─────────────────┘└─────────────────┘
┌ item ┐┌ item ┐┌ item ┐┌ item ┐┌ item ┐                         2 → 3 → 4 → 5 columns
│[cover]││      ││      ││      ││      │
│ name  ││      ││      ││      ││      │
│ code  ││      ││      ││      ││      │
│ 2 attr││      ││      ││      ││      │
│ price ││      ││      ││      ││      │   ← latest price only when permitted
└───────┘└──────┘└──────┘└──────┘└──────┘
 [‹ Previous]   page / pages   [Next ›]
 [+ Not in the library? Add "Other"]                 (pick mode)
┌ [Add item]  [Add group] ┐                          (manage mode, action bar)
```

**Rules**
- **The folder id lives in the URL**, so browser Back goes up one folder and any folder can be bookmarked.
- **Breadcrumb**: every crumb is a link; the current crumb is marked. On phones, paths longer than three collapse the middle crumbs into "…", which opens a list.
- **Folder cards** show a stack of up to three cover thumbnails from inside the folder, or the folder's first letter (or the category icon at the root) when it has no images, plus child-group and item counts.
- **Search** flattens results into one list across the category, with each item's folder path under its name. Searching hides folders.
- **Hovering or focusing a folder prefetches it**, so opening it feels instant.
- **Error keeps the last good content** visible with a retry, instead of blanking the screen.
- Inactive ("stopped") folders and items carry a visible marker; in manage mode they can be filtered.
- Empty folder: "This folder is empty." plus the add actions for the current mode.

### F2. Library item detail

```
 [‹ Category › Group › Group]                         ← path button back to the folder
┌ image carousel (2/5) ─────┐ ┌ details panel (3/5) ───────────────────────────┐
│ swipe · arrows · dots     │ │ Item name                            [⋯]       │  ← manage menu
│ [⤢ full screen + pinch]   │ │ CODE-123                                       │
└───────────────────────────┘ │ [Stopped]                                      │
                              │ [Show to client]        ← full-screen view       │
                              │ description                                    │
                              │ Unit ............ value                        │
                              │ Attribute ....... value                        │
                              │ Latest price .... 125.00     (permission)      │
                              │ Price date ...... …                            │
                              │ From work item .. …                            │
                              │ External party .. …          (permission)      │
                              └────────────────────────────────────────────────┘
```

- **Show to client** opens a **full-screen** overlay with only large images and the attributes marked as client-visible. There are no prices, codes or internal fields, so the screen can safely be shown to a customer.
- **Create and edit are routes rendered as a large workspace overlay** above the folder or item they belong to (`…/new`, `…/edit`). Closing returns to where the user came from; saving a new item goes to its page.

### F3. Library item editor (workspace overlay)

- Full-screen on phones, a large dialog on desktop.
- Fields: name, read-only **code** ("generated automatically" before save), unit, **location** (a folder picker sheet with "up one folder" and "choose here"), description, attributes (each with the right control: number, option list, text; "Add attribute" for optional ones), images.
- **Image manager**: upload several, see each one's processing state, drag to reorder, mark one as cover, delete with confirmation. Images autosave, and the overlay can't be dismissed while an upload is running.
- Leave guard while the form is dirty.

### F4. Tree manager

A list of the hierarchy with **expand/collapse** per folder, **move up / move down** buttons for sibling order, the stopped marker, and the same per-folder action menu as the explorer (rename, add child group, add item, move to…, defaults, stop/reactivate, delete). "Move to…" opens the folder picker sheet.

---

### G. Record manager (master data)

**Purpose:** List, add, edit, stop or delete one kind of simple entity. One template serves units, attributes, external parties, scope units and users.

**Opens with:** The full list loaded, search and status filter empty, nothing selected.

```
┌ RECORD-MANAGER WINDOW ───────────────────────────────────────────────────────┐
│ Title                                                                    [✕] │
│ [Search            ]  [Status: All ▾]                                        │
│ ┌ table (sticky header, scrolls inside, ≤ 60% viewport height) ─────────────┐ │
│ │ Name        │ column │ Status   │                              Actions   │ │
│ │ …           │        │ Active   │   [Edit] [Stop] [Delete]               │ │
│ │ …           │        │ Stopped  │   [Edit] [Reactivate] [Delete]         │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
│ ┌ action bar: [+ Add …]  [Close] ────────────────────────────────────────────┐ │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Flow**
```
List ──[+ Add]──► sheet "Add …"  ──[Save]──────────────► toast, sheet closes, list refreshes
                                 └─[Save and add another]► toast, form resets, sheet stays open
     ──[Edit]───► sheet "Edit …" (pre-filled) ──[Save changes]──► toast, closes
     ──[Stop]───► confirm "Stop this record?" (explains effect) ──► toast
     ──[Reactivate]─────────────────────────────────────────────► toast
     ──[Delete]─► confirm (danger) ─────────────────────────────► toast
     ──Esc / ✕ / [Close]──► parent hub
```

**Rules**
- It looks like a **self-contained window**: its own ✕ and Close both go to a fixed parent hub; **Esc goes back** when no overlay is open.
- Add, edit and delete each depend on their own permission. Without edit or delete, the actions column disappears entirely.
- **Stop (deactivate) is offered before Delete**, since stopping keeps history; both are confirmed with a sentence explaining the effect.
- Forms validate on submit, show **per-field errors** under each field, and show API errors (with fix hint) inline above the buttons.
- The first field gets focus when the sheet opens. The sheet can't be dismissed while saving.
- Field-specific helpers: phone fields accept loose input and **reformat on blur**; multi-select relations (categories, sites) are **chip groups**; booleans are **toggle rows** with an explanation.

---

### H. Report

**Purpose:** Answer a question about a period and scope.

**Opens with:** Default period "this month" (and the user's only scope unit when they have one), already applied. Metrics are visible without scrolling.

```
 [‹ Back to reports]
 REPORT TITLE
 What this report measures, in one sentence            ← caption explaining the measure
 1 Nov – 30 Nov 2026                                    ← the resolved period, always printed
┌ filters: Period ▾ | (From, To if custom) | Scope unit ▾ | Category ▾ | … [Apply] [Reset] ┐
┌ metric ┐┌ metric ┐┌ metric ┐┌ metric ┐┌ metric ┐┌ metric ┐    2 → 3 → 6 columns
│ label  ││        ││        ││        ││        ││        │
│ value  ││        ││        ││        ││        ││        │
│ "now" / "during the period"                               ← time domain under every value
 [Export]
┌ chart ─────────────────────────────────────────────────────────────────────────┐
┌ chart data table (when it differs from the main table) ┐
┌ breakdown tables ┐
┌ main table ┐
```

**Rules**
- **Filters are drafted, then applied** with one button, because reports are expensive and users change several fields at once. Reset returns to the defaults.
- "Custom" period reveals From/To date fields that constrain each other (To can't be before From).
- **Reading order is the information hierarchy**: what it measures → period → headline metrics → chart → breakdowns → detail.
- **Export exports exactly what is filtered**, with the resolved period.
- Reports that need prices show "Prices are hidden for your role" instead of a broken table when the user lacks that permission.
- Reports that need a subject first (for example, price history of one item) show an item picker and "Choose an item" until one is picked.

### H2. Record log

A read-only paginated table of past events (work items, receipts, approvals) with the same filter form plus log-specific filters (status, stage, urgency, creator, a search field). It shows "Page x of y, n records", Previous/Next, and Export.

---

### I. Editor page (role editor)

**Purpose:** Define a complex configuration object with many dependent switches.

**Opens with:** Name, description, scope cards and every permission grouped by area. For a new role everything is off; for an existing one the current state is shown.

```
 Edit role                                                          [Back]
┌ Name [            ]                                                         ┐
│ Description [                    ]                                         │
│ Scope:  ┌◉ Assigned units only ─────┐ ┌○ All units ──────────────────────┐  │  ← selectable cards
│         │ sees only their units     │ │ sees every unit                  │  │
└─────────────────────────────────────────────────────────────────────────────┘
 [Search permissions          ]                          [Copy from another role]
 ⚠ "Can't turn this off: X and Y need it"                 ← notice when relevant
┌ Area A                                                        [Select all] ┐
│ Permission label                                                  [◯━━]    │  ← toggle row
│ one-line consequence of granting it                                         │
│ "Turned on automatically because: …"                    ← dependency note    │
└─────────────────────────────────────────────────────────────────────────────┘
┌ [Save changes]                                   23 permissions ┐   sticky on phones
```

**Rules**
- **Dependencies tick themselves on** and say why. Turning off a permission others depend on is refused with a notice naming the dependents.
- Search filters across area, label and consequence.
- "Copy from another role" opens a picker and **replaces** the selection (with dependencies applied).
- A running count of selected permissions sits next to Save.
- Users only see the permissions they hold themselves (they can't grant what they don't have). Owner-only keys are never offered.
- Leave guard while dirty. A role that holds permissions beyond the editor's own can't be edited by them; the page shows the role name and explains what to do ("choose a role within your permissions or ask another administrator") instead of the form.

### J. Settings

**Purpose:** Change system behavior. Rarely visited, so clarity beats density.

```
 Settings
┌ [icon] Message templates ───────────────────────────────────────────────────┐
│ ┌ Placeholders: {number} = Work-item number · {site} = Site name … ┐        │
│ ┌ Template A [textarea] ┐  ┌ Template B [textarea] ┐                         │  2 columns on wide screens
│ │ Preview: rendered with sample values (live) │                              │
└─────────────────────────────────────────────────────────────────────────────┘
┌ [icon] Operations ──────────────────────────────────────────────────────────┐
│ Overdue after (days) [ 3 ]  "A work item is overdue after this many days…"  │
└─────────────────────────────────────────────────────────────────────────────┘
┌ [Save changes] ┐   one save for the page; sticky on phones
```

**Rules:** group by what is affected, give every field a hint that explains its effect, show a **live preview** for anything templated, use one save button, and confirm with a toast.

### K. Import / export

```
 Data management
 How it works: 1. Download the template  2. Fill it in  3. Upload and check  4. Import
[ Units ][ Sites ][ Attributes ][ Library tree ][ Library items ][ External parties ]   ← tab per entity
┌ Entity ───────────────────────────────────────────────────────────────────────┐
│ expected columns · entity-specific hints                                       │
│ [Download template] [Export]                                                   │
│ ┌┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┐                                                     │
│ ┆  ⤒ Choose or drop a file ┆   limits: types, size                              │
│ └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘                                                     │
│ filename.xlsx                                                                  │
│ Checking…                                                                      │
│ PREVIEW: will add 12 · will update 3                                           │
│ ┌ errors: row · column · message ┐                ← blocks the import           │
│ "Ready to import" / "Fix the errors and upload again"                          │
│ [Import]                                                                       │
│ ✓ Imported: added 12 · updated 3                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Rule: preview before commit.** Uploading only **checks** the file. Import is a separate action, enabled only when the preview is error-free and non-empty. If the commit fails, the user is asked to re-check.

### L. Destructive maintenance

Each action is a card: title, consequence, and a button. The button opens a dialog that requires **typing an exact phrase** (shown as the hint) **and the current password**. The confirm button stays disabled until both are filled. Long-running jobs show progress ("x of y") and a running message.

### M. Audit log

A filterable table (date range validated for order, user, entity, action) with a **detail drawer** (bottom sheet on phones, side panel on desktop) showing old and new values side by side, and an **integrity check** that marks rows whose signature doesn't match.

### N. System pages

| Page | Content | Exits |
|---|---|---|
| Login | Card: product mark, title, username, password, full-width Sign in (shows progress) | Error block shows message + fix; lockout and rate-limit messages name the wait |
| Access denied | Title, plain explanation | **Go home** (primary), **Back** |
| Not found | Title, explanation | **Go home**, **Back** |
| Unexpected error | Title, explanation | **Go home**, **Back** |
| Session loading | Skeleton lines | — |
| Session error | Message, fix hint | **Retry** |

---

## 8. Choosing an archetype

| If the user needs to… | Use |
|---|---|
| See what needs them and start work | **A. Home (inbox + hub)** |
| Pick a destination inside an area | **B. Hub** |
| Find any record by filters | **C. List** |
| Work a role-specific queue | **C2. Queue** |
| Understand and act on one record that passes between roles | **D. Work-item detail** (tabs + rail + action bar) |
| Build a record from nothing on a phone | **E. Guided creation** |
| Navigate or maintain a deep hierarchy | **F. Explorer** |
| See one reference item / show it to an outsider | **F2. Item detail** + full-screen presentation |
| Maintain a flat list of simple entities | **G. Record manager** |
| Understand a period | **H. Report** |
| Browse past events | **H2. Record log** |
| Configure a complex object with dependencies | **I. Editor page** |
| Change system behavior | **J. Settings** |
| Load or export data in bulk | **K. Import / export** |
| Run an irreversible system action | **L. Destructive maintenance** |

---

# Part III: Flows and workflow model

## 9. The workflow model

### 9.1 Stored status vs displayed stage

A work item has a **stored status** (what the server persists) and a **displayed stage** (what users see), derived by a shared function.

```
Stored:     DRAFT → AWAITING_APPROVER → AT_PROCESSING → FULFILMENT → COMPLETED
                ↘ RETURNED ↗        ↘ PAUSED ↗                     ↘ REJECTED / CANCELLED

Displayed during FULFILMENT, derived from line states, first match wins:
   any line awaiting second approval → "Awaiting pricing approval"
   any line awaiting receipt         → "Awaiting receipt"
   any line remaining / unavailable  → "Remaining lines"
   otherwise                          → "At processing"
```

Users never see "fulfilment". They see the step that actually needs someone now. When lines are in several states, **per-state count chips** appear next to the stage so mixed progress is visible.

### 9.2 Line states

| Line state | Meaning | Closed? |
|---|---|---|
| Open | Not processed yet | No |
| Unavailable | Marked unavailable by the processor | No |
| Awaiting approval | In a submitted round | No |
| Awaiting receipt | Approved; waiting in the field | No |
| Remaining | Partly received; the rest is back with the processor | No |
| Received | Fully received | Yes |
| Resolved externally | Handled outside the system | Yes |
| Rejected | Its round was rejected | Yes |
| Cancelled | Work item cancelled | Yes |
| Removed | Deleted during an edit (kept for history, hidden) | Yes |

The work item **completes automatically** when every line is closed and at least one was received or resolved.

### 9.3 The stage rail

```
 Draft → Awaiting approver → At processing → Awaiting 2nd approval → Awaiting receipt → Remaining → Completed
  [■■]      [■■]                [▓▓]             [  ]                   [  ]            [  ]        [  ]
  done      done               current          future                 future          future      future
```

| Situation | Rendering |
|---|---|
| Normal | Segments before current = done; current = primary; after = outlined |
| Returned for edits | Current = "Awaiting approver" with a **notch marker** |
| Paused | Current = "At processing" with a **notch marker** |
| Rejected / cancelled | Rail **ends** at the last stage reached, with a danger end cap and ✕; later segments are hidden |
| Phone | Segments only (no labels) + the current stage chip and time below |

### 9.4 Status tone roles

Every status, line state and urgency level is defined **once** in a shared map: `status → { label, tone, glyph }`. Every chip in the app reads from it, so a status always looks the same everywhere. **Status is never shown by color alone**; every chip carries a small glyph.

| Tone role | Meaning | Used for |
|---|---|---|
| Neutral | Not started, normal | Draft, open, normal urgency, removed |
| Primary | "You are here" | Current stage on the rail |
| Pending | Waiting for someone | Awaiting approver, awaiting second approval, urgent |
| Info | In progress elsewhere | At processing, awaiting receipt |
| Distinct | An exception to the normal flow | Returned, paused, unavailable, remaining |
| Success | Done, approved | Completed, received, resolved, approved |
| Danger | Ended badly, needs attention | Rejected, cancelled, very urgent, overdue |

**Interaction-color rule (as a role):** the **primary** treatment marks things you *can do* (primary buttons, the current stage). The **success** treatment marks things that are *done or selected* (completed stages, selected chips and rows, approvals, focus). Never use the success treatment for a button that hasn't happened yet.

### 9.5 Urgency and aging

- Three urgency levels, chosen as **chips**. The requester sets it while drafting; an approver may **raise** it, which **locks** it (shown as read-only text with "raised by approver", never as a disabled control). Nobody can lower a locked level.
- **Overdue** is computed per stage: the work item is overdue when its **current displayed stage** started more than N business-calendar days ago (N is a setting). It is never shown for final states.

---

## 10. Core user flows

Notation: `[Button]`, `(state)`, `⟶` user step, `⇒` system response, `⚠` safeguard, `✉` notification to the next actor.

### 10.1 Sign in and land

```
Open app ⇒ (session?) ─no─► Login ⟶ username, password ⟶ [Sign in] ⇒ progress on button
                                ├─ error ⇒ inline error block: message + fix / lockout wait
                                └─ ok ⇒ requested URL or Home
Home ⇒ inbox (first non-empty queue selected) + permitted tiles
```

### 10.2 Create and submit (requester)

```
Home ⟶ [+ New work item] ⇒ sheet
  ⟶ (scope unit chip, skipped if only one) ⟶ category tile ⇒ draft created ⇒ picker at category root
  ⟶ open folders / search / "recently used"
  ⟶ tap item ⇒ item sheet ⟶ quantity, unit, specs ⟶ [Add] ⇒ basket count updates   (autosave)
       ⚠ duplicate ⇒ [Increase existing] | [Add as separate line]
  ⟶ not found ⇒ [Add "Other"] ⇒ name, quantity, unit, specs (remembers the folder)
  ⟶ [Review] ⇒ editable lines + urgency + client/unit + note (collapsed)
  ⟶ [Send for approval] ⇒ ⚠ blocked with reason if no lines / bad quantity
                        ⇒ pending saves flushed ⇒ number assigned ⇒ toast ⇒ detail page
                        ✉ approvers on that scope unit
```

Side paths: leaving the work-item area with unsaved changes ⇒ ⚠ leave confirmation. From the detail page, the draft shows **[Continue draft]** (primary) and **[Delete draft]** in More (⚠ danger confirm).

### 10.3 Approve, return or reject (approver)

```
Inbox "Awaiting my approval" ⟶ row ⇒ detail
  ⟶ [Approve]          ⇒ ⚠ confirm ⇒ (At processing) ✉ processors
  ⟶ [Edit quantities]  ⇒ sheet with one quantity field per line ⇒ [Save] (only changed lines sent)
  ⟶ More ▸ [Return for edits] ⇒ ⚠ required note ⇒ (Returned) ✉ requester
  ⟶ More ▸ [Reject]           ⇒ ⚠ required reason, danger ⇒ (Rejected, final) ✉ requester
  ⟶ More ▸ [Raise urgency]    ⇒ sheet with only the higher levels ⇒ locked
```

Requester on a returned item: banner shows the reason ⟶ **[Edit]** (explicit edit mode) ⟶ **[Save]** ⟶ **[Resubmit]** ✉ approvers.

### 10.4 Processing (processor)

```
Inbox "Processing" / processor queue ⟶ row ⇒ detail on the Processing tab
  OUTREACH (optional, repeatable)
  ⟶ select lines ⟶ [Choose external parties] ⇒ sheet step 1: parties (already-contacted counts)
  ⟶ [Next] ⇒ step 2: message pre-filled from template ⟶ edit ⟶ [Send] ⇒ batch created
  ⇒ send sheet: per party [Open chat app] [Copy message] [Mark sent]
  ⇒ lines show "Sent to N" (tap: who and when); batches listed with [Continue sending]
  PRICING
  ⟶ per line: choose party (category parties, or toggle "all parties" + search), type line total
       ⇒ derived unit price shown ⇒ autosave per line
  ⟶ or toggle [Unavailable] ⇒ optional note
  ⟶ delivery fee (separate, never added)
  ⟶ [Send for approval] ⇒ ⚠ blocked while saving / failed / nothing priced
                         ⇒ summary sheet ⟶ confirm ⇒ round created ✉ second approvers
  Side actions: [Pause] (⚠ reason) · More ▸ [Return for edits] (⚠ reason, ✉ requester) · [Cancel] (⚠ reason, danger)
```

### 10.5 Second approval

```
Inbox "Awaiting my approval (pricing)" ⟶ row ⇒ detail, Lines tab shows the pending round
  each line: party, total, unit price, last recorded price, ▲/▼ change %
  round total; delivery fee separate; earlier rounds collapsed
  ⟶ [Approve] ⇒ ⚠ confirm with consequence ⇒ lines awaiting receipt; dispatch orders created
                 ⇒ header banner "Approved by Name (Role) — date"
                 ✉ requester, receivers, dispatch senders
  ⟶ [Reject]  ⇒ ⚠ required reason; wording says if this ends the whole work item
                 ⇒ lines rejected ⇒ [Copy rejected lines to a new work item] offered
```

### 10.6 Dispatch, receipt, remaining

```
Processor: Processing tab ▸ Dispatch orders (one per party): [Open chat app] [Copy] [Mark sent]
           (sending never blocks receipt)

Receiver:  Inbox "Awaiting receipt" ⟶ row ⇒ detail on the Receipt tab
  per line: [Received it all] or quantity (≤ outstanding) + note
  ⚠ "part will go back to processing" when partial
  ⟶ [Record receipt] (all filled lines at once) ⇒ toast ⇒ history entry
       full ⇒ line received   partial ⇒ line remaining ✉ processors

Processor: Remaining lines panel, per line:
  [Still coming]       ⇒ back to awaiting receipt (same party and price, no approval)
  [Re-price]           ⇒ sheet: party + total for the outstanding qty ⇒ awaiting receipt (no approval)
  [Resolved externally]⇒ optional note ⇒ closed; name and role recorded

All lines closed ⇒ (Completed) automatically
```

### 10.7 Pause and edit while paused

```
Processor ⟶ [Pause] ⇒ ⚠ reason ⇒ (Paused); banner shows reason, who and when
Holder of "edit while paused" ⟶ [Edit paused work item] ⇒ explicit edit mode on Lines
  ⟶ add/remove/change lines ⟶ [Save]
     ⇒ changed lines that had prices get "edited – needs re-pricing"
     ⇒ changed lines already sent out get "edited after sending"
Processor ⟶ [Resume] ⇒ (At processing) ✉ processors
```

### 10.8 Cancel, copy, convert

```
More ▸ [Cancel] ⇒ ⚠ reason, danger, consequence text ⇒ open lines cancelled; received stay recorded
More ▸ [Copy to new work item] ⇒ (site still valid? ⇒ new draft) | (else ⇒ sheet: choose site) ⇒ review page of the copy
Free-text line ▸ [Add to library] ⇒ item editor pre-filled with the line's name and unit ⇒ save ⇒ line now linked
```

### 10.9 Hand-off map

| After this… | The next actor learns through |
|---|---|
| Submit / resubmit | Their inbox queue + bell |
| Approve | Processor queue + bell |
| Return / reject / round rejected | Requester's bell (+ drafts queue for returned) |
| Pricing submitted | Second approver's queue + bell |
| Pricing approved | Requester, receivers, dispatch senders: bell + queues |
| Partial receipt | Processor's queue + bell |
| Urgency raised | Badge only, no notification |

---

## 11. The action model: how buttons are chosen and placed

### 11.1 One source of truth

```
shared rules module
  availableActions(workItem, viewer) → [{ action, hint: "primary" | "danger" | … }]
        │                                     ▲
        │ (server returns it with the record)  │ same module enforces on the server
        ▼
work-item page: handlers map { action → label, what to do, overflow? }
        │
        ▼
ActionBar(primary, secondary[], overflow[])
```

- The server returns the work item **with its available actions** for the current viewer. The page **never computes permissions or transitions itself**; it only maps action names to labels and handlers.
- An action the page has no handler for is simply not shown. An action not in the list is never shown.

### 11.2 Placement rules

| Rule | Result |
|---|---|
| First action with hint `primary` that isn't marked overflow | **Primary** button (one per bar) |
| Other non-overflow actions | **Secondary** buttons, in order |
| Actions marked overflow (rare, risky or secondary: reject, return, cancel, copy, raise urgency, delete draft) | **"More" sheet** |
| Hint `danger` | Rendered with the **danger-outline** treatment wherever it appears |
| Action allowed but blocked by local state | Button **disabled** + **reason line under it** |
| Action in progress | Button shows a spinner and is disabled; all bar actions disable while a write is running |

### 11.3 How an action collects input

| Kind of action | Interaction |
|---|---|
| Plain transition (submit, resume) | Click → toast |
| Consequential (approve, log out) | `confirm` dialog → toast |
| Affects someone else (reject, return, pause, cancel) | `prompt` dialog in **reason mode**: required multiline field, confirm disabled until filled |
| Needs a choice (raise urgency, choose site for a copy) | Small sheet with chips |
| Needs a structured edit (edit quantities) | Sheet with fields, Save sends only what changed |
| Changes many fields (edit) | **Explicit edit mode** on the page with Save / Cancel ([§15.3](#153-explicit-edit-mode-revision)) |
| Navigates (continue draft) | Goes to the right sub-route |

---

# Part IV: Components

## 12. Component architecture and separation

### 12.1 Layers

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 6. Pages            one per route; compose features; own URL params       │
├──────────────────────────────────────────────────────────────────────────┤
│ 5. Features         requests/ · catalog/ · inbox/ · reports/ · admin/     │  domain dialogs, tabs, panels
├──────────────────────────────────────────────────────────────────────────┤
│ 4. Shared           ActionBar · DataTable · Pagination · RecordManager ·  │  domain-agnostic composites
│    composites       InlineError · LoadRecord · useLeaveGuard              │
├──────────────────────────────────────────────────────────────────────────┤
│ 3. Primitives       Button · Chip/StatusChip · ChipSelect · SelectableCard│  no business knowledge
│                     ToggleRow · Field/Input/NumberInput · Modal · Tabs ·  │
│                     Dialogs (confirm/prompt) · EmptyState · Skeleton ·    │
│                     Toast                                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ 2. App frame        routes · shells · ProtectedRoute · session · live     │
│                     events · navigation helpers                           │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. Shared package   permission registry · module registry · lifecycle     │  used by server AND client
│    (both apps)      rules · status map · formatters · all UI strings ·    │
│                     validation schemas                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

A layer imports only from layers **below** it. An architecture test enforces direction-independent layout rules across the web app.

### 12.2 Separation rules

1. **Registries drive navigation.** Routes, Home tiles, hub tiles and the admin sidebar all read the module registry. No page hard-codes a list of destinations.
2. **Rules live in one shared module.** Transitions, queue membership, displayed stage, aging and valid quantities are pure functions used by both server and client. Components ask; they never decide.
3. **One service module per API area.** Components never call the network directly. Data goes through a query cache with stable keys per area (`['requests', id]`, `['requests','list', filters]`, `['master-data', …]`, `['reports', …]`).
4. **Templates take behavior as props.** The record-manager template receives `title, columns, list(), activate(), deactivate(), remove(), form(props)`. A new master-data screen is a page of about 40 lines: columns plus a form.
5. **Forms don't know where they live.** A form receives `row?, onBusy, onSaved(another)` and reports back. The template owns create vs edit, toasts and refresh.
6. **Imperative dialogs go through hooks.** `await confirm({...})` and `await prompt({...})` keep dialog state out of page logic. One provider renders them, stacked in order.
7. **One overlay primitive.** Every sheet, dialog, drawer, side panel and full-screen view is the same `Modal` with a variant prop (focus, Esc and scroll lock are consistent everywhere).
8. **Big screens split by region into named components.** The work-item page is `RequestHeader`, `StageRail`, `ItemRows`, `PricingApproval`, `PurchasingTab`, `ReceiptTab`, `Timeline`, `ActionBar`, plus small sheets (`UrgencySheet`, `QuantitySheet`).
9. **Feature folders keep a workflow together.** All of processing's pieces (`purchasing-tab`, `purchasing-rfq`, `purchasing-pricing`, `purchasing-autosave`, `purchasing-writes`, `supply-orders`, `remaining-items`) sit next to each other.
10. **All strings in one catalog.** Labels, toasts, errors, hints, empty states and dynamic phrases (`basket(n)`, `sentCount(n)`) live in one localization file shared by both apps.

### 12.3 Folder layout

```
packages/shared/src/
  permissions/      registry (keys, labels, consequences, dependencies), modules
  lifecycle/        model, rules per action, derive (stage, queues, aging), status map, events
  i18n/             the single strings catalog
  formatters.ts     numbers, money, dates, relative time, durations
apps/web/src/
  app/              routes, shells/, protected-route, session, live-events, navigation, module-icon
  components/
    ui/             primitives
    shared/         domain-agnostic composites and templates
  features/
    requests/       work-item workspace, detail, picker, forms, processing, approval, receipt, timeline
    catalog/        explorer, item editor, images, carousel, presentation, master-records template
    inbox/          home inbox, notification bell
    reports/        report explorer, filters, chart, data view
    admin/          user form, site dialog, role copy, data transfer, audit detail
  pages/            route pages (thin): home, login, system, requests, purchasing, reports-hub,
                    master-data/*, admin/*
  lib/api/          one service module per API area
  styles/           tokens and base rules
```

### 12.4 The work-item workspace pattern

A route-level **workspace** component loads the work item once and provides it to every child route (detail, review, picker, convert) through context:

```
/items/:id           RequestWorkspace  → loads record, owns draft autosave + edit-mode state + leave guard
   ├── (index)       Detail page       → reads workspace
   ├── review        Review page       → reads workspace
   ├── add/node/:n   Picker            → writes basket into workspace draft or edit-mode form
   └── convert/:l    Conversion        → reads workspace
```

Benefits:
- Moving between the detail, picker and review **keeps unsaved state**. The leave guard only fires when leaving the work item, not when moving between its sub-routes.
- One place owns "how to save", "how to refresh after a write" and "how to handle a conflict".

### 12.5 Serialized writes

Several parts of one screen write to the same record (per-line price autosaves, outreach actions, decisions). A **write queue** runs them one after another, each with the latest version number. After a conflict, it rejects queued writes made against the old version, so stale changes can't overwrite newer ones.

---

## 13. Component catalog

Contracts describe **what a component does and decides**, not how it looks.

### 13.1 Primitives

| Component | Responsibility | Key behavior |
|---|---|---|
| **Button** | Every clickable action | Variants by role: `primary`, `secondary`, `danger-outline`, `ghost`; `iconOnly`; `loading` (spinner, `aria-busy`, disabled). Minimum 44 × 44. `type="button"` by default. A `buttonClass()` helper gives links the same look. |
| **Chip** | A small label | Tone role + optional leading icon |
| **StatusChip** | One status / state / urgency | Reads `{label, tone, glyph}` from the shared status map; optional leading count ("8 awaiting receipt") |
| **ChipSelect** | Pick one or several of a few | Horizontal scrolling strip; `aria-pressed`; check mark on selected; used single-select by keeping only the last value |
| **SelectableCard** | Pick one of two or three significant options | Radio inside a large card with title + description; whole card is the target; focus ring on the card |
| **ToggleRow** | A boolean with consequence | Full-width row: label + one-line consequence + switch; whole row is the target |
| **Field** | Label + control + hint + error | Render-prop gives the control its `id`, `aria-describedby`, `aria-invalid`, `required`; "required" marker text next to the label; error has `role="alert"` |
| **Input / Textarea / Select** | Text controls | Same minimum height; invalid and disabled states |
| **NumberInput** | Decimal entry | Text input with decimal keypad, left-to-right, end-aligned, tabular; **converts local digits and separators to standard ones**; rejects invalid characters as you type; value stays a decimal string |
| **Modal** | Host a focused task | Variants: **default** (bottom sheet on phones, centered dialog on desktop), **drawer** (side navigation), **detailDrawer** (bottom sheet on phones, side panel on desktop), **workspace** (full screen on phones, large dialog on desktop), **fullScreen**. Header = optional icon + title + ✕; optional description; body scrolls. Focus moves to an element marked as initial focus (or the title); Tab is trapped; Esc and backdrop close **only the top layer**; focus returns to the trigger; page scroll locks while any layer is open; `dismissible={false}` while saving. |
| **Dialogs** (`useConfirm`, `usePrompt`) | Ask yes/no or one value | Promise-based. `tone: "danger"` makes the confirm button destructive. Prompt modes: **value**, **reason** (required multiline, hint), **password** (min length). Confirm is disabled until valid. Enter submits. |
| **Tabs** | Switch modes or sibling routes | `segmented` (tablist with arrow-key navigation that respects reading direction, Home/End, roving tabindex, panels kept mounted but hidden) or `route` (nav links with current marker). Optional **count badge** per tab. Horizontal scrolling strip when tabs overflow. |
| **EmptyState** | Say why an area is empty | Optional icon, title sentence, description, action button |
| **Skeleton** | Loading placeholder | Shape matches the content it replaces |
| **Toast** | Transient feedback | One channel; top center; success 4 s; error 5.5 s with the **fix hint as description**; close button; at most 3 visible |

### 13.2 Shared composites

| Component | Responsibility | Key behavior |
|---|---|---|
| **ActionBar** | The page's or tab's actions | `primary`, `secondary[]`, `overflow[]` (→ "More" sheet); each action may carry `reason` (disabled + reason line), `loading`, `variant`. Sticky at the bottom on phones (safe-area aware), static on desktop unless `stickyOnDesktop`. Renders nothing when empty. `fullWidthPrimary` for single-purpose submit bars. |
| **DataTable** | Rows and columns | `columns[{id, header, numeric?, cell}]`, sticky header, internal scroll with max height, keyboard-focusable region, numeric columns end-aligned and tabular, optional actions column. Built-in states: loading row, error row with fix + Retry, empty message, filtered message + Reset filters. `dense` mode. |
| **Pagination** | Page through results | Previous/Next only when they make sense; "page / pages" between them |
| **InlineError** | Show a failed load or save in place | Message + fix hint + optional Retry; `role="alert"` |
| **LoadRecord** | Standard load wrapper | Error → InlineError with Retry; loading → skeleton; then renders children with data |
| **RecordManager** | Window frame for record lists | Title, ✕ to fixed parent, Esc → parent (when no dialog is open), bottom ActionBar with Add + Close |
| **useLeaveGuard(dirty)** | Protect unsaved work | Blocks in-app navigation with a danger confirmation; asks the browser to warn on tab close or reload |

### 13.3 App frame

| Component | Responsibility |
|---|---|
| **ProtectedRoute(anyOf)** | Loading → bare skeleton; no session → login with returnTo; not allowed → access denied; else render |
| **Session provider** | Profile, `useCan(key)`, `useCanOnSite(key, unit)`, `useCanAny(keys)`; quiet refresh on navigation; login/logout/password change clear all cached data |
| **TopBar / StandardShell / AdminShell / BareShell** | See [§5](#5-application-shells) |
| **AccountMenu** | Sheet with name + role, Change password (inline form; success signs out and goes to login), Log out (danger confirm) |
| **LiveEvents** | One event stream per session; reconnect with backoff; on events, refresh the affected record, lists, inbox, notifications and reports |

### 13.4 Feature components (templates from the source)

| Component | Responsibility |
|---|---|
| **HomeInbox** | Queue tabs with counts, default to first non-empty, rows with facts; create actions in header |
| **NotificationBell** | Count badge; panel (dropdown on desktop, full-width under the top bar on phones); unread rows highlighted with a dot and bold text; "mark all read"; paginated; outside click and Esc close; announces the unread count politely |
| **RequestHeader** | Number, facts, chips, latest decision banner with actor + role + time |
| **RequestFacts** | Reusable facts + chip line for rows and headers (stage, urgency, edited, overdue, per-state counts, time in stage) |
| **StageRail** | Seven segments, markers, terminal cut, jump-to-history |
| **ItemRows** | Read-only lines with state, party, price (permission), inline line actions, rejection reasons, "resolved by" |
| **RequestFields** | Editable lines (remove, quantity, unit, optional specs) + urgency chips (or locked text) + client field + collapsible note |
| **QuantityField** | Decimal quantity with optional − / + stepper; inline error |
| **NewRequestDialog** | Scope chips (skipped if one) + category tiles; creates the draft on tap |
| **Picker page** | Explorer in pick mode + "recently used" strip + sticky basket bar + item sheet with duplicate handling |
| **Timeline** | Filter chips, stage groups with holder and duration, time-as-space gaps, event rows with diffs and expandable batches, highlight + scroll to an entry |
| **PurchasingTab** | Dispatch orders, remaining lines, Outreach / Pricing modes, combined save state, leave guard |
| **BatchComposer** | Two-step sheet: choose parties → edit message → create batch |
| **SendBatchSheet** | Per-party card: open chat app, copy message, mark sent, optional message edit, long-message warning |
| **SupplierPicker** | Category parties by default; toggle "all parties" with search and paging |
| **PricingMode** | Per-line autosaving pricing, unavailable toggle, total, separate fee, submit bar with reason, summary sheet |
| **PricingApproval** | Pending round with totals, last price comparison, Approve / Reject; earlier rounds collapsed and lazy-loaded |
| **ReceiptTab** | Per-line receive-all / quantity / note, partial warning, one sticky Record button, receipt history |
| **RemainingItems / ResolveItem** | Per-line still coming / re-price / resolve externally |
| **SupplyOrders** | Per-party dispatch cards with the same send pattern |
| **Explorer** | Browse / manage / pick hierarchy with breadcrumb, search, folder grid, item swatches, paging |
| **Carousel** | Swipe, arrows, dots, keyboard arrows; full-screen view with pinch and pan |
| **ClientPresentation** | Full-screen, outsider-safe item view |
| **ItemEditor** | Workspace overlay for item create/edit, folder picker, attributes, image manager, leave guard |
| **NodePicker** | Sheet to choose a folder: list children, "up one folder", "choose here" / "move here" |
| **CatalogActions** | Per-folder/item "⋯" menu sheet with only valid actions; non-empty folders explain why they can't be deleted |
| **MasterRecords** | Record-manager template with search, status filter, edit / stop / reactivate / delete, save-and-add-another |
| **ReportExplorer / RecordExplorer** | Filters with apply/reset, metrics with time domain, chart, tables, export |
| **DataTransfer** | Per-entity template download, export, upload → preview → import |
| **Maintenance dialog** | Typed phrase + password confirmation |

---

# Part V: Interaction

## 14. Interaction patterns

| Pattern | Description | *In the source* |
|---|---|---|
| **Inbox first** | Land on the user's actionable queues, defaulting to the first non-empty one | Home |
| **Tap-then-quantify** | Choosing an item opens a sheet to set quantity, unit and specs, instead of adding one blindly | Line picker |
| **Chips over dropdowns** | Few options → chips or big tiles; many options → select | Scope unit, category, urgency, sites |
| **Skip the obvious step** | A choice with one option is made automatically and not shown | Single scope unit |
| **Create early, save always** | Create the record at the first meaningful tap, then autosave | Draft on category tap |
| **Smart defaults** | Prefill from context: specs from attributes, unit from the item, a single unit preselected, message from a template | Item sheet, outreach message |
| **Detect duplicates at the moment of adding** | Offer "increase existing" or "add separate" | Basket |
| **Escape hatch at every level** | "Not in the library? Add Other" at every folder | Picker |
| **Promote free text later** | A free-text line can become a library item from within the work item | "Add to library" |
| **Progressive disclosure** | Rare fields start collapsed | Note, earlier approval rounds, batch details |
| **Disabled with reason** | Blocked actions stay visible with a sentence under them | Submit, Record receipt, Send for approval |
| **One-tap common answer** | The common value is a single button next to the free field | "Received it all" |
| **Show the derived value** | Display what the system computes from what the user typed | Unit price under line total |
| **Show the comparison** | Display change vs the last known value with direction and % | Price vs last price |
| **Summary before commit** | A sheet summarizes counts and totals before an irreversible submit | Send for approval |
| **Consequence-aware confirmation** | The dialog's text and button change when the action has a bigger effect | Final rejection |
| **Hand-off to another app, then confirm** | Open an external app with prefilled content, then the user marks it done | Open chat app → Mark sent |
| **Copy as a fallback** | When a deep link is too long, Copy becomes the primary action | Long message |
| **Select then act** | Checkbox rows + "select all" + a sticky action that names the next step | Outreach |
| **Multi-step sheet** | Short sequence in one overlay with Next / Previous | Parties → message |
| **Explain automatic changes** | When the system changes something for you, say why | Permission dependencies |
| **Preview before commit** | Upload checks; import is a separate, enabled-only-when-clean action | Import |
| **Prefetch on intent** | Hover or focus on a folder loads it ahead | Explorer |
| **Keep last good content** | Errors don't blank the screen | Explorer, notifications |
| **Jump to cause** | The current-stage summary links to the history entry that started it | Stage rail |
| **Deep link to the right tab** | Queue rows open the tab where the next action is | Inbox → processing / receipt tab |
| **Outsider-safe view** | A full-screen presentation that hides internal data | Show to client |
| **Typed-phrase gate** | Type an exact phrase + password for system-wide destruction | Maintenance |

---

## 15. Saving model: autosave, edit modes, conflicts

### 15.1 Draft autosave

```
change ⇒ queue latest form ⇒ wait 1.5 s of quiet ⇒ save (with version)
        status line: "Unsaved changes" → "Saving…" → "Saved"
        before any command (submit, delete, other actions): flush queued saves first
        invalid lines (bad quantity) are not sent; the status stays "unsaved"
        failed save ⇒ inline error with Retry (form keeps the user's input)
```

### 15.2 Per-field autosave (processing)

Each priceable line runs its own autosave (0.5 s debounce) and reports one of `dirty | saving | failed | incomplete`. The tab combines them:
- any `dirty`/`saving` ⇒ submit blocked with "Prices are still saving"
- any `failed`/`incomplete` ⇒ submit blocked with "Fix the unsaved prices"
- any unsaved state ⇒ **leave guard on**

### 15.3 Explicit edit mode (revision)

For work items that are already submitted (or paused), editing is **deliberate**:
- **[Edit]** switches the Lines tab into the editable form, hides other tabs, and replaces the action bar with **[Save] [Cancel]**.
- The picker can be used to add lines while in edit mode; the form survives the route change.
- Save sends **the full form** (before approval) or **a diff** (add / change / remove, when paused).
- Leaving the work item while in edit mode triggers the leave guard.

### 15.4 Save and add another

Record-manager create forms have two submit buttons: **Save** (closes) and **Save and add another** (resets the form, keeps the sheet open). Only the clicked button shows a spinner.

### 15.5 Concurrency conflicts

Every write sends the record's version. On a conflict:
```
server ⇒ 409 "Someone else changed this. Refresh the page."
client ⇒ error toast (message + fix) ⇒ drop queued draft saves ⇒ exit edit mode / close sheets
       ⇒ refetch the record, its history, processing data and lists
```
First write wins; the user sees the latest state immediately.

### 15.6 Leave guards

| Where | Trigger | Allows |
|---|---|---|
| Work-item workspace | Unsaved draft or edit mode | Moving between that work item's own sub-routes |
| Processing tab | Any line not saved | — |
| Item editor, role editor | Dirty form | — |
| All of the above | Tab close or reload | Native browser warning |

The confirmation is a danger-toned dialog: "Leave without saving? Your changes will be lost." **[Leave]** / **[Cancel]**.

---

## 16. State design

Every data region defines all of these states.

| State | Treatment |
|---|---|
| **Session loading** | Centered card with skeleton lines (no flash of login) |
| **Loading** | Skeleton matching the content's shape (rows, cards, a 3-row timeline); inside tables, a loading row keeps the table shape |
| **Empty** | A **specific sentence** naming what's missing, often with an icon, inviting the next action ("No lines yet.", "This folder is empty.", "Nothing is waiting for you right now.") |
| **Filtered to nothing** | A different sentence ("No matches") plus **Reset filters** |
| **Error (load)** | Inline block: message + fix hint + **Retry**; previous content stays visible where possible |
| **Error (save)** | Inline next to the form, or toast with fix; user input is kept |
| **Saving** | Button spinner + disabled; fieldsets disabled; overlays not dismissible |
| **Autosave status** | Text status line: Saving / Unsaved / Saved |
| **Disabled by state** | Visible + reason line |
| **Hidden by permission** | Absent; no placeholder |
| **Redacted** | Data the user may not see (prices, party names) is removed by the server; the UI shows a sentence when a whole view depends on it ("Prices are hidden for your role") |
| **Not applicable** | Sub-route redirects to the detail page (for example, review on a submitted item) |
| **Live** | Refreshes in place after another user's change; no reload needed |

---

## 17. Feedback and safeguard ladder

Match the strength of the response to the risk.

| Level | Mechanism | Used for | Dismissal |
|---|---|---|---|
| 0 | **Inline state change** | Selecting a chip, toggling, adding to basket (count updates, announced) | — |
| 1 | **Autosave status line** | Drafts, prices, images | Changes by itself |
| 2 | **Success toast** | Every completed command ("Approved", "Receipt recorded", "Saved") | Auto, 4 s |
| 3 | **Error toast with fix** | Failed commands, conflicts | Auto, 5.5 s, or ✕ |
| 4 | **Inline warning** | Predictable consequences shown before submit: partial receipt, message too long, dependency notice | Disappears when resolved |
| 5 | **Disabled with reason** | Action allowed but not ready | Resolve the cause |
| 6 | **Confirmation** | Approve, log out, leave with unsaved changes, stop a record | Explicit choice |
| 7 | **Danger confirmation** | Delete, cancel, reject, log out | Explicit choice; destructive button marked |
| 8 | **Confirmation + required reason** | Reject, return for edits, pause, cancel | Reason typed |
| 9 | **Summary + confirmation** | Submitting a pricing round | Review then confirm |
| 10 | **Typed phrase + password** | System-wide resets and purges | Both fields exact |

**Message rules**
- Success toasts are short past-tense statements that **echo the button's verb** ("Approve pricing" → "Pricing approved").
- Errors say **what happened** and, on a second line, **how to fix it**.
- Confirmation titles ask about the **consequence** ("Reject this work item for good?"), and the confirm button names the action ("Reject finally"), never just "OK".

---

## 18. Permissions and context-aware UI

### 18.1 Model

- **Permission keys** come from one registry. Each key has an area, a label, a **one-line consequence**, and **dependencies** (keys it requires).
- A **role** = name + description + scope (assigned units or all) + a set of keys. Roles are data, never code.
- A **user** = one role + assigned scope units (when the role's scope is "assigned").
- The **system owner** account bypasses checks but receives no workflow notifications.

### 18.2 Granularity

| Granularity | Mechanism | Effect |
|---|---|---|
| Area | Module `anyOf` | Tile and route present or absent |
| Page | Route gate (nested gates for create/edit children) | Page or access-denied |
| Sidebar group | Owner check | Support tools visible only to the owner |
| Tab | Permission (+ scope unit) | Tab present or absent |
| Action | Shared rules module (permission + scope + state) | Button present or absent |
| Column / field | Permission | Prices and party names present or absent in data and UI |
| Row actions | Separate create / edit / delete keys | Each button present or absent |
| Field editability | State (for example, urgency locked) | Editable control vs read-only text with explanation |
| Data | Scope unit | Lists, queues, reports and notifications limited to the user's units |

### 18.3 Rules

- **Hide, don't disable, for permission reasons.** Disable only for state reasons, and always say why.
- **The server is the authority.** It checks permission and scope on every request and **removes** restricted data (prices, party names, history) from responses. The UI hiding things is only a courtesy.
- **Scope-aware checks**: some permissions apply per scope unit (`can(key) && unit in user's units`), so the same user may see a Receipt tab on one work item and not on another.
- **Changes apply without signing in again** through the quiet session refresh.

---

## 19. Live updates and notifications

### 19.1 Live updates

- One server-sent event stream per session, opened with a short-lived ticket; reconnects with exponential backoff (0.5 s → 15 s) and **resumes from the last event**.
- Events are **signals, not data**: "work item 42 changed" ⇒ the client refreshes that record, its history, its processing data, the lists, the inbox and the reports.
- Nothing is shown to the user for brief disconnects; content just stays current.

### 19.2 Notifications

- **In-app only**, intentionally quiet: no sound, no browser push, no per-user settings.
- **Recipients = people who can take the next action** (permission + scope), plus the creator for outcomes. Never the person who acted. Never the system owner.
- The bell shows an unread count. The panel lists newest first: an unread dot, the event as a sentence (bold when unread), the work-item number and relative time. Clicking opens the work item and marks it read. **Mark all read** and paging are available. The unread count is announced through a polite live region.
- Old notifications are purged automatically.

---

## 20. Keyboard, focus and accessibility

| Scope | Key / behavior | Action |
|---|---|---|
| Any overlay | `Esc` | Closes the **top** overlay only |
| Any overlay | `Tab` / `Shift+Tab` | Trapped inside; wraps |
| Any overlay | Open | Focus goes to the marked initial field, else the title |
| Any overlay | Close | Focus returns to the element that opened it |
| Record manager | `Esc` with no overlay | Goes to the parent hub |
| Notifications panel | `Esc` / outside click | Closes; focus returns to the bell |
| Segmented tabs | `←` `→` (direction-aware), `Home`, `End` | Move and activate; roving tabindex |
| Carousel | `←` `→` | Previous / next image |
| Forms | `Enter` | Submits (prompt dialogs, record forms, quantity sheets) |

Accessibility rules applied throughout:
- Every interactive target is at least **44 × 44 px**.
- Icon-only buttons have labels that **include the object** ("Delete Line name", "Copy phone of Party").
- Status changes use `role="status"` / `aria-live="polite"` (autosave line, basket count, selection count, unread count); errors use `role="alert"`.
- Lists are real lists, tables have captions, timeline rows are focusable, times use `<time datetime>`.
- The stage rail exposes each segment's name and state ("current", "complete", "future").
- Selected state uses `aria-pressed`, `aria-selected` or `aria-current`, never styling alone.
- Status chips carry glyphs, so nothing depends on color.
- Visible focus ring on every focusable element.
- All motion is disabled under reduced-motion preferences.

---

## 21. Responsive adaptation

Design at **360 px first**. Breakpoints: small (≈ 640), medium (≈ 768), large (≈ 1024), extra large (≈ 1280). The layout changes **structure**, not just size.

| Element | Phone | Wider screens |
|---|---|---|
| Top bar | Icons only; account icon only | Labels; account name |
| Admin navigation | ☰ → slide-in drawer | Persistent sidebar |
| Default overlay | **Bottom sheet** (slides up) | Centered dialog |
| Detail drawer | Bottom sheet | Side panel |
| Workspace overlay | Full screen | Large dialog |
| Action bars / submit bars | **Sticky at the bottom**, safe-area padding | Static in flow (unless marked sticky on desktop) |
| Primary submit | Full width | Natural width |
| "More" button | Icon only | Icon + label |
| Stage rail | Segments only + current chip | Segments with labels |
| Breadcrumb | Middle crumbs collapse into "…" (> 3 levels) | Full path |
| Folder list | Full-width rows | 3-column tiles |
| Item grid | 2 columns | 3 → 4 → 5 |
| Tiles (home, hubs) | 1 column | 2 → 3 |
| Report metrics | 2 columns | 3 → 6 |
| List filters | 2 columns | 4 columns |
| Item detail | Stacked (images, then details) | Images 2/5, details 3/5 |
| Notifications panel | Full width under the top bar | Dropdown anchored to the bell |
| Wide tables | Horizontal scroll with a minimum width, or dense mode | Full |
| Chip and tab strips | Horizontal scroll, scrollbar hidden | Same |

Other scrollbars stay visible, so users can tell an area scrolls.

---

## 22. Data presentation rules

1. **Numbers use tabular figures**, are end-aligned in tables, and are always formatted by shared formatters (one numbering system for the whole app).
2. **Money is never a float.** It is a decimal string end to end and formatted at display time.
3. **A separate fee is never added to a total.** It is shown on its own line under the total, labeled "separate from total".
4. **Derived values sit next to their source** in muted text (unit price under line total).
5. **Comparisons show direction and size** (▲/▼ and %) with tone roles: lower is success, higher is danger, equal is neutral.
6. **Every metric states its time domain**: "now" (a point in time) or "during the period".
7. **Every report states what it measures** and prints the resolved period.
8. **Time is shown twice where it matters**: absolute ("Sun 17 Nov, 3:20 PM") and relative ("2 hours ago"), both in the **business time zone**, not the device's.
9. **Durations are human** ("1 day 4 hours", "less than a minute").
10. **Missing values show as "—"**, never blank or "null".
11. **Identifiers, codes, usernames and phone numbers keep their own direction** inside text in another script (isolated runs).
12. **Phone numbers are stored normalized and displayed grouped**; input accepts loose formats and reformats on blur.
13. **Long text wraps anywhere** rather than overflowing; user-entered multi-line text keeps its line breaks.
14. **Rejected lines are struck through** and keep their reason; removed lines are hidden but kept in history.

---

## 23. Copy rules

- **Plain, short, sentence-like**, written for the person holding the phone.
- **A button's verb matches its toast.**
- **Confirmation buttons name the action and its strength** ("Reject finally", "Leave without saving").
- **Errors say what happened and how to fix it.**
- **Empty states invite the next action.**
- **Hints explain effects** ("A work item is overdue after this many days in one stage").
- **Every permission has a one-line consequence** shown next to its toggle.
- **History events are one past-tense sentence** with the actor named.
- **All strings live in one catalog**, including dynamic phrases with counts, so wording can change in one place.

---

## 24. Motion

Exactly two kinds of motion, both functional:

1. **Hierarchy navigation**: opening a folder slides the current content a short distance toward the start side while fading, and the new folder enters from the end side (≈ 180 ms). Going back reverses it. It uses the browser's view-transition support when available.
2. **Overlays**: sheets slide up (≈ 200 ms), dialogs fade and scale slightly (≈ 150 ms); expand/collapse reveals what changed.

Nothing animates on page load. There are no hover lifts and no decorative motion. **Everything is instant** under reduced-motion preferences.

---

## 25. Direction-independent layout

The source is a right-to-left app, so every layout rule is written in **logical** terms and works in both directions:

- Use **start/end** for margins, padding, positioning, borders and text alignment, never left/right. An automated test fails the build on physical-direction classes.
- **Directional icons** (back arrows, chevrons, "next/previous") flip with the reading direction.
- **Arrow-key navigation** in tabs and carousels follows the reading direction.
- Content is **start-aligned**; numbers in tables are **end-aligned**.
- Runs of the other script (codes, numbers, usernames, the product mark) are **isolated** so they don't reorder surrounding text.

---

# Part VI: Reuse

## 26. Reuse kit and checklists

### 26.1 Build order for a new project

1. **Shared package**: permission registry (keys, labels, consequences, dependencies), module registry, strings catalog, formatters.
2. **Workflow rules module**: statuses, line states, `deriveStage`, `availableActions`, queue rules, aging. The server and the client both use it.
3. **Status map**: `status → {label, tone role, glyph}`.
4. **Primitives**: Button, Field/Input/NumberInput, Chip/StatusChip, ChipSelect, SelectableCard, ToggleRow, **one Modal** with variants, confirm/prompt dialogs, Tabs, EmptyState, Skeleton, Toast.
5. **Shells and guards**: Standard, Admin console, Bare; ProtectedRoute; login with safe returnTo; system pages; quiet session refresh.
6. **Composites**: ActionBar, DataTable, Pagination, InlineError, LoadRecord, RecordManager, useLeaveGuard.
7. **Home inbox + hubs** from the registries.
8. **Work-item workspace** (route-level context, autosave, edit mode, write queue, conflict handling) and the **detail page** (header, rail, tabs, action bar).
9. **Guided creation + library explorer** (browse / manage / pick).
10. **Role-specific tabs** (processing, approval, receipt) and **timeline**.
11. **Live events + notification bell.**
12. **Reports, record logs, import/export, settings, admin console.**

### 26.2 New screen checklist

**Entry**
- [ ] Which archetype ([§8](#8-choosing-an-archetype)) and which shell?
- [ ] Which permission gates it? Which tabs and actions inside need their own permission or scope check?
- [ ] What exactly does the user see on open: defaults applied, tab selected, first focus?
- [ ] What state belongs in the URL (filters, page, tab, node id)?

**Orientation**
- [ ] Title on the start side; exit or primary action on the end side.
- [ ] Back works even when opened from a link (falls back to Home).
- [ ] The record's stage, urgency, age and owner are visible without scrolling.

**Interaction**
- [ ] Few options are chips/tiles; a single option is skipped.
- [ ] Actions come from the shared rules module and are placed by the action model ([§11](#11-the-action-model-how-buttons-are-chosen-and-placed)).
- [ ] Blocked actions show a reason line.
- [ ] Rare fields are collapsed; common answers are one tap.
- [ ] Esc closes the top overlay; focus returns to the trigger.

**States**
- [ ] Loading skeleton, specific empty sentence, filtered-to-nothing with reset, inline error with fix + retry, saving.

**Safety**
- [ ] Safeguard level chosen from the ladder ([§17](#17-feedback-and-safeguard-ladder)).
- [ ] Unsaved work protected (autosave + status line, or leave guard).
- [ ] Consequences shown before confirming; reasons required when someone else is affected.
- [ ] Conflicts refresh the view and explain what happened.

**Data**
- [ ] Each metric states what it measures and its time domain.
- [ ] Money as decimal strings; separate fees never summed; derived values shown.
- [ ] Missing values "—"; numbers tabular and end-aligned; times in the business time zone.

**Responsive and accessible**
- [ ] Designed at 360 px; sticky bottom actions on phones; sheets on phones.
- [ ] Targets ≥ 44 px; labels name the object; live regions for counts and save status.
- [ ] Logical start/end only; directional icons flip.

### 26.3 New flow checklist

- [ ] Write the flow in the notation of [§10](#10-core-user-flows) before designing screens.
- [ ] Define stored statuses, **displayed stages**, and line states ([§9](#9-the-workflow-model)).
- [ ] For every transition: who (permission + scope), from → to, required input (confirm / reason / fields), and the history sentence it writes.
- [ ] Decide which actions are primary, secondary, overflow or danger.
- [ ] Map every "can't proceed yet" moment to a visible reason.
- [ ] Define the queue each next actor sees and which tab a queue row opens.
- [ ] Define who is notified (only the next actors; never the actor).
- [ ] Decide what the stage rail shows for exceptions (markers) and endings (cut).
- [ ] Decide which decisions need "who did it" shown prominently.

### 26.4 Mapping the source to your domain

| Source concept | Generic pattern | Replace with |
|---|---|---|
| Purchase request | Work item with lines | Ticket, order, application, claim, change request |
| Site | Scope unit | Branch, project, region, tenant, department |
| Site engineer / manager | Requester / approver | Employee / supervisor, agent / lead |
| Purchasing officer | Processor | Fulfilment, review team, operations |
| Pricing approval | Second-level approval of processor output | Budget sign-off, QA review, legal review |
| Receipt on site | Field confirmation with partial outcomes | Delivery, installation, inspection |
| Material catalog | Hierarchical library + "Other" escape hatch | Product catalog, service menu, knowledge base |
| Supplier messaging via chat app | Manual external outreach with "mark sent" | Email, phone call, partner portal |
| Delivery fee | A value shown separately and never summed | Shipping, deposit, tax shown apart |
