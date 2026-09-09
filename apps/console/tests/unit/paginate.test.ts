import { describe, expect, it } from "vitest";
import { paginate } from "../../lib/paginate";

describe("paginate", () => {
  const items = [1, 2, 3, 4, 5, 6, 7];

  it("returns the page slice", () => {
    expect(paginate(items, 1, 3)).toEqual([1, 2, 3]);
    expect(paginate(items, 2, 3)).toEqual([4, 5, 6]);
  });

  it("returns a partial last page", () => {
    expect(paginate(items, 3, 3)).toEqual([7]);
  });

  it("returns empty when the page is out of range", () => {
    expect(paginate(items, 4, 3)).toEqual([]);
  });

  it("clamps invalid pages to the first page", () => {
    expect(paginate(items, 0, 3)).toEqual([1, 2, 3]);
    expect(paginate(items, -2, 3)).toEqual([1, 2, 3]);
  });
});
