import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { ReviewsTab } from "../ReviewsTab";

const mockReviews = [
  {
    id: 2,
    model: "openai/gpt-4o",
    review: "## Summary\nLooks good.",
    createdAt: "2026-07-01T10:00:00.000Z",
  },
  {
    id: 1,
    model: "gemini/gemini-1.5-flash",
    review: "No issues found.",
    createdAt: "2026-07-01T09:00:00.000Z",
  },
];

vi.mock("../../lib/api", () => ({
  api: {
    review: {
      getHistory: vi.fn(() =>
        Promise.resolve({ reviews: mockReviews, total: 2, hasMore: false }),
      ),
      trigger: vi.fn(() =>
        Promise.resolve({ model: "openai/gpt-4o", review: "New review" }),
      ),
    },
  },
}));

let busCallback: ((msg: any) => void) | null = null;
vi.mock("../../lib/eventBus", () => ({
  eventBus: {
    subscribe: vi.fn((cb: (msg: any) => void) => {
      busCallback = cb;
      return () => {
        busCallback = null;
      };
    }),
  },
}));

let intersectionObserverCallback:
  ((entries: IntersectionObserverEntry[]) => void) | null = null;
class MockIntersectionObserver {
  constructor(cb: IntersectionObserverCallback) {
    intersectionObserverCallback = (entries) =>
      cb(entries, this as unknown as IntersectionObserver);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

describe("ReviewsTab", () => {
  beforeEach(() => {
    busCallback = null;
    intersectionObserverCallback = null;
    vi.clearAllMocks();
  });

  it("shows loading then renders review list", async () => {
    render(<ReviewsTab sessionId="sess-1" />);
    await waitFor(() =>
      expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument(),
    );
    expect(screen.getByText("gemini/gemini-1.5-flash")).toBeInTheDocument();
  });

  it("renders empty state when no reviews", async () => {
    const { api } = await import("../../lib/api");
    (api.review.getHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      reviews: [],
      total: 0,
    });
    render(<ReviewsTab sessionId="sess-empty" />);
    await waitFor(() =>
      expect(screen.getByText(/暂无审核记录/)).toBeInTheDocument(),
    );
  });

  it("calls onCountChange with review count on load", async () => {
    const onCountChange = vi.fn();
    render(<ReviewsTab sessionId="sess-1" onCountChange={onCountChange} />);
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(2));
  });

  it("expands review content on click", async () => {
    render(<ReviewsTab sessionId="sess-1" />);
    await waitFor(() =>
      expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument(),
    );
    // Initially collapsed — markdown body "Looks good" not visible
    expect(screen.queryByText(/Looks good/)).not.toBeInTheDocument();
    // Click the first row button
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]!);
    await waitFor(() =>
      expect(screen.getByText(/Looks good/)).toBeInTheDocument(),
    );
  });

  it("prepends new review from review_ready WS event", async () => {
    render(<ReviewsTab sessionId="sess-1" />);
    await waitFor(() =>
      expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument(),
    );
    busCallback?.({
      type: "review_ready",
      data: {
        sessionId: "sess-1",
        id: 3,
        model: "kimi/moonshot-v1",
        review: "New WS review",
        createdAt: new Date().toISOString(),
      },
    });
    await waitFor(() =>
      expect(screen.getByText("kimi/moonshot-v1")).toBeInTheDocument(),
    );
  });

  it("ignores review_ready events for other sessions", async () => {
    render(<ReviewsTab sessionId="sess-1" />);
    await waitFor(() =>
      expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument(),
    );
    busCallback?.({
      type: "review_ready",
      data: {
        sessionId: "other-sess",
        id: 99,
        model: "x/y",
        review: "other",
        createdAt: "",
      },
    });
    expect(screen.queryByText("x/y")).not.toBeInTheDocument();
  });

  it("loads more reviews when the sentinel becomes visible", async () => {
    const { api } = await import("../../lib/api");
    const firstPage = [
      {
        id: 3,
        model: "openai/gpt-4o",
        review: "First",
        createdAt: "2026-07-01T10:00:00.000Z",
      },
    ];
    const secondPage = [
      {
        id: 2,
        model: "gemini/gemini-1.5-flash",
        review: "Second",
        createdAt: "2026-07-01T09:00:00.000Z",
      },
    ];
    (api.review.getHistory as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ reviews: firstPage, total: 2, hasMore: true })
      .mockResolvedValueOnce({ reviews: secondPage, total: 2, hasMore: false });

    render(<ReviewsTab sessionId="sess-paginate" />);
    await waitFor(() =>
      expect(screen.getByText("openai/gpt-4o")).toBeInTheDocument(),
    );

    expect(api.review.getHistory).toHaveBeenCalledWith("sess-paginate", {
      offset: 0,
      limit: 20,
    });

    intersectionObserverCallback?.([
      { isIntersecting: true } as IntersectionObserverEntry,
    ]);

    await waitFor(() =>
      expect(api.review.getHistory).toHaveBeenCalledWith("sess-paginate", {
        offset: 1,
        limit: 20,
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("gemini/gemini-1.5-flash")).toBeInTheDocument(),
    );
  });

  it("calls onCountChange with total count, not just loaded reviews", async () => {
    const { api } = await import("../../lib/api");
    (api.review.getHistory as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      reviews: mockReviews.slice(0, 1),
      total: 5,
      hasMore: true,
    });
    const onCountChange = vi.fn();
    render(<ReviewsTab sessionId="sess-total" onCountChange={onCountChange} />);
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(5));
  });
  it("increments badge total on review_ready WS event", async () => {
    const onCountChange = vi.fn();
    render(<ReviewsTab sessionId="sess-1" onCountChange={onCountChange} />);
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(2));

    busCallback?.({
      type: "review_ready",
      data: {
        sessionId: "sess-1",
        id: 3,
        model: "kimi/moonshot-v1",
        review: "New WS review",
        createdAt: new Date().toISOString(),
      },
    });

    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(3));
  });

  it("calls onCountChange exactly once per unique count", async () => {
    const onCountChange = vi.fn();
    render(
      <StrictMode>
        <ReviewsTab sessionId="sess-1" onCountChange={onCountChange} />
      </StrictMode>,
    );
    await waitFor(() => expect(onCountChange).toHaveBeenCalledWith(2));
    expect(onCountChange).toHaveBeenCalledTimes(1);
  });
});
