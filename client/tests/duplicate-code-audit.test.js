import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const file = (path) => new URL(`../${path}`, import.meta.url);
const read = (path) => readFileSync(file(path), "utf8");

describe("duplicate code audit and cleanup", () => {
  describe("removed duplicate components", () => {
    it("removes unused shared/Button.jsx", () => {
      expect(existsSync(file("src/components/shared/Button.jsx"))).toBe(false);
    });

    it("removes unused shared/Card.jsx", () => {
      expect(existsSync(file("src/components/shared/Card.jsx"))).toBe(false);
    });

    it("removes unused shared/FormInput.js", () => {
      expect(existsSync(file("src/components/shared/FormInput.js"))).toBe(false);
    });

    it("removes unused shared/LoadingSpinner.jsx", () => {
      expect(existsSync(file("src/components/shared/LoadingSpinner.jsx"))).toBe(false);
    });
  });

  describe("retained canonical components", () => {
    it("retains used ui/Button.jsx", () => {
      expect(existsSync(file("src/components/ui/Button.jsx"))).toBe(true);
      const button = read("src/components/ui/Button.jsx");
      expect(button).toContain("export default function Button");
      expect(button).toContain("Spinner");
    });

    it("retains used ui/Spinner.jsx", () => {
      expect(existsSync(file("src/components/ui/Spinner.jsx"))).toBe(true);
      const spinner = read("src/components/ui/Spinner.jsx");
      expect(spinner).toContain("export default function Spinner");
    });

    it("retains used NavMobile.jsx that imports ui/Button", () => {
      expect(existsSync(file("src/components/shared/NavMobile.jsx"))).toBe(true);
      const navMobile = read("src/components/shared/NavMobile.jsx");
      expect(navMobile).toContain("import { Button } from '@/components/ui'");
      expect(navMobile).toContain("<Button variant=\"outline\"");
      expect(navMobile).toContain("<Button variant=\"primary\"");
    });
  });

  describe("removed unused ui components", () => {
    it("removes unused ui/Card.jsx", () => {
      expect(existsSync(file("src/components/ui/Card.jsx"))).toBe(false);
    });

    it("removes unused ui/Input.jsx", () => {
      expect(existsSync(file("src/components/ui/Input.jsx"))).toBe(false);
    });

    it("removes unused ui/Alert.jsx", () => {
      expect(existsSync(file("src/components/ui/Alert.jsx"))).toBe(false);
    });
  });

  describe("intentionally retained different implementations", () => {
    it("retains both api-key and api-keys pages as they serve different purposes", () => {
      // api-key: single key management (legacy)
      expect(existsSync(file("src/app/settings/api-key/page.jsx"))).toBe(true);
      const singular = read("src/app/settings/api-key/page.jsx");
      expect(singular).toContain("getApiKeyMeta");
      expect(singular).toContain("createUserApiKey");
      expect(singular).toContain("revokeUserApiKey");
      expect(singular).toContain("API Key"); // Singular title

      // api-keys: multiple named keys management (new)
      expect(existsSync(file("src/app/settings/api-keys/page.jsx"))).toBe(true);
      const plural = read("src/app/settings/api-keys/page.jsx");
      expect(plural).toContain("listApiKeys");
      expect(plural).toContain("createNamedApiKey");
      expect(plural).toContain("revokeApiKeyByKeyId");
      expect(plural).toContain("API Keys"); // Plural title
    });

    it("retains all auth pages as they have distinct purposes", () => {
      expect(existsSync(file("src/app/login/page.js"))).toBe(true);
      expect(existsSync(file("src/app/register/page.js"))).toBe(true);
      expect(existsSync(file("src/app/forgot-password/page.js"))).toBe(true);
      expect(existsSync(file("src/app/reset-password/page.js"))).toBe(true);
    });
  });

  describe("regression tests for retained functionality", () => {
    it("retains ui/Button with all variants and loading state", () => {
      const button = read("src/components/ui/Button.jsx");
      expect(button).toContain("variantClasses");
      expect(button).toContain("primary");
      expect(button).toContain("secondary");
      expect(button).toContain("outline");
      expect(button).toContain("ghost");
      expect(button).toContain("danger");
      expect(button).toContain("isLoading");
      expect(button).toContain("sizeClasses");
    });

    it("retains ui/Spinner with all size variants", () => {
      const spinner = read("src/components/ui/Spinner.jsx");
      expect(spinner).toContain("sizeClasses");
      expect(spinner).toContain("sm");
      expect(spinner).toContain("md");
      expect(spinner).toContain("lg");
      expect(spinner).toContain("animate-spin");
    });
  });
});
