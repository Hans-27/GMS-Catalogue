import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import { LoginForm } from "./login-form";

const { replace, refresh, login } = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  login: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, login };
});

describe("LoginForm routing", () => {
  beforeEach(() => {
    window.localStorage.setItem("gms-catalogue-language", "en");
    login.mockResolvedValue({
      id: "customer-user-1",
      username: "customer",
      email: "customer@example.com",
      full_name: "Customer Account",
      roles: ["customer_user"],
      permissions: ["catalogues.view"],
    });
  });

  it("sends customer accounts to the customer portal after sign in", async () => {
    render(
      <LanguageProvider>
        <LoginForm />
      </LanguageProvider>,
    );

    fireEvent.change(screen.getByLabelText("Username or email"), {
      target: { value: "customer" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "CustomerPassword123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/customer"));
  });
});
