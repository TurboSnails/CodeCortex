import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityBar } from "../ActivityBar";

describe("ActivityBar", () => {
  it("renders Explorer and Settings but not Source Control", () => {
    render(<ActivityBar active="explorer" onChange={vi.fn()} />);
    expect(screen.getByTitle("Explorer")).toBeInTheDocument();
    expect(screen.getByTitle("Settings")).toBeInTheDocument();
    expect(screen.queryByTitle("Source Control")).not.toBeInTheDocument();
  });
});
