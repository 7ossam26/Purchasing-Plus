import { formatNumber, normalizeArabic } from '@purchasing-plus/shared';
import { admin, ar, masterData as copy } from '@purchasing-plus/shared/i18n/ar';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  FolderOpen,
  ListFilter,
  Plus,
  Search,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { useCan } from '../../app/session.js';
import { ActionBar } from '../../components/shared/action-bar.js';
import { Pagination } from '../../components/shared/pagination.js';
import { InlineError } from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { Input, Select } from '../../components/ui/field.js';
import { Modal } from '../../components/ui/modal.js';
import { EmptyState, Skeleton } from '../../components/ui/states.js';
import {
  catalogApi,
  type CatalogItem,
  type Folder,
  type FolderContents,
  type NamedRecord,
} from '../../lib/api/catalog.js';

import { CatalogActions, FolderForm } from './CatalogActions.js';
import {
  attributeLabel,
  CategoryIcon,
  itemUrl,
  nodeUrl,
  pathLabel,
  SampleCover,
  Stopped,
} from './presentation.js';
import './explorer.css';

export type ExplorerProps =
  | { mode: 'manage' | 'browse' }
  | {
      mode: 'pick';
      nodeHref: (nodeId: number) => string;
      onPickItem: (item: CatalogItem) => void;
      onAddOther: (nodeId: number) => void;
      beforeContents?: ReactNode;
    };

interface FolderLinkState {
  catalogPath: NamedRecord[];
  back?: boolean;
}
const folderQuery = (id: number, manage: boolean) =>
  queryOptions({
    queryKey: ['master-data', 'folder', manage, id] as const,
    queryFn: ({ signal }) => catalogApi.folder(id, manage, signal),
  });
