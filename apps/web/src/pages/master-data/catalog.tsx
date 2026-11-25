import { formatDateTime, formatMoney } from '@purchasing-plus/shared';
import { masterData as copy } from '@purchasing-plus/shared/i18n/ar';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router';

import { useCan } from '../../app/session.js';
import { LoadRecord } from '../../components/shared/record-feedback.js';
import { buttonClass } from '../../components/ui/button.js';
import { Carousel } from '../../features/catalog/Carousel.js';
import { CatalogActions } from '../../features/catalog/CatalogActions.js';
import { ClientPresentation } from '../../features/catalog/ClientPresentation.js';
import { Explorer } from '../../features/catalog/Explorer.js';
import { ItemEditor } from '../../features/catalog/ItemEditor.js';
import {
  attributeLabel,
  itemUrl,
  nodeUrl,
  pathLabel,
  SamplePlaceholder,
  Stopped,
} from '../../features/catalog/presentation.js';
import { catalogApi } from '../../lib/api/catalog.js';

export function CatalogPage() {
  const manage = useCan('masterData.view');
  return (
    <>
      <Explorer mode={manage ? 'manage' : 'browse'} />
      <Outlet />
    </>
  );
}
function useItem(itemId: number) {
  const manage = useCan('masterData.view');
  return useQuery({
    queryKey: manage
      ? ['master-data', 'item', itemId]
      : ['master-data', 'item', itemId, 'active'],
    queryFn: ({ signal }) => catalogApi.item(itemId, manage, signal),
  });
}
export function ItemPage() {
  const { itemId } = useParams();
  const query = useItem(Number(itemId));
  const manage = useCan('masterData.view');
  const prices = useCan('requests.viewPrices');
  const supplierNames = useCan('requests.viewSupplierNames');
  return (
    <>
      <LoadRecord query={query}>
        {(item) => (
          <article className="mx-auto grid max-w-5xl gap-4">
            <Link
              className={
                buttonClass('secondary') + ' justify-self-start text-start'
              }
              to={nodeUrl(item.nodeId)}
            >
              <bdi className="wrap-anywhere">{pathLabel(item.nodePath)}</bdi>
            </Link>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <div className="min-w-0">
                {item.images?.length ? (
                  <Carousel images={item.images} name={item.name} />
                ) : (
                  <SamplePlaceholder
                    name={item.name}
                    icon={item.categoryIcon}
                    large
                  />
                )}
              </div>
              <div className="min-w-0 rounded-panel border border-seam bg-paper p-4 sm:p-6">
                <header className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h1 className="wrap-anywhere text-title sm:text-title-wide">
                      {item.name}
                    </h1>
                    <bdi dir="ltr" className="text-small text-concrete">
                      {item.code}
                    </bdi>
                  </div>
                  {manage && <CatalogActions item={item} />}
                </header>
                <Stopped active={item.isActive} />
                <div className="my-3">
                  <ClientPresentation item={item} />
                </div>
                {item.description && (
                  <p className="my-3 whitespace-pre-wrap wrap-anywhere">
                    {item.description}
                  </p>
                )}
                <dl className="mt-4 grid grid-cols-2 gap-x-3 divide-y divide-seam border-t border-seam">
                  <Detail label={copy.unit} value={item.unit.name} />
                  {item.attributeValues.map((attribute) => (
                    <Detail
                      key={attribute.attributeId}
                      label={attribute.attribute.name}
                      value={attributeLabel(attribute)}
                    />
                  ))}
                  {prices && (
                    <>
                      <Detail
                        label={copy.unitPrice}
                        value={
                          item.unitPrice == null
                            ? copy.unitPriceUnset
                            : formatMoney(item.unitPrice)
                        }
                      />
                      <Detail
                        label={copy.latestPrice}
                        value={
                          item.latestPrice
                            ? formatMoney(item.latestPrice.unitPrice)
                            : copy.dash
                        }
                      />
                      {item.latestPrice && (
                        <Detail
                          label={copy.priceDate}
                          value={formatDateTime(item.latestPrice.createdAt)}
                        />
                      )}
                      {item.latestPrice?.requestNumber && (
                        <Detail
                          label={copy.priceRequest}
                          value={item.latestPrice.requestNumber}
                        />
                      )}
                      {supplierNames && item.latestPrice?.supplier && (
                        <Detail
                          label={copy.priceSupplier}
                          value={item.latestPrice.supplier.name}
                        />
                      )}
                    </>
                  )}
                </dl>
              </div>
            </div>
          </article>
        )}
      </LoadRecord>
      <Outlet />
    </>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="col-span-2 grid grid-cols-subgrid py-2">
      <dt className="wrap-anywhere text-small text-concrete">{label}</dt>
      <dd className="wrap-anywhere font-semibold">
        <bdi>{value}</bdi>
      </dd>
    </div>
  );
}
function useEditorNavigation(fallback: string, editing: boolean) {
  const navigate = useNavigate();
  const location = useLocation();
  const back = Boolean(
    (location.state as { catalogEditorFrom?: string } | null)
      ?.catalogEditorFrom,
  );
  const close = useCallback(() => {
    if (back) void navigate(-1);
    else void navigate(fallback, { replace: true });
  }, [back, fallback, navigate]);
  const saved = useCallback(
    ({ id }: { id: number }) => {
      if (editing && back) close();
      else void navigate(itemUrl(id), { replace: true });
    },
    [editing, back, close, navigate],
  );
  return { close, saved };
}
export function NewItemPage() {
  const { nodeId } = useParams();
  const { close, saved } = useEditorNavigation(nodeUrl(Number(nodeId)), false);
  return <ItemEditor nodeId={Number(nodeId)} onClose={close} onSaved={saved} />;
}
export function EditItemPage() {
  const { itemId } = useParams();
  const query = useItem(Number(itemId));
  const { close, saved } = useEditorNavigation(itemUrl(Number(itemId)), true);
  return (
    <LoadRecord query={query}>
      {(item) => (
        <ItemEditor
          item={item}
          nodeId={item.nodeId}
          onClose={close}
          onSaved={saved}
        />
      )}
    </LoadRecord>
  );
}
