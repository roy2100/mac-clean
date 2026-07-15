# mac-clean

扫描 macOS 上常见的 app 卸载残留文件，也可扫描 `node_modules` 目录、Downloads 大文件、残余的 Node 开发进程和 Xcode 缓存。

## 用法

```bash
bun index.js                        # 扫描所有已知残留目录
bun index.js spotify                # 只看包含 "spotify" 的条目
bun index.js --size                 # 附带显示磁盘占用
bun index.js --large                # 只展示 100MB 以上的条目
bun index.js --paths                # 只输出路径，适合管道删除
bun index.js --orphans              # 只展示对应 app 已卸载的条目
```

## 其他扫描模式

```bash
# 扫描 HOME 下所有 node_modules 目录
bun index.js --npm
bun index.js --npm --size           # 附带磁盘占用
bun index.js --npm --large          # 只展示 100MB 以上的 node_modules
bun index.js --npm myproject        # 只展示路径包含 "myproject" 的目录

# 扫描 Downloads 目录下的大文件（默认 ≥50MB）
bun index.js --downloads
bun index.js --downloads --large    # 只展示 100MB 以上的文件
bun index.js --downloads dmg        # 只展示路径包含 "dmg" 的文件

# 扫描残余的 Node 开发进程（npm run dev / vite / webpack / nodemon 等）
bun index.js --procs
bun index.js --procs --large        # 只展示 RSS ≥100MB 的进程
bun index.js --procs finance        # 只展示命令行包含 "finance" 的进程

# 扫描 Xcode 缓存目录（附带大小，按大小排序）
bun index.js --xcode
bun index.js --xcode derived        # 只展示路径/说明包含 "derived" 的目录
```

`--procs` 会列出仍在运行的 Node 开发进程（PID、内存占用、运行时长、完整命令行），
其中父进程已退出的会标记为 `[孤儿·父进程已退出]`。已自动排除 Claude Code、MCP 服务、
VS Code / Cursor 内置 node、语言服务器等，避免误杀正在使用的工具。

`--xcode` 会检查以下四个已知的 Xcode 缓存目录是否存在，并显示各自占用的磁盘空间：

| 目录 | 说明 | 是否安全删除 |
|------|------|------|
| `~/Library/Developer/Xcode/DerivedData` | 编译索引 / 构建产物 | 安全，下次打开项目会自动重建 |
| `~/Library/Caches/com.apple.dt.Xcode` | Xcode 运行时缓存 | 安全 |
| `~/Library/Developer/Xcode/iOS DeviceSupport` | 各 iOS 版本的真机调试支持文件 | 若不需要在旧版 iOS 真机上调试可删 |
| `~/Library/Developer/Xcode/Archives` | `Product -> Archive` 打包历史（`.xcarchive`） | 删除后会丢失历史版本的符号文件 |

## 删除示例

```bash
# 预览路径
bun index.js --paths spotify

# 确认无误后删除
bun index.js --paths spotify | xargs rm -rf

# 删除所有 node_modules / Downloads 大文件
bun index.js --npm --paths | xargs rm -rf
bun index.js --downloads --paths | xargs rm -rf

# 结束所有残余 Node 开发进程（--paths 输出 PID）
bun index.js --procs --paths | xargs kill

# 删除所有存在的 Xcode 缓存目录
bun index.js --xcode --paths | xargs rm -rf
```

## 扫描范围

| 目录 | 说明 |
|------|------|
| `~/Library/Application Support` | App 数据（用户） |
| `~/Library/Preferences` | plist 配置文件 |
| `~/Library/Caches` | 缓存（用户） |
| `~/Library/Logs` | 日志（用户） |
| `~/Library/Containers` | 沙盒 App 数据 |
| `~/Library/Group Containers` | 多 App 共享数据 |
| `~/Library/LaunchAgents` | 开机启动项（用户） |
| `/Library/Application Support` | App 数据（系统） |
| `/Library/LaunchAgents` | 开机启动项（系统） |
| `/Library/LaunchDaemons` | 系统守护进程 |
| `/Library/PrivilegedHelperTools` | 特权辅助工具 |

## 注意

- 删除前请确认条目确实属于已卸载的 app
- `~/Library/Group Containers` 中的条目可能被多个 app 共享，删除前需额外确认
- 脚本不会主动删除任何文件，删除操作由用户自行执行

## 开发

核心扫描逻辑拆分在 `lib/` 目录下（`format` / `residue` / `npm` / `files` / `procs` / `xcode`），
`index.js` 只负责参数解析、调度和输出。运行单元测试：

```bash
bun test
```

打包成单文件（仍需目标机器安装 bun，产物写入 `dist/mac-clean.js`，不提交到仓库）：

```bash
bun run build
bun dist/mac-clean.js --xcode
```
