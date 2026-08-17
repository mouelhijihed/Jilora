const inFlightRequests = new Map<string, Promise<unknown>>();
const REQUEST_TIMEOUT_MS = 15000;
const API_BASE_URL = String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

async function performRequest<T>(url: string, options: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const externalSignal = options.signal;
    const abortFromExternal = () => controller.abort();
    externalSignal?.addEventListener("abort", abortFromExternal, { once: true });

    try {
        const response = await fetch(`${API_BASE_URL}${url}`, {
            ...options,
            headers: { "Content-Type": "application/json", ...options.headers },
            credentials: "include",
            signal: controller.signal,
        });

        if (!response.ok) {
            const body = await response.json().catch(() => null) as { message?: string } | null;
            if (response.status === 401 && !url.endsWith("/api/auth/me")) window.dispatchEvent(new Event("auth:unauthorized"));
            throw new ApiError(body?.message || `Request failed with status ${response.status}`, response.status);
        }

        if (response.status === 204) return undefined as T;
        try {
            return await response.json() as T;
        } catch {
            throw new ApiError("The server returned an invalid response", 502);
        }
    } catch (error) {
        if (error instanceof ApiError) throw error;
        if (controller.signal.aborted) throw new ApiError(externalSignal?.aborted ? "The request was cancelled" : "The request timed out", 408);
        throw new ApiError(error instanceof Error ? error.message : "The request could not be completed", 0);
    } finally {
        window.clearTimeout(timeout);
        externalSignal?.removeEventListener("abort", abortFromExternal);
    }
}

export function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
    const method = String(options.method || "GET").toUpperCase();
    const key = `${method}:${url}:${typeof options.body === "string" ? options.body : ""}`;
    const existing = inFlightRequests.get(key);
    if (existing) return existing as Promise<T>;

    const request = performRequest<T>(url, options).finally(() => {
        if (inFlightRequests.get(key) === request) inFlightRequests.delete(key);
    });
    inFlightRequests.set(key, request);
    return request;
}
