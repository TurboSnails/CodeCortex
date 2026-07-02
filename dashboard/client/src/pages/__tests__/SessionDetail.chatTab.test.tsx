import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { SessionDetail } from "../SessionDetail";
import type { Session } from "../../lib/types";

const mockSession: Session = {
  id: "sess-1",
  name: "Test Session",
  status: "active",
  cwd: "/tmp",
  model: "claude-sonnet-4",
  started_at: new Date().toISOString(),
  ended_at: null,
  metadata: null,
};

vi.mock("../../lib/api", () => ({
  api: {
    sessions: {
      get: vi.fn(() =>
        Promise.resolve({
          session: mockSession,
          agents: [],
          workflows: [],
        })
      ),
      transcripts: vi.fn(() => Promise.resolve({ transcripts: [] })),
    },
    pricing: { sessionCost: vi.fn(() => Promise.resolve({ total_cost: 0, breakdown: [] })) },
    plan: { get: vi.fn(() => Promise.reject(new Error("no plan"))) },
    events: { list: vi.fn(() => Promise.resolve({ events: [] })) },
    run: {
      list: vi.fn(() => Promise.resolve({ items: [] })),
    },
  },
}));

vi.mock("../../lib/eventBus", () => ({
  eventBus: {
    subscribe: vi.fn(() => () => {}),
    connected: true,
    onConnection: vi.fn(() => () => {}),
  },
}));

describe("SessionDetail chat tab", () => {
  it("renders a Chat tab that can be activated", async () => {
    render(
      <MemoryRouter initialEntries={["/sessions/sess-1"]}>
        <Routes>
          <Route path="/sessions/:id" element={<SessionDetail />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Test Session")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Chat/i }));
    expect(screen.getByPlaceholderText(/Ask Claude/)).toBeInTheDocument();
  });
});
