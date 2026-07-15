import fs from "fs";
import path from "path";

const DEFAULT_SKIP_DIRS = new Set(["Library", ".Trash", ".cache", ".npm", ".nvm"]);

// 在 searchRoot 下递归查找所有 node_modules 目录（不递归进 node_modules 内部）
export async function findNodeModules(searchRoot, { filter = null, maxDepth = 8, skipDirs = DEFAULT_SKIP_DIRS } = {}) {
  const results = [];

  async function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const subdirs = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") && entry.name !== ".") continue;
      if (skipDirs.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.name === "node_modules") {
        const projectName = path.basename(dir);
        if (!filter || dir.toLowerCase().includes(filter) || projectName.toLowerCase().includes(filter)) {
          try {
            results.push({ name: `${projectName}/node_modules`, fullPath, stat: fs.statSync(fullPath), kb: -1 });
          } catch {}
        }
        // 不递归进 node_modules 内部
        continue;
      }
      subdirs.push(fullPath);
    }
    await Promise.all(subdirs.map(d => walk(d, depth + 1)));
  }

  await walk(searchRoot, 0);
  return results;
}
