import { describe, test, expect } from "bun:test";
import { isNodeProc, isDevProc, isExcludedProc, parsePsLine } from "../lib/procs.js";

describe("isNodeProc", () => {
  test("matches npm/vite invocations", () => {
    expect(isNodeProc("npm run dev")).toBe(true);
    expect(isNodeProc("/usr/local/bin/node server.js")).toBe(true);
  });

  test("does not match unrelated commands", () => {
    expect(isNodeProc("/usr/bin/ssh user@host")).toBe(false);
  });
});

describe("isDevProc", () => {
  test("matches known dev-server patterns", () => {
    expect(isDevProc("npm run dev")).toBe(true);
    expect(isDevProc("node_modules/.bin/vite")).toBe(true);
  });

  test("does not match a one-off script", () => {
    expect(isDevProc("node build.js")).toBe(false);
  });
});

describe("isExcludedProc", () => {
  test("excludes Claude Code and MCP processes", () => {
    expect(isExcludedProc("/Applications/ClaudeCode.app/Contents/MacOS/claude")).toBe(true);
    expect(isExcludedProc("node some-mcp-server.js")).toBe(true);
  });

  test("does not exclude a normal dev server", () => {
    expect(isExcludedProc("npm run dev")).toBe(false);
  });
});

describe("parsePsLine", () => {
  const ctx = { selfPid: 100, selfPpid: 1 };

  function line({ pid = 200, ppid = 1, pgid = 200, rss = 51200, etime = "01:00", command }) {
    return `${pid} ${ppid} ${pgid} ${rss} ${etime} ${command}`;
  }

  test("parses a matching dev-server process", () => {
    const result = parsePsLine(line({ command: "npm run dev" }), ctx);
    expect(result).toMatchObject({ pid: 200, ppid: 1, kb: 51200, orphaned: true });
  });

  test("returns null for the caller's own process tree", () => {
    expect(parsePsLine(line({ pid: 100, command: "npm run dev" }), ctx)).toBeNull();
    expect(parsePsLine(line({ ppid: 100, command: "npm run dev" }), ctx)).toBeNull();
  });

  test("returns null for excluded processes", () => {
    expect(parsePsLine(line({ command: "node some-mcp-server.js" }), ctx)).toBeNull();
  });

  test("returns null for non-dev node processes", () => {
    expect(parsePsLine(line({ command: "node build.js" }), ctx)).toBeNull();
  });

  test("returns null for malformed lines", () => {
    expect(parsePsLine("not a valid ps line", ctx)).toBeNull();
  });

  test("applies keyword filter against the command line", () => {
    expect(parsePsLine(line({ command: "npm run dev --project finance" }), { ...ctx, filter: "finance" })).not.toBeNull();
    expect(parsePsLine(line({ command: "npm run dev --project finance" }), { ...ctx, filter: "unrelated" })).toBeNull();
  });
});