function supportsMotion() {
  return (
    typeof document.startViewTransition === 'function' &&
    !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}
function CatalogLink({
  id,
  href,
  path,
  back,
  children,
  className,
  onPreview,
}: {
  id: number;
  href: (id: number) => string;
  path: NamedRecord[];
  back?: boolean;
  children: ReactNode;
  className?: string;
  onPreview: (id: number) => void;
}) {
  return (
    <Link
      to={href(id)}
      state={{ catalogPath: path, back } satisfies FolderLinkState}
      viewTransition={supportsMotion()}
      className={className}
      onFocus={() => onPreview(id)}
      onPointerEnter={() => onPreview(id)}
      onPointerDown={() => onPreview(id)}
    >
      {children}
    </Link>
  );
}

export function Explorer(props: ExplorerProps) {
  const manage = props.mode === 'manage';
  const { nodeId } = useParams();
  const node = Number(nodeId);
  const href = props.mode === 'pick' ? props.nodeHref : nodeUrl;
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const canAddGroup = useCan('catalogTree.create');
  const canAddItem = useCan('catalog.create');
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('');
  const [last, setLast] = useState<{ manage: boolean; data: FolderContents }>();
  const categories = useQuery({
    queryKey: ['master-data', 'categories', manage],
    queryFn: ({ signal }) => catalogApi.categories(manage, signal),
  });
  const folder = useQuery({
    ...folderQuery(node, manage),
    enabled: nodeId !== undefined,
  });
  const data = nodeId === undefined ? undefined : folder.data;
  if (data && (last?.manage !== manage || last.data !== data))
    setLast({ manage, data });
  const linkState = location.state as FolderLinkState | null;
  const oldPath =
    last?.manage === manage ? last.data.node.breadcrumb : undefined;
  const depth = oldPath?.findIndex(({ id }) => id === node) ?? -1;
  const path =
    data?.node.breadcrumb ??
    (linkState?.catalogPath?.at(-1)?.id === node
      ? linkState.catalogPath
      : undefined) ??
    (oldPath && depth >= 0 ? oldPath.slice(0, depth + 1) : undefined);
  const category =
    categories.data?.find(({ id }) => id === path?.[0]?.id) ??
    (data?.node.parentId === null ? data.node : undefined);
  const [step, setStep] = useState({ path, back: false, key: location.key });
  if (
    step.key !== location.key ||
    (data && step.path !== data.node.breadcrumb)
  ) {
    const back =
      step.key === location.key
        ? step.back
        : Boolean(
            linkState?.back ||
            step.path?.slice(0, -1).some(({ id }) => id === node),
          );
    setStep({ path, back, key: location.key });
  }
  useLayoutEffect(() => {
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' });
  }, [nodeId]);

  function preview(id: number) {
    void client.prefetchQuery(folderQuery(id, manage));
  }
  const disabledBranch = !path || path.some(({ isActive }) => !isActive);
  const currentContents =
    data ?? (folder.error && last?.manage === manage ? last.data : undefined);
  const heading = nodeId === undefined ? copy.items : path?.at(-1)?.name;
  const canShowActions = manage && data && !disabledBranch;
  const matches = ({ isActive }: NamedRecord) =>
    !filter || isActive === (filter === 'active');

  return (
    <section
      className="catalog-explorer mx-auto grid max-w-6xl gap-4"
      data-folder-back={step.back || undefined}
    >
      {nodeId !== undefined && path && (
        <Breadcrumb
          key={nodeId}
          path={path}
          icon={category?.iconKey}
          href={href}
          onPreview={preview}
        />
      )}
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-control border border-seam bg-paper">
            <CategoryIcon name={category?.iconKey} />
          </span>
          {heading ? (
            <h1 className="wrap-anywhere text-title sm:text-title-wide">
              {heading}
            </h1>
          ) : (
            <Skeleton className="h-8 w-36" />
          )}
        </div>
        {manage && nodeId === undefined && (
          <StatusFilter value={filter} onChange={setFilter} />
        )}
      </header>
      {props.mode === 'pick' && props.beforeContents}
      <div className="catalog-folder-frame grid gap-4">
        {nodeId === undefined ? (
          <>
            <InlineError
              error={categories.error}
              retry={() => void categories.refetch()}
            />
            {categories.isPending ? (
              <FolderSkeleton />
            ) : (
              categories.data && (
                <FolderGrid
                  folders={categories.data.filter(matches)}
                  manage={manage}
                  path={[]}
                  href={href}
                  onPreview={preview}
                />
              )
            )}
            {categories.data && !categories.data.some(matches) && (
              <EmptyState
                title={filter ? admin.noMatches : copy.emptyCategories}
                action={
                  filter && (
                    <Button variant="secondary" onClick={() => setFilter('')}>
                      {ar.common.resetFilters}
                    </Button>
                  )
                }
              />
            )}
          </>
        ) : (
          <>
            <InlineError
              error={folder.error}
              retry={() => void folder.refetch()}
            />
            {folder.isPending && <FolderSkeleton />}
            {folder.error && !currentContents && categories.data && (
              <FolderGrid
                folders={categories.data.filter(matches)}
                manage={manage}
                path={[]}
                href={href}
                onPreview={preview}
              />
            )}
            {currentContents && (
              <FolderBody
                key={currentContents.node.id}
                data={currentContents}
                props={props}
                href={href}
                filter={filter}
                matches={matches}
                onFilter={setFilter}
                onPreview={preview}
              />
            )}
          </>
        )}
      </div>
      {nodeId !== undefined && props.mode === 'pick' && data && (
        <Button
          variant="secondary"
          className="min-h-14 justify-start border-dashed text-start"
          onClick={() => props.onAddOther(node)}
        >
          <Plus size={20} aria-hidden="true" />
          {copy.other}
        </Button>
      )}
      {canShowActions && (
        <ActionBar
          primary={
            canAddItem
              ? {
                  id: 'item',
                  label: copy.addItem,
                  onClick: () =>
                    void navigate(nodeUrl(node) + '/new', {
                      state: { catalogEditorFrom: location.pathname },
                    }),
                }
              : undefined
          }
          secondary={
            canAddGroup
              ? [
                  {
                    id: 'group',
                    label: copy.addGroup,
                    onClick: () => setAdding(true),
                  },
                ]
              : []
          }
        />
      )}
      {adding && canShowActions && (
        <FolderForm parentId={node} onClose={() => setAdding(false)} />
      )}
    </section>
  );
}

function StatusFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative min-w-27 shrink-0">
      <ListFilter
        size={17}
        className="pointer-events-none absolute start-2.5 top-3.5 text-concrete"
        aria-hidden="true"
      />
      <Select
        aria-label={admin.status}
        className="ps-8 text-small"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">{admin.all}</option>
        <option value="active">{admin.active}</option>
        <option value="inactive">{copy.stopped}</option>
      </Select>
    </div>
  );
}

