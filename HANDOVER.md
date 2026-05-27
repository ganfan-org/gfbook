# GTBook 交接文档

## 项目概述

GTBook 是一个本地知识库/书的管理桌面应用，每本书是一个 Git 仓库，包含 `gtbook.yaml` 元数据和 `chapters/` 目录下的 Markdown 章节文件。基于 Tauri 2 + React 19 + TypeScript + Vite 8 构建。

## 技术栈

| 层面 | 技术 |
|------|------|
| 桌面框架 | Tauri 2 |
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 8 |
| UI 库 | MUI (Material UI) 7 |
| Markdown 编辑器 | TipTap v3 + @tiptap/markdown |
| 数学公式 | KaTeX + @tiptap/extension-mathematics |
| YAML 解析 | serde_yaml (Rust) |
| UUID | uuid v4 (Rust) |
| Git | git2-rs (libgit2 绑定，无需 CLI)，版本 0.19 |
| 图片 | 存 assets/ 目录，Tauri Asset Protocol 按需加载 |

## 项目结构

```
gtbook-tauri/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs               # 入口
│   │   ├── lib.rs                # Tauri 构建器 + 注册 40+ 个命令
│   │   ├── models.rs             # 数据模型（含 #[serde(default)] 兼容旧 YAML）
│   │   ├── commands.rs           # 所有 Tauri 命令实现 (~1000行)
│   │   ├── git.rs                # Git2-rs 操作封装
│   │   └── logger.rs             # 操作日志系统
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/default.json
├── src/
│   ├── main.tsx
│   ├── App.tsx                   # 主题（亮/暗）+ 页面切换 + 关闭前自动提交
│   ├── types/index.ts
│   ├── utils/commands.ts
│   ├── hooks/
│   │   ├── useBooks.ts           # 书架管理 + 全局设置
│   │   ├── useBook.ts            # 组合 hook
│   │   ├── useBookChapters.ts    # 章节 CRUD
│   │   ├── useBookGit.ts         # Git 操作
│   │   └── useBookGitRemote.ts   # Git 远程操作
│   ├── components/
│   │   ├── ChapterTree.tsx       # 章节目录树（鼠标拖拽、重命名 Dialog）
│   │   ├── ChapterEditor.tsx     # TipTap v3 编辑器（编排逻辑）
│   │   ├── ChapterEditor.css     # 编辑器样式
│   │   ├── EditorToolbar.tsx     # 编辑器工具栏
│   │   ├── LinkDialog.tsx        # 链接编辑弹窗
│   │   ├── MathDialog.tsx        # 数学公式弹窗
│   │   └── BookSettingsDialog.tsx # 统一设置弹窗（Info/Git/Log 三Tab）
│   └── pages/
│       ├── BookShelf.tsx         # iBooks 风格书架
│       └── BookDetail.tsx        # 详情页（可拖拽宽度的侧边栏 + 编辑器）
├── docs/                         # 技术文档
│   ├── image-asset-protocol.md
│   ├── optimization-log.md
│   ├── tauri-webview-limitations.md
│   └── dev-log-2026-05-27.md
├── package.json
├── tsconfig.json
├── vite.config.mts
└── index.html
```

## 数据模型

每本书独立存储在任意路径下（默认 `~/gtbooks/{slug}/`）：

```
~/gtbooks/{book-name}/
├── gtbook.yaml       # 元数据
├── chapters/
│   ├── {uuid}.md     # 每章一个文件
│   └── ...
└── assets/
    └── {uuid}.png    # 图片附件
```

`gtbook.yaml` 格式：
```yaml
title: "书名"
created_time: 1715000000000      # 可选，缺失默认0
updated_time: 1715000000123
chapters:
  - id: "uuid-v4"
    title: "第一章"
    created_time: 1715000000000
    updated_time: 1715000000123
    chapters:
      - id: "uuid-v4"
        title: "1.1 节"
        created_time: 1715000000100
        updated_time: 1715000000123
        chapters: []
```

应用配置存储在 `{app_data_dir}/gtbook-config.json`，记录已打开的书路径列表。

## Rust 后端 — 主要 Tauri 命令

### 书管理 (7)
`list_books`, `new_book`, `delete_book`, `rename_book`, `import_book`, `get_books_dir_info`, `set_books_dir`

### 章节 CRUD (7)
`get_book_meta`, `read_chapter`, `write_chapter`, `new_chapter`, `delete_chapter`, `rename_chapter`, `move_chapter`（支持 before/after/inner 位置）

### Git 操作 (13)
`git_status`, `git_commit`, `git_log`, `git_remote_url`, `git_remote_set_url`, `git_fetch`, `git_pull`, `git_push`, `git_ahead_behind`, `git_list_conflicted`, `resolve_conflict`, `attempt_merge`

### 用户配置 (6)
`git_user_config`, `git_set_user_config`, `get_global_git_user`, `set_global_git_user`, `get_proxy_setting`, `set_proxy_setting`

