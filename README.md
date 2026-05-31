# mac-clean

扫描 macOS 上常见的 app 卸载残留文件。

## 用法

```bash
bun index.js                        # 扫描所有已知残留目录
bun index.js spotify                # 只看包含 "spotify" 的条目
bun index.js --size                 # 附带显示磁盘占用
bun index.js --large                # 只展示 100MB 以上的条目
bun index.js --paths                # 只输出路径，适合管道删除
```

## 删除示例

```bash
# 预览路径
bun index.js --paths spotify

# 确认无误后删除
bun index.js --paths spotify | xargs rm -rf
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
