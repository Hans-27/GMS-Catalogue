import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { applicationBranding } from "@/lib/branding";
import { ApplicationLogo } from "./application-logo";

describe("ApplicationLogo", () => {
  it("uses the versioned local logo and an accessible company name", () => {
    render(<ApplicationLogo priority />);
    const logo = screen.getByRole("img", { name: applicationBranding.companyName });
    expect(logo).toHaveAttribute("src", applicationBranding.defaultLogo);
    expect(logo).toHaveAttribute("loading", "eager");
  });

  it("falls back to a readable text mark when the asset cannot load", () => {
    render(<ApplicationLogo />);
    fireEvent.error(screen.getByRole("img", { name: applicationBranding.companyName }));
    expect(screen.getByRole("img", { name: applicationBranding.companyName })).toHaveTextContent("GMS");
  });
});

