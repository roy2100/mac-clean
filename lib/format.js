import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function getSizeKB(fullPath) {
  try {
    const { stdout } = await execFileAsync("du", ["-sk", fullPath]);
    return parseInt(stdout.split("\t")[0].trim(), 10);
  } catch {
    return -1;
  }
}

export function formatKB(kb) {
  if (kb < 0)            return "?";
  if (kb < 1024)         return `${kb} K`;
  if (kb < 1024 * 1024)  return `${(kb / 1024).toFixed(1)} M`;
  return `${(kb / (1024 * 1024)).toFixed(1)} G`;
}
