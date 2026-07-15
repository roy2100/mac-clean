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
 *   bun index.js --procs                # 扫描残余的 Node 开发进程（npm run dev / vite / webpack …）
 *   bun index.js --procs --large        # 只展示 RSS ≥100MB 的进程
 *   bun index.js --procs finance        # 只展示命令行包含 "finance" 的进程
 *   bun index.js --xcode                # 扫描 Xcode 缓存（DerivedData / Caches / DeviceSupport / Archives）
 *
 * 删除示例：
 *   bun index.js --paths spotify        # 预览路径
 *   bun index.js --paths spotify | xargs rm -rf
 *   bun index.js --npm --paths | xargs rm -rf   # 删除所有 node_modules
 *   bun index.js --downloads --paths | xargs rm -rf   # 删除所有大文件
 *   bun index.js --procs --paths | xargs kill   # 结束所有残余 Node 开发进程
 *   bun index.js --xcode --paths | xargs rm -rf # 删除所有 Xcode 缓存目录
 */

import os from "os";
import { getSizeKB, formatKB } from "./lib/format.js";
import { collectResidueSections, filterOrphanSections, getInstalledApps } from "./lib/residue.js";
import { findNodeModules } from "./lib/npm.js";
import { findLargeFiles } from "./lib/files.js";
import { findNodeProcs } from "./lib/procs.js";
import { scanXcodeDirs } from "./lib/xcode.js";

const HOME = os.homedir();

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
const scanProcs   = args.includes("--procs");
const scanXcode   = args.includes("--xcode");
const filterRaw   = args.find(a => !a.startsWith("--"));
const filter      = filterRaw ? filterRaw.toLowerCase() : null;

const LARGE_THRESHOLD_KB = 100 * 1024;
// Downloads 模式默认门槛：≥50MB 才算"大文件"
const DOWNLOADS_THRESHOLD_KB = 50 * 1024;

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
  const title = scanProcs
    ? "🧹 残余 Node 开发进程扫描器"
    : scanXcode
      ? "🛠️  Xcode 缓存扫描器"
      : scanDownloads
        ? "📥 Downloads 大文件扫描器"
        : scanNpm
          ? "📦 npm node_modules 扫描器"
          : "🔍 macOS 卸载残留扫描器";
  console.log(`\n${c.bold}${title}${c.reset}`);
  if (filter)        console.log(`${c.yellow}过滤关键词：${filter}${c.reset}`);
  if (showSize && !scanProcs) console.log(`${c.yellow}已开启大小统计（较慢）${c.reset}`);
  if (largeOnly)     console.log(`${c.yellow}只显示 100MB 以上的条目${c.reset}`);
  if (orphansOnly)   console.log(`${c.yellow}只显示对应 app 已卸载的条目${c.reset}`);
  if (scanNpm)       console.log(`${c.yellow}搜索根目录：${HOME}${c.reset}`);
  if (scanProcs)     console.log(`${c.yellow}匹配：npm run dev / vite / webpack / nodemon 等（已排除 Claude、MCP、编辑器内置 node）${c.reset}`);
  if (scanXcode)     console.log(`${c.yellow}检查：DerivedData / Caches / iOS DeviceSupport / Archives${c.reset}`);
  if (scanDownloads) {
    const thresholdKb = largeOnly ? LARGE_THRESHOLD_KB : DOWNLOADS_THRESHOLD_KB;
    console.log(`${c.yellow}搜索目录：${DOWNLOADS_DIR}${c.reset}`);
    console.log(`${c.yellow}门槛：≥${formatKB(thresholdKb)}${c.reset}`);
  }
  console.log();
}

const needSize = showSize || largeOnly;
let totalCount = 0;

