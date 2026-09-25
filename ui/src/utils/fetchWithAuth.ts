const fetchWithAuth = async (
  input: RequestInfo | URL,
  options: RequestInit = {},
  token?: string
): Promise<Response> => {
  const headers = new Headers(options.headers);

  // Add Authorization header
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers,
  };

  let response: Response;
  try {
    response = await fetch(input, fetchOptions);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ConnectionError(error);
  }
  if (!response.ok) {
    let office: string | undefined;
    if (response.status === 403) {
      const body = await response.clone().json().catch(() => null);
      if (body?.detail?.code === "office_access_required" && typeof body.detail.office === "string" && /^[A-Z0-9-]{2,10}$/.test(body.detail.office)) office = body.detail.office;
    }
    let fields: Record<string, string> | undefined;
    let message = response.status >= 500
      ? "The server could not complete the request. Please try again later."
      : response.status === 401
        ? "Your session has expired. Please sign in again."
        : response.status === 403
          ? "You do not have permission to perform this action."
          : `The request could not be completed (${response.status}).`;
    // Only show intentional client-error messages, never HTML or server traces.
    if (response.status >= 400 && response.status < 500 && response.status !== 401 && response.status !== 403) {
      const body = await response.json().catch(() => null);
      if (typeof body?.detail === "string") message = body.detail;
      else if (Array.isArray(body?.detail)) {
        message = "Some fields are invalid. Check your entries and try again.";
        fields = {};
        for (const issue of body.detail) {
          const field = issue.loc?.[1];
          if (typeof field === "string" && typeof issue.msg === "string") fields[field] = issue.msg;
        }
      }
    }
    throw new ApiError(message, response.status, fields, office);
  }
  return response;
};

export default fetchWithAuth;
class ConnectionError extends Error {
  constructor(public readonly cause: unknown) {
    super("Unable to connect to the server. Check your connection and try again.");
    this.name = "ConnectionError";
  }
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly fields?: Record<string, string>, public readonly office?: string) {
    super(message);
    this.name = "ApiError";
  }
}
