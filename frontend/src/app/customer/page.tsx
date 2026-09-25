import type { Metadata } from "next";
import { Suspense } from "react";
import { CustomerPortal } from "./customer-portal";

export const metadata: Metadata = { title: "Customer Portal | GMS Catalogue" };

export default function CustomerPortalPage() {
  return (
    <Suspense fallback={<main>Preparing your customer portal…</main>}>
      <CustomerPortal />
    </Suspense>
  );
}
