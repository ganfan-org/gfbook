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
| Git | git2-rs (libgit2 绑定，无需 CLI) |
| 图片 | 存 assets/ 目录 + data URL 显示 |

## 项目结构

```
gtbook-tauri/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs               # 入口
│   │   ├── lib.rs                # Tauri 构建器 + 注册 30+ 个命令
│   │   ├── models.rs             # 数据模型（含 #[serde(default)] 兼容旧 YAML）
│   │   ├── commands.rs           # 所有 Tauri 命令实现 (~900行)
│   │   └── git.rs                # Git2-rs 操作封装 (init/status/commit/push/pull/fetch)
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
│   │   └── useBook.ts            # 章节 CRUD / Git / 自动提交
│   ├── components/
│   │   ├── ChapterTree.tsx       # 章节目录树（鼠标拖拽、右键菜单、重命名 Dialog）
│   │   ├── ChapterEditor.tsx     # TipTap v3 编辑器
│   │   └── ChapterEditor.css     # 编辑器样式
│   └── pages/
│       ├── BookShelf.tsx         # iBooks 风格书架
│       └── BookDetail.tsx        # 详情页（可拖拽宽度的侧边栏 + 编辑器）
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

### Git 操作 (10)
`git_status`, `git_commit`, `git_log`, `git_remote_url`, `git_remote_set_url`, `git_fetch`, `git_pull`, `git_push`, `git_ahead_behind`, `git_list_conflicted`

### 用户配置 (6)
`git_user_config`, `git_set_user_config`, `get_global_git_user`, `set_global_git_user`, `get_proxy_setting`, `set_proxy_setting`

### 工具 (5)
`read_file_base64`, `read_image_as_data_url`, `save_image_to_book`, `save_image_data`, `download_image_url`, `reveal_in_finder`, `path_exists`

## 前端组件树

```
<App> (ThemeProvider: 亮/暗模式, auto-commit on close)
  ├─ <BookShelf>          首页
  │    ├─ 书封面网格（渐变色 + 缩写）
  │    ├─ 右键菜单：重命名 / 删除
  │    ├─ Open Book（任意 gtbook.yaml 文件夹）
  │    ├─ New Book（Dialog：书名 + 文件夹名 + 位置选择 + 校验）
  │    └─ Settings Dialog（Git Author + Proxy）
  └─ <BookDetail>         详情页
       ├─ [可拖拽侧边栏] <ChapterTree>
       │    ├─ 递归渲染的章节节点
       │    ├─ 展开/折叠
       │    ├─ 右键菜单：添加子章节 / 重命名 Dialog / 删除
       │    ├─ 鼠标拖拽重排（自定义鼠标事件）
       │    └─ Git 状态栏 + Settings 入口（点击打开 Settings Dialog）
       └─ [右侧主区域] <ChapterEditor>
            ├─ 排版工具栏：T / H1-H3 / B I / 列表 / 链接 / 公式 / 图片 / 表格 / TOC
            ├─ TOC 侧边栏（可开关）
            └─ WYSIWYG 编辑器（500ms 防抖自动保存）
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

### 4. 图片处理
- 插入：选择或粘贴图片 → 保存到 `assets/{uuid}.{ext}` → 显示用 data URL
- 粘贴外部图片（知乎等）→ 后台上传下载到本地
- 不依赖自定义协议或 `asset://` 协议

### 5. 拖拽重排
WKWebView 对 HTML5 DnD 支持不完善，采用自定义 `mousedown`/`mousemove`/`mouseup` 实现：
- `elementFromPoint()` + `data-chapter-id` 属性定位目标
- Y 位置百分比判定：上 25% = before，中间 50% = inner，下 25% = after

### 6. Git 集成
使用 `git2-rs` 直接操作仓库，不依赖 `git` CLI。支持：
- 自动提交（每 10 分钟 / 切换章节 / 关闭应用）
- 远程同步（Fetch/Pull/Push，SSH 或 HTTPS）
- 冲突检测
- 代理配置

### 7. 自动保存
- 编辑器内容变化 → 串行化 markdown → 与上次保存内容比较 → 有变化则 500ms 防抖写入
- 首次加载和图片异步加载时跳过保存
- 切换章节 / 关闭应用时立即自动提交

## 开发命令

```bash
npm run tauri dev       # 开发模式
npm run tauri build     # 生产构建
npm run build           # 仅前端构建
npm run dev             # 仅前端开发服务器
cargo build             # 仅 Rust 后端构建
```

## 已知问题

1. **`@tiptap/markdown` 的 content 解析未生效** — `useEditor({ content: markdownString })` 不能直接用原始 markdown，需通过 `MarkdownManager.parse()` 预解析为 JSON
2. **图片粘贴依赖网络下载** — 从网页粘贴图片需要 `download_image_url` 命令，每次打开文档时扫描外链图片并下载
3. **数学公式编辑** — 点击公式弹出 Dialog 编辑，但 KaTeX 渲染在有错误时显示 `\Box` 框
4. **`@tiptap/markdown` Link mark 序列化** — 链接在 markdown 中输出为 `[text](url)`，但删除链接后需要自定义 ProseMirror 事务（`tr.removeMark()`）而非依赖选区

## 扩展方向

1. 全文搜索
2. 导出 PDF/HTML
3. 思维导图 / Mermaid 图表
4. Markdown 源文件直接编辑（Monaco Editor）
5. 书的多标签页支持
6. 差异对比 / 历史版本
7. 上传 Mac App Store
8. 书签 / 标注 / 笔记功能
