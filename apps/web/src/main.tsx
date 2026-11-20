import { ar } from '@purchasing-plus/shared/i18n/ar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { HomePage } from './pages/home.js';
import './styles.css';

const router = createBrowserRouter([{ path: '/', element: <HomePage /> }]);
const queryClient = new QueryClient();
const root = document.getElementById('root');

if (!root) throw new Error('Missing root element');
document.title = ar.appName;
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
