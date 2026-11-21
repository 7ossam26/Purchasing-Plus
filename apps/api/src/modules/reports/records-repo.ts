import { Prisma } from '@prisma/client';
import type {
  RecordId,
  ReportPeriod,
  ReportRow,
} from '@purchasing-plus/shared';

import { during, type ReadRows } from './repo.js';
import type { RecordFilters } from './schemas.js';

const matches = (value: Prisma.Sql, q: string) =>
  Prisma.sql`strpos(lower(coalesce(${value}, '')), lower(${q})) > 0`;

function recordSource(
  id: RecordId,
  filters: RecordFilters,
  period: ReportPeriod | null,
  prices: boolean,
  timeline: boolean,
) {
  const q = filters.q ?? '';
  switch (id) {
    case 'requests':
      return Prisma.sql`
        SELECT r.id AS "requestId", r.number, s.name AS site, c.name AS category, u.name AS creator,
          r.urgency::text, r."displayedStage"::text AS stage,
          r."createdAt" AT TIME ZONE 'UTC' AS "createdAt", r."submittedAt" AT TIME ZONE 'UTC' AS "submittedAt",
          r.id AS tie, r."createdAt" AS sort
          ${
            prices
              ? Prisma.sql`, (SELECT sum(i."lineTotal")::text FROM "RequestItem" i
            WHERE i."requestId" = r.id AND i.state <> 'REMOVED') AS total, r."deliveryFee"::text AS fee`
              : Prisma.empty
          }
        FROM scoped r JOIN "Site" s ON s.id = r."siteId" JOIN "CatalogNode" c ON c.id = r."categoryId"
          JOIN "User" u ON u.id = r."createdById"
        WHERE ${during(Prisma.sql`r."createdAt"`, period)}
          AND (${!q} OR ${matches(Prisma.sql`r.number`, q)})
          AND (${filters.status ?? null}::text IS NULL OR r.status = ${filters.status ?? null}::"RequestStatus")
          AND (${filters.stage ?? null}::text IS NULL OR r."displayedStage" = ${filters.stage ?? null}::"RequestStage")
          AND (${filters.urgency ?? null}::text IS NULL OR r.urgency = ${filters.urgency ?? null}::"RequestUrgency")
          AND (${filters.creatorId ?? null}::int IS NULL OR r."createdById" = ${filters.creatorId ?? null})
      `;
    case 'receipts':
      return Prisma.sql`
        SELECT r.id AS "requestId", r.number, s.name AS site, c.name AS category,
          t."recordedAt" AT TIME ZONE 'UTC' AS date, i.snapshot->>'name' AS item,
          l.quantity::text AS quantity, u.name AS recorder, t."recordedAt" AS sort, t.id AS tie, l."itemId" AS line
        FROM scoped r JOIN "Receipt" t ON t."requestId" = r.id JOIN "ReceiptLine" l ON l."receiptId" = t.id
          JOIN "RequestItem" i ON i.id = l."itemId" JOIN "User" u ON u.id = t."recordedById"
          JOIN "Site" s ON s.id = r."siteId" JOIN "CatalogNode" c ON c.id = r."categoryId"
        WHERE ${during(Prisma.sql`t."recordedAt"`, period)} AND (
          ${!q} OR ${matches(Prisma.sql`r.number`, q)} OR ${matches(Prisma.sql`i.snapshot->>'name'`, q)}
        )
      `;
    case 'approvals':
      return Prisma.sql`
        SELECT r.id AS "requestId", r.number, s.name AS site, c.name AS category,
          p."decidedAt" AT TIME ZONE 'UTC' AS date, p.number AS round, p.status::text AS decision,
          ${timeline ? Prisma.sql`coalesce(e."actorName", u.name)` : Prisma.sql`u.name`} AS "decisionActor",
          ${timeline ? Prisma.sql`e."actorRoleName"` : Prisma.sql`NULL::text`} AS role,
          p."decidedAt" AS sort, p.id AS tie
          ${
            prices
              ? Prisma.sql`, (SELECT sum(l."lineTotal")::text FROM "PricingRoundItem" l WHERE l."roundId" = p.id)
            AS total, p."deliveryFee"::text AS fee`
              : Prisma.empty
          }
        FROM scoped r JOIN "PricingRound" p ON p."requestId" = r.id
          JOIN "Site" s ON s.id = r."siteId" JOIN "CatalogNode" c ON c.id = r."categoryId"
          LEFT JOIN "User" u ON u.id = p."decidedById"
          ${
            timeline
              ? Prisma.sql`LEFT JOIN LATERAL (
            SELECT "actorName", "actorRoleName" FROM "RequestEvent" e
            WHERE e."requestId" = r.id AND e.type IN ('PRICING_APPROVED', 'PRICING_REJECTED')
              AND e.payload->>'roundNo' = p.number::text
            ORDER BY e.id DESC LIMIT 1
          ) e ON TRUE`
              : Prisma.empty
          }
        WHERE p.status IN ('APPROVED', 'REJECTED') AND p."decidedAt" IS NOT NULL
          AND ${during(Prisma.sql`p."decidedAt"`, period)} AND (
            ${!q} OR ${matches(Prisma.sql`r.number`, q)} OR
            ${matches(timeline ? Prisma.sql`coalesce(e."actorName", u.name)` : Prisma.sql`u.name`, q)}
          )
      `;
  }
}

export async function readRecords(
  read: ReadRows,
  id: RecordId,
  filters: RecordFilters,
  period: ReportPeriod | null,
  prices: boolean,
  timeline: boolean,
) {
  const order = Prisma.sql`sort DESC, tie DESC ${id === 'receipts' ? Prisma.sql`, line` : Prisma.empty}`;
  const source = recordSource(id, filters, period, prices, timeline);
  if (filters.format === 'xlsx') {
    const rows = await read(Prisma.sql`${source} ORDER BY ${order}`);
    return { rows, total: rows.length };
  }
  const [result] = (await read(Prisma.sql`
    , filtered AS (${source}), page AS (
      SELECT * FROM filtered ORDER BY ${order} LIMIT ${filters.pageSize} OFFSET ${(filters.page - 1) * filters.pageSize}
    )
    SELECT (SELECT count(*)::int FROM filtered) AS total, coalesce(
      (SELECT jsonb_agg(to_jsonb(p) - 'sort' - 'tie' - 'line' ORDER BY ${order}) FROM page p), '[]'::jsonb
    ) AS rows
  `)) as unknown as [{ total: number; rows: ReportRow[] }];
  return result;
}
