import { Prisma } from '@prisma/client';
import type { ReportPeriod } from '@purchasing-plus/shared';

import { during, type ReadRows } from './repo.js';

const eligible = Prisma.sql`
  i.state NOT IN ('REJECTED', 'CANCELLED', 'REMOVED') AND r.status NOT IN ('REJECTED', 'CANCELLED')
`;

function approvedLines(period: ReportPeriod) {
  return Prisma.sql`
    SELECT r.id AS "requestId", r."siteId", r."categoryId", p."decidedAt" AS at,
      l."itemId", l."supplierId", l."lineTotal" AS amount
    FROM scoped r JOIN "PricingRound" p ON p."requestId" = r.id
      JOIN "PricingRoundItem" l ON l."roundId" = p.id JOIN "RequestItem" i ON i.id = l."itemId"
    WHERE p.status = 'APPROVED' AND ${eligible} AND ${during(Prisma.sql`p."decidedAt"`, period)}
    UNION ALL
    SELECT r.id, r."siteId", r."categoryId", e.at, i.id,
      (e.payload->>'supplierId')::int, (e.payload->>'lineTotal')::numeric
    FROM scoped r JOIN "RequestEvent" e ON e."requestId" = r.id
      JOIN "RequestItem" i ON i."requestId" = r.id AND i.id = ANY(e."itemIds")
    WHERE e.type = 'ITEM_REPRICED' AND ${eligible} AND ${during(Prisma.sql`e.at`, period)}
  `;
}

export function spending(read: ReadRows, period: ReportPeriod, names: boolean) {
  const month = Prisma.sql`to_char((at AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Cairo', 'YYYY-MM')`;
  const amounts = Prisma.sql`,
    first_fee AS (
      SELECT DISTINCT ON (r.id) r."siteId", r."categoryId", p."decidedAt" AS at, p."deliveryFee" AS fee
      FROM scoped r JOIN "PricingRound" p ON p."requestId" = r.id
      WHERE p.status = 'APPROVED' AND p."deliveryFee" IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM "PricingRoundItem" l JOIN "RequestItem" i ON i.id = l."itemId"
          WHERE l."roundId" = p.id AND ${eligible}
        )
      ORDER BY r.id, p."decidedAt", p.number
    ), amounts AS (
      SELECT "siteId", "categoryId", at, ${names ? Prisma.sql`"supplierId"` : Prisma.sql`NULL::int`}
        AS "supplierId", amount, NULL::numeric AS fee
      FROM (${approvedLines(period)}) lines
      UNION ALL
      SELECT "siteId", "categoryId", at, NULL, NULL, fee
      FROM first_fee WHERE ${during(Prisma.sql`at`, period)}
    )
  `;
  return Promise.all([
    read(Prisma.sql`${amounts}
      SELECT s.name AS site, c.name AS category, ${month} AS month, u.name AS supplier,
        sum(amount)::text AS amount, sum(fee)::text AS fee
      FROM amounts a JOIN "Site" s ON s.id = a."siteId" JOIN "CatalogNode" c ON c.id = a."categoryId"
      LEFT JOIN "Supplier" u ON u.id = a."supplierId"
      GROUP BY s.id, s.name, c.id, c.name, month, u.id, u.name
      ORDER BY month, s.name, c.name, u.name, u.id, s.id, c.id
    `),
    read(Prisma.sql`${amounts}
      SELECT ${month} AS month, coalesce(sum(amount), 0)::text AS amount, coalesce(sum(fee), 0)::text AS fee
      FROM amounts GROUP BY GROUPING SETS ((month), ()) ORDER BY month NULLS FIRST
    `),
  ]);
}

export function suppliers(
  read: ReadRows,
  period: ReportPeriod,
  names: boolean,
) {
  return read(Prisma.sql`
    , asked AS (
      SELECT DISTINCT bs."supplierId", bi."itemId" FROM scoped r
      JOIN "RfqBatch" b ON b."requestId" = r.id
      JOIN "RfqBatchSupplier" bs ON bs."batchId" = b.id
      JOIN "RfqBatchItem" bi ON bi."batchId" = b.id
      WHERE ${during(Prisma.sql`bs."sentAt"`, period)}
    ), activity AS (
      SELECT "supplierId", count(*)::int AS asked, 0 AS won, 0 AS orders, 0::numeric AS amount
      FROM asked GROUP BY "supplierId"
      UNION ALL
      SELECT "supplierId", 0, count(DISTINCT "itemId")::int, 0, sum(amount)
      FROM (${approvedLines(period)}) lines GROUP BY "supplierId"
      UNION ALL
      SELECT o."supplierId", 0, 0, count(*)::int, 0 FROM scoped r JOIN "SupplyOrder" o ON o."requestId" = r.id
      WHERE ${during(Prisma.sql`o."sentAt"`, period)} GROUP BY o."supplierId"
    )
    SELECT ${names ? Prisma.sql`u.name` : Prisma.sql`NULL::text`} AS supplier, sum(asked)::int AS asked, sum(won)::int AS won,
      round(sum(won)::numeric / nullif(sum(asked), 0) * 100, 2)::text AS "winRate",
      sum(orders)::int AS orders, round(sum(amount), 2)::text AS amount
    FROM activity a JOIN "Supplier" u ON u.id = a."supplierId"
    GROUP BY GROUPING SETS (${names ? Prisma.sql`(u.id, u.name),` : Prisma.empty} ())
    HAVING count(*) > 0
    ${names ? Prisma.sql`ORDER BY u.id NULLS FIRST, u.name` : Prisma.empty}
  `);
}