function Breadcrumb({
  path,
  icon,
  href,
  onPreview,
}: {
  path: NamedRecord[];
  icon?: string | null;
  href: (id: number) => string;
  onPreview: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const middle = path.slice(1, -1);
  const collapse = path.length > 3;
  const separator = (
    <ChevronRight
      size={14}
      className="rtl-mirror shrink-0 text-concrete"
      aria-hidden="true"
    />
  );
  return (
    <nav
      aria-label={copy.breadcrumb}
      className="sticky top-topbar z-20 rounded-control border border-seam bg-paper px-1 sm:px-2"
    >
      <ol className="flex flex-wrap items-center gap-x-0.5 sm:gap-x-1">
        {path.map((part, index) => {
          const current = index === path.length - 1;
          return (
            <li
              key={part.id}
              className={`min-w-0 max-w-full items-center gap-0.5 ${collapse && index > 0 && !current ? 'hidden sm:flex' : 'flex'}`}
            >
              {index !== 0 && separator}
              {collapse && current && (
                <span className="flex shrink-0 items-center sm:hidden">
                  <Button
                    iconOnly
                    variant="ghost"
                    aria-label={copy.showPath}
                    aria-expanded={open}
                    onClick={() => setOpen(true)}
                  >
                    {copy.ellipsis}
                  </Button>
                  {separator}
                </span>
              )}
              {current ? (
                <Link
                  to={href(part.id)}
                  replace
                  state={{ catalogPath: path } satisfies FolderLinkState}
                  aria-current="page"
                  className="catalog-current-crumb flex min-h-target min-w-0 items-center gap-1 rounded-control px-2 py-1 text-small font-bold text-ppr-deep hover:bg-ppr-wash"
                >
                  {index === 0 && <CategoryIcon name={icon} size={16} />}
                  <bdi className="min-w-0 wrap-anywhere">{part.name}</bdi>
                </Link>
              ) : (
                <CatalogLink
                  id={part.id}
                  href={href}
                  path={path.slice(0, index + 1)}
                  back
                  onPreview={onPreview}
                  className="inline-flex min-h-target min-w-target items-center gap-1 rounded-control px-2 py-1 text-small font-semibold hover:bg-plaster"
                >
                  {index === 0 && <CategoryIcon name={icon} size={16} />}
                  <bdi className="min-w-0 wrap-anywhere">{part.name}</bdi>
                </CatalogLink>
              )}
            </li>
          );
        })}
      </ol>
      <Modal open={open} title={copy.breadcrumb} onClose={() => setOpen(false)}>
        <ol className="divide-y divide-seam">
          {middle.map((part, index) => (
            <li key={part.id}>
              <CatalogLink
                id={part.id}
                href={href}
                path={path.slice(0, index + 2)}
                back
                onPreview={onPreview}
                className="flex min-h-target items-center justify-between gap-3 rounded-control px-3 py-2 font-semibold hover:bg-plaster"
              >
                <bdi className="wrap-anywhere">{part.name}</bdi>
                {separator}
              </CatalogLink>
            </li>
          ))}
        </ol>
      </Modal>
    </nav>
  );
}

function FolderSkeleton() {
  return (
    <div
      role="status"
      aria-label={ar.common.loading}
      className="grid gap-2 sm:grid-cols-3"
    >
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} className="h-16 w-full sm:h-30" />
      ))}
    </div>
  );
}

