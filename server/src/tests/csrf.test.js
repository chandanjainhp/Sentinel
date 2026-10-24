/**
 * CSRF Protection Tests
 * 
 * Tests for the CSRF middleware implementation.
 * These tests verify that CSRF protection is properly enforced for
 * cookie-based authenticated requests.
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "bun:test";

import { csrfProtection } from "../middlewares/csrf.middleware.js";
import { ApiError } from "../utils/api-error.js";

// Mock request and response objects
function createMockRequest(options = {}) {
  return {
    method: options.method || "GET",
    headers: options.headers || {},
    cookies: options.cookies || {},
    ...options,
  };
}

function createMockResponse() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

// Helper to call the middleware and catch errors
async function callMiddleware(middleware, req, res) {
  try {
    await middleware(req, res, vi.fn());
    return { error: null, res };
  } catch (error) {
    return { error, res };
  }
}

describe("CSRF Middleware", () => {
  beforeEach(() => {
    // Reset environment for each test
    process.env.NODE_ENV = "test";
  });

  describe("GET requests", () => {
    it("should allow GET requests without CSRF check", async () => {
      const req = createMockRequest({
        method: "GET",
        cookies: { accessToken: "some-token" },
      });
      const res = createMockResponse();

      const result = await callMiddleware(csrfProtection, req, res);
      
      expect(result.error).toBeNull();
    });

    it("should allow HEAD requests without CSRF check", async () => {
      const req = createMockRequest({
        method: "HEAD",
        cookies: { accessToken: "some-token" },
      });
      const res = createMockResponse();

      const result = await callMiddleware(csrfProtection, req, res);
      
      expect(result.error).toBeNull();
    });

    it("should allow OPTIONS requests without CSRF check", async () => {
      const req = createMockRequest({
        method: "OPTIONS",
        cookies: { accessToken: "some-token" },
      });
      const res = createMockResponse();

      const result = await callMiddleware(csrfProtection, req, res);
      
      expect(result.error).toBeNull();
    });
  });

  describe("POST requests", () => {
    it("should allow POST with Bearer token (no CSRF check)", async () => {
      const req = createMockRequest({
        method: "POST",
        headers: { authorization: "Bearer some-token" },
      });
      const res = createMockResponse();

      const result = await callMiddleware(csrfProtection, req, res);
      
      expect(result.error).toBeNull();
    });

    it("should skip CSRF in test mode", async () => {
      const req = createMockRequest({
        method: "POST",
        cookies: { accessToken: "some-token" },
      });
      const res = createMockResponse();

      const result = await callMiddleware(csrfProtection, req, res);
      
      // In test mode, should pass without error
      expect(result.error).toBeNull();
    });
  });

  describe("PUT requests", () => {
    it("should allow PUT with Bearer token", async () => {
      const req = createMockRequest({
        method: "PUT",
        headers: { authorization: "Bearer some-token" },
      });
      const res = createMockResponse();

      const result = await callMiddleware(csrfProtection, req, res);
      
      expect(result.error).toBeNull();
    });

    it("should skip in test mode", async () => {
      const req = createMockRequest({
        method: "PUT",
        cookies: { accessToken: "some-token" },
      });
      const res = createMockResponse();

      const result = await callMiddleware(csrfProtection, req, res);
      
      expect(result.error).toBeNull();
    });
  });

  describe("PATCH requests", () => {
    it("should allow PATCH with Bearer token", async () => {
      const req = createMockRequest({
        method: "PATCH",
        headers: { authorization: "Bearer some-token" },
      });
      const res = createMockResponse();

      const result = await callMiddleware(csrfProtection, req, res);
      
      expect(result.error).toBeNull();
    });

    it("should skip in test mode", async () => {
      const req = createMockRequest({
        method: "PATCH",
        cookies: { accessToken: "some-token" },
      });
      const res = createMockResponse();

      const result = await callMiddleware(csrfProtection, req, res);
      
      expect(result.error).toBeNull();
    });
  });

  describe("DELETE requests", () => {
    it("should allow DELETE with Bearer token", async () => {
      const req = createMockRequest({
        method: "DELETE",
        headers: { authorization: "Bearer some-token" },
      });
      const res = createMockResponse();

      const result = await callMiddleware(csrfProtection, req, res);
      
      expect(result.error).toBeNull();
    });

    it("should skip in test mode", async () => {
      const req = createMockRequest({
        method: "DELETE",
        cookies: { accessToken: "some-token" },
      });
      const res = createMockResponse();

      const result = await callMiddleware(csrfProtection, req, res);
      
      expect(result.error).toBeNull();
    });
  });

  describe("Non-test mode behavior", () => {
    it("should check Origin header for POST with cookies in non-test mode", async () => {
      // Temporarily set NODE_ENV to production for this test
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        const req = createMockRequest({
          method: "POST",
          cookies: { accessToken: "some-token" },
          // No Origin header
        });
        const res = createMockResponse();

        // Set CORS_ORIGIN so we can test
        process.env.CORS_ORIGIN = "http://localhost:3000";

        const result = await callMiddleware(csrfProtection, req, res);
        
        // Without Origin header, should fail
        expect(result.error).toBeDefined();
        expect(result.error.message).toContain("Cross-origin");
      } finally {
        process.env.NODE_ENV = originalEnv;
        delete process.env.CORS_ORIGIN;
      }
    });

    it("should allow valid Origin header", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        process.env.CORS_ORIGIN = "http://localhost:3000";

        const req = createMockRequest({
          method: "POST",
          cookies: { accessToken: "some-token" },
          headers: { origin: "http://localhost:3000" },
        });
        const res = createMockResponse();

        const result = await callMiddleware(csrfProtection, req, res);
        
        // Should pass with valid Origin
        expect(result.error).toBeNull();
      } finally {
        process.env.NODE_ENV = originalEnv;
        delete process.env.CORS_ORIGIN;
      }
    });

    it("should reject invalid Origin header", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        process.env.CORS_ORIGIN = "http://localhost:3000";

        const req = createMockRequest({
          method: "POST",
          cookies: { accessToken: "some-token" },
          headers: { origin: "http://evil.com" },
        });
        const res = createMockResponse();

        const result = await callMiddleware(csrfProtection, req, res);
        
        // Should fail with invalid Origin
        expect(result.error).toBeDefined();
        expect(result.error.message).toContain("Cross-origin");
      } finally {
        process.env.NODE_ENV = originalEnv;
        delete process.env.CORS_ORIGIN;
      }
    });

    it("should allow localhost origins with any port", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        process.env.CORS_ORIGIN = "http://localhost:3000";

        // Test with different port
        const req = createMockRequest({
          method: "POST",
          cookies: { accessToken: "some-token" },
          headers: { origin: "http://localhost:8080" },
        });
        const res = createMockResponse();

        const result = await callMiddleware(csrfProtection, req, res);
        
        // Should pass because both are localhost
        expect(result.error).toBeNull();
      } finally {
        process.env.NODE_ENV = originalEnv;
        delete process.env.CORS_ORIGIN;
      }
    });
  });

  describe("Edge cases", () => {
    it("should skip if no cookies", async () => {
      process.env.NODE_ENV = "production";
      process.env.CORS_ORIGIN = "http://localhost:3000";

      try {
        const req = createMockRequest({
          method: "POST",
          // No cookies
          headers: {},
        });
        const res = createMockResponse();

        const result = await callMiddleware(csrfProtection, req, res);
        
        // Should pass because no cookie auth
        expect(result.error).toBeNull();
      } finally {
        delete process.env.CORS_ORIGIN;
      }
    });

    it("should skip if no accessToken cookie", async () => {
      process.env.NODE_ENV = "production";
      process.env.CORS_ORIGIN = "http://localhost:3000";

      try {
        const req = createMockRequest({
          method: "POST",
          cookies: { someOtherCookie: "value" },
        });
        const res = createMockResponse();

        const result = await callMiddleware(csrfProtection, req, res);
        
        // Should pass because no accessToken cookie
        expect(result.error).toBeNull();
      } finally {
        delete process.env.CORS_ORIGIN;
      }
    });

    it("should use referer header if origin is missing", async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        process.env.CORS_ORIGIN = "http://localhost:3000";

        const req = createMockRequest({
          method: "POST",
          cookies: { accessToken: "some-token" },
          headers: { referer: "http://localhost:3000/some-page" },
        });
        const res = createMockResponse();

        const result = await callMiddleware(csrfProtection, req, res);
        
        // Should pass with valid referer
        expect(result.error).toBeNull();
      } finally {
        process.env.NODE_ENV = originalEnv;
        delete process.env.CORS_ORIGIN;
      }
    });
  });
});
