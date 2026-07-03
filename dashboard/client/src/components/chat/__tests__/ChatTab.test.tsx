import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatTab } from "../ChatTab";
import { ChatWorkspaceProvider } from "../ChatWorkspaceContext";

vi.mock("../../../lib/api", () => ({
  api: {
    run: {
      start: vi.fn(),
      send: vi.fn(),
      kill: vi.fn(),
      respondToPermission: vi.fn(),
      files: vi.fn(),
    },
    ccConfig: {
      commands: vi.fn(() => Promise.resolve({ items: [] })),
    },
  },
}));

vi.mock("../../../lib/eventBus", () => ({
  eventBus: {
    subscribe: vi.fn(() => () => {}),
    connected: true,
    onConnection: vi.fn(() => () => {}),
  },
}));

// ChatTab now wires attachment errors through the workspace's addProblem
// action (which the ChatToast container reads), so it must be rendered
// inside the workspace provider.
function renderChatTab(props: { sessionId: string; cwd: string }) {
  return render(
    <ChatWorkspaceProvider>
      <ChatTab {...props} />
    </ChatWorkspaceProvider>
  );
}

describe("ChatTab", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders start prompt placeholder when no run is active", () => {
    renderChatTab({ sessionId: "sess-1", cwd: "/tmp" });
    expect(screen.getByPlaceholderText(/Ask Claude/)).toBeInTheDocument();
  });

  it("renders a textarea for input", () => {
    renderChatTab({ sessionId: "sess-1", cwd: "/tmp" });
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("has a send button disabled when input is empty", () => {
    renderChatTab({ sessionId: "sess-1", cwd: "/tmp" });
    const sendBtn = screen.getByRole("button", { name: /send/i });
    expect(sendBtn).toBeDisabled();
  });

  it("allows typing in the textarea", () => {
    renderChatTab({ sessionId: "sess-1", cwd: "/tmp" });
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "hello world" } });
    expect(textarea).toHaveValue("hello world");
  });

  it("enables send button when text is entered", () => {
    renderChatTab({ sessionId: "sess-1", cwd: "/tmp" });
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "hello" } });
    const sendBtn = screen.getByRole("button", { name: /send/i });
    expect(sendBtn).not.toBeDisabled();
  });
});