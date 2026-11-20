import { ar } from '@purchasing-plus/shared/i18n/ar';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { createQueryClient } from './app/query.js';
import { routes } from './app/routes.js';
import '@fontsource-variable/cairo';
import './styles/base.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
document.title = ar.appName;
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={createBrowserRouter(routes)} />
    </QueryClientProvider>
  </StrictMode>,
);
