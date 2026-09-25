import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("local port configuration", () => {
  it("uses port 3000 consistently for frontend commands and local URLs", () => {
    const frontendRoot = process.cwd();
    const packageJson = JSON.parse(
      readFileSync(resolve(frontendRoot, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    for (const scriptName of ["dev", "dev:turbopack", "dev:webpack", "start"]) {
      expect(packageJson.scripts[scriptName], scriptName).toMatch(/(?:-p|--port) 3000(?:\s|$)/);
    }

    const configurationFiles = [
      resolve(frontendRoot, "playwright.overlap.config.ts"),
      resolve(frontendRoot, ".env.e2e.example"),
    ];

    for (const filePath of configurationFiles) {
      const contents = readFileSync(filePath, "utf8");
      expect(contents, filePath).toContain("127.0.0.1:3000");
    }
  });
});
