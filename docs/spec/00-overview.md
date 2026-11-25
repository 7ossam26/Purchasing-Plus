# 00 — Overview

Purchasing+ is an internal web app for a finishing (تشطيبات) contractor. It takes a material request from a site engineer, gets it approved, collects supplier prices over WhatsApp, gets the pricing approved, sends supply orders, and tracks receipt on site until every item is closed.

This spec is the single source of truth. It replaces `Purchasing_Plus_notes.md` and the three Q&A rounds it was built from. When the spec and anything else disagree, the spec wins. When the spec is silent, follow `docs/spec/09-assumptions.md`, then choose the conservative option and write it under "Open questions" in `docs/PROGRESS.md`.

## Deployment model

- **One company per deployment.** Each client gets its own app and its own database on Dokploy. No tenant IDs in the schema, no company-specific code.
- **Standalone.** No shared login, database or code with ERP-V2. ERP-V2 is a reference for patterns only.
- **No hard limits** on users, sites, requests, catalog size or nesting depth. Design for growth: paginate every list, index every filter column, never load a whole table into memory.

## People (all configured as data)

Roles are created in the role editor, never in code (see `01-access-control.md`). These are the roles the client is expected to set up. The first deploy seeds them once as editable sample data.

| Sample role | What they do |
|---|---|
| مهندس الموقع | Creates requests for the sites assigned to him, shows the catalog to the unit owner, records receipt on site |
| مدير الموقع | Approves, rejects or returns requests for his sites, raises urgency, edits quantities, can reject pricing |
| مسؤول المشتريات | Works on all sites: sends price requests on WhatsApp, enters prices, sends supply orders, handles remaining items |
| المحاسب | Approves pricing on all sites |
| صاحب الشركة | Sees everything on all sites, approves or rejects pricing, can cancel at any stage |
| مدير النظام (the client's admin) | Manages users, roles, master data and settings |
| Superadmin (the developer) | Not a role. A flag on the account that bypasses every check |

## Locale and formats

- Arabic only, right-to-left. One locale for the whole product, including login, errors and the admin console.
- Currency EGP with 2 decimals. Western digits everywhere (`ar-EG-u-nu-latn` in every `Intl` formatter).
- Time zone `Africa/Cairo` for "today", date presets, day boundaries and request numbering years. Store UTC.
- Typeface: Cairo, self-hosted (no Google Fonts CDN).

## Devices

- Engineer, site manager and purchasing officer work **on phones**. Every operational screen is mobile-first.
- Admin, master data and reports must also work well on desktop.
- Installable PWA (manifest + icons). No offline mode.

## Glossary

| Term | Arabic | Meaning |
|---|---|---|
| Site | موقع | A project location. Users are assigned to sites |
| Category | فئة | Top-level node of the catalog tree (كهربا، صحي، سيراميك، دهانات، أوكر ومقابض). Suppliers and requests attach here |
| Group | مجموعة | Any node below a category. Nests without a depth limit |
| Catalog item | صنف | A specific product in the tree, with code, attributes and images |
| Attribute | خاصية | A definable property (الماركة، المقاس، اللون…) with a type |
| Unit | وحدة | قطعة، متر، م²، كرتونة… (admin-editable list) |
| Request | طلب | One request for one site and one category |
| Request item | بند | One line of a request |
| Price-request batch | دفعة طلب أسعار | A set of items sent to a set of suppliers on WhatsApp |
| Pricing round | جولة تسعير | A set of priced items submitted together; it goes straight to the site engineer for receipt (no approval step since 2026-11-25) |
| Supply order | أمر توريد | WhatsApp message telling a winning supplier to deliver |
| Receipt | استلام | Quantity the engineer confirms arrived on site |
| Timeline | السجل الزمني | Per-request history of every event |

## Out of scope for v1

Printing and PDFs; uploading supplier quotes and OCR; automatic WhatsApp sending (Business API); images sent to suppliers; supplier payments and accounts; budgets; site inventory; comments on requests; sound or browser-push notifications; importing users; multi-company tenancy.

## Spec index

| File | Covers |
|---|---|
| `01-access-control.md` | Dynamic roles, permission registry, site scope, superadmin, sessions |
| `02-request-lifecycle.md` | Statuses, item states, every transition, editing rules, urgency, numbering |
| `03-purchasing.md` | Price-request batches, WhatsApp links, pricing, delivery fee, pause, supply orders, receipt, remaining items |
| `04-catalog.md` | Catalog tree, attributes, items, codes, prices, suppliers, sites, units, images |
| `05-timeline-notifications.md` | Event model, timeline UI, notifications, home inbox, aging |
| `06-reports-import-export.md` | Reports, records, Excel import and export |
| `07-ui-design.md` | Visual tokens, screens, folder explorer, mobile patterns, copy |
| `08-architecture.md` | Stack, repo layout, API conventions, testing, deployment, security |
| `09-assumptions.md` | Decisions made where the answers were silent |
