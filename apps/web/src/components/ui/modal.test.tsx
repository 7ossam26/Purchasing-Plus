import { ar, uiPreview } from '@purchasing-plus/shared/i18n/ar';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';

import { Button } from './button.js';
import { DialogProvider, usePrompt } from './dialogs.js';
import { Modal } from './modal.js';

afterEach(cleanup);
it('traps focus, closes only the top modal with Escape and restores both triggers', () => {
  function Stack() {
    const [depth, set] = useState(0);
    return (
      <>
        <Button onClick={() => set(1)}>{uiPreview.showModal}</Button>
        <Modal
          open={depth > 0}
          title={uiPreview.details}
          onClose={() => set(0)}
        >
          <Button onClick={() => set(2)}>{uiPreview.stack}</Button>
          <Modal
            open={depth > 1}
            title={uiPreview.notes}
            onClose={() => set(1)}
          >
            <Button>{ar.common.save}</Button>
          </Modal>
        </Modal>
      </>
    );
  }
  render(<Stack />);
  const first = screen.getByRole('button', { name: uiPreview.showModal });
  first.focus();
  fireEvent.click(first);
  const next = screen.getByRole('button', { name: uiPreview.stack });
  next.focus();
  fireEvent.click(next);
  const top = screen.getByRole('dialog', { name: uiPreview.notes });
  const last = within(top).getByRole('button', { name: ar.common.save });
  last.focus();
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(document.activeElement).toBe(
    within(top).getByRole('button', { name: ar.common.close }),
  );
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: uiPreview.notes })).toBeNull();
  expect(screen.getByRole('dialog', { name: uiPreview.details })).toBeTruthy();
  expect(document.activeElement).toBe(next);
  fireEvent.keyDown(next, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(first);
});

it('requires non-whitespace reason text before accepting a prompt', async () => {
  function Prompt() {
    const prompt = usePrompt();
    const [result, setResult] = useState<string | null>(null);
    return (
      <>
        <Button
          onClick={async () =>
            setResult(
              await prompt({ title: uiPreview.reasonTitle, mode: 'reason' }),
            )
          }
        >
          {uiPreview.showPrompt}
        </Button>
        {result && <output>{result}</output>}
      </>
    );
  }
  render(
    <DialogProvider>
      <Prompt />
    </DialogProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: uiPreview.showPrompt }));
  const textbox = screen.getByLabelText(ar.dialogs.reason);
  expect(document.activeElement).toBe(textbox);
  const confirm = screen.getByRole<HTMLButtonElement>('button', {
    name: ar.common.confirm,
  });
  expect(confirm.disabled).toBe(true);
  fireEvent.change(textbox, { target: { value: '  ' } });
  expect(confirm.disabled).toBe(true);
  fireEvent.change(textbox, { target: { value: 'تغيير الموقع' } });
  expect(confirm.disabled).toBe(false);
  fireEvent.click(confirm);
  expect(await screen.findByText('تغيير الموقع')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});
