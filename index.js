#!/usr/bin/env bun

/**
 * scan-remnants.js — 扫描 macOS app 卸载残留文件 / npm node_modules / Downloads 大文件
 *
 * 用法：
 *   bun index.js                        # 扫描所有已知残留目录
 *   bun index.js spotify                # 只看包含 "spotify" 的条目
 *   bun index.js --size                 # 附带显示磁盘占用
 *   bun index.js --paths                # 只输出路径，适合管道删除
 *   bun index.js --large                # 只展示 100MB 以上的条目（自动显示大小）
 *   bun index.js --orphans              # 只展示对应 app 已卸载的条目
 *   bun index.js --npm                  # 扫描 HOME 下所有 node_modules 目录
 *   bun index.js --npm --size           # 同上，附带磁盘占用
 *   bun index.js --npm --large          # 只展示 100MB 以上的 node_modules
 *   bun index.js --npm myproject        # 只展示路径包含 "myproject" 的 node_modules
 *   bun index.js --downloads            # 扫描 Downloads 下的大文件（默认 ≥50MB）
 *   bun index.js --downloads --large    # 只展示 100MB 以上的文件
 *   bun index.js --downloads dmg        # 只展示路径包含 "dmg" 的大文件
 *
 * 删除示例：
 *   bun index.js --paths spotify        # 预览路径
 *   bun index.js --paths spotify | xargs rm -rf
 *   bun index.js --npm --paths | xargs rm -rf   # 删除所有 node_modules
 *   bun index.js --downloads --paths | xargs rm -rf   # 删除所有大文件
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// ──────────────────────────────────────────────
// 配置
// ──────────────────────────────────────────────
const HOME = os.homedir();

const SCAN_DIRS = [
  { dir: `${HOME}/Library/Application Support`, label: "App Support (用户)" },
  { dir: `${HOME}/Library/Preferences`,         label: "Preferences (plist)" },
  { dir: `${HOME}/Library/Caches`,              label: "Caches (用户)" },
  { dir: `${HOME}/Library/Logs`,                label: "Logs (用户)" },
  { dir: `${HOME}/Library/Containers`,          label: "Containers (沙盒)" },
  { dir: `${HOME}/Library/Group Containers`,    label: "Group Containers" },
  { dir: `${HOME}/Library/LaunchAgents`,        label: "LaunchAgents (用户)" },
  { dir: `/Library/Application Support`,        label: "App Support (系统)" },
  { dir: `/Library/LaunchAgents`,               label: "LaunchAgents (系统)" },
  { dir: `/Library/LaunchDaemons`,              label: "LaunchDaemons (系统)" },
  { dir: `/Library/PrivilegedHelperTools`,      label: "PrivilegedHelperTools" },
];

const SKIP_PATTERNS = [
  /^com\.apple\./i,
  /^Apple$/i,
  /^MobileSync$/i,
  /^Spotlight$/i,
  /^Safari$/i,
  /^iCloud$/i,
  /^CloudDocs$/i,
  /^CallHistoryDB$/i,
  /^AddressBook$/i,
  /^com\.crashlytics\./i,
];

// ──────────────────────────────────────────────
// CLI 参数解析
// ──────────────────────────────────────────────
const args = process.argv.slice(2);
const showSize    = args.includes("--size");
const pathsOnly   = args.includes("--paths");
const largeOnly   = args.includes("--large");
const orphansOnly = args.includes("--orphans");
const scanNpm     = args.includes("--npm");
const scanDownloads = args.includes("--downloads");
const filterRaw   = args.find(a => !a.startsWith("--"));
const filter      = filterRaw ? filterRaw.toLowerCase() : null;

const LARGE_THRESHOLD_KB = 100 * 1024;
// Downloads 模式默认门槛：≥50MB 才算"大文件"
const DOWNLOADS_THRESHOLD_KB = 50 * 1024;

// ──────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────

async function getSizeKB(fullPath) {
  try {
    const { stdout } = await execFileAsync("du", ["-sk", fullPath]);
    return parseInt(stdout.split("\t")[0].trim(), 10);
  } catch {
    return -1;
  }
}

function formatKB(kb) {
  if (kb < 0)            return "?";
  if (kb < 1024)         return `${kb} K`;
  if (kb < 1024 * 1024)  return `${(kb / 1024).toFixed(1)} M`;
  return `${(kb / (1024 * 1024)).toFixed(1)} G`;
}

function shouldSkip(name) {
  return SKIP_PATTERNS.some(re => re.test(name));
}

async function getInstalledApps() {
  const appDirs = ["/Applications", `${HOME}/Applications`];
  const bundleIds = new Set();
  const appNames = new Set();

  const tasks = [];
  for (const appDir of appDirs) {
    if (!fs.existsSync(appDir)) continue;
    let apps;
    try { apps = fs.readdirSync(appDir); } catch { continue; }
    for (const app of apps) {
      if (!app.endsWith(".app")) continue;
      appNames.add(app.replace(/\.app$/, "").toLowerCase());
      const plistPath = path.join(appDir, app, "Contents", "Info.plist");
      if (!fs.existsSync(plistPath)) continue;
      tasks.push(
        execFileAsync("plutil", ["-convert", "json", "-o", "-", plistPath])
          .then(({ stdout }) => {
            const info = JSON.parse(stdout);
            if (info.CFBundleIdentifier)  bundleIds.add(info.CFBundleIdentifier.toLowerCase());
            if (info.CFBundleDisplayName) appNames.add(info.CFBundleDisplayName.toLowerCase());
            if (info.CFBundleName)        appNames.add(info.CFBundleName.toLowerCase());
          })
          .catch(() => {})
      );
    }
  }
  await Promise.all(tasks);
  return { bundleIds, appNames };
}

function isActiveApp(name, { bundleIds, appNames }) {
  const lower = name.toLowerCase();
  if (appNames.has(lower)) return true;
  if (bundleIds.has(lower)) return true;
  for (const id of bundleIds) {
    if (lower.startsWith(id) || id.startsWith(lower + ".")) return true;
  }
  return false;
}

// 在 searchRoot 下递归查找所有 node_modules 目录（不递归进 node_modules 内部）
async function findNodeModules(searchRoot, maxDepth = 8) {
  const results = [];
  const SKIP_DIRS = new Set(["Library", ".Trash", ".cache", ".npm", ".nvm"]);

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
      if (SKIP_DIRS.has(entry.name)) continue;
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

// 在 searchRoot 下递归查找所有文件，按大小返回（大小直接取自 stat，无需 du）
async function findLargeFiles(searchRoot, maxDepth = 8) {
  const results = [];
  const SKIP_DIRS = new Set([".Trash"]);

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
        if (SKIP_DIRS.has(entry.name)) continue;
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

const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  cyan:   "\x1b[36m",
  yellow: "\x1b[33m",
  green:  "\x1b[32m",
  gray:   "\x1b[90m",
};

// ──────────────────────────────────────────────
// 主逻辑
// ──────────────────────────────────────────────

const DOWNLOADS_DIR = `${HOME}/Downloads`;

if (!pathsOnly) {
  const title = scanDownloads
    ? "📥 Downloads 大文件扫描器"
    : scanNpm
      ? "📦 npm node_modules 扫描器"
      : "🔍 macOS 卸载残留扫描器";
  console.log(`\n${c.bold}${title}${c.reset}`);
  if (filter)        console.log(`${c.yellow}过滤关键词：${filter}${c.reset}`);
  if (showSize)      console.log(`${c.yellow}已开启大小统计（较慢）${c.reset}`);
  if (largeOnly)     console.log(`${c.yellow}只显示 100MB 以上的条目${c.reset}`);
  if (orphansOnly)   console.log(`${c.yellow}只显示对应 app 已卸载的条目${c.reset}`);
  if (scanNpm)       console.log(`${c.yellow}搜索根目录：${HOME}${c.reset}`);
  if (scanDownloads) {
    const thresholdKb = largeOnly ? LARGE_THRESHOLD_KB : DOWNLOADS_THRESHOLD_KB;
    console.log(`${c.yellow}搜索目录：${DOWNLOADS_DIR}${c.reset}`);
    console.log(`${c.yellow}门槛：≥${formatKB(thresholdKb)}${c.reset}`);
  }
  console.log();
}

const needSize = showSize || largeOnly;
let totalCount = 0;

if (scanDownloads) {
  // ── Downloads 大文件扫描模式 ───────────────────
  const thresholdKb = largeOnly ? LARGE_THRESHOLD_KB : DOWNLOADS_THRESHOLD_KB;
  const allFiles = await findLargeFiles(DOWNLOADS_DIR);

  const displayItems = allFiles
    .filter(item => item.kb >= thresholdKb)
    .sort((a, b) => b.kb - a.kb);

  if (!pathsOnly && displayItems.length > 0) {
    console.log(`${c.cyan}${c.bold}▸ Downloads 大文件${c.reset}`);
    console.log(`${c.gray}  ${DOWNLOADS_DIR}${c.reset}`);
  }

  for (const { name, fullPath, kb } of displayItems) {
    if (pathsOnly) {
      console.log(fullPath);
    } else {
      console.log(`  📄 ${name}  ${c.green}${formatKB(kb)}${c.reset}`);
      console.log(`     ${c.gray}${fullPath}${c.reset}`);
    }
    totalCount++;
  }

  if (!pathsOnly && displayItems.length > 0) console.log();

} else if (scanNpm) {
  // ── npm node_modules 扫描模式 ─────────────────
  const npmItems = await findNodeModules(HOME);

  if (needSize) {
    const sizes = await Promise.all(npmItems.map(item => getSizeKB(item.fullPath)));
    npmItems.forEach((item, i) => { item.kb = sizes[i]; });
  }

  let displayItems = largeOnly
    ? npmItems.filter(item => item.kb >= LARGE_THRESHOLD_KB)
    : npmItems;

  if (needSize) displayItems = [...displayItems].sort((a, b) => b.kb - a.kb);

  if (!pathsOnly && displayItems.length > 0) {
    console.log(`${c.cyan}${c.bold}▸ node_modules 目录${c.reset}`);
    console.log(`${c.gray}  ${HOME}${c.reset}`);
  }

  for (const { name, fullPath, kb } of displayItems) {
    if (pathsOnly) {
      console.log(fullPath);
    } else {
      const sizeStr = needSize ? `  ${c.green}${formatKB(kb)}${c.reset}` : "";
      console.log(`  📦 ${name}${sizeStr}`);
      console.log(`     ${c.gray}${fullPath}${c.reset}`);
    }
    totalCount++;
  }

  if (!pathsOnly && displayItems.length > 0) console.log();

} else {
  // ── macOS 残留扫描模式 ────────────────────────

  // 第一遍：收集所有候选条目
  const sections = [];
  for (const { dir, label } of SCAN_DIRS) {
    if (!fs.existsSync(dir)) continue;

    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      if (!pathsOnly) console.log(`${c.gray}[跳过] ${dir}  (无读取权限)${c.reset}`);
      continue;
    }

    const items = entries
      .filter(name => {
        if (shouldSkip(name)) return false;
        if (filter && !name.toLowerCase().includes(filter)) return false;
        return true;
      })
      .map(name => {
        const fullPath = path.join(dir, name);
        try {
          return { name, fullPath, stat: fs.statSync(fullPath), kb: -1 };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    if (items.length > 0) sections.push({ dir, label, items });
  }

  // 第二遍：过滤掉仍在安装的 app（仅 --orphans 时）
  if (orphansOnly) {
    const installed = await getInstalledApps();
    for (const section of sections) {
      section.items = section.items.filter(item => !isActiveApp(item.name, installed));
    }
    sections.splice(0, sections.length, ...sections.filter(s => s.items.length > 0));
  }

  // 第三遍：并发获取所有条目大小（仅 --size / --large 时）
  if (needSize) {
    const allItems = sections.flatMap(s => s.items);
    const sizes = await Promise.all(allItems.map(item => getSizeKB(item.fullPath)));
    allItems.forEach((item, i) => { item.kb = sizes[i]; });
  }

  // 第四遍：过滤 + 排序 + 打印
  for (const { dir, label, items } of sections) {
    let displayItems = largeOnly
      ? items.filter(item => item.kb >= LARGE_THRESHOLD_KB)
      : items;

    if (displayItems.length === 0) continue;

    if (needSize) displayItems = [...displayItems].sort((a, b) => b.kb - a.kb);

    if (!pathsOnly) {
      console.log(`${c.cyan}${c.bold}▸ ${label}${c.reset}`);
      console.log(`${c.gray}  ${dir}${c.reset}`);
    }

    for (const { name, fullPath, stat, kb } of displayItems) {
      if (pathsOnly) {
        console.log(fullPath);
      } else {
        const icon    = stat.isDirectory() ? "📁" : "📄";
        const sizeStr = needSize ? `  ${c.green}${formatKB(kb)}${c.reset}` : "";
        console.log(`  ${icon} ${name}${sizeStr}`);
      }
      totalCount++;
    }

    if (!pathsOnly) console.log();
  }
}

// ──────────────────────────────────────────────
// 汇总
// ──────────────────────────────────────────────
if (!pathsOnly) {
  if (totalCount === 0) {
    const msg = scanDownloads
      ? (filter ? `未找到包含 "${filter}" 的大文件` : "未找到大文件")
      : scanNpm
        ? (filter ? `未找到包含 "${filter}" 的 node_modules 目录` : "未找到 node_modules 目录")
        : (filter ? `未找到包含 "${filter}" 的残留条目` : "未找到明显残留");
    console.log(`${c.green}✅ ${msg}${c.reset}\n`);
  } else if (scanDownloads) {
    console.log(`${c.bold}共找到 ${c.yellow}${totalCount}${c.reset}${c.bold} 个大文件${c.reset}`);
    console.log(`${c.dim}💡 删除示例：bun index.js --downloads --paths | xargs rm -rf${c.reset}\n`);
  } else if (scanNpm) {
    console.log(`${c.bold}共找到 ${c.yellow}${totalCount}${c.reset}${c.bold} 个 node_modules 目录${c.reset}`);
    console.log(`${c.dim}💡 删除示例：bun index.js --npm --paths | xargs rm -rf${c.reset}\n`);
  } else {
    console.log(`${c.bold}共找到 ${c.yellow}${totalCount}${c.reset}${c.bold} 个条目${c.reset}`);
    console.log(`${c.dim}⚠️  删除前请确认，部分文件可能仍被其他 app 使用${c.reset}\n`);
  }
}
