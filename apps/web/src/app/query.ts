import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '../lib/api/client.js';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failures, error) =>
          failures < 1 &&
          !(
            error instanceof ApiError &&
            error.status >= 400 &&
            error.status < 500
          ),
        refetchOnWindowFocus: false,
        staleTime: 10_000,
      },
      mutations: { retry: false },
    },
  });
}