function FolderGrid({
  folders,
  manage,
  path,
  href,
  onPreview,
}: {
  folders: Folder[];
  manage: boolean;
  path: NamedRecord[];
  href: (id: number) => string;
  onPreview: (id: number) => void;
}) {
  if (!folders.length) return null;
  return (
    <ul className="catalog-folder-grid">
      {folders.map((folder) => (
        <li className="catalog-drawer relative min-w-0" key={folder.id}>
          <div className="catalog-drawer-inner">
            <CatalogLink
              id={folder.id}
              href={href}
              path={[...path, folder]}
              onPreview={onPreview}
              className="catalog-drawer-link min-w-0 rounded-control"
            >
              <span
                className={`catalog-folder-slot ${folder.coverThumbs.length ? 'catalog-folder-stack' : ''}`}
                aria-hidden="true"
              >
                {folder.coverThumbs.length ? (
                  folder.coverThumbs.map((url, index) => (
                    <img
                      key={url}
                      src={url}
                      loading="lazy"
                      alt=""
                      data-layer={index}
                    />
                  ))
                ) : folder.parentId === null ? (
                  <CategoryIcon name={folder.iconKey} />
                ) : (
                  [...folder.name][0]
                )}
              </span>
              <span className="min-w-0 grow">
                <span className="flex min-w-0 items-center gap-1">
                  <bdi className="min-w-0 truncate text-subtitle sm:line-clamp-2 sm:wrap-anywhere sm:whitespace-normal">
                    {folder.name}
                  </bdi>
                  <Stopped active={folder.isActive} />
                </span>
                <span className="block truncate text-micro text-concrete">
                  {copy.counts(
                    formatNumber(folder.childGroupCount),
                    formatNumber(folder.subtreeItemCount),
                  )}
                </span>
              </span>
              <ChevronRight
                size={19}
                className="catalog-drawer-arrow rtl-mirror shrink-0 text-concrete"
                aria-hidden="true"
              />
            </CatalogLink>
            {manage && (
              <CatalogActions
                folder={folder}
                ancestorsActive={path.every(({ isActive }) => isActive)}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function FolderBody({
  data,
  props,
  href,
  filter,
  matches,
  onFilter,
  onPreview,
}: {
  data: FolderContents;
  props: ExplorerProps;
  href: (id: number) => string;
  filter: string;
  matches: (row: NamedRecord) => boolean;
  onFilter: (value: string) => void;
  onPreview: (id: number) => void;
}) {
  const manage = props.mode === 'manage';
  const category = data.node.breadcrumb[0]!;
  const [draft, setDraft] = useState('');
  const [term, setTerm] = useState('');
  const normalized = normalizeArabic(draft);
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (!normalized || normalized === term) return;
    const timer = window.setTimeout(() => setTerm(normalized), 250);
    return () => window.clearTimeout(timer);
  }, [normalized, term]);
  const searching = normalized !== '';
  const active = filter ? String(filter === 'active') : undefined;
  const showCachedFirstPage = page === 1 && !active;
  const search = useQuery({
    queryKey: [
      'master-data',
      'search',
      manage,
      category.id,
      term,
      page,
      active,
    ],
    enabled: searching && Boolean(term) && term === normalized,
    queryFn: ({ signal }) =>
      catalogApi.search(category.id, term, manage, page, signal, active),
  });
  const more = useQuery({
    queryKey: ['master-data', 'items', manage, data.node.id, page, active],
    enabled: !searching && !showCachedFirstPage,
    queryFn: ({ signal }) =>
      catalogApi.items(data.node.id, manage, page, signal, active),
  });
  const result = searching
    ? normalized === term
      ? search.data
      : undefined
    : showCachedFirstPage
      ? data.items
      : more.data;
  const [lastResult, setLastResult] = useState<typeof result>();
  if (result && lastResult !== result) setLastResult(result);
  const query = searching ? search : more;
  const status =
    query.error &&
    (!searching || normalized === term) &&
    (searching || !showCachedFirstPage)
      ? query.error
      : null;
  const listing = result ?? (status ? lastResult : undefined);
  const folders = searching ? [] : data.folders.filter(matches);
  const items = listing?.items.filter(matches) ?? [];
  const waiting = !result && !status;
  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={19}
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-3 text-concrete"
          />
          <Input
            type="search"
            className="ps-10"
            aria-label={copy.searchIn(category.name)}
            placeholder={copy.searchIn(category.name)}
            value={draft}
            maxLength={200}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              setPage(1);
              if (!normalizeArabic(event.currentTarget.value)) setTerm('');
            }}
          />
        </div>
        {manage && (
          <StatusFilter
            value={filter}
            onChange={(value) => {
              onFilter(value);
              setPage(1);
            }}
          />
        )}
      </div>
      {!searching && (
        <FolderGrid
          folders={folders}
          manage={manage}
          path={data.node.breadcrumb}
          href={href}
          onPreview={onPreview}
        />
      )}
      {searching && <h2 className="text-section">{copy.searchResults}</h2>}
      <InlineError error={status} retry={() => void query.refetch()} />
      {waiting && <FolderSkeleton />}
      {items.length > 0 && (
        <ul
          className={
            searching
              ? 'grid gap-2'
              : 'grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5'
          }
        >
          {items.map((item) => (
            <ItemSample
              key={item.id}
              item={item}
              props={props}
              search={searching}
            />
          ))}
        </ul>
      )}
      {!waiting && !status && !folders.length && !items.length && (
        <div className="rounded-panel border border-dashed border-seam bg-paper">
          <EmptyState
            title={searching || filter ? admin.noMatches : copy.emptyFolder}
            icon={<FolderOpen size={22} aria-hidden="true" />}
            action={
              (searching || filter) && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDraft('');
                    setTerm('');
                    setPage(1);
                    onFilter('');
                  }}
                >
                  {ar.common.resetFilters}
                </Button>
              )
            }
          />
        </div>
      )}
      {listing && (
        <Pagination
          page={page}
          pageSize={listing.pageSize}
          total={listing.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

function ItemSample({
  item,
  props,
  search,
}: {
  item: CatalogItem;
  props: ExplorerProps;
  search: boolean;
}) {
  const children = (
    <>
      <SampleCover item={item} />
      <span className="grid min-w-0 content-start gap-1">
        <bdi className="line-clamp-2 wrap-anywhere text-subtitle">
          {item.name}
        </bdi>
        {search && (
          <bdi className="wrap-anywhere text-small text-concrete">
            {pathLabel(item.nodePath)}
          </bdi>
        )}
        <bdi dir="ltr" className="w-fit text-micro text-concrete">
          {item.code}
        </bdi>
        {!search && item.attributeValues.length > 0 && (
          <span className="flex flex-wrap gap-x-2 gap-y-1 text-small text-concrete">
            {item.attributeValues.slice(0, 2).map((attribute) => (
              <bdi key={attribute.attributeId} className="max-w-full truncate">
                {attributeLabel(attribute)}
              </bdi>
            ))}
          </span>
        )}
        <Stopped active={item.isActive} />
      </span>
    </>
  );
  const className = search
    ? 'grid w-full grid-cols-[52px_minmax(0,1fr)] items-center gap-3 p-2 text-start'
    : 'grid w-full content-start gap-2 p-2 text-start sm:p-3';
  return (
    <li
      className={`relative grid min-w-0 rounded-panel border border-seam bg-paper hover:border-concrete ${search ? 'grid-cols-[minmax(0,1fr)_auto] items-center' : ''}`}
    >
      {props.mode !== 'pick' ? (
        <Link className={className + ' rounded-panel'} to={itemUrl(item.id)}>
          {children}
        </Link>
      ) : (
        <button
          type="button"
          className={className + ' rounded-panel'}
          onClick={() => props.onPickItem(item)}
        >
          {children}
        </button>
      )}
      {props.mode === 'manage' && (
        <div
          className={
            search
              ? 'pe-1'
              : 'absolute end-2 top-2 rounded-control bg-paper sm:end-3 sm:top-3 empty:hidden'
          }
        >
          <CatalogActions item={item} />
        </div>
      )}
    </li>
  );
}
