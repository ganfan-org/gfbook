# Tauri WebView 限制与替代方案

## 1. `window.prompt` 无法弹窗

### 现象

在 Tauri WebView 中调用 `window.prompt('请输入')`，不会弹出输入框，返回值始终为 `null`。

### 原因

Tauri 的 WebView（macOS 用 WKWebView，Windows 用 WebView2）不完全支持所有 Web API。`window.prompt()`、`window.alert()`、`window.confirm()` 这三个原生弹窗 API 在 Tauri 中被默认禁用或静默忽略，因为它们：

- 阻塞主线程，与 Tauri 的异步 IPC 模型冲突
- 弹出的原生对话框无法统一 UI 风格
- 在 WKWebView 中，非用户手势触发的 `prompt` 可能被安全策略拦截

### 解决方案

用 Tauri 的 **dialog 插件** 或 **MUI Dialog + TextField** 替代。

**方案 A：Tauri Dialog Plugin（简单场景）**

```ts
import { ask, message } from '@tauri-apps/plugin-dialog'

// 替代 window.confirm
const yes = await ask('确定要删除吗？', { title: '确认', kind: 'warning' })

// 替代 window.alert
await message('操作成功', { title: '提示', kind: 'info' })
```

> 缺点：弹出的是系统原生对话框，无法自定义样式。

**方案 B：React 组件（本项目采用）**

用 MUI `Dialog` + `TextField` 实现自定义输入弹窗。

```tsx
// 替代 window.prompt('请输入章节名称')
const [renameDialog, setRenameDialog] = useState<{ id: string; title: string } | null>(null)
const [renameDialogValue, setRenameDialogValue] = useState('')

<Dialog open={!!renameDialog} onClose={() => setRenameDialog(null)} maxWidth="xs" fullWidth>
  <DialogTitle>Rename Chapter</DialogTitle>
  <DialogContent>
    <TextField
      autoFocus
      margin="dense"
      label="Title"
      fullWidth
      value={renameDialogValue}
      onChange={(e) => setRenameDialogValue(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') handleRenameConfirm() }}
    />
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setRenameDialog(null)}>Cancel</Button>
    <Button onClick={handleRenameConfirm} variant="contained">Confirm</Button>
  </DialogActions>
</Dialog>
```

> 优点：风格与 App 统一，支持暗色模式，可自定义验证逻辑，Enter 键确认。

---

## 2. `window.open` 无法打开链接

### 现象

在 Tauri WebView 中调用 `window.open('https://example.com')` 不会打开浏览器。

### 原因

`window.open` 在桌面 WebView 中的行为取决于平台：

- **macOS WKWebView**：不支持 `window.open` 打开外部链接，WebView 没有浏览器级别的导航概念
- **Windows WebView2**：默认也不支持，需要额外配置
- Tauri 为了避免 WebView 意外跳出应用，默认拦截了导航请求

### 解决方案

使用 **Tauri Shell Plugin** 的 `open` 函数，它会用系统默认浏览器打开 URL。

```ts
import { open } from '@tauri-apps/plugin-shell'

function openInBrowser(url: string) {
  open(url)
}
```

### 完整配置

**1. `Cargo.toml` 添加依赖**：

```toml
[dependencies]
tauri-plugin-shell = "2"
```

**2. `lib.rs` 注册插件**：

```rust
.plugin(tauri_plugin_shell::init())
```

**3. `capabilities/default.json` 添加权限**（精确权限，推荐）：

```json
{
  "permissions": [
    "shell:allow-open"
  ]
}
```

> `shell:allow-open` 只允许打开 URL，不允许执行任意命令。比 `shell:allow-execute` / `shell:allow-spawn` 安全。

**4. 前端调用**（本项目 `LinkDialog.tsx:56`）：

```tsx
import { open as shellOpen } from '@tauri-apps/plugin-shell'

<Button onClick={() => shellOpen(url)}>Open in Browser</Button>
```

---

## 3. `window.opener` 和导航隔离

### 背景

