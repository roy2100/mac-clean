import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import { findNodeModules } from "../lib/npm.js";

describe("findNodeModules", () => {
  let root;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "mac-clean-npm-"));

    // root/project-a/node_modules
    fs.mkdirSync(path.join(root, "project-a", "node_modules"), { recursive: true });
    // root/nested/project-b/node_modules
    fs.mkdirSync(path.join(root, "nested", "project-b", "node_modules"), { recursive: true });
    // root/nested/project-b/node_modules/some-dep/node_modules (must NOT be found — inside node_modules)
    fs.mkdirSync(path.join(root, "nested", "project-b", "node_modules", "some-dep", "node_modules"), { recursive: true });
    // root/.cache/project-c/node_modules (must be skipped — under .cache)
    fs.mkdirSync(path.join(root, ".cache", "project-c", "node_modules"), { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test("finds top-level node_modules without recursing into them", async () => {
    const results = await findResultNames(root);
    expect(results).toContain("project-a/node_modules");
    expect(results).toContain("project-b/node_modules");
    expect(results.some(name => name.includes("some-dep"))).toBe(false);
  });

  test("does not descend into skipped directories (.cache)", async () => {
    const results = await findNodeModules(root);
    expect(results.some(r => r.fullPath.includes(".cache"))).toBe(false);
  });

  test("filters by project/path keyword", async () => {
    const results = await findNodeModules(root, { filter: "project-a" });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("project-a/node_modules");
  });

  async function findResultNames(searchRoot) {
    const results = await findNodeModules(searchRoot);
    return results.map(r => r.name);
  }
});
