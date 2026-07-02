import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PermissionPrompt } from "../PermissionPrompt";
import type { PermissionRequestEnvelope } from "../types";

const request: PermissionRequestEnvelope = {
  type: "permission_request",
  id: "p1",
  tool_name: "Bash",
  description: "List files",
};

describe("PermissionPrompt", () => {
  it("calls onApprove when Approve is clicked", () => {
    const onApprove = vi.fn();
    render(
      <PermissionPrompt
        request={request}
        onApprove={onApprove}
        onReject={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Approve/i }));
    expect(onApprove).toHaveBeenCalled();
  });

  it("calls onReject when Reject is clicked", () => {
    const onReject = vi.fn();
    render(
      <PermissionPrompt
        request={request}
        onApprove={vi.fn()}
        onReject={onReject}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Reject/i }));
    expect(onReject).toHaveBeenCalled();
  });

  it("disables both buttons when disabled is true", () => {
    render(
      <PermissionPrompt
        request={request}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        disabled
      />
    );
    expect(screen.getByRole("button", { name: /Approve/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Reject/i })).toBeDisabled();
  });

  it("renders the permission description", () => {
    render(
      <PermissionPrompt
        request={request}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );
    expect(screen.getByText("List files")).toBeInTheDocument();
  });
});
