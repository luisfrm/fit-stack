import { describe, expect, it, vi } from "vitest";
import { apiCode, formatApiErrorMessage, mutationError } from "../src/errors";

describe("formatApiErrorMessage", () => {
  it("returns null for non-object input", () => {
    expect(formatApiErrorMessage(null)).toBeNull();
    expect(formatApiErrorMessage(undefined)).toBeNull();
    expect(formatApiErrorMessage("string")).toBeNull();
  });

  it("formats Zod issues with custom Spanish messages", () => {
    const data = {
      error: {
        issues: [{ message: "El nombre es requerido", path: ["name"] }],
      },
    };
    expect(formatApiErrorMessage(data)).toBe("El nombre es requerido");
  });

  it('formats Zod issues with "Required" message to Spanish', () => {
    const data = {
      error: {
        issues: [{ message: "Required", path: ["email"] }],
      },
    };
    expect(formatApiErrorMessage(data)).toContain("Correo electrónico");
  });

  it("formats multiple issues into a single string", () => {
    const data = {
      error: {
        issues: [
          { message: "Required", path: ["firstName"] },
          { message: "Required", path: ["lastName"] },
        ],
      },
    };
    const result = formatApiErrorMessage(data);
    expect(result).toContain("Nombre");
    expect(result).toContain("Apellido");
  });

  it("extracts message from error.message", () => {
    const data = { error: { message: "Server error occurred" } };
    expect(formatApiErrorMessage(data)).toBe("Server error occurred");
  });

  it("extracts message from error string", () => {
    const data = { error: "Simple error string" };
    expect(formatApiErrorMessage(data)).toBe("Simple error string");
  });

  it("extracts message from message field", () => {
    const data = { message: "Direct message" };
    expect(formatApiErrorMessage(data)).toBe("Direct message");
  });
});

describe("apiCode", () => {
  it("reads the business code from err.data.code", () => {
    expect(apiCode({ data: { code: "SLUG_TAKEN" } })).toBe("SLUG_TAKEN");
  });

  it("returns undefined when there is no code", () => {
    expect(apiCode(new Error("boom"))).toBeUndefined();
    expect(apiCode(null)).toBeUndefined();
  });
});

describe("mutationError", () => {
  it("logs the real error and returns the generic fallback", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(
        mutationError("TestScope", new Error("raw"), "No se pudo guardar"),
      ).toBe("No se pudo guardar");
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
    }
  });
});
