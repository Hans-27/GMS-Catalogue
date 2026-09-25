import type { Page } from "@playwright/test";
import type {
  AuditCase,
  AuditException,
  AuditViewport,
  LayoutFinding,
} from "./audit-types";

const CANDIDATE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "[role='button']",
  "[role='dialog']",
  "[role='menu']",
  "header",
  "aside",
  "main",
  "nav",
  "section",
  "article",
  "table",
].join(",");

export async function waitForStableLayout(page: Page, root: string) {
  await page.waitForLoadState("domcontentloaded");
  await page.locator(root).first().waitFor({ state: "visible" });
  await page.waitForFunction(
    async ({ selector }) => {
      const target = document.querySelector(selector);
      if (!target) return false;
      if (document.fonts?.status !== "loaded") await document.fonts?.ready;

      const signature = () => {
        const rect = target.getBoundingClientRect();
        return [
          Math.round(rect.x),
          Math.round(rect.y),
          Math.round(rect.width),
          Math.round(rect.height),
          document.documentElement.scrollWidth,
          document.documentElement.scrollHeight,
        ].join(":");
      };

      let previous = signature();
      for (let sample = 0; sample < 3; sample += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const current = signature();
        if (current !== previous) return false;
        previous = current;
      }
      return true;
    },
    { selector: root },
  );
}

export async function collectLayoutFindings(
  page: Page,
  auditCase: AuditCase,
  viewport: AuditViewport,
): Promise<LayoutFinding[]> {
  return page.evaluate(
    ({ candidateSelector, currentCase, currentViewport }) => {
      type Candidate = {
        element: Element;
        selector: string;
        rect: DOMRect;
        interactive: boolean;
        fixedOrSticky: boolean;
      };

      const findings: LayoutFinding[] = [];
      const route = currentCase.path;
      const viewportName = currentViewport.name;
      const root = document.documentElement;
      const documentWidth = Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0);

      const describe = (element: Element) => {
        if (element.id) return `#${CSS.escape(element.id)}`;
        const testId = element.getAttribute("data-testid");
        if (testId) return `[data-testid=${JSON.stringify(testId)}]`;
        const role = element.getAttribute("role");
        const name = element.getAttribute("aria-label")?.trim();
        if (role && name) return `[role=${JSON.stringify(role)}][aria-label=${JSON.stringify(name)}]`;
        const className =
          typeof (element as HTMLElement).className === "string"
            ? (element as HTMLElement).className.trim().split(/\s+/)[0]
            : "";
        if (className) return `${element.tagName.toLowerCase()}.${CSS.escape(className)}`;
        return element.tagName.toLowerCase();
      };

      const toRectangle = (rect: DOMRect) => ({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      });

      const visible = (element: Element, style: CSSStyleDeclaration, rect: DOMRect) =>
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || "1") > 0 &&
        rect.width > 0 &&
        rect.height > 0 &&
        !element.hasAttribute("hidden") &&
        element.getAttribute("aria-hidden") !== "true";

      const interactiveSelector =
        "button,a[href],input,select,textarea,[role='button'],[role='menuitem']";
      const candidates: Candidate[] = Array.from(
        document.querySelectorAll(candidateSelector),
      )
        .map((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (!visible(element, style, rect)) return null;
          return {
            element,
            selector: describe(element),
            rect,
            interactive: element.matches(interactiveSelector),
            fixedOrSticky: style.position === "fixed" || style.position === "sticky",
          };
        })
        .filter((candidate): candidate is Candidate => candidate !== null);

      if (documentWidth > currentViewport.width + 1) {
        findings.push({
          kind: "page-overflow",
          severity: "error",
          route,
          viewport: viewportName,
          first: "html",
          detail: `Document width ${documentWidth}px exceeds viewport ${currentViewport.width}px.`,
        });
      }

      for (const candidate of candidates) {
        if (
          candidate.fixedOrSticky &&
          (candidate.rect.left < -1 ||
            candidate.rect.right > currentViewport.width + 1 ||
            candidate.rect.top < -1 ||
            candidate.rect.bottom > currentViewport.height + 1)
        ) {
          findings.push({
            kind: "viewport-clipping",
            severity: "error",
            route,
            viewport: viewportName,
            first: candidate.selector,
            firstRect: toRectangle(candidate.rect),
            detail: "A visible fixed or sticky element extends outside the viewport.",
          });
        }

        if (candidate.interactive) {
          const isInlineTextLink =
            candidate.element.matches("a[href]") &&
            getComputedStyle(candidate.element).display === "inline" &&
            Boolean(candidate.element.textContent?.trim());
          const requiredTarget = currentViewport.width <= 760 ? 44 : 24;
          if (!isInlineTextLink && (candidate.rect.width < requiredTarget || candidate.rect.height < requiredTarget)) {
            findings.push({
              kind: "undersized-control",
              severity: "error",
              route,
              viewport: viewportName,
              first: candidate.selector,
              firstRect: toRectangle(candidate.rect),
              detail: `Interactive control is smaller than the required ${requiredTarget}px target.`,
            });
          } else if (
            !isInlineTextLink &&
            currentViewport.width > 760 &&
            (candidate.rect.width < 40 || candidate.rect.height < 40)
          ) {
            findings.push({
              kind: "undersized-control",
              severity: "warning",
              route,
              viewport: viewportName,
              first: candidate.selector,
              firstRect: toRectangle(candidate.rect),
              detail: "Interactive control is smaller than the preferred 40px target.",
            });
          }
        }
      }

      const matchesException = (
        exceptions: readonly AuditException[] | undefined,
        first: Candidate,
        second: Candidate,
      ) =>
        (exceptions ?? []).some(
          (exception) =>
            (first.element.matches(exception.first) &&
              second.element.matches(exception.second)) ||
            (first.element.matches(exception.second) &&
              second.element.matches(exception.first)),
        );

      for (let firstIndex = 0; firstIndex < candidates.length; firstIndex += 1) {
        const first = candidates[firstIndex];
        for (let secondIndex = firstIndex + 1; secondIndex < candidates.length; secondIndex += 1) {
          const second = candidates[secondIndex];
          if (first.element.contains(second.element) || second.element.contains(first.element)) continue;
          if (first.element.parentElement !== second.element.parentElement) continue;
          if (!first.interactive && !second.interactive) continue;

          const width =
            Math.min(first.rect.right, second.rect.right) -
            Math.max(first.rect.left, second.rect.left);
          const height =
            Math.min(first.rect.bottom, second.rect.bottom) -
            Math.max(first.rect.top, second.rect.top);
          const overlapArea = width > 0 && height > 0 ? width * height : 0;
          if (overlapArea <= 4 || matchesException(currentCase.exceptions, first, second)) continue;

          findings.push({
            kind: first.interactive && second.interactive ? "control-overlap" : "sibling-overlap",
            severity: "error",
            route,
            viewport: viewportName,
            first: first.selector,
            second: second.selector,
            firstRect: toRectangle(first.rect),
            secondRect: toRectangle(second.rect),
            overlapArea,
            detail: "Visible sibling elements occupy the same rendered area.",
          });
        }
      }

      return findings;
    },
    {
      candidateSelector: CANDIDATE_SELECTOR,
      currentCase: auditCase,
      currentViewport: viewport,
    },
  );
}
