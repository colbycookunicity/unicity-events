import { QueryClient, QueryFunction } from "@tanstack/react-query";

export function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function throwIfResNotOk(res: Response) {
  // Check content-type to detect HTML responses from catch-all routes
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    // Try to parse JSON error response for better messages
    try {
      const json = JSON.parse(text);
      throw new Error(json.error || json.message || `${res.status}: ${text}`);
    } catch (parseError) {
      // If not JSON, use the raw text (truncated for HTML responses)
      const truncated = text.length > 200 ? text.substring(0, 200) + '...' : text;
      throw new Error(`${res.status}: ${truncated}`);
    }
  }
  
  // Even if res.ok, detect HTML responses that should be JSON (indicates routing issue)
  // Only check for API routes to avoid issues with non-API endpoints
  if (!isJson && res.url.includes('/api/')) {
    console.error('API returned non-JSON response:', res.url, contentType);
    throw new Error('Server returned HTML instead of JSON. Please try again or refresh the page.');
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const authHeaders = getAuthHeaders();
  const res = await fetch(url, {
    method,
    headers: {
      ...authHeaders,
      ...(data ? { "Content-Type": "application/json" } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const authHeaders = getAuthHeaders();
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: authHeaders,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