if (scanProcs) {
  // ── 残余 Node 开发进程扫描模式 ─────────────────
  const procItems = await findNodeProcs({ filter });

  let displayItems = largeOnly
    ? procItems.filter(p => p.kb >= LARGE_THRESHOLD_KB)
    : procItems;
  displayItems = [...displayItems].sort((a, b) => b.kb - a.kb);

  if (!pathsOnly && displayItems.length > 0) {
    console.log(`${c.cyan}${c.bold}▸ Node 开发进程${c.reset}`);
  }

  for (const p of displayItems) {
    if (pathsOnly) {
      console.log(p.pid);
    } else {
      const orphanTag = p.orphaned ? `  ${c.yellow}[孤儿·父进程已退出]${c.reset}` : "";
      console.log(`  ⚙️  ${c.bold}PID ${p.pid}${c.reset}  ${c.green}${formatKB(p.kb)}${c.reset}  ${c.gray}运行 ${p.etime}${c.reset}${orphanTag}`);
      console.log(`     ${p.command}`);
      console.log(`     ${c.gray}PPID ${p.ppid} · 进程组 ${p.pgid}${c.reset}`);
    }
    totalCount++;
  }

  if (!pathsOnly && displayItems.length > 0) console.log();

} else if (scanXcode) {
  // ── Xcode 缓存扫描模式 ─────────────────────────
  const xcodeItems = await scanXcodeDirs(filter);

  if (!pathsOnly && xcodeItems.length > 0) {
    console.log(`${c.cyan}${c.bold}▸ Xcode 缓存目录${c.reset}`);
  }

  for (const { dir, label, kb } of xcodeItems) {
    if (pathsOnly) {
      console.log(dir);
    } else {
      console.log(`  📁 ${label}  ${c.green}${formatKB(kb)}${c.reset}`);
      console.log(`     ${c.gray}${dir}${c.reset}`);
    }
    totalCount++;
  }

  if (!pathsOnly && xcodeItems.length > 0) console.log();

} else if (scanDownloads) {
  // ── Downloads 大文件扫描模式 ───────────────────
  const thresholdKb = largeOnly ? LARGE_THRESHOLD_KB : DOWNLOADS_THRESHOLD_KB;
  const allFiles = await findLargeFiles(DOWNLOADS_DIR, { filter });

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
  const npmItems = await findNodeModules(HOME, { filter });

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
  const { sections: rawSections, unreadableDirs } = collectResidueSections(filter);

  if (!pathsOnly) {
    for (const dir of unreadableDirs) {
      console.log(`${c.gray}[跳过] ${dir}  (无读取权限)${c.reset}`);
    }
  }

  // 过滤掉仍在安装的 app（仅 --orphans 时）
  let sections = rawSections;
  if (orphansOnly) {
    const installed = await getInstalledApps();
    sections = filterOrphanSections(sections, installed);
  }

  // 并发获取所有条目大小（仅 --size / --large 时）
  if (needSize) {
    const allItems = sections.flatMap(s => s.items);
    const sizes = await Promise.all(allItems.map(item => getSizeKB(item.fullPath)));
    allItems.forEach((item, i) => { item.kb = sizes[i]; });
  }

  // 过滤 + 排序 + 打印
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
    const msg = scanProcs
      ? (filter ? `未找到包含 "${filter}" 的残余 Node 开发进程` : "未找到残余 Node 开发进程")
      : scanXcode
        ? (filter ? `未找到包含 "${filter}" 的 Xcode 缓存目录` : "未找到 Xcode 缓存目录")
        : scanDownloads
          ? (filter ? `未找到包含 "${filter}" 的大文件` : "未找到大文件")
          : scanNpm
            ? (filter ? `未找到包含 "${filter}" 的 node_modules 目录` : "未找到 node_modules 目录")
            : (filter ? `未找到包含 "${filter}" 的残留条目` : "未找到明显残留");
    console.log(`${c.green}✅ ${msg}${c.reset}\n`);
  } else if (scanProcs) {
    console.log(`${c.bold}共找到 ${c.yellow}${totalCount}${c.reset}${c.bold} 个残余 Node 开发进程${c.reset}`);
    console.log(`${c.dim}💡 结束示例：bun index.js --procs --paths | xargs kill${c.reset}`);
    console.log(`${c.dim}⚠️  结束前请确认，避免误杀正在使用的开发服务${c.reset}\n`);
  } else if (scanXcode) {
    console.log(`${c.bold}共找到 ${c.yellow}${totalCount}${c.reset}${c.bold} 个 Xcode 缓存目录${c.reset}`);
    console.log(`${c.dim}💡 删除示例：bun index.js --xcode --paths | xargs rm -rf${c.reset}`);
    console.log(`${c.dim}⚠️  iOS DeviceSupport 删除后无法在对应旧版 iOS 真机上调试；Archives 删除后将丢失历史打包的符号文件${c.reset}\n`);
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