### 图片 (4)
`get_asset_url`, `save_image_to_book`, `save_image_data`, `download_image_url`

### 工具 (4)
`read_file_base64`, `reveal_in_finder`, `path_exists`, `read_logs`, `read_book_logs`

## 前端组件树

```
<App> (ThemeProvider: 亮/暗模式, auto-commit on close)
  ├─ <BookShelf>          首页
  │    ├─ 书封面网格（渐变色 + 缩写）
  │    ├─ MoreVertIcon 按钮 → <BookSettingsDialog>（Info/Git/Log 三个Tab）
  │    │    ├─ Info：书名、路径、重命名、删除
  │    │    ├─ Git：状态、远程配置、Fetch/Pull/Push/Merge、冲突解决
  │    │    └─ Log：该书相关操作日志
  │    ├─ Open Book（任意 gtbook.yaml 文件夹）
  │    ├─ New Book（Dialog：书名 + 文件夹名 + 位置选择 + 校验）
  │    └─ Settings Dialog（Git Author + Proxy + Activity Log 全局日志）
  └─ <BookDetail>         详情页
       ├─ [可拖拽侧边栏] <ChapterTree>
       │    ├─ 递归渲染的章节节点
       │    ├─ 展开/折叠
       │    ├─ 右键菜单：添加子章节 / 重命名 Dialog / 删除
       │    ├─ 鼠标拖拽重排（自定义鼠标事件）
       │    └─ Git 状态栏（Ahead/Behind + dirty/clean）+ Settings 齿轮
       ├─ [右侧主区域] <ChapterEditor>
       │    ├─ <EditorToolbar>：T/H1-H3/B/I/UL/OL/Link/Math/Image/Table/TOC
       │    ├─ <EditorArea> (React.memo)：TOC 侧边栏 + WYSIWYG 编辑器（500ms 防抖自动保存）
       │    ├─ <LinkDialog>：链接编辑弹窗
       │    └─ <MathDialog>：数学公式编辑弹窗
       └─ <BookSettingsDialog>（Settings 齿轮打开，Info/Git/Log 三个Tab）
```

## 关键技术决策

### 1. 编辑器选型
从 Milkdown 迁移到 **TipTap v3**。Milkdown 在 WKWebView 上中文 IME 输入有拼音残留、Schema 兼容问题。TipTap 更成熟，官方扩展生态完善。

已安装的扩展：StarterKit（标题/加粗/斜体/列表/引用/代码块）、Image、Mathematics（KaTeX）、Table、MarkdownManager。

### 2. Markdown 解析与序列化
使用 `@tiptap/markdown` 的 `MarkdownManager`：
- 加载：`MarkdownManager.parse(content)` 将 md 解析为 ProseMirror JSON
- 保存：`MarkdownManager.serialize(editor.getJSON())` 序列化回 md
- 初始内容用 `useMemo` 预解析，避免每次渲染重复解析
- 代码块空行修复：保存时正则替换多余空行

### 3. IME 中文输入防护
```tsx
handleKeyDown(view, event) {
  if (view.composing && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault(); return true;
  }
}
```
防止输入法选词时被列表的 `splitListItem` 命令拦截。

### 4. 图片处理 — Tauri Asset Protocol

**决策过程**：最初用 Data URL 方案（base64 全量嵌入 DOM），存在内存浪费问题。尝试 Tauri Asset Protocol 后迁移。详见 `docs/image-asset-protocol.md`。

**当前方案**：
```
图片文件 → Rust canonicalize + 安全校验 → 绝对路径
         → convertFileSrc() → asset://localhost/%2FUsers%2F...
         → <img src="asset://..."> → WebView 拦截 → 读磁盘 → 按需返回
```

**关键配置**（`tauri.conf.json`）：
```json
"assetProtocol": {
  "enable": true,
  "scope": {
    "requireLiteralLeadingDot": false,
    "allow": ["$HOME/**/*"]
  }
},
"csp": "... img-src 'self' asset: http://asset.localhost https://asset.localhost blob: data: ..."
```

**Custom TipTap Extension `ImageWithAsset`**：
- `src`：存储 Markdown 相对路径 `assets/uuid.png`（可移植）
- `dataSrc`：存储 Asset Protocol URL（用于渲染显示）
- `renderHTML`：优先用 `dataSrc`，降级用 `src`

### 5. 链接点击处理
默认 TipTap `link: { openOnClick: false }` 不导航。通过 capture-phase click 监听器在编辑器的 DOM 上拦截链接点击，打开 `LinkDialog` 弹窗编辑。

对 `mousedown` 事件也做拦截，防止 ProSeMirror 设置光标并触发 `scrollSelectionIntoView` 导致滚动条跳转。