export function priceHistory(
  read: ReadRows,
  period: ReportPeriod,
  itemId?: number,
) {
  if (!itemId) return Promise.resolve([]);
  return read(Prisma.sql`
    SELECT p."createdAt" AS date, p."unitPrice"::text AS price, s.name AS supplier,
      r.id AS "requestId", r.number, c.name AS item
    FROM scoped r JOIN "CatalogItemPrice" p ON p."requestId" = r.id
      JOIN "CatalogItem" c ON c.id = p."itemId"
      JOIN "Supplier" s ON s.id = p."supplierId"
    WHERE p."itemId" = ${itemId} AND ${during(Prisma.sql`p."createdAt"`, period)}
    ORDER BY p."createdAt", p.id
  `);
}

export function unavailable(read: ReadRows, period: ReportPeriod) {
  const events = Prisma.sql`
    FROM scoped r JOIN "RequestEvent" e ON e."requestId" = r.id
    JOIN "RequestItem" i ON i."requestId" = r.id AND i.id = ANY(e."itemIds")
    JOIN "Site" s ON s.id = r."siteId" JOIN "CatalogNode" c ON c.id = r."categoryId"
    WHERE e.type IN ('ITEM_UNAVAILABLE', 'ITEM_RESOLVED_EXTERNALLY')
      AND ${during(Prisma.sql`e.at`, period)}
  `;
  const counts = Prisma.sql`count(*) FILTER (WHERE e.type = 'ITEM_UNAVAILABLE')::int AS unavailable,
    count(*) FILTER (WHERE e.type = 'ITEM_RESOLVED_EXTERNALLY')::int AS resolved`;
  return Promise.all([
    read(Prisma.sql`
      SELECT r.id AS "requestId", r.number, e.at AS date, s.name AS site, c.name AS category,
        i.snapshot->>'name' AS item, e.type AS event,
        CASE WHEN e.type = 'ITEM_RESOLVED_EXTERNALLY' THEN e."actorName" END AS resolver,
        CASE WHEN e.type = 'ITEM_RESOLVED_EXTERNALLY' THEN e."actorRoleName" END AS role
      ${events} ORDER BY e.at DESC, e.id DESC, i.id
    `),
    read(Prisma.sql`
      SELECT s.name AS site, c.name AS category, ${counts} ${events}
      GROUP BY GROUPING SETS ((s.id, s.name, c.id, c.name), (s.id, s.name), ())
      ORDER BY s.id NULLS FIRST, c.id NULLS FIRST
    `),
  ]);
}

export function userActivity(read: ReadRows, period: ReportPeriod) {
  return read(Prisma.sql`
    , actions AS (
      SELECT r."createdById" AS actor, 'CREATED' AS type
      FROM scoped r WHERE ${during(Prisma.sql`r."createdAt"`, period)}
      UNION ALL
      SELECT e."actorId", e.type FROM scoped r JOIN "RequestEvent" e ON e."requestId" = r.id
      WHERE ${during(Prisma.sql`e.at`, period)} AND e."actorId" IS NOT NULL AND (
        e.type IN ('MANAGER_APPROVED', 'MANAGER_REJECTED', 'RETURNED_FOR_EDIT', 'PRICING_SUBMITTED',
          'PRICING_APPROVED', 'PRICING_REJECTED', 'RECEIPT_RECORDED')
        OR (e.type = 'EDITED' AND r."submittedAt" IS NOT NULL AND e.at >= r."submittedAt")
      )
    )
    SELECT u.name AS actor,
      count(*) FILTER (WHERE a.type = 'CREATED')::int AS created,
      count(*) FILTER (WHERE a.type = 'EDITED')::int AS edited,
      count(*) FILTER (WHERE a.type IN ('MANAGER_APPROVED', 'MANAGER_REJECTED', 'RETURNED_FOR_EDIT'))::int AS "managerDecisions",
      count(*) FILTER (WHERE a.type = 'PRICING_SUBMITTED')::int AS "pricingSubmitted",
      count(*) FILTER (WHERE a.type IN ('PRICING_APPROVED', 'PRICING_REJECTED'))::int AS "pricingDecisions",
      count(*) FILTER (WHERE a.type = 'RECEIPT_RECORDED')::int AS received
    FROM actions a JOIN "User" u ON u.id = a.actor
    GROUP BY GROUPING SETS ((u.id, u.name), ()) HAVING count(*) > 0
    ORDER BY u.id NULLS FIRST, u.name
  `);
}
