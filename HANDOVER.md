# gfbook 交接文档

## 项目概述

gfbook 是一个本地知识库/书的管理桌面应用，每本书是一个 Git 仓库，包含 `gfbook.yaml` 元数据和 `chapters/` 目录下的 Markdown 章节文件。基于 Tauri 2 + React 19 + TypeScript + Vite 8 构建。

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
| Git | git2-rs (libgit2 绑定，无需 CLI)，版本 0.19（注意 API：IndexEntry 是字段而非方法） |
| 图片 | 存 assets/ 目录，Tauri Asset Protocol 按需加载 |

## 项目结构

```
gfbook/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs               # 入口
│   │   ├── lib.rs                # Tauri 构建器 + 注册 45+ 个命令
│   │   ├── models.rs             # 数据模型 + SearchLine + flatten_chapters
│   │   ├── commands.rs           # 所有 Tauri 命令实现 (~1080行)
│   │   ├── git.rs                # Git2-rs 操作封装
│   │   └── logger.rs             # 操作日志系统
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/default.json
├── src/
│   ├── main.tsx
│   ├── App.tsx                   # 主题 + 页面切换 + 关闭前自动提交
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
│   │   ├── ChapterEditor.tsx     # TipTap v3 编辑器（编排逻辑 + EditorArea）
│   │   ├── ChapterEditor.css     # 编辑器样式（.gfbook-editor 前缀）
│   │   ├── EditorToolbar.tsx     # 编辑器工具栏
│   │   ├── LinkDialog.tsx        # 链接编辑弹窗
│   │   ├── MathDialog.tsx        # 数学公式弹窗
│   │   ├── BookSettingsDialog.tsx# 统一设置弹窗（Info/Git/Log 三Tab）
│   │   └── SearchDialog.tsx      # 全文搜索弹窗
│   └── pages/
│       ├── BookShelf.tsx         # iBooks 风格书架
│       └── BookDetail.tsx        # 详情页（可拖拽宽度侧边栏 + 编辑器）
├── docs/
│   ├── image-asset-protocol.md
│   ├── optimization-log.md
│   ├── tauri-webview-limitations.md
│   ├── dev-log-2026-05-27.md
│   └── dev-log-2026-05-28.md
├── package.json
├── tsconfig.json
├── vite.config.mts
├── index.html
└── HANDOVER.md
```

## 数据模型

每本书独立存储在任意路径下（默认 `~/gfbooks/{slug}/`）：

```
~/gfbooks/{book-name}/
├── gfbook.yaml       # 元数据
├── chapters/
│   ├── {uuid}.md     # 每章一个文件
│   └── ...
└── assets/
    └── {uuid}.png    # 图片附件
```

`gfbook.yaml` 格式：
```yaml
title: "书名"
created_time: 1715000000000      # 可选，缺失默认0
updated_time: 1715000000123
chapters:
  - id: "uuid-v4"
    title: "第一章"
    created_time: 1715000000000
    updated_time: 1715000000123
    chapters: []
```

应用配置存储在 `{app_data_dir}/gfbook-config.json`，记录已打开的书路径列表。

## 数据流架构

```
App 配置（全局、存配置 JSON）
├── books 目录
├── 全局 git 作者
└── 全局代理

书列表（从每本书的 gfbook.yaml 读取）
├── 书 A → BookInfo { title, path, created_time, updated_time }
├── 书 B → BookInfo { title, path, created_time, updated_time }
└── ...
          ↓ 导航时传入
BookDetail
├── 直接使用 bookInfo.title / bookInfo.updated_time（不重复读 yaml）
├── meta → 仅用于 meta.chapters（章节树）
└── git 数据 → 各自独立加载（useBookGit）
```

## Rust 后端 — 主要 Tauri 命令

### 书管理 (7)
`list_books`, `new_book`, `delete_book`, `rename_book`, `import_book`, `get_books_dir_info`, `set_books_dir`

### 章节 CRUD (7)
`get_book_meta`, `read_chapter`, `write_chapter`, `new_chapter`, `delete_chapter`, `rename_chapter`, `move_chapter`

### Git 操作 (13)
`git_status`, `git_commit`, `git_log`, `git_remote_url`, `git_remote_set_url`, `git_fetch`, `git_pull`, `git_push`, `git_ahead_behind`, `git_list_conflicted`, `resolve_conflict`, `attempt_merge`

### 用户配置 (6)
`git_user_config`, `git_set_user_config`, `get_global_git_user`, `set_global_git_user`, `get_proxy_setting`, `set_proxy_setting`

### 图片 (4)
`get_asset_url`, `save_image_to_book`, `save_image_data`, `download_image_url`

### 工具 & 日志 (5)
`read_file_base64`, `reveal_in_finder`, `path_exists`, `read_logs`, `read_book_logs`, `start_search`

## 前端组件树

