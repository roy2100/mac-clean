# mac-clean

扫描 macOS 上常见的 app 卸载残留文件，也可扫描 `node_modules` 目录和 Downloads 大文件。

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
```

## 删除示例

```bash
# 预览路径
bun index.js --paths spotify

# 确认无误后删除
bun index.js --paths spotify | xargs rm -rf

# 删除所有 node_modules / Downloads 大文件
bun index.js --npm --paths | xargs rm -rf
bun index.js --downloads --paths | xargs rm -rf
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
