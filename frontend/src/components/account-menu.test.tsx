import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/api";
import { AccountMenu } from "./account-menu";

const user: AuthenticatedUser = {
  id: "admin-1",
  username: "superadmin",
  email: "admin@example.com",
  full_name: "Super Administrator",
  roles: ["superadmin"],
  permissions: [],
  is_superadmin: true,
  department: "Catalogue Department",
};

describe("AccountMenu", () => {
  it("shows the signed-in user's name, email, role and department", () => {
    render(
      <AccountMenu
        user={user}
        roleLabel="SuperAdmin"
        canViewSettings
        onSignOut={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Account menu for Super Administrator",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("SuperAdmin")).toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getAllByText("Super Administrator")).toHaveLength(2);
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("Catalogue Department")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveAttribute(
      "href",
      "/admin/settings/general",
    );
  });

  it("uses a clear fallback when the user has no department", () => {
    render(
      <AccountMenu
        user={{ ...user, department: null }}
        roleLabel="SuperAdmin"
        canViewSettings={false}
        onSignOut={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Account menu for Super Administrator",
      }),
    );

    expect(screen.getByText("Not assigned")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("signs out and supports Escape and outside-click dismissal", async () => {
    const onSignOut = vi.fn().mockResolvedValue(undefined);
    render(
      <div data-testid="outside">
        <AccountMenu
          user={user}
          roleLabel="SuperAdmin"
          canViewSettings
          onSignOut={onSignOut}
        />
      </div>,
    );

    const trigger = screen.getByRole("button", {
      name: "Account menu for Super Administrator",
    });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
  });
});
