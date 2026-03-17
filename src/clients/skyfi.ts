import type { SkyFiConfig } from "../types/config.js";

export class SkyFiApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = "SkyFiApiError";
  }
}

export interface SkyFiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  params?: Record<string, string>;
}

export interface SkyFiApiResponse<T = unknown> {
  data: T;
  statusCode: number;
}

export class SkyFiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiVersion: string;

  constructor(config: SkyFiConfig) {
    this.baseUrl = config.api_base_url.replace(/\/$/, "");
    this.apiKey = config.api_key;
    this.apiVersion = config.api_version;
  }

  get version(): string {
    return this.apiVersion;
  }

  async request<T = unknown>(options: SkyFiRequestOptions): Promise<SkyFiApiResponse<T>> {
    const url = new URL(`${this.baseUrl}${options.path}`);
    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Skyfi-Api-Key": this.apiKey,
    };

    const fetchInit: RequestInit = {
      method: options.method ?? "GET",
      headers,
    };
    if (options.body) {
      fetchInit.body = JSON.stringify(options.body);
    }
    const response = await fetch(url.toString(), fetchInit);

    if (response.status === 401) {
      throw new SkyFiApiError(
        "Authentication failed. The API key may be invalid or revoked.",
        401,
      );
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      throw new SkyFiApiError(
        `SkyFi API rate limit exceeded.${retryAfter ? ` Retry after ${retryAfter}s.` : ""}`,
        429,
      );
    }

    if (response.status >= 500) {
      throw new SkyFiApiError(
        "SkyFi API is temporarily unavailable. Try again shortly.",
        response.status,
      );
    }

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text();
      }
      throw new SkyFiApiError(
        `SkyFi API error (${response.status})`,
        response.status,
        body,
      );
    }

    const data = (await response.json()) as T;
    return { data, statusCode: response.status };
  }
}
