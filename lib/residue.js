import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const HOME = os.homedir();

export const SCAN_DIRS = [
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

export const SKIP_PATTERNS = [
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

export function shouldSkip(name) {
  return SKIP_PATTERNS.some(re => re.test(name));
}

// 遍历 SCAN_DIRS，收集候选残留条目（不含大小、不做 orphan 过滤）
export function collectResidueSections(filter = null, { dirs = SCAN_DIRS } = {}) {
  const sections = [];
  const unreadableDirs = [];

  for (const { dir, label } of dirs) {
    if (!fs.existsSync(dir)) continue;

    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      unreadableDirs.push(dir);
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

  return { sections, unreadableDirs };
}

// 过滤掉对应 app 仍已安装的条目，丢弃过滤后变空的 section
export function filterOrphanSections(sections, installed) {
  return sections
    .map(section => ({
      ...section,
      items: section.items.filter(item => !isActiveApp(item.name, installed)),
    }))
    .filter(section => section.items.length > 0);
}

export async function getInstalledApps() {
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

export function isActiveApp(name, { bundleIds, appNames }) {
  const lower = name.toLowerCase();
  if (appNames.has(lower)) return true;
  if (bundleIds.has(lower)) return true;
  for (const id of bundleIds) {
    if (lower.startsWith(id) || id.startsWith(lower + ".")) return true;
  }
  return false;
}
