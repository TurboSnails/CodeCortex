import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatModeSelector } from "../ChatModeSelector";

describe("ChatModeSelector", () => {
  it("renders four mode buttons", () => {
    render(<ChatModeSelector mode="normal" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "普通" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "OpenSpec" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Superpower" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Superflow" })).toBeInTheDocument();
  });

  it("calls onChange when a different mode is clicked", async () => {
    const onChange = vi.fn();
    render(<ChatModeSelector mode="normal" onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "OpenSpec" }));
    expect(onChange).toHaveBeenCalledWith("openspec");
  });
});
