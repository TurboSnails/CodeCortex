import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlanPanel } from "../PlanPanel";

const plan = {
  changeName: "test-plan",
  tasks: [
    { done: false, text: "Write tests" },
    { done: true, text: "Implement feature" },
  ],
};

describe("PlanPanel", () => {
  it("renders all task texts", () => {
    render(<PlanPanel plan={plan} onToggle={vi.fn()} />);
    expect(screen.getByText("Write tests")).toBeInTheDocument();
    expect(screen.getByText("Implement feature")).toBeInTheDocument();
  });

  it("shows the done/total count", () => {
    render(<PlanPanel plan={plan} onToggle={vi.fn()} />);
    expect(screen.getByText(/1\/2/)).toBeInTheDocument();
  });

  it("calls onToggle with the task index and inverted done state when a task is clicked", () => {
    const onToggle = vi.fn();
    render(<PlanPanel plan={plan} onToggle={onToggle} />);

    fireEvent.click(screen.getByText("Write tests"));

    expect(onToggle).toHaveBeenCalledWith(0, true);
  });

  it("toggles a completed task back to not-done when clicked", () => {
    const onToggle = vi.fn();
    render(<PlanPanel plan={plan} onToggle={onToggle} />);

    fireEvent.click(screen.getByText("Implement feature"));

    expect(onToggle).toHaveBeenCalledWith(1, false);
  });

  it("renders an empty state when there are no tasks", () => {
    render(<PlanPanel plan={{ changeName: "empty", tasks: [] }} onToggle={vi.fn()} />);
    expect(screen.getByText(/no tasks/i)).toBeInTheDocument();
  });
});
