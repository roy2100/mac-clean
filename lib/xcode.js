import fs from "fs";
import os from "os";
import { getSizeKB } from "./format.js";

const HOME = os.homedir();

export const XCODE_DIRS = [
  { dir: `${HOME}/Library/Developer/Xcode/DerivedData`,      label: "DerivedData（编译索引/构建产物）" },
  { dir: `${HOME}/Library/Caches/com.apple.dt.Xcode`,         label: "Xcode Caches（运行时缓存）" },
  { dir: `${HOME}/Library/Developer/Xcode/iOS DeviceSupport`, label: "iOS DeviceSupport（真机调试符号）" },
  { dir: `${HOME}/Library/Developer/Xcode/Archives`,          label: "Archives（打包历史 .xcarchive）" },
];

// 检查已知 Xcode 缓存目录是否存在，附带各自大小，按大小降序返回。
// exists/sizeOf 可注入替换（用于单元测试），默认使用真实文件系统 / du。
export async function scanXcodeDirs(filter = null, { dirs = XCODE_DIRS, exists = fs.existsSync, sizeOf = getSizeKB } = {}) {
  const candidates = dirs.filter(({ dir, label }) => {
    if (!exists(dir)) return false;
    if (filter && !dir.toLowerCase().includes(filter) && !label.toLowerCase().includes(filter)) return false;
    return true;
  });

  const sizes = await Promise.all(candidates.map(({ dir }) => sizeOf(dir)));
  return candidates
    .map(({ dir, label }, i) => ({ dir, label, kb: sizes[i] }))
    .sort((a, b) => b.kb - a.kb);
}
