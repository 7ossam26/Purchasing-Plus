import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HomePage } from './home.js';

describe('placeholder route', () => {
  it('shows the app name', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { name: 'Purchasing+' })).toBeTruthy();
  });
});