Tauri 应用是**单窗口桌面应用**，没有浏览器的多标签页概念。`window.opener`、`window.parent`、`postMessage` 等 Web 窗口管理 API 在 Tauri 中不适用。

### 替代思路

| 需求 | Web 方案 | Tauri 方案 |
|---|---|---|
| 打开外部链接 | `window.open()` | `@tauri-apps/plugin-shell` 的 `open()` |
| 多窗口通信 | `postMessage()` + `window.opener` | Tauri 事件系统 `emit()` / `listen()` |
| 子窗口 | `window.open('child.html')` | 创建新 WebView 窗口（`@tauri-apps/api/webviewWindow`） |
| 模态输入 | `window.prompt()` | MUI `Dialog` + `TextField` 或 Tauri dialog 插件 |
| 确认对话框 | `window.confirm()` | MUI `Dialog` 或 Tauri `ask()` |
| 提示消息 | `window.alert()` | MUI `Snackbar` / `Alert` 或 Tauri `message()` |

---

## 4. SSH 密钥认证需要 `ssh-add`

### 现象

执行 `git push` / `git pull` 时报认证失败，但终端中 `git` 命令正常工作。执行 `ssh-add ~/.ssh/id_ed25519` 后恢复。

### 原因

GTBook 使用 `git2` 库（libgit2 的 Rust 绑定）操作 Git，它有自己的 SSH 认证流程，**不会自动使用系统的 SSH Agent**。

代码中的认证尝试顺序（`git.rs:185-209`）：

```
1. Cred::ssh_key_from_agent(user)     ← SSH Agent（需要 ssh-add 注册过）
2. Cred::ssh_key(user, None, path, None) ← 直接读密钥文件
```

第二步 `Cred::ssh_key` 的最后一个参数是密钥密码（passphrase），当前传了 `None`：

- **密钥无密码** → 第二步成功，无需 `ssh-add`
- **密钥有密码** → 第二步失败（passphrase 为 `None`），只能靠第一步的 SSH Agent

macOS 自带的 `ssh` 命令会通过 Keychain 自动处理密码（`UseKeychain yes`），所以终端里 `git push` 正常。但 `git2`/libgit2 不访问 macOS Keychain，它只看 SSH Agent。

### 解决方案

**永久方案**：在 `~/.ssh/config` 中添加 `AddKeysToAgent yes` 和 `UseKeychain yes`：

```
Host *
    AddKeysToAgent yes
    UseKeychain yes
    IdentityFile ~/.ssh/id_ed25519
```

这样系统首次使用密钥后会自动将其加载到 SSH Agent，重启后也能用。

**临时方案**（已执行）：手动 `ssh-add ~/.ssh/id_ed25519`，当前会话有效，重启后失效。

**长期改进方向**（代码侧）：

| 方案 | 说明 |
|---|---|
| 提示用户输入密码 | `Cred::ssh_key` 支持 `passphrase: Some(passphrase)`，但需要 UI 交互 |
| 调用系统 `git` 代替 `git2` | 用 `std::process::Command` 执行 `git push` 等命令，复用系统 Git 的所有认证机制（包括 Keychain） |
| 接入 `ssh-agent` 协议 | 直接用 Unix socket 通信查询 agent，不依赖 `git2` 的封装 |

---

## 5. `@tauri-apps/plugin-shell` 的 `open` vs `@tauri-apps/plugin-opener`

Tauri 2 有两个类似功能的插件：

| 插件 | 函数 | 用途 |
|---|---|---|
| `tauri-plugin-opener` | `openUrl()` / `openPath()` | 专门用于打开 URL 和文件路径，API 更简洁 |
| `tauri-plugin-shell` | `open()` | 功能更全，还包括 `execute()`（执行命令）和 `spawn()`（启动进程） |

本项目使用 `tauri-plugin-shell` 的 `open()`，因为它同时也被其他功能使用（如 `revealInFinder`）。如果只需要打开浏览器，`tauri-plugin-opener` 更轻量：

```ts
// tauri-plugin-opener 方案
import { openUrl } from '@tauri-apps/plugin-opener'

await openUrl('https://example.com')
```