```
<App> (ThemeProvider: 亮/暗模式, auto-commit on close)
  ├─ <BookShelf>          首页
  │    ├─ 书封面网格（渐变色 + 缩写）
  │    ├─ 搜索图标 → <SearchDialog>（跨书全文搜索 + 增量结果 + 点击跳转）
  │    ├─ MoreVertIcon → <BookSettingsDialog>（Info/Git/Log 三 Tab，git 数据 App 启动时预加载）
  │    ├─ Open Book（任意 gfbook.yaml 文件夹）
  │    ├─ New Book（Dialog：书名 + 文件夹名 + 校验）
  │    └─ Settings Dialog（Git Author + Proxy + 全局日志）
  └─ <BookDetail>         详情页
       ├─ [可拖拽侧边栏] <ChapterTree>
       │    ├─ 递归渲染章节节点 + 展开/折叠
       │    ├─ 右键菜单 + 拖拽重排
       │    ├─ Git 状态栏（Ahead/Behind + dirty/clean）+ 搜索图标 + Settings 齿轮
       │    └─ <SearchDialog>（当前书全文搜索）
       ├─ [右侧主区域] <ChapterEditor>
       │    ├─ <EditorToolbar>：T/H1-H3/B/I/UL/OL/Link/Math/Image/Table/TOC
       │    ├─ <EditorArea> (React.memo)：TOC 侧边栏 + 编辑器
       │    ├─ <LinkDialog> / <MathDialog>
       └─ <BookSettingsDialog>（Settings 齿轮打开）
```

## 关键技术决策

### 1. 编辑器选型
从 Milkdown 迁移到 **TipTap v3**。Milkdown 在 WKWebView 上中文 IME 输入有拼音残留、Schema 兼容问题。

扩展：StarterKit、Image、Mathematics（KaTeX）、Table、MarkdownManager。

### 2. 图片处理 — Tauri Asset Protocol
图片存 `assets/uuid.png`，通过 Tauri Asset Protocol 按需加载，不嵌入 DOM。详见 `docs/image-asset-protocol.md`。

### 3. 滚动条跳转修复
WKWebView 中 flex 子元素 `overflow: auto` 在布局重算时丢失滚动位置。最终方案：`EditorArea` 组件 `React.memo` 隔离 + 绝对定位 + mousedown 拦截。

### 4. 统一数据模型
书架页传入 `BookInfo`，详情页直接复用（`bookInfo.title`），不再重复读 yaml。`meta` 仅用于章节树数据。

### 5. Git 数据缓存
App 启动时 `loadAllGitData()` 一次性加载所有书的 git 状态，存入 `gitDataMap`。后续通过 `git:done` 事件增量刷新。不再在弹窗打开时单独请求。

### 6. 冲突解决
当 Pull 发现分叉时，点击 Merge 按钮：Fetch → `merge_commits` → 有冲突则展示文件列表 → 逐文件选择 Keep Remote / Keep Local → Commit Merge。

### 7. 操作日志系统
所有关键操作记录到 `~/Library/Caches/com.gfbook.app/events.log`，按 `b`（book_path）字段过滤。详见 `docs/tauri-webview-limitations.md`。

### 8. 全文搜索
通过 `start_search` 命令后台线程逐章扫描 `chapters/*.md` + 章节标题，增量 `emit('search:progress', ...)` 返回结果 → 前端 `SearchDialog` 实时展示。支持跨书搜索。

### 9. 项目命名
`name = "gfbook"`, `productName = "gfbook"`, `identifier = "com.gfbook.app"`。旧数据文件名为 `gtbook.yaml` / `gtbook-config.json`，已统一改为 `gfbook.*`。

## 开发命令

```bash
npm run tauri dev       # 开发模式
npm run tauri build     # 生产构建
npm run build           # 仅前端构建
npm run dev             # 仅前端开发服务器
cargo build             # 仅 Rust 后端构建
```

## 已知问题

1. **SSH 密钥认证** — 加密的 SSH 密钥需预先 `ssh-add` 注册到 Agent。详见 `docs/tauri-webview-limitations.md`

2. **`window.prompt` / `window.open` 不可用** — WKWebView 不支持原生弹窗 API，用 MUI Dialog + `@tauri-apps/plugin-shell` 替代。详见 `docs/tauri-webview-limitations.md`

3. **`autoFocus` 在弹窗中不生效** — 浏览器动态渲染的元素不触发 `autofocus` 属性。使用 MUI `slotProps.transition.onEntered` 回调手动聚焦

4. **图片粘贴依赖网络下载** — `download_image_url` 命令全量加载无文件大小上限

5. **git2 0.19 API** — `IndexEntry` 的 `flags`、`path`、`id` 是**字段**不是方法（0.20+ 才是方法）。冲突 stage 从 `(entry.flags >> 12) & 3` 提取

6. **git pull 不支持 merge** — 分叉时 `git_pull` 返回错误，用户需点击 Merge 按钮

## 扩展方向

1. 设计系统（跨 Tauri / Flutter / SwiftUI 的设计 token）
2. 导出 PDF/HTML
3. 思维导图 / Mermaid 图表
4. Markdown 源文件直接编辑（Monaco Editor）
5. 多标签页支持
6. 差异对比 / 历史版本
7. 上传 Mac App Store
