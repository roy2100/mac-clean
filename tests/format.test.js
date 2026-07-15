import { describe, test, expect } from "bun:test";
import { formatKB } from "../lib/format.js";

describe("formatKB", () => {
  test("returns '?' for negative (unknown) size", () => {
    expect(formatKB(-1)).toBe("?");
  });

  test("formats sizes under 1024 KB as K", () => {
    expect(formatKB(512)).toBe("512 K");
  });

  test("formats sizes under 1024 MB as M", () => {
    expect(formatKB(1536)).toBe("1.5 M");
  });

  test("formats sizes at or over 1 GB as G", () => {
    expect(formatKB(1024 * 1024 * 2)).toBe("2.0 G");
  });
});
