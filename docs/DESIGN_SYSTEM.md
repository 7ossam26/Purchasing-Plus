# UX Architecture & Design System (Brand-Independent)

> This document pulls the **user-experience architecture** out of the Elghonemy ERP frontend so you can reuse it in a completely different product.
> It describes **structure and behavior only**: how the system is organized, how users move through it, how each screen is laid out, how responsibilities are split between components, and how the system talks back to the user.
>
> It deliberately contains **no branding**: no colors, logos, imagery, or styling values. The one exception is the **typeface (Cairo)**, which is kept on purpose (see [§1.1](#11-typeface-cairo-self-hosted)). Where a visual difference matters for usability (for example "these two actions must never look alike"), it's described as a *role*, not a color. Apply your own visual identity on top.
>
> Examples from the source system appear as *"In the source:"* notes. They show what a pattern looks like when used for real; they aren't requirements.

---

## Contents

**Part I: Foundations**
1. [UX principles](#1-ux-principles)
2. [Information architecture](#2-information-architecture)
3. [Navigation logic](#3-navigation-logic)
4. [Application shells](#4-application-shells)

**Part II: Pages**
5. [How to read a page spec](#5-how-to-read-a-page-spec)
6. [Page archetypes](#6-page-archetypes)
7. [Choosing an archetype](#7-choosing-an-archetype)

**Part III: Flows**
8. [Core user flows](#8-core-user-flows)
9. [Lifecycle and status models](#9-lifecycle-and-status-models)

**Part IV: Components**
10. [Component architecture and separation](#10-component-architecture-and-separation)
11. [Component catalog (by responsibility)](#11-component-catalog-by-responsibility)

**Part V: Interaction**
12. [Interaction patterns](#12-interaction-patterns)
13. [State design](#13-state-design)
14. [Feedback and safeguard ladder](#14-feedback-and-safeguard-ladder)
15. [Permissions and context-aware UI](#15-permissions-and-context-aware-ui)
16. [Keyboard and efficiency](#16-keyboard-and-efficiency)
17. [Responsive adaptation](#17-responsive-adaptation)
18. [Data presentation rules](#18-data-presentation-rules)
19. [Output flows: print and documents](#19-output-flows-print-and-documents)
20. [Realtime awareness](#20-realtime-awareness)

**Part VI: Reuse**
21. [Anti-patterns found in the source (avoid)](#21-anti-patterns-found-in-the-source-avoid)
22. [Reuse kit and checklists](#22-reuse-kit-and-checklists)

---

# Part I: Foundations

## 1. UX principles

These ten principles explain nearly every decision in the system. Use them to settle design arguments.

| # | Principle | What it means in practice |
|---|---|---|
| P1 | **Launch, don't browse** | The home screen is a grid of large destination tiles, one per job. No sidebar tree, no nested menus. A user reaches any module in **one click** from home. |
| P2 | **Always one step from safety** | Every page has a persistent **Back** and **Home**, and every overlay closes with **Esc**. Users never get trapped. |
| P3 | **You only see what you can do** | The UI hides any destination, button, or tab the user lacks permission for, instead of showing it disabled. The interface shrinks to fit the role. |
| P4 | **Context is always visible** | The current operating scope (which branch, store, or tenant; which shift; which user) is shown on screen all the time, and changing it reloads the data under it. |
| P5 | **Operators deserve speed** | High-frequency screens (point of sale, order intake) are built for touch and keyboard: one-tap actions, presets instead of typing, Enter to finish, shortcuts listed on screen. |
| P6 | **Guide, then unlock** | Multi-part tasks are split into ordered steps. Later steps stay locked until earlier ones are complete, and the UI always says *why* something is locked. |
| P7 | **Guard what can't be undone** | Protection scales with risk: a toast for routine actions, confirmation for destructive ones, a supervisor's credentials for overrides, and a full-screen block when the system's integrity is at stake. |
| P8 | **Numbers explain themselves** | Every figure says what it measures and over what time span. A zero caused by missing setup is labeled differently from a real zero. |
| P9 | **Nothing is lost** | Work in progress can be parked (hold/resume), drafts are restored, and leaving a dirty form asks first. |
| P10 | **Every transaction produces an artifact** | Sales, transfers, shifts, and settlements each produce a printable document from a layout made for paper, separate from the screen layout. |

### 1.1 Typeface: Cairo, self-hosted

The one visual choice this document keeps. **Cairo** is the only typeface for headings, body text, numbers, receipts, and PDFs. It covers Arabic and Latin in one family, its digits read well in tables, and it stays legible on thermal receipts.

**Load it locally, the way the project does, not from a CDN.**

*In the source:* the font files ship with the app in `frontend/public/fonts/`:

```
public/fonts/
  Cairo-Regular.woff2         ← Arabic subset
  Cairo-Latin-Regular.woff2   ← Latin subset
```

`src/utils/pdfFonts.js` loads these files at startup (`preloadPdfFonts()` in `main.jsx`), so printed and PDF documents never depend on the network. **The on-screen UI doesn't do this yet:** `src/index.css` still imports Cairo from Google Fonts. In the new project, use the local files for the screen as well:

```css
/* fonts.css: same files for screen, print, and PDF */
@font-face {
  font-family: "Cairo";
  src: url("/fonts/Cairo-Regular.woff2") format("woff2");
  font-weight: 400;
  font-display: swap;
  unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF; /* Arabic */
}
@font-face {
  font-family: "Cairo";
  src: url("/fonts/Cairo-Latin-Regular.woff2") format("woff2");
  font-weight: 400;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+20AC; /* Latin */
}
/* Add one @font-face pair per weight used (600, 700, 800), or use a single variable-weight file. */

body { font-family: "Cairo", sans-serif; }
```

Why self-host:
- **Works offline and on weak networks.** The point-of-sale and branch screens must keep working when the internet drops.
- **No flash of the wrong font** and no layout shift while a third-party request loads.
- **One source of truth.** Screen, print, and PDF use the same files, so documents match what users see.
- **No third-party requests** from inside the business network.

Rules: use one family for everything, pair numbers with tabular figures so columns line up, and ship only the weights you actually use.

---

## 2. Information architecture

### 2.1 Module taxonomy

All functionality is sorted into **five kinds of module**. This split is the backbone of the navigation and the permission model.

| Kind | Purpose | How users reach it | In the source |
|---|---|---|---|
| **Operations** | Daily work: create transactions, move goods and money | Tiles on the **Home hub** | Sales, purchases, stock transfers, cash transfers, expenses, deposits, shifts, call center, wholesale, courier settlement |
| **Master data** | The entities that operations refer to | One **"Master data" tile** on Home opens a second hub | Warehouses, cash accounts, branches, suppliers, categories, items, employees, couriers, delivery zones, clients, recipes, wholesale customers, data import |
| **Reports** | Read-only analysis and history | One **"Reports" tile** opens a report hub that branches into summary reports and history logs | General report, journal, call-center KPIs, 10 history logs |
| **Actions** | Permissions for a *specific action inside* a page, not a page itself | Never navigated to; they gate buttons and tabs | Sales returns, purchase returns, stock write-off |
| **Administration** | System configuration: users, roles, audit, reset | A **separate console** with its own shell | Users, roles and permissions, audit logs, database reset |

**Rule:** Kind is metadata, not folder structure. Every module is declared once in a **module registry**:

```
{ id, permissionCode, label, description, icon, path?, kind }
```

- Hubs build their tiles from the registry (filtered by kind and permission).
- The role editor builds its permission matrix from the same registry, with Action-kind modules in a separate table.
- Action-kind entries have **no path**, so they can never become dead tiles.

Adding a module is one registry entry plus one route. Navigation and permissions update by themselves.

### 2.2 Depth model

```
Level 0   Login
Level 1   Home hub ─────────────── (Operations tiles)
Level 2     ├── Module page         e.g. Point of sale, Purchases
            ├── Master-data hub ──► Level 3: Record managers
            └── Reports hub ──────► Level 3: Summary reports
                                    └► Level 3: History hub ──► Level 4: History logs
Separate    Admin console (own shell, own nav)
```

- Most work happens at **level 2**. Reference data is at level 3. Nothing important is deeper than level 4.
- Inside a module, sub-areas use **tabs** or **steps**, not more pages.

### 2.3 User roles as UX drivers

The system serves very different people, and the IA bends to each:

| Role type | What they need | How the UX responds |
|---|---|---|
| **Front-line operator** (cashier, call agent) | Speed, few choices, no mistakes | Full-screen workspace with no surrounding chrome, big targets, keyboard paths, safeguards against wrong actions |
| **Branch supervisor** | Approve, correct, reconcile | Approval inboxes, supervisor-credential prompts, shift review |
| **Back-office / finance** | Enter documents, reconcile, analyze | Document-entry pages, master-detail reconciliation, reports with explained numbers |
| **Global manager** | Cross-branch view | Can switch scope to **"All branches"**, which is unavailable to everyone else |
| **System administrator** | Configure, audit | A separate admin console that looks distinct from the operational app, so nobody confuses the two |

---

## 3. Navigation logic

### 3.1 The navigation contract

Every page in the standard shell guarantees the following:

| Control | Location | Behavior |
|---|---|---|
| **Back** | Top bar, start side | Browser-history back (`navigate(-1)`) |
| **Home** | Top bar, next to Back | Goes to the Home hub |
| **Product mark** | Top bar, center | Also goes Home (a second, larger target) |
| **Scope switcher** | Top bar, end side | Shows and changes the active branch (or tenant) |
| **Help** | Top bar, end side | Opens the user manual |
| **User menu** | Top bar, far end | Identity (name + role) and Logout, which asks for confirmation |
| **Esc** | Keyboard | Closes the top overlay. On record-manager pages with no overlay open, it navigates back. |
| **In-page exit** | Page header, end side | An explicit "Back to {parent}" link or a close ✕ that goes to a *fixed parent*, not to history |

Two kinds of back exist on purpose: **history back** (top bar, which works wherever the user came from) and **structural back** (in-page, which always goes to the logical parent hub). Report pages and record managers offer the structural one.

### 3.2 Entry and access rules

```
User opens any URL
   │
   ├─ not signed in ───────────► Login (remembers the requested URL)
   │                               └─ success ─► requested URL, or Home
   │                                             (admins ► Admin console)
   ├─ signed in, opens Login ──► redirect to Home / Admin console
   ├─ lacks required role ─────► Home
   ├─ lacks required permission► "Access denied" page ── [Go back] [Go home]
   ├─ unknown URL ─────────────► "Not found" page ────── [Go home] [Go back]
   └─ allowed ─────────────────► page
```

- A route can require **one permission** or **any one of several**. Master-data pages accept either the "view" or the "create" permission.
- Permissions are **refreshed quietly on navigation** (throttled to once per 10 s), so role changes take effect without a re-login.
- Error pages always offer **two ways out**: back (undo the mistake) and home (start over).

### 3.3 In-module navigation

| Pattern | Use when | Changes URL? | In the source |
|---|---|---|---|
| **Segmented tabs** | Different *modes* of the same subject on one page | No | Inventory: stock / opening stock / write-off |
| **Route tabs** | Sibling pages of one module that people switch between often | Yes | Wholesale: point of sale / collections / orders |
| **Status tabs with counts** | A queue split by lifecycle stage | No | Preparation queue: new / preparing / ready |
| **Numbered steps** | An ordered task where each part depends on the previous one | No | Call-center order: customer → branch → delivery zone |
| **Table of contents** | Long reference content | Anchors | User manual |
| **Clickable status segments** | Summary of a long form; each segment scrolls to its section | No | Call-center command bar |

### 3.4 Scope (context) switching

- The **active scope** (branch) is a global context, saved per user.
- Users with one branch see it **as a read-only label**. Users with several get a **dropdown**. Global roles also get **"All"**.
- Every data page **reloads when the scope changes**. Forms default their scope fields to the active scope but allow editing where the role permits.
- A field that a role may not change is shown **as read-only text, not as a disabled dropdown**. *In the source:* the source warehouse on a stock transfer is a label for branch users and a selector for global users.

---

## 4. Application shells

A **shell** is the persistent frame around page content. There are four, and each page declares which one it uses.

### 4.1 Standard shell (most pages)

```
┌──────────────────────────────────────────────────────────────────────┐
│ [Back] [Home]            [ PRODUCT MARK ]       [Scope ▾] [?] [User ▾] │  TOP BAR: fixed, always visible
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                 ┌──────── centered content column ────────┐          │  CONTENT: max width ≈ 1280 px,
│                 │                 page                     │          │  padding grows with screen size
│                 └──────────────────────────────────────────┘          │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ footer (credits, copyright)                                          │  FOOTER: pushed to the bottom
└──────────────────────────────────────────────────────────────────────┘
```

- The top bar is **fixed**. Content is offset by the bar's height.
- On small screens, Back and Home show **icons only**, the scope switcher hides, and the user menu shows only the avatar.
- Pages that should fit the viewport (lists, workspaces) size themselves to *viewport minus top bar* and **scroll inside their own panels**, not the whole page.

### 4.2 Admin console shell

```
┌──────────────┬───────────────────────────────────────────────┐
│ product mark │ [☰ mobile] [Back]                    header   │
│──────────────├───────────────────────────────────────────────┤
│ ▶ Users      │                                               │
│   Roles      │              content column (≈ 1150 px)        │
│   Audit log  │                                               │
│   Reset      │                                               │
│──────────────│                                               │
│ identity     │                                               │
│ [Sign out]   │                                      footer   │
└──────────────┴───────────────────────────────────────────────┘
```

- A **persistent sidebar**, because admins jump between a few sibling sections. It becomes a slide-over drawer with a dismissible backdrop on mobile.
- **It must look different from the operational app** (a different visual treatment), so an admin always knows they are in the place where actions are destructive and system-wide.

### 4.3 Full-screen workspace shell

```
┌────────────────────────────────────────────────────────────────────┐
│ context strip: who · where · shift · clock · date  │  quick actions │  thin, always visible
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│                the workspace fills the remaining viewport           │  no page scroll; panels scroll
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

- Used when the user works **inside one screen all shift long**. *In the source:* the point of sale.
- The standard top bar is replaced by a **context strip**: operator identity, location, shift and live clock, date, plus the module's own quick actions (history, queue, returns, end shift).
- Back and Home are still present, inside the workspace's own top bar.

### 4.4 Bare shell

Login, Access denied, Not found, and the User manual. There's no top bar, just a centered card or the content itself plus the footer.

---

# Part II: Pages

## 5. How to read a page spec

Each archetype below lists:

- **Purpose:** the job it does.
- **Opens with:** the exact state the user lands in (what's loaded, what's focused, what's visible).
- **Regions:** a diagram of where things sit. Diagrams show the **start side on the right** (the source is right-to-left). Mirror them for left-to-right.
- **Flow:** the main interaction loop.
- **Rules:** the behaviors that make it work.

---

## 6. Page archetypes

### A. Hub (launcher)

**Purpose:** Choose where to go. Used for Home, the Master-data hub, the Reports hub, and the History-logs hub.

**Opens with:** A centered title with a short description, then a grid of tiles containing only the destinations this user can access.

```
                       PAGE TITLE
                      ───────────
               one-line description (optional)

    ┌───────────┐  ┌───────────┐  ┌───────────┐
    │   icon    │  │   icon    │  │   icon    │
    │  Title    │  │  Title    │  │  Title    │      grid: 1 col → 2 → 3
    │  purpose  │  │  purpose  │  │  purpose  │
    └───────────┘  └───────────┘  └───────────┘
```

**Rules**
- A tile has three parts: **icon, title (a noun: the module), one-line purpose** (what you do there).
- The whole tile is the target. Hover or focus gives clear feedback (lift, emphasis).
- Tile order follows how often people use them, not the alphabet.
- A hub can end with a **utility tile** that isn't a module. *In the source:* "Import / export data" at the end of the Master-data hub.
- Report hubs use **bigger tiles with a longer description**, because the choice needs more thought.
- History-log hubs use a **horizontal tile** (icon beside the text) to fit more choices on one screen.

---

### B. Record manager ("window")

**Purpose:** List, add, edit, and delete one kind of entity. It's the single template behind all master data and the history logs.

**Opens with:** The full list loaded (scoped to the active branch), the search/filter strip ready, and no row selected.

```
┌──────────────────────────────────────────────────────────────────┐
│ ✕ close      [ optional header actions ]        Title     [icon] │  HEADER
│                                                 subtitle         │
├──────────────────────────────────────────────────────────────────┤
│ [search] [scope] [from date] [to date]  [apply] [reset]          │  FILTER STRIP (optional)
├──────────────────────────────────────────────────────────────────┤
│ col │ col │ col │ … │ actions                                    │  TABLE (sticky header,
│ …   │     │     │   │ ✎  🗑                                      │  scrolls inside the window)
├──────────────────────────────────────────────────────────────────┤
│ [Close]                                            [+ Add new]   │  FOOTER ACTIONS
└──────────────────────────────────────────────────────────────────┘
```

**Flow**
```
List ──[+ Add new]──► Modal "Add {entity}" ──[Save & close]──► toast ► list reloads
  │                         └──[Save & add another]──► toast ► form clears, stays open
  ├──[✎ row]──► Modal "Edit {entity}" (pre-filled) ──[Save changes]──► toast ► list reloads
  └──[🗑 row]──► Confirm "Are you sure?" ──[Yes]──► toast ► list reloads
```

**Rules**
- It looks like a **self-contained window** with its own close ✕ and Close button, both going to a fixed parent hub.
- **Esc navigates back** when no modal is open.
- Add hides without the *create* permission. Edit and delete render only for *sensitive-access* users.
- Pages can **swap edit/delete for custom row actions** (view, print, approve). The actions column then reads "View".
- The create form shows the **next ID read-only** so users know what they're creating.
- The list reloads after every mutation and whenever the scope changes. It never shows stale data after a save.

---

### C. Report

**Purpose:** Answer "how are we doing?" for a period and scope.

**Opens with:** A default period (usually today) already applied. KPIs are visible without scrolling.

```
 ← Back to reports                                         REPORT TITLE
                                       subtitle: what this report covers
                                       caption: what the numbers measure,
                                       and where to find the complementary view
┌ filters: period presets | custom range | scope | [apply] ────────────────────┐
┌ KPI ┐ ┌ KPI ┐ ┌ KPI ┐ ┌ KPI ┐                       ← headline figures, each with a sub-breakdown
┌──────────── statement (label ........ value), indented sub-lines ───────────┐  ← how the headline adds up
┌──────── trend chart (2/3) ─────────┐ ┌──── composition chart (1/3) ────┐      ← visual
┌──── breakdown table ────┐  ┌──── exceptions / alerts table ────┐               ← detail and action items
```

**Reading order is the information hierarchy:** headline → how it adds up → trend → breakdown → exceptions.

**Rules**
- **Explain the measure in the header** (P8). *In the source:* one report measures what was *invoiced*, another what was *collected*. Each says so and points to the other.
- A KPI card may carry a **sub-breakdown** (for example retail vs wholesale) and a **diagnostic note** when a value is zero because configuration is missing.
- Every KPI card **states its time domain**: "current balance" (a point in time) vs "during the period" (a flow).
- Long ledgers keep **the header and the totals row pinned** while the body scrolls.
- An **integrity panel** above a ledger reports whether the books balance before the user reads the detail.

---

### D. Transactional workspace (point of sale)

**Purpose:** Repeat one transaction quickly, all day.

**Opens with:**
1. **Shift check first.** If no shift is open → *Start shift* dialog. If another user holds the shift, or the last shift awaits review → a **full-screen block** explaining who or what is blocking and what to do.
2. Then: all products for the active scope, the first category selected, search ready, and an empty cart assigned to the default walk-in customer (the customer picker is hidden).

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ [End shift][Return][Courier debts][Prep queue ③][History][🔔]   date·shift·clock·branch·operator │ CONTEXT STRIP
├──────────────── CART PANEL (fixed width) ────────┬──────── CATALOG (flexible) ──────────┤
│ (customer picker, revealed only when needed)     │ [search…]              breadcrumb · back │
│ ── line items ─────────────────────────────────  │ [‹] [cat][CAT][cat][cat] … [›]          │
│   item ........................ total            │ ┌────┐┌────┐┌────┐┌────┐┌────┐          │
│   qty × unit price                ▐ selected     │ │name││    ││    ││    ││    │          │
│ ── payment: [Cash][Wallet][Card][Delivery] ────  │ │stk ││    ││    ││    ││    │ 2 → 5 cols│
│ ── discount (type, value, reason)                │ │$$  ││    ││    ││    ││    │          │
│ ── TOTAL (largest text on screen)                │ └────┘└────┘└────┘└────┘└────┘          │
│    subtotal · discount · tax · fee lines          │                                        │
│ ── [Print] [Cancel] [Hold / Held carts ●]         │                                        │
└──────────────────────────────────────────────────┴────────────────────────────────────────┘
 mobile: one panel at a time + bottom tab bar  [ Products | Cart (n) • ]
```

**The quantity keypad.** Tapping a product **doesn't add it straight away**. The cart panel splits: the line list shrinks to about 45% of its height and a **keypad takes the bottom 55%**. The keypad has a mode for each kind of quantity:

| Mode | Keypad | Why |
|---|---|---|
| Piece | Number pad + "10" + custom field + Cancel / Confirm | Counting |
| Weight | Presets **⅛, ¼, ½, 1** + custom field + Cancel / Confirm | The weights customers actually ask for, in one tap |
| Payment | Total + big buttons for each payment method | Final confirmation |

**Rules**
- **The total is the most prominent element** on the screen. The breakdown lines sit under it.
- **Payment methods are one-tap buttons**, never a dropdown. Each method is visually distinct from the others.
- **Enter completes the sale as exact cash** (see [§16](#16-keyboard-and-efficiency)).
- **Cart line selection:** tap a line to select it. It gets a strong marker, and only then does a delete control appear. Unselected lines reserve that space so nothing shifts.
- **Hold / resume:** "Hold" parks the current cart. When the cart is empty, the same button becomes "Held carts", with an indicator when any are waiting. Held carts survive a reload.
- **Contextual reveal:** the customer picker is hidden for walk-in sales and appears only when a flow needs a named customer (delivery). When it appears, it gets focus, and a message explains why.
- **Stock guard:** you can't add more than is available. The error names the available quantity, and products that can be made automatically show how many.
- **Quick actions in the context strip** have **equal size** and show live counters where something is waiting.

---

### E. Guided workspace (multi-step intake)

**Purpose:** Capture a transaction that needs **several dependent pieces of information** before items can be added. *In the source:* phone orders.

**Opens with:** The phone field focused, steps 2–3 waiting, the catalog **locked** with its reason shown, and the command bar showing "—" with an alert marker on every missing piece.

```
┌ COMMAND BAR (sticky): Branch: — ⚠ · Customer: — ⚠ · Items: — ⚠ · Total: 0       [? shortcuts] ┐
│ each segment is clickable and scrolls to or focuses its section                                │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
  [Orders list] [context chips…]                                       eyebrow / PAGE TITLE
┌── C · CART RAIL (3/12) ──┐ ┌─────── B · CATALOG (5/12) ────────┐ ┌──── A · FORM (4/12) ──────┐
│ receipt-style lines      │ │ status: [waiting ⚠] → [ready ✓]   │ │ ① Customer                │
│ − qty + · remove         │ │ [search… (press /)]  ← locked     │ │ │ phone → live matches    │
│ edit weight              │ │ [category tabs]                    │ │ │ last order ↻ (1 click)  │
│ discount                 │ │ ┌──┐┌──┐┌──┐  keyboard grid        │ │ │ name · address · notes▸ │
│ subtotal · fee · total   │ │ └──┘└──┘└──┘                       │ │ ② Branch     (chips)      │
│ [Send order]             │ │                                    │ │ ③ Delivery zone (chips+fee)│
│ "why can't I send?" line │ │                                    │ │ [Save customer record]    │
└──────────────────────────┘ └────────────────────────────────────┘ └───────────────────────────┘
        12-column grid at desktop (4 / 5 / 3); stacks vertically below it
```

**Rules**
- **The columns follow the task order** in the reading direction: who → what → total and send.
- **Step states:** *pending* (muted number), *active* (emphasized number), *complete* (check mark). Each step's content hangs off a vertical rail, so the sequence reads at a glance.
- **Progressive gating with reasons:** the catalog search is disabled until the customer data is complete, and its placeholder **says what is missing**. A status pill switches from "waiting" to "ready".
- **The submit blocker is spelled out:** next to Send, a line explains the current reason it can't be sent, instead of only greying out the button.
- **Choices are chips, not dropdowns**, when there are few of them (branches, zones). A chip can carry a value (the zone's delivery fee).
- **Lookup by the natural key:** typing a phone number shows matches live. Enter takes the first match. With no match, focus moves to the name field and a "new customer" notice appears.
- **Reuse past work:** the customer's last order shows as a card with one-click reorder.
- **Low-priority fields start collapsed** (notes).
- The command bar is a **live summary** of the whole form, so the agent never has to scroll to check the state.

---

### F. Document entry

**Purpose:** Enter a formal multi-line document: a purchase invoice, stock transfer, or cash transfer.

**Opens with:** An empty document, header fields defaulted from context (scope, today, the next number), the first input focused. If a saved draft exists, a **"restore draft" banner** appears above the lines.

```
 [Held drafts] [History]                                           DOCUMENT TITLE
┌ HEADER: party · location · date · reference (dense grid) ────────────────────────┐
┌ LINES: item · qty · unit cost · total · remove      [+ add line]                 ┐
│ (wide → scrolls horizontally on small screens)                                    │
┌──────── TOTALS (2/3) ─────────────────────┐ ┌──── SETTLEMENT (1/3) ─────────────┐
│ subtotal · discount · tax · net           │ │ ⚠ "source balance is insufficient"  │
│                                           │ │ ( ) Cash  ( ) Card  ( ) Deferred    │
│                                           │ │ ( ) Mixed → split amount fields     │
│                                           │ │ [Save document]                     │
└───────────────────────────────────────────┘ └─────────────────────────────────────┘
```

**Variant: picker + sidebar** (stock transfer). The catalog takes the main area as a **multi-select grid** (checkboxes; items already added are marked; flagged items carry a badge), with "select all / clear" actions and a **bulk-quantity bar** that applies one quantity to the whole selection. The document builds in a **sidebar**: header form, line list, and a footer with totals and Submit.

**Variant: route visualizer** (cash transfer). A narrow single card shows **source → destination** as a diagram with the amount between them, so it's obvious which way the money moves.

**Rules**
- Settlement options are **large selectable cards**. Choosing *Mixed* reveals the split fields (progressive disclosure).
- **Warn before submit**, not after: an insufficient balance or exceeded credit is shown inline as soon as it's known.
- **Hold draft / resume** from a list of held drafts.
- **Leaving with unsaved changes asks for confirmation.**
- Every successful save offers or produces a printable document.

---

### G. Approval inbox

**Purpose:** Let a supervisor act on requests other people made: cash transfers, stock transfers, closed shifts.

**Opens with:** The list filtered to **Pending**, newest first.

```
 Title                                            [Pending ▸][Approved][Rejected][All]   ← status filter
┌──────────────────────────────────────────────────────────────────────────────────┐
│ request summary (from → to, amount, by whom, when)   [status chip]   [Approve][Reject] │
│ …                                                                    (only when pending)│
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Rules**
- Actions appear **only for statuses that allow them**. Finished items are read-only.
- Approve, reject, and reopen confirm first, then update the row's status in place.
- For **shifts**: *Approve* only while it's pending review. *Reopen* both from pending review (send it back instead of approving) and from closed (undo an approval). Reopen asks for a reason.

---

### H. Master-detail (reconciliation)

**Purpose:** Work through a list of parties one at a time, settling each. *In the source:* courier settlements, stock write-offs, opening stock.

```
┌──────────── DETAIL (selected party) ────────────────┬──── MASTER LIST ─────────┐
│ action header: name · amounts due · [Settle]         │ summary strip (totals)    │
│ ─ pending items table (select rows, per-row actions) │ [search]                  │
│ ─ totals for what's displayed                         │ [select all / bulk strip] │
│ ─ notes / extra dues · pay now                        │ ▸ party A   amount        │
│                                                       │   party B   amount        │
│ (alternate view: daily report)                         │   …                       │
└───────────────────────────────────────────────────────┴───────────────────────────┘
```

**Rules**
- The list always shows **each party's outstanding amount**, so the user picks who needs attention.
- The detail has a **work view** and a **report view** for the same party or day.
- Per-row actions inside the detail **don't toggle row selection** (the click areas are kept separate).
- Before recording a write-off, the dialog **shows its financial impact** (cost to be charged) so the user confirms the consequence, not just the quantity.

---

### I. Entity detail

**Purpose:** Everything about one important record (a wholesale customer, an order).

**Opens with:** The identity header (name, key attributes, credit status badge) and the first tab.

```
 breadcrumb / eyebrow
 ENTITY NAME                                    [primary actions]
 [Overview][Orders][Ledger][Prices]             ← tabs
┌ info card ┐┌ info card ┐                     ← 2-col facts
┌ summary ┐┌ summary ┐                          ← totals: billed, paid, open
┌───────── chronological ledger (date · type chip · ref · debit · credit · balance) ─────────┐
```

**Rules**
- Status-like facts are badges in the header (for example "over credit limit").
- Long text in a table cell is truncated, and the full value is available on hover or focus.

---

### J. Settings

**Purpose:** Configure behavior. Rarely visited, so clarity beats density.

**Opens with:** The current values loaded, one narrow column (≈ 900 px).

```
 TITLE / description
┌ Section: Operational ─────────────────┐   each section: heading + icon,
│ field        field                     │   2-col field grid, helper text under fields
┌ Section: HR ──────────────────────────┐
┌ Section: Shifts (morning | evening) ──┐
┌ Section: Feature toggles ─────────────┐
│ [☑] Toggle title                        │   full-width clickable row: control + title +
│     explanation of the effect           │   one-line consequence
└─────────────────────────────────────────┘
                                 [Save changes]   ← one save for the page, shows progress
```

**Rules:** group by *who is affected*, explain every toggle's effect in one line, use a single save button at the end, and confirm with a toast.

---

### K. Import

**Purpose:** Bulk-load entities from a file.

```
 TITLE · "How it works" (3 numbered steps)
 [Items][Clients][Suppliers][Employees]…   ← tab per entity
┌ active entity card ─────────────────────────────┐
│ expected columns hint · scope note               │
│ ┌ drop zone: drag a file or click ┐  [template]  │
│ result: n imported · m failed (with reasons)     │
└──────────────────────────────────────────────────┘
```

---

### L. System pages

| Page | Content | Exits |
|---|---|---|
| Login | Centered card: product mark, greeting, two fields with leading icons, a full-width submit that shows progress | Goes to the requested page on success |
| Access denied | Big icon, title, plain explanation, "ask your administrator" | **Go back**, **Go home** |
| Not found | Code, title, explanation | **Go home**, **Go back** |
| User manual | Sticky top bar, table of contents (sticky sidebar on desktop, drawer on mobile), numbered sections | Back |

---

## 7. Choosing an archetype

| If the user needs to… | Use |
|---|---|
| Pick where to go | **A. Hub** |
| Maintain a list of simple entities | **B. Record manager** |
| Understand performance over a period | **C. Report** |
| Repeat one fast transaction all day | **D. Transactional workspace** (full-screen shell) |
| Capture dependent information before a transaction | **E. Guided workspace** |
| Enter a formal multi-line document | **F. Document entry** |
| Approve or reject other people's requests | **G. Approval inbox** |
| Settle or reconcile parties one by one | **H. Master-detail** |
| See everything about one rich record | **I. Entity detail** |
| Change system behavior | **J. Settings** |
| Load data in bulk | **K. Import** |

---

# Part III: Flows

## 8. Core user flows

Notation: `[Button]`, `(state)`, `⟶` user step, `⇒` system response, `⚠` safeguard.

### 8.1 Sign in and land

```
Open app ⇒ (signed in?) ─no─► Login ⟶ enter credentials ⟶ [Sign in] ⇒ progress on button
                                   ├─ error ⇒ error toast (+ how-to-fix hint if provided)
                                   └─ ok ⇒ success toast ⇒ requested page | Home | Admin console
Home ⇒ shows only permitted tiles
```

### 8.2 Maintain master data

```
Home ⟶ [Master data] ⟶ [Items] ⇒ record manager, list loaded for active scope
  ⟶ [+ Add new] ⇒ modal, ID shown read-only, first field ready
  ⟶ fill ⟶ [Save & add another] ⇒ toast, form cleared, modal stays     (repeat)
  ⟶ [Save & close] ⇒ toast, modal closes, list reloads
  ⟶ row [✎] ⇒ pre-filled modal ⟶ [Save changes]
  ⟶ row [🗑] ⇒ ⚠ confirm ⟶ [Yes] ⇒ toast, list reloads
  ⟶ Esc ⇒ back to the Master-data hub
```

### 8.3 Point-of-sale sale (walk-in)

```
Open POS ⇒ ⚠ shift check ─(none)─► Start-shift dialog ⟶ confirm ⇒ shift open
                          ─(held by someone else / awaiting review)─► full-screen block (explains why)
⟶ pick category ⟶ tap product ⇒ keypad opens (piece or weight mode)
⟶ tap ½ (or digits) ⟶ [Confirm] ⇒ line added (cart bumps) | ⚠ "only n available"
⟶ (repeat)
⟶ optional: discount ⇒ ⚠ reason required
⟶ press Enter  ─or─ tap [Cash]/[Wallet]/[Card] ⇒ payment confirmation
⟶ Enter / [Confirm] ⇒ sale saved ⇒ receipt prints ⇒ cart cleared, ready for the next sale
```

Side paths: **[Hold]** parks the cart; **[Held carts]** resumes one; **[Print]** re-prints the last receipt; **[Cancel]** clears the cart.

### 8.4 Delivery order: from the counter to settlement

```
POS ⟶ [Delivery] ⇒ ⚠ needs a named customer
        └─ walk-in? ⇒ customer picker revealed + focused + message
⟶ pick or create customer ⟶ delivery dialog: zone (fee), address ⟶ confirm
⇒ order sent to the PREPARATION QUEUE (toast names the zone)

Preparation queue (opened from the POS context strip, badge = waiting count)
  tabs with counts: [New] [Preparing] [Ready]
  order card: age (more urgent the older it gets) · customer · items · totals · one next-step button
  [Start preparing] ⇒ moves to Preparing  ⇒ tab follows the order automatically
  [Ready for delivery] ⇒ moves to Ready
  [Send] ⇒ ⚠ requires picking a courier ⇒ Out for delivery

Courier settlement (master-detail)
  pick courier (list shows amounts owed) ⇒ pending orders ⟶ select ⟶ [Settle] ⇒ receipt prints
```

### 8.5 Phone order (call center → branch)

```
Agent: phone ⟶ Enter ⇒ match picked | new-customer notice ⇒ name ⟶ address
       ⟶ branch chip ⟶ zone chip (fee shown) ⇒ catalog unlocks ("ready")
       ⟶ add items (keyboard grid; weight dialog for weighed items)  | Alt+R reorder last
       ⟶ Ctrl+Enter / [Send order] ⇒ ⚠ blocker reason shown if anything is missing
Branch POS: ⇒ sound + browser notification + bell badge ⇒ order appears in the preparation queue (8.4)
```

### 8.6 Return / refund

```
POS ⟶ [Return] ⇒ return dialog shows RECENT SALES (no typing needed for the common case)
  ⟶ or search by invoice number (server search; out-of-date replies are discarded)
  ⟶ pick sale ⇒ lines with returnable quantities ⟶ choose lines and quantities
  ⟶ ⚠ supervisor credentials ⟶ confirm ⇒ refund recorded ⇒ receipt
```

### 8.7 Shift lifecycle

```
(none) ──start──► OPEN ──[End shift]: count the cash, type the actual amount──► verification
   verification screen: expected vs actual vs difference ──confirm──► PENDING_REVIEW
   ⇒ shift report prints
   while PENDING_REVIEW: the next POS session at the branch is blocked (full-screen gate explains why)

Supervisor, Shift management (approval inbox):
   PENDING_REVIEW ──[Approve]──► CLOSED (difference posted)
   PENDING_REVIEW ──[Reopen + reason]──► OPEN
   CLOSED ──[Reopen + reason]──► OPEN
```

### 8.8 Request → approve (stock or cash transfer)

```
Requester: document entry ⟶ source (fixed to own scope unless global) ⟶ destination
           ⟶ lines / amount ⟶ ⚠ confirm summary ⟶ submit ⇒ PENDING ⇒ printable slip
Approver:  inbox (Pending) ⟶ [Approve] ⇒ APPROVED (stock or money moves)
                            ⟶ [Reject]  ⇒ REJECTED
```

### 8.9 Purchase invoice

```
Purchases ⟶ supplier · warehouse · date ⟶ add lines ⟶ totals update live
  ⟶ settlement: Cash | Card | Deferred | Mixed(split)
     ⇒ ⚠ inline warning if the paying account's balance is insufficient
  ⟶ [Save] ⇒ toast ⇒ receipt
  side paths: [Hold] / [Held drafts]; navigating away with changes ⇒ ⚠ leave confirmation
  return: from history ⟶ return dialog (needs the "purchase returns" action permission)
```

### 8.10 Wholesale order

```
Wholesale area tabs: [Point of sale] [Collections] [Orders]
POS ⟶ pick customer (credit badge: open balance vs limit) ⟶ catalog ⟶ cart ⟶ [Confirm]
  ⇒ confirm dialog: summary · method (pills) · amount · account · bank ref / cheque fields (per method)
  ⇒ ⚠ credit limit exceeded ⇒ inline banner with the numbers; order not placed
  ⇒ ok ⇒ order status: CONFIRMED | PARTIALLY_PAID | PAID ⇒ invoice (print / PDF)
Collections ⟶ record payment against open orders
Order detail ⟶ [Return] ⇒ return dialog ⇒ RETURNED
```

### 8.11 Stock count, opening stock, write-off

```
Inventory ⇒ [Stock] tab: KPIs (total items, shortages, value…) + filterable table
           ⟶ [Hide zero stock] [Scope] [Category chips] [Search]
           ⟶ [Print count sheet] ⇒ ⚠ asks first: include prices? ⇒ A4 sheet
           ⟶ [Export] ⇒ CSV of exactly the filtered rows
         ⇒ [Opening stock] tab (adds stock)     ← must look clearly different from ↓
         ⇒ [Write-off] tab (removes stock; separate permission)
              master-detail: product list | details + history
              [Record write-off] ⇒ dialog shows the cost impact ⇒ confirm ⇒ history row
```

### 8.12 Reporting

```
Home ⟶ [Reports] ⇒ report hub
  ⟶ [Summary] ⇒ report (default period applied) ⟶ change period/scope ⟶ [Apply]
  ⟶ [History logs] ⇒ history hub ⟶ a log ⇒ record manager in read-only mode + filter strip
  ⟶ "Back to reports" (structural) or Back (history)
```

---

## 9. Lifecycle and status models

Every entity with a lifecycle shows its status as a **chip**, uses **one tone per status role**, and offers **only the actions that are valid for that status**.

| Entity | Statuses (in order) | Terminal |
|---|---|---|
| Shift | Open → Pending review → Closed (↺ Reopen from either) | — |
| Transfer (stock or cash) | Pending → Approved / Rejected | Approved, Rejected |
| Delivery order | New → Preparing → Ready → Out for delivery → Delivered | Delivered, Cancelled |
| Wholesale order | Draft → Quoted → Confirmed → Partially paid → Paid | Paid, Cancelled, Returned |
| Ledger entry | Order · Payment · Refund | — |

**Status role → meaning** (map these to your own palette):

| Role | Used for |
|---|---|
| Neutral | Draft, not started |
| Primary | Confirmed / active / in your hands |
| Pending | Waiting for someone, partial, low stock, "adds" operations |
| Success | Paid, approved, complete, ready, enough stock |
| Danger | Cancelled, rejected, shortage, out of stock, "removes" operations, costs |
| Distinct (returns) | Returned, refunded |
| Info | History, neutral secondary actions |

Rule from the source: **operations with opposite effects must never share a tone.** "Opening stock" (adds) and "Write-off" (removes) are deliberately kept visually distinct.

---

# Part IV: Components

## 10. Component architecture and separation

### 10.1 Layers

```
┌────────────────────────────────────────────────────────────────────────┐
│ 6. Pages             one per route; composes templates + features       │
├────────────────────────────────────────────────────────────────────────┤
│ 5. Templates         Hub · RecordManager · Report · Workspace · …       │  page archetypes (§6)
├────────────────────────────────────────────────────────────────────────┤
│ 4. Feature modules   pos/ · bulk/ · orders/ · shifts/ · inventory/ …    │  domain dialogs, panels, print layouts
├────────────────────────────────────────────────────────────────────────┤
│ 3. Shared composites DataTable · FilterForm · DateFilterBar · Confirm   │  domain-agnostic, reusable
├────────────────────────────────────────────────────────────────────────┤
│ 2. Primitives        Modal · Toast · QuantityInput · Chip · StatusChip  │  no business knowledge
├────────────────────────────────────────────────────────────────────────┤
│ 1. Cross-cutting     contexts (scope, realtime) · hooks (confirm,       │  available everywhere
│                      prompt) · services (one per domain) · config        │
└────────────────────────────────────────────────────────────────────────┘
```

Each layer may only use the layers **below** it.

### 10.2 Separation rules the source follows (and you should keep)

1. **Config drives navigation.** Hubs and the permission matrix read a single module registry. No page hard-codes the list of modules.
2. **One service per domain** (`itemService`, `shiftService`, `orderService`, …). Components never call the network directly, and templates take a `service` prop with a uniform `getAll / create / update / delete` contract.
3. **Templates take behavior as props, not by copying code.** A record manager is configured with `title, subtitle, icon, service, columns, FormComponent, FilterComponent, customActions, headerActions, backPath, emptyMessage`. A new master-data screen is about 100 lines: a form plus column definitions.
4. **Forms don't know where they live.** A form receives `initialData, onSave(data, keepOpen), onClose, isSaving` and reports back. The template decides create vs update, toasts, and reloading.
5. **Cross-cutting state goes in a context:** active scope, realtime events. Everything else is local to the page.
6. **Imperative dialogs go through hooks.** `const ok = await confirm({...})` and `const value = await prompt({...})` keep dialog state out of the page's logic.
7. **Print layouts are separate components** (one per document type). They're never the on-screen component with print styles bolted on.
8. **Feature folders keep a workflow together.** All of a workflow's dialogs and panels live next to each other (`pos/`, `bulk/`, `shifts/components/`).
9. **Big pages break into named sub-components by region.** *In the source:* the guided workspace is `CommandBar`, `Step`, `BranchChips`, `ZoneChips`, `ItemsGrid`, `CartDrawer`, `LastOrderCard`, and `WeightPickerModal`.
10. **Pure logic lives outside components and has tests** (reorder logic, date ranges, PDF generation, the event stream).

### 10.3 Recommended folder layout

```
src/
  config/        modules registry, roles
  contexts/      ScopeContext, RealtimeContext
  hooks/         useConfirm, usePrompt
  services/      apiClient + one file per domain
  layouts/       StandardShell, AdminShell, (workspace shell lives in its page)
  components/
    ui/          primitives
    shared/      domain-agnostic composites + templates
    <domain>/    feature components (dialogs, panels, print layouts)
  pages/
    <area>/      route pages; complex pages get a components/ subfolder
  utils/         pure helpers (dates, formatting, printing)
```

---

## 11. Component catalog (by responsibility)

Contracts describe **what a component does and decides**, not how it looks.

### 11.1 Shell and navigation

| Component | Responsibility | Key behavior |
|---|---|---|
| **StandardShell** | Top bar, content column, footer | Fixed bar; refreshes the profile on navigation (throttled); logout confirmation |
| **AdminShell** | Sidebar console | Active-section marker; sidebar becomes a drawer on mobile |
| **ProtectedRoute** | Access control | `requiredRole`, `requiredPermission` (string or any-of array) → login / home / access-denied |
| **ScopeSwitcher** | Show and change the active scope | Label for single-scope users; dropdown for multi; "All" for global; closes on outside click |
| **UserMenu** | Identity and logout | Outside click closes; logout asks for confirmation |
| **HubTile** | One destination | Whole tile is the target; icon + title + purpose |
| **SectionTabs** | Route-based sibling navigation | Active state from the current route |
| **SegmentedTabs** | Mode switch within a page | Optional per-tab tone; permission-gated tabs |
| **Step** | One step of a guided flow | `number, label, complete, active` → pending / active / complete |
| **CommandBar** | Live summary of a long form | Segments with alert markers; clicking scrolls to or focuses the section; shortcut help |

### 11.2 Data display

| Component | Responsibility | Key behavior |
|---|---|---|
| **DataTable** | Show rows | `columns[{header, accessor, render, wrap}]`, sticky header, inner scroll, loading row, empty row, `dense` mode, actions column (edit/delete or custom), print mode |
| **Pagination** | Page through rows | "Showing a–b of n"; prev/next disabled at the bounds; a window of page numbers |
| **KpiCard** | One headline figure | Label, value, optional sub-breakdown, optional diagnostic note, **time-domain caption** |
| **SummaryCard** | A small total | `label, value, tone` |
| **StatusChip** | One lifecycle status | Status → label + tone from a single map |
| **CreditBadge** | Open balance vs limit | Flags over-limit; "unlimited" when no limit is set |
| **CountBadge / Dot** | Something is waiting | A count on an action; a pulsing dot for "attention" |
| **Statement** | "Label ....... value" lines | Indented sub-lines, subtotal rows |
| **Ledger** | Chronological entries | Pinned header and totals |

### 11.3 Input

| Component | Responsibility | Key behavior |
|---|---|---|
| **Field** | Label + control + helper | Leading icon; required marker; read-only variant |
| **FilterForm** | Search + scope + date range | Apply and reset; reset re-queries with defaults; scope list limited by role |
| **DateFilterBar** | Choose a period | Presets (today, yesterday, last 7, custom); custom reveals from/to + apply; a reversed range is swapped |
| **ChipSelect** | Pick one of a few | Chips can show an attached value |
| **QuantityKeypad** | Enter a count | Digits, a quick "10", custom, cancel/confirm |
| **WeightSelector** | Enter a weight | Fraction presets + custom |
| **DiscountPanel** | Apply a discount | Type (amount/percent), value, **required reason** |
| **SearchSelect** | Find and pick a record | Live results dropdown; Enter = first result; outside click closes |
| **ToggleRow** | A boolean setting | Whole row clickable; title + consequence text |
| **DropZone** | Upload a file | Drag or click; shows the result summary |
| **PaymentMethodPicker** | Choose how to pay | Large one-tap options; *Mixed* reveals split fields |

### 11.4 Overlays and safeguards

| Component | Responsibility | Key behavior |
|---|---|---|
| **Modal** | Host a focused task | Backdrop click and Esc close; header with icon + title + close; scrollable body; **full screen on mobile**; stackable via a z-order prop |
| **ConfirmDialog** + `useConfirm` | Yes/no | Promise-based; `tone: "danger"` makes the confirm button destructive |
| **PromptDialog** + `usePrompt` | Ask for one value | Enter submits, Esc cancels |
| **SupervisorAuthDialog** | Authorize an override | Supervisor username + password; explains why it's needed; focuses the first field |
| **BlockingGate** | Stop work that would break integrity | Full screen; explains the cause and who is involved; offers only valid next steps |
| **LeaveGuard** | Protect unsaved work | Confirms before navigating away from a dirty form |
| **ShortcutsDialog** | Teach the keyboard | A table of key → action, opened with `?` |

### 11.5 Feature components (from the source, as templates)

| Component | Responsibility |
|---|---|
| **StartShiftDialog / EndShiftDialog / ShiftVerification / ShiftApproval / ShiftReopen** | Each step of the shift lifecycle has its own dialog |
| **PreparationQueue** | Kanban-like queue: tabs with counts, one next-step action per card, auto-follow to the next tab, urgency by age, courier required to dispatch |
| **HeldCarts / HeldDrafts** | List, resume, delete, clear all |
| **RefundDialog** | Recent sales, search, pick lines, authorize |
| **OrderHistoryDialog** | Look up and re-print past transactions |
| **DeliveryDialog** | Zone, fee, address for a delivery sale |
| **WeightPickerDialog** | Weight entry with Enter/Esc |
| **ConfirmOrderDialog** | Order summary + method-specific fields + credit check |
| **Print layouts** | Receipt, shift report, transfer slip, settlement receipt, invoice, count sheet |

---

# Part V: Interaction

## 12. Interaction patterns

| Pattern | Description | Where |
|---|---|---|
| **Tap-then-quantify** | Choosing an item opens a quantity input in context instead of adding 1 blindly | POS keypad, weight dialog |
| **Presets before free input** | Offer the common values as one-tap buttons, with "custom" as the fallback | Weights, date ranges, payment methods |
| **Select-to-reveal** | Destructive per-row controls appear only on the selected row | POS cart line delete |
| **Progressive disclosure** | Hide optional or rare fields until needed | Notes, customer picker for delivery, mixed-payment split, custom date range |
| **Progressive gating** | Lock later parts until earlier ones are valid, **with the reason shown** | Guided workspace catalog and submit |
| **Smart defaults** | Prefill from context: scope, today, the next number, the walk-in customer | All forms |
| **Save and continue** | Keep the form open for the next record | Record-manager create |
| **Park and resume** | Hold the current work and come back to it | Carts, purchase drafts |
| **Draft restore** | Offer to restore unsaved work on return | Stock transfer |
| **Reuse history** | Reorder the last order; recent sales listed before search | Call center, refunds |
| **Auto-follow** | After a status change, the view moves to where the item went | Preparation queue tabs |
| **Live summary** | A sticky bar mirrors the state of a long form | Call-center command bar |
| **Inline consequence** | Show the effect of an action before it is confirmed | Write-off cost impact, insufficient balance, credit limit |
| **Ask before output** | Confirm output options before generating | "Include prices?" before printing the count sheet |
| **Export what you see** | Export follows the active filters exactly | Inventory CSV |
| **Bulk selection** | Multi-select + "apply to all" bar | Stock transfer picker, courier settlement |
| **Discard stale replies** | Ignore search responses for an older query | Refund invoice search |

---

## 13. State design

Every data region must define all of these states. *In the source* each is implemented as follows:

| State | Treatment |
|---|---|
| **Initial / loading** | A spinner row inside the table area (table shape kept); skeleton placeholders for KPI values; progress inside the triggering button |
| **Empty** | A specific sentence naming the entity ("No warehouses added yet."), optionally with a large faded icon. Never a blank area. |
| **Populated** | Normal |
| **Filtered to nothing** | The same empty message, plus a visible reset filters action |
| **Error** | A toast with the error message; if the server supplies a fix, a **"how to fix"** hint line; the region keeps its last good data |
| **Saving** | The action button is disabled and shows progress; double submits prevented |
| **Disabled with reason** | Never disable silently: a placeholder, an inline note, or a blocker line says why |
| **Blocked** | A full-screen gate for integrity problems (shift conflict) |
| **Stale-proof** | Data reloads after every mutation and every scope change |
| **Offline / reconnecting** (realtime) | The event stream reconnects automatically; nothing is shown to the user for brief drops |

---

## 14. Feedback and safeguard ladder

Match the strength of the response to the risk of the action:

| Level | Mechanism | Use for | Dismissal |
|---|---|---|---|
| 0 | **Inline state change** | Selecting, toggling, adding a line | — |
| 1 | **Toast (success)** | Every completed mutation | Auto (≈ 4 s) |
| 2 | **Toast (error + fix hint)** | Failed actions, rule violations ("only 3 available", "pick a reason") | Auto (≈ 4–6 s) or ✕ |
| 3 | **Inline warning** | Predictable problems *before* submit (balance, credit, missing setup) | Disappears when resolved |
| 4 | **Confirmation** | Delete, logout, leave with unsaved changes, approve/reject | Explicit choice |
| 5 | **Confirmation + reason** | Reopen a shift, discount | Explicit choice + input |
| 6 | **Supervisor credentials** | Refunds and other overrides of the operator's authority | Valid credentials |
| 7 | **Blocking gate** | The system can't safely continue (conflicting shift) | Only by resolving the cause |

**Message rules**
- Success: past tense, names the object ("Item added successfully").
- Error: what failed + the constraint or the fix ("Quantity unavailable. In stock: 3").
- Confirm: a direct question about the consequence ("Delete this record?"). The destructive option is visually marked.
- Toasts appear in a consistent spot, and **confirmation toasts stay until answered**.

---

## 15. Permissions and context-aware UI

| Granularity | Mechanism | Effect |
|---|---|---|
| Area | Role (`superadmin`) | Admin console reachable or not |
| Page | Route permission (any-of list) | Page reachable, or the access-denied page |
| Hub tile | Registry + permission | Tile rendered or absent |
| Button / tab | Action permission (`SALES_RETURNS`, `STOCK_WRITE_OFF`) | Control rendered or absent |
| Row actions | "Sensitive access" flag | Edit/delete rendered or absent |
| Field | Role scope | Editable selector vs read-only label |
| Data | Active scope | Rows limited to the branch; "All" only for global roles |

Rules
- **Hide, don't disable**, for permission reasons. Disable only for *state* reasons, and give the reason.
- The frontend hides, but **the server is the authority**. The UI hides as a courtesy.
- Permission changes take effect without a re-login (silent profile refresh).

---

## 16. Keyboard and efficiency

| Scope | Key | Action |
|---|---|---|
| Global overlays | `Esc` | Close the top overlay |
| Record manager | `Esc` (no overlay) | Back to the parent hub |
| POS | `Enter` | Complete the sale as exact cash; when the payment confirmation is open, confirm it |
| POS | `Enter` is **ignored** | When any other overlay or dropdown is open, or on key repeat |
| Guided workspace | `/` | Focus search (only when not typing in a field) |
| Guided workspace | `Esc` | Clear search / close the list |
| Guided workspace | `Enter` in the lookup field | Take the first match, or move to the next field |
| Guided workspace | `Ctrl+Enter` | Submit |
| Guided workspace | `Alt+R` | Repeat the last order |
| Guided workspace | `?` | Show the shortcuts |
| Item grid | Arrow keys | Move focus by cell or by row (roving tabindex; direction-aware) |
| Small dialogs | `Enter` / `Esc` | Confirm / cancel |

Rules
- **Shortcuts are shown in the UI**: in placeholders ("press / to search") and in a `?` help dialog.
- **Global shortcuts don't fire while the user is typing**, unless they use a modifier key.
- Bind letter shortcuts by **physical key** (`code`), not character, so they work on any keyboard layout.
- A global Enter handler must **check for blocking overlays** before acting.
- Auto-focus the field that blocks progress.

---

## 17. Responsive adaptation

The source changes **structure**, not just size, at breakpoints (≈ 640 / 768 / 1024 / 1280 px).

| Element | Small screens | Large screens |
|---|---|---|
| Top bar | Icons only; scope switcher hidden; avatar only | Labels, scope switcher, name + role |
| Hub / KPI grids | 1 column | 2 → 3 (hubs) / 2 → 4–5 (KPIs) |
| Modal | **Full screen** | Centered dialog, max ≈ 90% viewport height, scrollable body |
| Transactional workspace | **One panel at a time + bottom tab bar** (Products / Cart with count and dot) | Side by side |
| Catalog grid | 2 columns | 3 → 4 → 5 |
| Guided workspace | Stacked sections in task order | 3 columns (4 / 5 / 3) |
| Admin nav | Hamburger → drawer + backdrop | Persistent sidebar |
| Form actions | Full width, stacked | Inline at the end |
| Wide tables | Horizontal scroll with a minimum width; or dense mode | Full |
| Labels on action buttons | Hidden (icon only) | Visible |
| Decorative elements | Removed | Shown |

**Touch:** every interactive target is at least **44 × 44 px**.

---

## 18. Data presentation rules

1. **Every figure says what it measures** (invoiced vs collected; retail vs wholesale).
2. **Every KPI says its time domain** (a point in time vs a period).
3. **Zero-by-misconfiguration is labeled** ("no warehouse linked to …"), so nobody takes it for real zero activity.
4. **Breakdowns sit directly under their total** as indented sub-lines.
5. **Statements read top-down as arithmetic**: (+) sales, (−) cost, = gross, (−) expenses, = net.
6. **Numbers align** (tabular figures), with currency in one consistent position.
7. **Negative and cost figures share one tone.** Signs are explicit.
8. **Empty values display as "—"**, never blank or "null".
9. **Truncated text keeps its full value** available on hover or focus.
10. **Dates are pinned to the business's time zone** for "today" and the presets, whatever the device's clock says.
11. **Live context (clock, shift) updates in place.**

---

## 19. Output flows: print and documents

| Output | Trigger | Format |
|---|---|---|
| Sale receipt | Automatically after each sale; re-print from history or the "Print" action | Thermal roll (≈ 80 mm) |
| Delivery ticket | Delivery dispatch | Thermal |
| Shift report | End shift | Thermal |
| Transfer slip | Transfer submitted | Thermal |
| Settlement receipt | Courier settled | Thermal |
| Purchase receipt | Purchase saved | Thermal |
| Wholesale invoice | Order confirmed | Print or PDF |
| Count sheet | Inventory "print count", after asking about prices | A4 |
| Report / list | Print action on lists and reports | A4 (table with borders, actions removed) |

Rules
- Print layouts are **separate components**, hidden on screen.
- On print, **all app chrome (nav, sidebars, footers, toasts, action columns) is hidden**.
- Thermal layouts favor **legibility on poor paper**: heavy weight, simple rules between sections, the grand total emphasized and set apart.
- Receipts carry identity metadata: document number, customer, operator, and delivery block when relevant.

---

## 20. Realtime awareness

- One long-lived event stream per session, which **reconnects automatically**.
- An incoming event that needs action (a new phone order for this branch) is announced through **three channels at once**: a sound, a browser notification (if allowed), and a **count badge** on a persistent bell or queue button.
- Queues update live, and their tab counts change in place.
- Realtime never interrupts input: it **announces**, and the user opens the item when ready.

---

# Part VI: Reuse

## 21. Anti-patterns found in the source (avoid)

These are UX-level problems found during the scan. Don't carry them into the new project.

1. **Several overlay implementations.** About 45 screens build their own overlay instead of using the shared modal. Focus handling, Esc, and mobile full-screen behavior become inconsistent. → **One Modal primitive.**
2. **Two toast systems and two confirmation styles** (a toast with yes/no vs a dialog). → **One toast channel, one confirm hook.**
3. **Hard-coded header icon in the shared modal** (always the same icon). → Make it a prop.
4. **Mixed languages** in system pages and the admin console. → One locale per deployment; system pages included.
5. **Physical (left/right) layout rules** in a right-to-left app. → Use logical start/end so layouts mirror automatically.
6. **Scrollbars hidden globally.** Users can't tell an area scrolls. → Hide them only on horizontal chip sliders.
7. **A disabled theme variant that can't be reached** (fully styled, never toggled). → Ship it with a switch, or remove it.
8. **Placeholder data in a live KPI** (a hard-coded trend badge). → Never show a figure that isn't computed.
9. **Fit-to-viewport heights defined differently on different pages.** → One layout variable for "viewport minus shell".
10. **Several icon sets** in one UI. → One set, for consistent meaning and weight.
11. **Admin console in a different language** from the main app. A different *look* is intended; a different language isn't.
12. **Screen font loaded from a CDN even though the local files exist.** The UI breaks typographically offline while PDFs don't. → Self-host it for everything (§1.1).

---

## 22. Reuse kit and checklists

### 22.1 Build order for a new project

1. **Module registry** (kinds: Operations, Master data, Reports, Actions, Admin) and **permission model**.
2. **Typeface:** self-hosted Cairo `@font-face` files shared by screen, print, and PDF (§1.1).
3. **Shells:** Standard, Admin, Full-screen workspace, Bare.
4. **Guards:** ProtectedRoute, access-denied and not-found pages, return-to-requested-URL login.
5. **Context:** scope switcher + scope context, with "reload on change" in every data template.
6. **Primitives:** Modal, Toast channel, `useConfirm`, `usePrompt`, Supervisor auth, Blocking gate, Leave guard.
7. **Composites:** DataTable, Pagination, FilterForm, DateFilterBar, KpiCard, StatusChip (single status map), ChipSelect, SearchSelect, Step, CommandBar.
8. **Templates:** Hub, Record manager, Report, Document entry, Approval inbox, Master-detail, Entity detail, Settings, Import, Transactional workspace, Guided workspace.
9. **Output:** print layout base (receipt + A4) and print rules.
10. **Realtime:** event stream context + badge + notification.

### 22.2 New screen checklist

**Entry**
- [ ] Which archetype is it (§7)? Which shell?
- [ ] Which permission gates it? Which actions inside it need their own permission?
- [ ] What exactly does the user see on open: defaults applied, first focus, what's loaded?

**Orientation**
- [ ] Title and one-line purpose on the start side; exit (structural back or ✕) on the end side.
- [ ] Active scope visible; data reloads when it changes.

**Interaction**
- [ ] The primary action is obvious and reachable by keyboard.
- [ ] Common values are presets; rare fields are disclosed progressively.
- [ ] Disabled controls explain why.
- [ ] Esc closes the top overlay.

**States**
- [ ] Loading, specific empty message, error with a fix hint, saving, filtered-to-nothing.

**Safety**
- [ ] Safeguard level chosen from the ladder (§14).
- [ ] Unsaved work is protected (hold, draft, or leave-guard).
- [ ] Consequences are shown before confirming.

**Data**
- [ ] Each figure states what it measures and its time domain.
- [ ] Empty values shown as "—"; numbers aligned.

**Responsive and output**
- [ ] Structure adapts on small screens (not just shrinks); targets ≥ 44 px.
- [ ] If users print it, a dedicated print layout exists.

### 22.3 New flow checklist

- [ ] Write the flow in the notation of §8 before designing screens.
- [ ] Define the entity's status model (§9) and which actions are valid in each status.
- [ ] Every status change says who can make it, what confirms it, and what document it produces.
- [ ] Map every "can't proceed" moment to a visible reason.
- [ ] Decide what announces the hand-off to the next role (badge, sound, notification, queue).
- [ ] Give the next role an inbox or queue view filtered to "needs me" by default.
