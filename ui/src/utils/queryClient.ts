import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./fetchWithAuth";
import { notifyError, reportWarnings } from "./errorNotifications";

const message = (error: unknown) => error instanceof SyntaxError
  ? "The server returned an invalid response. Please try again later."
  : error instanceof Error ? error.message : "Something went wrong. Please try again.";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.inlineError) return;
      notifyError({ id: query.queryHash, message: message(error), retry: () => query.fetch() });
    },
    onSuccess: (data, query) => reportWarnings(query.queryHash, data, () => query.fetch()),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => notifyError({
      id: `mutation-${JSON.stringify(mutation.options.mutationKey ?? [])}-${message(error)}`, message: message(error),
    }),
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => failureCount < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      retryOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    // Retrying a write could create a duplicate job after a lost response.
    mutations: { retry: false },
  },
});
