import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlanningPrompt } from "../PlanningPrompt";

const mockSession = {
  id: "session-1",
  name: "my-project - session-1",
  status: "active" as const,
  cwd: "/Users/me/my-project",
  model: null,
  started_at: new Date().toISOString(),
  ended_at: null,
  metadata: null,
};

describe("PlanningPrompt", () => {
  it("renders the session name", () => {
    render(<PlanningPrompt session={mockSession} onSkip={vi.fn()} onPlan={vi.fn()} />);
    expect(screen.getByText(/my-project/i)).toBeInTheDocument();
  });

  it("calls onSkip when Skip button is clicked", () => {
    const onSkip = vi.fn();
    render(<PlanningPrompt session={mockSession} onSkip={onSkip} onPlan={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it("calls onPlan with the description when Plan button is clicked", () => {
    const onPlan = vi.fn();
    render(<PlanningPrompt session={mockSession} onSkip={vi.fn()} onPlan={onPlan} />);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Build the auth module" } });
    fireEvent.click(screen.getByRole("button", { name: /plan/i }));

    expect(onPlan).toHaveBeenCalledWith("Build the auth module");
  });

  it("does not call onPlan when description is empty", () => {
    const onPlan = vi.fn();
    render(<PlanningPrompt session={mockSession} onSkip={vi.fn()} onPlan={onPlan} />);
    fireEvent.click(screen.getByRole("button", { name: /plan/i }));
    expect(onPlan).not.toHaveBeenCalled();
  });

  it("shows loading state when submitting prop is true", () => {
    render(
      <PlanningPrompt session={mockSession} onSkip={vi.fn()} onPlan={vi.fn()} submitting />
    );
    expect(screen.getByRole("button", { name: /planning/i })).toBeDisabled();
  });
});
