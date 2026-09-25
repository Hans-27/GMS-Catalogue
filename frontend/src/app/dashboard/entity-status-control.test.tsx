import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import { EntityStatusControl } from "./entity-status-control";

afterEach(cleanup);

describe("EntityStatusControl", () => {
  it("requires a written reason before disabling a product", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <LanguageProvider>
        <EntityStatusControl
          entityType="product"
          entityName="NM-10 mouse"
          isActive
          onChange={onChange}
        />
      </LanguageProvider>,
    );

    fireEvent.click(
      screen.getByRole("switch", { name: "NM-10 mouse product status" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Disable product" });
    const confirm = within(dialog).getByRole("button", {
      name: "Disable product",
    });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("Reason for disabling"), {
      target: { value: "Duplicate ERP record" },
    });
    fireEvent.click(confirm);

    expect(onChange).toHaveBeenCalledWith(false, "Duplicate ERP record");
  });

  it("re-enables an inactive record without requesting a new reason", () => {
    const onChange = vi.fn().mockResolvedValue(undefined);
    render(
      <LanguageProvider>
        <EntityStatusControl
          entityType="brand"
          entityName="Nubwo"
          isActive={false}
          inactiveReason="Paused"
          onChange={onChange}
        />
      </LanguageProvider>,
    );

    fireEvent.click(
      screen.getByRole("switch", { name: "Nubwo brand status" }),
    );

    expect(onChange).toHaveBeenCalledWith(true, "");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
