/**
 * Safely parse JSON response, handling cases where the server returns
 * non-JSON content (e.g. plain text errors, HTML error pages).
 */

export async function parseJsonResponse<T = unknown>(
  response: Response
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const text = await response.text();
  try {
    const data = JSON.parse(text) as T;
    return { ok: true, data };
  } catch {
    // Response body is not valid JSON - return the raw text or status text
    return {
      ok: false,
      error: text || response.statusText || "Invalid response",
    };
  }
}
