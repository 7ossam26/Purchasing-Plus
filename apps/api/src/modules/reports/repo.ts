import { Prisma } from '@prisma/client';
import {
  businessTimeZone,
  defaultSettings,
  type ReportPeriod,
  type ReportRow,
} from '@purchasing-plus/shared';

import { siteWhere, type Viewer } from '../../middleware/access.js';
import type { Tx } from '../access/repo.js';

export interface ReportScope {
  siteId?: number;
  categoryId?: number;
}
export type ReadRows = (query: Prisma.Sql) => Promise<ReportRow[]>;

export function fromScope(
  tx: Tx,
  viewer: Viewer,
  filters: ReportScope,
): ReadRows {
  const conditions: Prisma.Sql[] = [];
  const sites = siteWhere(viewer).siteId;
  if (sites) conditions.push(Prisma.sql`r."siteId" = ANY(${sites.in}::int[])`);
  if (filters.siteId)
    conditions.push(Prisma.sql`r."siteId" = ${filters.siteId}`);
  if (filters.categoryId)
    conditions.push(Prisma.sql`r."categoryId" = ${filters.categoryId}`);

  return async (query) =>
    (
      await tx.$queryRaw<Record<string, ReportRow[string] | Date>[]>(Prisma.sql`
    WITH scoped AS (
      SELECT r.* FROM "Request" r
      ${conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty}
    ) ${query}
  `)
    ).map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          value instanceof Date ? value.toISOString() : value,
        ]),
      ),
    );
}

