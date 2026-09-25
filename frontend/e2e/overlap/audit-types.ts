export type AuditRole =
  | "public"
  | "superadmin"
  | "sales_admin"
  | "sales"
  | "customer";

export type AuditViewport = {
  name: "desktop" | "tablet" | "mobile" | "mobile-small";
  width: number;
  height: number;
};

export type AuditException = {
  id: string;
  first: string;
  second: string;
  reason: string;
};

export type AuditCase = {
  id: string;
  path: string;
  role: AuditRole;
  root: string;
  exceptions?: readonly AuditException[];
};

export type Rectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

export type LayoutFinding = {
  kind:
    | "page-overflow"
    | "viewport-clipping"
    | "sibling-overlap"
    | "control-overlap"
    | "undersized-control";
  severity: "error" | "warning";
  route: string;
  viewport: string;
  first: string;
  second?: string;
  firstRect?: Rectangle;
  secondRect?: Rectangle;
  overlapArea?: number;
  detail: string;
};
