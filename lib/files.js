import fs from "fs";
import path from "path";

const DEFAULT_SKIP_DIRS = new Set([".Trash"]);

// 在 searchRoot 下递归查找所有文件，按大小返回（大小直接取自 stat，无需 du）
export async function findLargeFiles(searchRoot, { filter = null, maxDepth = 8, skipDirs = DEFAULT_SKIP_DIRS } = {}) {
  const results = [];

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        if (filter && !fullPath.toLowerCase().includes(filter)) continue;
        try {
          const stat = fs.statSync(fullPath);
          results.push({ name: path.relative(searchRoot, fullPath), fullPath, stat, kb: Math.round(stat.size / 1024) });
        } catch {}
      }
    }
  }

  walk(searchRoot, 0);
  return results;
}
