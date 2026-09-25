import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductLifecycleBadge, ProductStatusDialog } from "./product-lifecycle";

describe("Product lifecycle controls", () => {
  it("renders distinct Active and Inactive badges", () => {
    const { rerender } = render(<ProductLifecycleBadge status="active" />);
    expect(screen.getByText("Active")).toBeInTheDocument();
    rerender(<ProductLifecycleBadge status="inactive" />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("explains inactive visibility and requires a note for Other", () => {
    const confirm = vi.fn();
    render(<ProductStatusDialog nextStatus="inactive" reason="other" note="" saving={false} onReason={vi.fn()} onNote={vi.fn()} onCancel={vi.fn()} onConfirm={confirm} />);
    expect(screen.getByText(/hidden from customer-facing catalogues/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("shows the reactivation confirmation and submits it", () => {
    const confirm = vi.fn();
    render(<ProductStatusDialog nextStatus="active" reason="" note="Supplier resumed" saving={false} onReason={vi.fn()} onNote={vi.fn()} onCancel={vi.fn()} onConfirm={confirm} />);
    expect(screen.getByText(/may become visible again/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});
