import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReviewPanel } from "../ReviewPanel";
import { ReviewPrompt } from "../ReviewPrompt";

describe("ReviewPanel", () => {
  const result = {
    id: 1,
    model: "gemini/gemini-1.5-flash",
    review: "The code looks good. No major issues found.",
    createdAt: new Date().toISOString(),
  };

  it("renders the model name", () => {
    render(<ReviewPanel result={result} onClose={vi.fn()} />);
    expect(screen.getByText(/gemini/i)).toBeInTheDocument();
  });

  it("renders the review text", () => {
    render(<ReviewPanel result={result} onClose={vi.fn()} />);
    expect(screen.getByText(/No major issues found/i)).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<ReviewPanel result={result} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows a spinner when loading prop is true", () => {
    const { container } = render(<ReviewPanel result={null} onClose={vi.fn()} loading />);
    expect(container.querySelector('[data-testid="review-loading"]')).toBeInTheDocument();
  });
});

describe("ReviewPrompt", () => {
  it("renders the session ID context", () => {
    render(<ReviewPrompt sessionId="sess-1" onConfirm={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText(/sess-1/i)).toBeInTheDocument();
  });

  it("calls onConfirm when Yes button is clicked", () => {
    const onConfirm = vi.fn();
    render(<ReviewPrompt sessionId="sess-1" onConfirm={onConfirm} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /yes|审核|review/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onDismiss when No button is clicked", () => {
    const onDismiss = vi.fn();
    render(<ReviewPrompt sessionId="sess-1" onConfirm={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /no|跳过|skip/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
