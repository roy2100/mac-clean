import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// 判断命令是否由 node/bun/deno 或包管理器驱动
const NODE_EXEC_RE = /(^|\/)(node|bun|deno)(\s|$)|(^|\/)(npm|npx|yarn|pnpm)(\s|$)/i;
export function isNodeProc(cmd) {
  return NODE_EXEC_RE.test(cmd) || /node_modules\/\.bin\//.test(cmd);
}

// 命中即认为是"开发进程"（dev server / watcher / bundler …）
const DEV_PATTERNS = [
  /\b(run|exec)\s+(dev|start|serve|watch|develop|storybook)\b/i,
  /\bvite\b/i,
  /webpack(-dev-server)?\b/i,
  /\bnext\b\s+(dev|start)\b|next-server\b/i,
  /\bnuxt\b/i,
  /\bnodemon\b/i,
  /\bts-node\b/i,
  /\btsx\b\s+watch\b/i,
  /\bparcel\b/i,
  /\bastro\b\s+dev\b/i,
  /\bremix\b\s+(dev|vite:dev)\b/i,
  /\bng\b\s+serve\b/i,
  /\breact-scripts\b\s+start\b/i,
  /\bvue-cli-service\b\s+serve\b/i,
  /\bgatsby\b\s+develop\b/i,
  /\bstorybook\b/i,
  /node_modules\/\.bin\/(vite|webpack|next|nuxt|nodemon|tsx|astro|remix|parcel|rollup|serve|nest|ng)/i,
];
export function isDevProc(cmd) {
  return DEV_PATTERNS.some(re => re.test(cmd));
}

// 明确排除的进程：编辑器内置 node、MCP 服务、Claude 等，避免误杀
const EXCLUDE_PATTERNS = [
  /ClaudeCode\.app/i,
  /(^|\/|\s)claude(\s|$)/i,
  /-mcp\b/i,
  /mcp[-_]?server/i,
  /modelcontextprotocol/i,
  /Visual Studio Code|Code Helper|vscode|node\.mojom/i,
  /Cursor|cursor/,
  /language.?server|tsserver|typescript-language-server/i,
  /copilot/i,
];
export function isExcludedProc(cmd) {
  return EXCLUDE_PATTERNS.some(re => re.test(cmd));
}

const PS_LINE_RE = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/;

// 解析单行 `ps -o pid=,ppid=,pgid=,rss=,etime=,command=` 输出；
// 返回残余 Node 开发进程描述对象，不匹配/被排除时返回 null
export function parsePsLine(line, { selfPid, selfPpid, filter = null } = {}) {
  const m = line.match(PS_LINE_RE);
  if (!m) return null;

  const [, pidS, ppidS, pgidS, rssS, etime, command] = m;
  const pid = parseInt(pidS, 10);
  const ppid = parseInt(ppidS, 10);
  const pgid = parseInt(pgidS, 10);
  const kb = parseInt(rssS, 10);

  if (pid === selfPid || ppid === selfPid || pid === selfPpid) return null;
  if (!isNodeProc(command)) return null;
  if (isExcludedProc(command)) return null;
  if (!isDevProc(command)) return null;
  if (filter && !command.toLowerCase().includes(filter)) return null;

  return { pid, ppid, pgid, kb, etime, command, orphaned: ppid === 1 };
}

// 扫描当前所有残余的 Node 开发进程
export async function findNodeProcs({ filter = null } = {}) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync("ps", ["-axww", "-o", "pid=,ppid=,pgid=,rss=,etime=,command="]));
  } catch {
    return [];
  }

  const selfPid = process.pid;
  const selfPpid = process.ppid;
  const results = [];

  for (const line of stdout.split("\n")) {
    const proc = parsePsLine(line, { selfPid, selfPpid, filter });
    if (proc) results.push(proc);
  }
  return results;
}
