import { afterEach, describe, expect, it, vi } from "vitest";
import { isAdminRelaxedAuth } from "./admin-config";

describe("isAdminRelaxedAuth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is true only in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isAdminRelaxedAuth()).toBe(true);
  });

  it("is false in production even if ADMIN_RELAXED_AUTH is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_RELAXED_AUTH", "true");
    expect(isAdminRelaxedAuth()).toBe(false);
  });
});
