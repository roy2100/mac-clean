import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import { shouldSkip, isActiveApp, collectResidueSections, filterOrphanSections } from "../lib/residue.js";

describe("shouldSkip", () => {
  test("skips known Apple system entries", () => {
    expect(shouldSkip("com.apple.Safari")).toBe(true);
    expect(shouldSkip("Spotlight")).toBe(true);
  });

  test("does not skip regular third-party entries", () => {
    expect(shouldSkip("com.spotify.client")).toBe(false);
  });
});

describe("isActiveApp", () => {
  const installed = {
    bundleIds: new Set(["com.spotify.client"]),
    appNames: new Set(["spotify"]),
  };

  test("matches by app name", () => {
    expect(isActiveApp("Spotify", installed)).toBe(true);
  });

  test("matches by bundle id prefix", () => {
    expect(isActiveApp("com.spotify.client.helper", installed)).toBe(true);
  });

  test("does not match uninstalled apps", () => {
    expect(isActiveApp("com.uninstalled.app", installed)).toBe(false);
  });
});

describe("collectResidueSections", () => {
  let root;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "mac-clean-residue-"));
    fs.mkdirSync(path.join(root, "CacheDir"));
    fs.writeFileSync(path.join(root, "CacheDir", "com.apple.Safari"), "");
    fs.writeFileSync(path.join(root, "CacheDir", "com.spotify.client"), "");
    fs.writeFileSync(path.join(root, "CacheDir", "com.finance.app"), "");
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const dirs = () => [{ dir: path.join(root, "CacheDir"), label: "Test Cache" }];

  test("skips Apple system entries, keeps third-party ones", () => {
    const { sections } = collectResidueSections(null, { dirs: dirs() });
    expect(sections).toHaveLength(1);
    const names = sections[0].items.map(i => i.name).sort();
    expect(names).toEqual(["com.finance.app", "com.spotify.client"]);
  });

  test("applies keyword filter", () => {
    const { sections } = collectResidueSections("finance", { dirs: dirs() });
    expect(sections[0].items.map(i => i.name)).toEqual(["com.finance.app"]);
  });

  test("reports unreadable dirs and omits missing dirs entirely", () => {
    const missing = path.join(root, "does-not-exist");
    const { sections, unreadableDirs } = collectResidueSections(null, {
      dirs: [{ dir: missing, label: "Missing" }],
    });
    expect(sections).toHaveLength(0);
    expect(unreadableDirs).toHaveLength(0); // non-existent dir is skipped, not "unreadable"
  });
});

describe("filterOrphanSections", () => {
  test("drops active-app items and empty sections", () => {
    const sections = [
      {
        dir: "/x", label: "X",
        items: [{ name: "spotify", fullPath: "/x/spotify" }, { name: "old-app", fullPath: "/x/old-app" }],
      },
      {
        dir: "/y", label: "Y",
        items: [{ name: "spotify", fullPath: "/y/spotify" }],
      },
    ];
    const installed = { bundleIds: new Set(), appNames: new Set(["spotify"]) };

    const result = filterOrphanSections(sections, installed);
    expect(result).toHaveLength(1);
    expect(result[0].items.map(i => i.name)).toEqual(["old-app"]);
  });
});