### 6. 滚动条跳转修复（WKWebView）
WKWebView（macOS Tauri）中 flex 子元素 `overflow: auto` 在父级布局重算时丢失滚动位置。最终方案：
- 提取 `EditorArea` 组件，`React.memo` 包裹，弹窗状态变化时 props 不变 → 不重渲染
- 滚动容器用绝对定位（`position: absolute; inset: 0`）替代 flex
- `mousedown` 捕获防止 ProSeMirror 点击链接时滚动
- `useLayoutEffect` + `requestAnimationFrame` 双重恢复应对异步布局

### 7. 拖拽重排
WKWebView 对 HTML5 DnD 支持不完善，采用自定义 `mousedown`/`mousemove`/`mouseup` 实现：
- `elementFromPoint()` + `data-chapter-id` 属性定位目标
- Y 位置百分比判定：上 25% = before，中间 50% = inner，下 25% = after

### 8. Git 集成
使用 `git2-rs` (0.19) 直接操作仓库，不依赖 `git` CLI。支持：
- 自动提交（每 10 分钟 / 切换章节 / 关闭应用）
- 远程同步（Fetch/Pull/Push，SSH 或 HTTPS）
- 冲突解决：Ahead/Behind 指示器 + 冲突文件列表 + Per-file 接受远程/本地 + Merge 提交
- 代理配置
- SSH Agent 认证（需用户预先 `ssh-add`）
- 日志系统

### 9. Git 冲突处理
当 Pull 发现本地和远程分叉时，点击 Merge 按钮：
1. Fetch 远程变更
2. `merge_commits` 执行合并
3. 有冲突 → 展示冲突文件列表
4. 逐文件选择接受远程 (theirs) 或保留本地 (ours)
5. 全部解决 → Commit Merge

**git2 0.19 API 注意**：`IndexEntry` 的 `flags`、`path`、`id` 是**字段**不是方法（0.20+ 才是方法），冲突 stage 从 `(entry.flags >> 12) & 3` 提取。

### 10. 操作日志系统
所有关键操作记录到 `~/Library/Caches/com.gtbook.app/events.log`：
- 格式：`{"t":"ISO8601","e":"event","d":"detail","b":"book_path"}`
- 全局日志：`read_logs(limit)` — 所有 App 操作
- 按书日志：`read_book_logs(limit, bookPath)` — 按 `b` 字段过滤
- 远程操作自动记录 started/ok/failed 结果
- 通过 BookSettingsDialog 的 Log Tab 查看

### 11. 自动保存
- 编辑器内容变化 → 串行化 markdown → 与上次保存内容比较 → 有变化则 500ms 防抖写入
- 首次加载和图片异步加载时跳过保存
- 切换章节 / 关闭应用时立即自动提交

### 12. 暗色模式 BookCover 适配
BookCover 右下角 MoreVertIcon 按钮背景需主题自适应：
```tsx
sx={(t) => ({
  bgcolor: t.palette.mode === 'dark' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)',
  '&:hover': { bgcolor: t.palette.mode === 'dark' ? 'rgba(0,0,0,0.9)' : 'white' },
})}
```

## 开发命令

```bash
npm run tauri dev       # 开发模式
npm run tauri build     # 生产构建
npm run build           # 仅前端构建
npm run dev             # 仅前端开发服务器
cargo build             # 仅 Rust 后端构建
```

## 已知问题

1. **SSH 密钥认证** — 加密的 SSH 密钥需预先 `ssh-add` 注册到 Agent，否则 git2 无法认证（macOS 上 git2 不访问 Keychain）。详见 `docs/tauri-webview-limitations.md`

2. **`window.prompt` / `window.open` 不可用** — WKWebView 不支持原生弹窗 API，需用 MUI Dialog 替代；打开外部链接需用 `@tauri-apps/plugin-shell` 的 `open()`。详见 `docs/tauri-webview-limitations.md`

3. **`@tiptap/markdown` 的 content 解析未生效** — `useEditor({ content: markdownString })` 不能直接用原始 markdown，需通过 `MarkdownManager.parse()` 预解析为 JSON

4. **图片粘贴依赖网络下载** — 从网页粘贴图片需要 `download_image_url` 命令，每次打开文档时扫描外链图片并下载

5. **数学公式编辑** — 点击公式弹出 Dialog 编辑，但 KaTeX 渲染在有错误时显示 `\Box` 框

6. **git pull 不支持 merge** — 当本地和远程分叉时，`git_pull` 返回错误。用户需点击 Merge 按钮主动发起合并

7. **Mac App Store 兼容性** — Tauri asset protocol 和 git2 SSH 认证在 Sandbox 下可能有问题，需在提交 MAS 前评估

## 扩展方向

1. 全文搜索
2. 导出 PDF/HTML
3. 思维导图 / Mermaid 图表
4. Markdown 源文件直接编辑（Monaco Editor）
5. 书的多标签页支持
6. 差异对比 / 历史版本
7. 上传 Mac App Store
8. 书签 / 标注 / 笔记功能
