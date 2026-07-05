import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatMessageList } from "../ChatMessageList";
import type { Envelope, PermissionRequestEnvelope } from "../types";

const request: PermissionRequestEnvelope = {
  type: "permission_request",
  id: "p1",
  tool_name: "Bash",
  description: "Run `ls`?",
};

const userEnv: Envelope = {
  type: "user",
  message: { content: "hello" },
};

const assistantEnv: Envelope = {
  type: "assistant",
  message: { content: [{ type: "text", text: "hi there" }] },
};

const assistantWithToolEnv: Envelope = {
  type: "assistant",
  message: {
    content: [
      { type: "text", text: "I'll list files." },
      {
        type: "tool_use",
        id: "tu1",
        name: "Bash",
        input: { command: "ls -la" },
      },
      {
        type: "tool_result",
        tool_use_id: "tu1",
        content: "file.txt",
        is_error: false,
      },
    ],
  },
};

const assistantWithThinkingEnv: Envelope = {
  type: "assistant",
  message: {
    content: [{ type: "thinking", thinking: "Hmm..." }],
  },
};

const streamingAssistantEmpty: Envelope = {
  type: "assistant",
  message: {
    id: "stream-1",
    content: [],
    _streaming: true,
  },
};

const streamingAssistantText: Envelope = {
  type: "assistant",
  message: {
    id: "stream-2",
    content: [{ type: "text", text: "This is a long streaming text that definitely exceeds forty characters total" }],
    _streaming: true,
  },
};

describe("ChatMessageList", () => {
  it("renders user and assistant envelopes", () => {
    render(
      <ChatMessageList
        envelopes={[userEnv, assistantEnv]}
        isLive={false}
      />,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("hi there")).toBeInTheDocument();
  });

  it("renders an inline permission prompt when a request is active", () => {
    render(
      <ChatMessageList
        envelopes={[userEnv, assistantEnv]}
        isLive={false}
        activePermissionRequest={request}
        onApprovePermission={vi.fn()}
        onRejectPermission={vi.fn()}
      />,
    );
    expect(screen.getByText("Run `ls`?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reject/i })).toBeInTheDocument();
  });

  it("does not render a permission prompt when no request is active", () => {
    render(
      <ChatMessageList
        envelopes={[userEnv, assistantEnv]}
        isLive={false}
      />,
    );
    expect(screen.queryByText("Run `ls`?")).not.toBeInTheDocument();
  });

  it("forwards approve/reject callbacks", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <ChatMessageList
        envelopes={[]}
        isLive={false}
        activePermissionRequest={request}
        onApprovePermission={onApprove}
        onRejectPermission={onReject}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Approve/i }));
    expect(onApprove).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Reject/i }));
    expect(onReject).toHaveBeenCalled();
  });

  it("renders a tool_use block with its paired tool_result", () => {
    const { container } = render(
      <ChatMessageList envelopes={[assistantWithToolEnv]} isLive={false} />,
    );
    expect(screen.getByText("Bash")).toBeInTheDocument();
    expect(screen.getByText("ls -la")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Bash/i }));
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(container.textContent).toContain("file.txt");
  });

  it("renders a thinking block", () => {
    render(<ChatMessageList envelopes={[assistantWithThinkingEnv]} isLive={false} />);
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
  });

  it("shows a streaming indicator while waiting for the first block", () => {
    render(<ChatMessageList envelopes={[streamingAssistantEmpty]} isLive={true} />);
    expect(screen.getByText(/claude is thinking/i)).toBeInTheDocument();
  });

  it("shows a blinking cursor after the last streaming text block", async () => {
    render(<ChatMessageList envelopes={[streamingAssistantText]} isLive={true} />);
    // Wait for animation to settle and cursor to appear
    await new Promise((r) => setTimeout(r, 400));
    // Cursor is the inline pulse element inside the streaming text
    const cursor = document.querySelector('[class*="bg-violet-400"]');
    expect(cursor).toBeInTheDocument();
  });
});
