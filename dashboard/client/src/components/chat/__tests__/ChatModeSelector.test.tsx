import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("shows a step-chain hover preview for OpenSpec mode", () => {
    render(<ChatModeSelector mode="normal" onChange={vi.fn()} />);
    const openSpecBtn = screen.getByRole("radio", { name: "OpenSpec" });
    fireEvent.mouseEnter(openSpecBtn.parentElement!, { clientX: 10, clientY: 10 });
    expect(screen.getByText(/opsx:explore/)).toBeInTheDocument();
    expect(screen.getByText(/opsx:archive/)).toBeInTheDocument();
  });

  it("shows no hover preview for the normal mode", () => {
    render(<ChatModeSelector mode="normal" onChange={vi.fn()} />);
    const normalBtn = screen.getByRole("radio", { name: "普通" });
    fireEvent.mouseEnter(normalBtn, { clientX: 10, clientY: 10 });
    expect(screen.queryByText(/自动执行/)).not.toBeInTheDocument();
  });
});
