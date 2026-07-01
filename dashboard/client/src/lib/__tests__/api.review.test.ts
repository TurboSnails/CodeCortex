import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "../api";

describe("api.review.getHistory", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetch(json: unknown) {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(json),
    });
  }

  it("includes offset and limit query params when provided", async () => {
    mockFetch({ reviews: [], total: 0, hasMore: false });
    await api.review.getHistory("sess-1", { offset: 20, limit: 10 });

    expect(fetch).toHaveBeenCalledTimes(1);
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const url = calls[0]?.[0];
    expect(url).toBe("/api/review/sess-1/history?offset=20&limit=10");
  });

  it("uses default offset 0 and limit 20 when omitted", async () => {
    mockFetch({ reviews: [], total: 0, hasMore: false });
    await api.review.getHistory("sess-1");

    expect(fetch).toHaveBeenCalledTimes(1);
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const url = calls[0]?.[0];
    expect(url).toBe("/api/review/sess-1/history?offset=0&limit=20");
  });
});