export function utc(value: Date | string) {
  return Prisma.sql`(${new Date(value).toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}

export function during(column: Prisma.Sql, period: ReportPeriod | null) {
  return period
    ? Prisma.sql`${column} >= ${utc(period.start)} AND ${column} < ${utc(period.endExclusive)}`
    : Prisma.sql`TRUE`;
}

export async function options(tx: Tx, viewer: Viewer) {
  const where = { id: siteWhere(viewer).siteId };
  const [sites, categories, creators] = await Promise.all([
    tx.site.findMany({
      where,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    tx.catalogNode.findMany({
      where: { parentId: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    fromScope(
      tx,
      viewer,
      {},
    )(Prisma.sql`
      SELECT DISTINCT u.id, u.name FROM scoped r JOIN "User" u ON u.id = r."createdById"
      WHERE (${viewer.isSuperadmin} OR NOT u."isSuperadmin")
      ORDER BY u.name, u.id
    `) as Promise<{ id: number; name: string }[]>,
  ]);
  return { sites, categories, creators };
}

export function matchingItems(
  tx: Tx,
  viewer: Viewer,
  filters: ReportScope,
  q: string,
  itemId?: number,
) {
  return fromScope(
    tx,
    viewer,
    filters,
  )(Prisma.sql`
    SELECT c.id, c.name, c.code FROM "CatalogItem" c
    WHERE (${itemId ?? null}::int IS NULL OR c.id = ${itemId ?? null})
      AND (strpos(lower(c.name), lower(${q})) > 0 OR strpos(lower(c.code), lower(${q})) > 0)
      AND EXISTS (
        SELECT 1 FROM "CatalogItemPrice" p JOIN scoped r ON r.id = p."requestId" WHERE p."itemId" = c.id
      )
    ORDER BY c.name, c.code, c.id LIMIT 30
  `);
}

export const openRequests = Prisma.sql`r.status NOT IN ('DRAFT', 'COMPLETED', 'REJECTED', 'CANCELLED')`;

export async function agingDays(tx: Tx) {
  const settings = await tx.settings.findUnique({
    where: { id: 1 },
    select: { agingDays: true },
  });
  return settings?.agingDays ?? defaultSettings.agingDays;
}

export function overview(
  read: ReadRows,
  period: ReportPeriod,
  now: Date,
  agingDays: number,
) {
  const submitted = during(Prisma.sql`r."submittedAt"`, period);
  return Promise.all([
    read(Prisma.sql`
      SELECT (SELECT count(*)::int FROM scoped r WHERE ${submitted}) AS submitted,
        (SELECT count(*)::int FROM scoped r WHERE ${openRequests}) AS open,
        count(DISTINCT e."requestId") FILTER (WHERE e.type = 'COMPLETED')::int AS completed,
        count(DISTINCT e."requestId") FILTER (WHERE e.type IN ('MANAGER_REJECTED', 'REJECTED_AUTO'))::int AS rejected,
        count(DISTINCT e."requestId") FILTER (WHERE e.type = 'CANCELLED')::int AS cancelled
      FROM "RequestEvent" e JOIN scoped r ON r.id = e."requestId"
      WHERE e.type IN ('COMPLETED', 'MANAGER_REJECTED', 'REJECTED_AUTO', 'CANCELLED')
        AND ${during(Prisma.sql`e.at`, period)}
    `),
    read(Prisma.sql`
      SELECT r."displayedStage"::text AS stage, count(*)::int AS count
      FROM scoped r WHERE ${openRequests} GROUP BY r."displayedStage" ORDER BY r."displayedStage"
    `),
    read(Prisma.sql`
      SELECT v.dimension, v.label, count(*)::int AS count
      FROM scoped r JOIN "Site" s ON s.id = r."siteId" JOIN "CatalogNode" c ON c.id = r."categoryId"
      CROSS JOIN LATERAL (VALUES ('site', s.name, s.id::text), ('category', c.name, c.id::text),
        ('urgency', r.urgency::text, r.urgency::text)) v(dimension, label, id)
      WHERE ${submitted}
      GROUP BY v.dimension, v.label, v.id ORDER BY count DESC, v.label, v.id
    `),
    read(Prisma.sql`
      SELECT r.id AS "requestId", r.number, s.name AS site, c.name AS category,
        r."displayedStage"::text AS stage, r.urgency::text, r."stageStartedAt" AS "stageAt"
      FROM scoped r JOIN "Site" s ON s.id = r."siteId" JOIN "CatalogNode" c ON c.id = r."categoryId"
      WHERE ${openRequests} AND
        ((${utc(now)} AT TIME ZONE 'UTC') AT TIME ZONE ${businessTimeZone})::date
        - ((r."stageStartedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${businessTimeZone})::date > ${agingDays}::int
      ORDER BY r.urgency DESC, r."stageStartedAt", r.id
    `),
  ]);
}

export function stageTimes(read: ReadRows, period: ReportPeriod, now: Date) {
  const start = utc(period.start);
  const end = Prisma.sql`least(${utc(period.endExclusive)}, ${utc(now)})`;
  const intervals = Prisma.sql`,
    changes AS (
      SELECT e.id, e."requestId", e.at, e."stageAfter" AS stage,
        lag(e."stageAfter") OVER (PARTITION BY e."requestId" ORDER BY e.id) AS previous
      FROM "RequestEvent" e JOIN scoped r ON r.id = e."requestId"
      WHERE e.at < ${end}
    ), visits AS (
      SELECT *, lead(at) OVER (PARTITION BY "requestId" ORDER BY id) AS exit
      FROM changes WHERE stage IS DISTINCT FROM previous
    ), durations AS (
      SELECT "requestId", stage, extract(epoch FROM
        least(coalesce(exit, ${end}), ${end}) - greatest(at, ${start})) * 1000 AS elapsed
      FROM visits
      WHERE stage NOT IN ('DRAFT', 'COMPLETED', 'REJECTED', 'CANCELLED')
        AND least(coalesce(exit, ${end}), ${end}) > greatest(at, ${start})
    )
  `;
  return Promise.all([
    read(Prisma.sql`${intervals}
      SELECT stage::text, s.name AS site, round(avg(elapsed))::float8 AS average,
        round(percentile_cont(.5) WITHIN GROUP (ORDER BY elapsed))::float8 AS median,
        count(*)::int AS count
      FROM durations d JOIN scoped r ON r.id = d."requestId" JOIN "Site" s ON s.id = r."siteId"
      GROUP BY stage, s.id, s.name ORDER BY stage, s.name, s.id
    `),
    read(Prisma.sql`${intervals}
      , per_stage AS (
        SELECT "requestId", stage, sum(elapsed) AS elapsed FROM durations GROUP BY "requestId", stage
      ), ranked AS (
        SELECT *, row_number() OVER (PARTITION BY "requestId" ORDER BY elapsed DESC, stage) AS rank,
          sum(elapsed) OVER (PARTITION BY "requestId") AS total FROM per_stage
      )
      SELECT r.id AS "requestId", r.number, s.name AS site, x.stage::text, x.elapsed::float8 AS duration,
        x.total::float8 AS total
      FROM ranked x JOIN scoped r ON r.id = x."requestId" JOIN "Site" s ON s.id = r."siteId"
      WHERE x.rank = 1 ORDER BY x.total DESC, r.id LIMIT 20
    `),
    read(Prisma.sql`${intervals}
      SELECT stage::text, round(avg(elapsed))::float8 AS average,
        round(percentile_cont(.5) WITHIN GROUP (ORDER BY elapsed))::float8 AS median
      FROM durations GROUP BY stage ORDER BY stage
    `),
    read(Prisma.sql`${intervals}
      SELECT count(DISTINCT "requestId")::int AS count, round(avg(elapsed))::float8 AS average,
        round(percentile_cont(.5) WITHIN GROUP (ORDER BY elapsed))::float8 AS median
      FROM durations
    `),
  ]);
}
