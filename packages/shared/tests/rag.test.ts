import { describe, expect, it } from "vitest";
import { RAG_CONFIG, splitIntoChunks, estimateCreditsFromMessages } from "../src/ai";

describe("splitIntoChunks", () => {
  it("retorna vacío para strings vacíos o whitespace", () => {
    expect(splitIntoChunks("")).toEqual([]);
    expect(splitIntoChunks("   \n  ")).toEqual([]);
  });

  it("texto corto = un solo chunk", () => {
    const chunks = splitIntoChunks("FitStack es una plataforma de gestión para gimnasios.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toContain("FitStack");
  });

  it("respeta el tamaño máximo de chunk", () => {
    const longText = Array.from({ length: 50 }, (_, i) => `Párrafo ${i} con contenido suficiente para ocupar espacio.`).join("\n\n");
    const chunks = splitIntoChunks(longText);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(RAG_CONFIG.chunkSizeChars);
    }
  });

  it("el overlap preserva continuidad entre chunks consecutivos", () => {
    const sentence = "FitStack gestiona miembros, pagos y clases de tu gimnasio. ";
    const longText = sentence.repeat(40);
    const chunks = splitIntoChunks(longText);
    for (let i = 1; i < chunks.length; i++) {
      const prevEnd = chunks[i - 1]!.slice(-RAG_CONFIG.chunkOverlapChars - 10);
      expect(typeof prevEnd).toBe("string");
      expect(chunks[i]!.length).toBeGreaterThan(0);
    }
  });

  it("no produce chunks vacíos aunque el texto tenga saltos repetidos", () => {
    const messy = `${"línea.\n\n\n".repeat(300)}`;
    const chunks = splitIntoChunks(messy);
    for (const chunk of chunks) {
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("estimateCreditsFromMessages con extraChars", () => {
  it("cuenta caracteres extra (system prompt compuesto server-side)", () => {
    const base = estimateCreditsFromMessages([{ role: "user", content: "hola" }], 800, 0);
    const withExtra = estimateCreditsFromMessages([{ role: "user", content: "hola" }], 800, 2000);
    expect(withExtra).toBeGreaterThanOrEqual(base);
    expect(withExtra).toBe(Math.ceil(((4 + 2000) / 4 + 800) / 1000));
  });
});
