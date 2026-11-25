import { admin } from '@purchasing-plus/shared/i18n/ar';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useDeferredValue, useId, useState } from 'react';

import { Pagination } from '../../components/shared/pagination.js';
import { LoadRecord } from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { Field, Input } from '../../components/ui/field.js';
import { siteApi, type EngineerOption } from '../../lib/api/sites.js';

const copy = admin.siteManager;

export interface EngineerChoice {
  id: number;
  name: string;
  username: string;
  isActive: boolean;
  canRemove: boolean;
}
export function choiceFromOption(option: EngineerOption): EngineerChoice {
  return {
    id: option.id,
    name: option.name,
    username: option.username,
    isActive: true,
    canRemove: true,
  };
}

// A searchable multi-select. The selection lives with the caller so the site and its
// assignments save together.
export function SiteEngineers({
  siteId,
  selected,
  allowAdd,
  onToggle,
}: {
  siteId?: number;
  selected: EngineerChoice[];
  allowAdd: boolean;
  onToggle: (choice: EngineerChoice) => void;
}) {
  const headingId = useId();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDeferredValue(search.trim());
  const options = useQuery({
    queryKey: ['sites', 'engineer-options', q, page],
    enabled: allowAdd,
    // Keep the last results on screen while the next search loads.
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => siteApi.engineerOptions(q, page, signal),
  });
  const chosen = new Set(selected.map(({ id }) => id));
  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-3 rounded-panel border border-seam p-3 sm:p-4"
    >
      <div className="grid gap-1">
        <h3 id={headingId} className="text-subtitle">
          {copy.engineers}
        </h3>
        <p className="text-small text-concrete">{copy.engineersHint}</p>
      </div>
      {selected.length ? (
        <ul aria-labelledby={headingId} className="flex flex-wrap gap-2">
          {selected.map((engineer) => (
            <li
              key={engineer.id}
              className="inline-flex min-h-target max-w-full items-center gap-1 rounded-full border border-ppr bg-ppr-wash ps-3 text-small text-ppr-deep"
            >
              <bdi className="wrap-anywhere font-semibold">{engineer.name}</bdi>
              {!engineer.isActive && (
                <span className="text-micro">({admin.inactive})</span>
              )}
              {engineer.canRemove ? (
                <Button
                  iconOnly
                  variant="ghost"
                  aria-label={copy.unassign(engineer.name)}
                  onClick={() => onToggle(engineer)}
                >
                  <X size={16} aria-hidden="true" />
                </Button>
              ) : (
                <span className="pe-3 text-micro">{copy.outOfReach}</span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-concrete">{copy.noEngineers}</p>
      )}
      {allowAdd ? (
        <>
          <Field label={copy.searchEngineers}>
            {(props) => (
              <Input
                {...props}
                type="search"
                maxLength={200}
                value={search}
                onChange={(event) => {
                  setSearch(event.currentTarget.value);
                  setPage(1);
                }}
              />
            )}
          </Field>
          <LoadRecord query={options}>
            {(result) =>
              result.items.length ? (
                <>
                  <ul className="grid gap-1">
                    {result.items.map((option) => {
                      const pressed = chosen.has(option.id);
                      const others = option.sites
                        .filter(({ id }) => id !== siteId)
                        .map(({ name }) => name)
                        .join('، ');
                      return (
                        <li key={option.id}>
                          <button
                            type="button"
                            aria-pressed={pressed}
                            onClick={() => onToggle(choiceFromOption(option))}
                            className="flex min-h-target w-full items-center gap-3 rounded-control border border-seam bg-paper px-3 py-2 text-start hover:bg-plaster aria-pressed:border-ppr aria-pressed:bg-ppr-wash"
                          >
                            <span className="grid min-w-0 grow">
                              <bdi className="wrap-anywhere font-semibold">
                                {option.name}
                              </bdi>
                              <span className="wrap-anywhere text-small text-concrete">
                                <bdi dir="ltr">{option.username}</bdi>
                                {others && ' · ' + copy.alsoAt(others)}
                              </span>
                            </span>
                            {pressed && (
                              <Check
                                size={18}
                                strokeWidth={1.75}
                                className="shrink-0 text-ppr-deep"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {result.total > result.pageSize && (
                    <Pagination {...result} onPageChange={setPage} />
                  )}
                </>
              ) : (
                <p className="text-small text-concrete">
                  {q ? copy.noCandidateMatches : copy.noCandidates}
                </p>
              )
            }
          </LoadRecord>
        </>
      ) : (
        <p className="text-small text-concrete">{copy.inactiveSite}</p>
      )}
    </section>
  );
}
