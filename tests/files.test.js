import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import { findLargeFiles } from "../lib/files.js";

describe("findLargeFiles", () => {
  let root;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "mac-clean-files-"));
    fs.writeFileSync(path.join(root, "movie.dmg"), Buffer.alloc(2048));
    fs.writeFileSync(path.join(root, "notes.txt"), Buffer.alloc(10));
    fs.mkdirSync(path.join(root, "sub"));
    fs.writeFileSync(path.join(root, "sub", "installer.dmg"), Buffer.alloc(4096));
    fs.mkdirSync(path.join(root, ".Trash"));
    fs.writeFileSync(path.join(root, ".Trash", "deleted.dmg"), Buffer.alloc(9999));
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test("finds files recursively with size in KB", async () => {
    const results = await findLargeFiles(root);
    const byName = Object.fromEntries(results.map(r => [r.name, r.kb]));
    expect(byName["movie.dmg"]).toBe(2);
    expect(byName[path.join("sub", "installer.dmg")]).toBe(4);
  });

  test("skips .Trash", async () => {
    const results = await findLargeFiles(root);
    expect(results.some(r => r.fullPath.includes(".Trash"))).toBe(false);
  });

  test("filters by keyword in path", async () => {
    const results = await findLargeFiles(root, { filter: "sub" });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe(path.join("sub", "installer.dmg"));
  });
});
