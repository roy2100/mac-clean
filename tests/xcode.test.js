import { describe, test, expect } from "bun:test";
import { scanXcodeDirs } from "../lib/xcode.js";

describe("scanXcodeDirs", () => {
  const dirs = [
    { dir: "/fake/DerivedData", label: "DerivedData（编译索引/构建产物）" },
    { dir: "/fake/Caches/com.apple.dt.Xcode", label: "Xcode Caches（运行时缓存）" },
    { dir: "/fake/iOS DeviceSupport", label: "iOS DeviceSupport（真机调试符号）" },
    { dir: "/fake/Archives", label: "Archives（打包历史 .xcarchive）" },
  ];
  const sizeMap = {
    "/fake/DerivedData": 1024,
    "/fake/Caches/com.apple.dt.Xcode": 512,
    "/fake/iOS DeviceSupport": 4096,
  };
  const exists = dir => dir in sizeMap;
  const sizeOf = async dir => sizeMap[dir];

  test("skips non-existent directories and sorts by size descending", async () => {
    const result = await scanXcodeDirs(null, { dirs, exists, sizeOf });
    expect(result.map(r => r.dir)).toEqual([
      "/fake/iOS DeviceSupport",
      "/fake/DerivedData",
      "/fake/Caches/com.apple.dt.Xcode",
    ]);
  });

  test("filters by keyword against path or label", async () => {
    const result = await scanXcodeDirs("derived", { dirs, exists, sizeOf });
    expect(result).toHaveLength(1);
    expect(result[0].dir).toBe("/fake/DerivedData");
  });

  test("filters by keyword against the Chinese label", async () => {
    const result = await scanXcodeDirs("真机", { dirs, exists, sizeOf });
    expect(result).toHaveLength(1);
    expect(result[0].dir).toBe("/fake/iOS DeviceSupport");
  });

  test("returns empty when nothing exists", async () => {
    const result = await scanXcodeDirs(null, { dirs, exists: () => false, sizeOf });
    expect(result).toEqual([]);
  });
});
