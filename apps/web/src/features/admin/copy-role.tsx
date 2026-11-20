import { admin, ar } from '@purchasing-plus/shared/i18n/ar';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { LoadRecord } from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { Field, Select } from '../../components/ui/field.js';
import { Modal } from '../../components/ui/modal.js';
import { roleApi } from '../../lib/api/roles.js';

import { scopeLabel } from './labels.js';

const copy = admin.roles;

export function CopyRole({
  currentId,
  onClose,
  onCopy,
}: {
  currentId?: number;
  onClose: () => void;
  onCopy: (keys: string[]) => void;
}) {
  const [id, setId] = useState('');
  const query = useQuery({
    queryKey: ['roles', 'copy'],
    queryFn: ({ signal }) => roleApi.all(signal),
  });
  return (
    <Modal open title={copy.copy} description={copy.copyHint} onClose={onClose}>
      <LoadRecord query={query}>
        {(data) => {
          const roles = data.filter((role) => role.id !== currentId);
          const role = roles.find((role) => String(role.id) === id);
          if (!roles.length) return <p>{copy.empty}</p>;
          return (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (role) onCopy(role.keys);
              }}
            >
              <Field label={admin.role} required>
                {(props) => (
                  <Select
                    {...props}
                    value={id}
                    data-initial-focus
                    onChange={(event) => setId(event.currentTarget.value)}
                  >
                    <option value="">{ar.common.choose}</option>
                    {roles.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name} — {scopeLabel(item.siteScope)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Button type="submit">{copy.copyAction}</Button>
            </form>
          );
        }}
      </LoadRecord>
    </Modal>
  );
}
