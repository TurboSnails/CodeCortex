import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChatInput, type ChatSlashCommand } from "../ChatInput";
import { api } from "../../../lib/api";

vi.mock("../../../lib/api", () => ({
  api: {
    run: {
      files: vi.fn(),
    },
  },
}));

const COMMANDS: ChatSlashCommand[] = [
  { name: "clear", description: "Clear conversation", source: "builtin" },
  { name: "compact", description: "Compact context", source: "builtin" },
  { name: "config", description: "Open config", source: "builtin" },
  { name: "review", description: "Review changes", source: "project" },
  { name: "demo-skill", description: "A demo skill", source: "skill" },
];

function setup(props: Partial<Parameters<typeof ChatInput>[0]> = {}) {
  const onChange = vi.fn();
  const onSend = vi.fn();
  const onStop = vi.fn();
  const utils = render(
    <ChatInput
      value=""
      onChange={onChange}
      onSend={onSend}
      onStop={onStop}
      slashCommands={COMMANDS}
      fileCwd="/tmp"
      {...props}
    />,
  );
  return { ...utils, onChange, onSend, onStop };
}

describe("ChatInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the textarea and send button", () => {
    setup();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
  });

  it("opens a slash-command dropdown when / is typed", () => {
    setup();
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/", selectionStart: 1 } });
    expect(screen.getByText(/clear/)).toBeInTheDocument();
    expect(screen.getByText(/compact/)).toBeInTheDocument();
  });

  it("filters slash commands as the user types", () => {
    setup();
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/co", selectionStart: 3 } });
    expect(screen.getByText("/compact")).toBeInTheDocument();
    expect(screen.getByText("/config")).toBeInTheDocument();
    expect(screen.queryByText("/clear")).not.toBeInTheDocument();
  });

  it("inserts the selected slash command on Enter", () => {
    const { onChange } = setup();
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/co", selectionStart: 3 } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("/config");
  });

  it("inserts the selected slash command on Tab", () => {
    const { onChange } = setup();
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/co", selectionStart: 3 } });
    fireEvent.keyDown(textarea, { key: "Tab" });
    expect(onChange).toHaveBeenCalledWith("/config");
  });

  it("navigates the dropdown with arrow keys", () => {
    const { onChange } = setup();
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/c", selectionStart: 2 } });
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("/config");
  });

  it("renders skill commands with a distinct badge", () => {
    setup();
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/demo", selectionStart: 5 } });
    expect(screen.getByText("/demo-skill")).toBeInTheDocument();
    expect(screen.getByText("skill")).toBeInTheDocument();
  });

  it("closes the dropdown on Escape", () => {
    setup();
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/", selectionStart: 1 } });
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(screen.queryByText(/clear/)).not.toBeInTheDocument();
  });

  it("fetches and shows file suggestions when @ is typed", async () => {
    (api.run.files as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: ["src/App.tsx", "src/index.css"],
    });
    setup();
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "@src", selectionStart: 4 } });
    vi.advanceTimersByTime(200);
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "src/App.tsx" })).toBeInTheDocument();
    });
    expect(screen.getByRole("option", { name: "src/index.css" })).toBeInTheDocument();
  });

  it("inserts the selected file on Enter", async () => {
    (api.run.files as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: ["src/App.tsx"],
    });
    const { onChange } = setup();
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "@App", selectionStart: 4 } });
    vi.advanceTimersByTime(200);
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "src/App.tsx" })).toBeInTheDocument();
    });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("@src/App.tsx");
  });

  it("does not fetch files when no fileCwd is provided", async () => {
    setup({ fileCwd: undefined });
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "@x", selectionStart: 2 } });
    vi.advanceTimersByTime(200);
    expect(api.run.files).not.toHaveBeenCalled();
  });

  it("sends the message on Enter when autocomplete is closed", () => {
    const { onSend } = setup({ value: "hello" });
    const textarea = screen.getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSend).toHaveBeenCalled();
  });

  it("does not send when Shift+Enter is pressed", () => {
    const { onSend } = setup({ value: "hello" });
    const textarea = screen.getByRole("textbox");
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });
});
