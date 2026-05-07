# GTBook 交接文档

## 项目概述

GTBook 是一个本地知识库/书的管理桌面应用，每本书是一个 Git 仓库，包含 `gtbook.yaml` 元数据和 `chapters/` 目录下的 Markdown 章节文件。基于 Tauri 2 + React + TypeScript + Vite 构建。

## 技术栈

| 层面 | 技术 |
|------|------|
| 桌面框架 | Tauri 2 |
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite 8 |
| UI 库 | MUI (Material UI) 7 |
| Markdown 编辑器 | Milkdown 7 (WYSIWYG) |
| YAML 解析 | serde_yaml (Rust) |
| UUID | uuid v4 (Rust) |
| Git | 通过 CLI 调用 git 命令 |

## 项目结构

```
gtbook-tauri/
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs               # 入口
│   │   ├── lib.rs                # Tauri 构建器 + 注册 16 个命令
│   │   ├── models.rs             # 数据模型：Chapter, BookMeta, BookInfo, CommitInfo
│   │   ├── commands.rs           # 所有 Tauri 命令实现 (~450行)
│   │   └── git.rs                # Git 操作封装 (init, status, commit, log)
│   ├── Cargo.toml
│   ├── tauri.conf.json           # 窗口 1200x800, 标题 GTBook
│   └── capabilities/default.json # 权限: core, opener, dialog
├── src/                          # React 前端
│   ├── main.tsx                  # 入口
│   ├── App.tsx                   # 根组件：ThemeProvider + 页面切换
│   ├── types/index.ts            # TypeScript 类型定义（与 Rust models 对应）
│   ├── utils/commands.ts         # Tauri invoke 调用封装 (16个函数)
│   ├── hooks/
│   │   ├── useBooks.ts           # 书架管理 (列表/新建/导入/删除)
│   │   └── useBook.ts            # 单书操作 (章节CRUD/拖拽/Git)
│   ├── components/
│   │   ├── ChapterTree.tsx       # 章节目录树 (递归渲染 + 鼠标拖拽)
│   │   └── ChapterEditor.tsx     # Milkdown WYSIWYG 编辑器 (500ms 防抖保存)
│   └── pages/
│       ├── BookShelf.tsx         # 首页：书列表 (新建/导入/删除)
│       └── BookDetail.tsx        # 详情页：左侧目录 + 右侧编辑器
├── package.json
├── tsconfig.json
├── vite.config.mts
└── index.html
```

## 数据模型

每本书在磁盘上的结构：
```
{app_data_dir}/books/{book-name}/
├── gtbook.yaml       # 元数据
└── chapters/
    ├── {uuid}.md     # 每章一个文件
    └── ...
```

`gtbook.yaml` 格式：
```yaml
title: "书名"
created_time: 1715000000000
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

## Rust 后端 — 16 个 Tauri 命令

| # | 命令 | 参数 | 返回值 | 说明 |
|---|------|------|--------|------|
| 1 | `list_books` | `app_handle` | `Vec<BookInfo>` | 扫描 `{app_data}/books/` 下所有含 `gtbook.yaml` 的目录 |
| 2 | `new_book` | `title` | `BookInfo` | 创建目录 + `gtbook.yaml` + `chapters/` + `git init` |
| 3 | `delete_book` | `book_path` | `()` | 递归删除整个书目录 |
| 4 | `import_book` | `folder_path` | `BookInfo` | 验证目标目录有 `gtbook.yaml` |
| 5 | `get_book_meta` | `book_path` | `BookMeta` | 解析 `gtbook.yaml` |
| 6 | `read_chapter` | `book_path, chapter_id` | `String` | 读取 `chapters/{id}.md` |
| 7 | `write_chapter` | `book_path, chapter_id, content` | `()` | 写文件 + 更新 chapter.updated_time |
| 8 | `new_chapter` | `book_path, parent_id?, title` | `Chapter` | 生成 UUID + 写入 `# Title` + 追加到父节点 |
| 9 | `delete_chapter` | `book_path, chapter_id` | `()` | 递归删除章节及其所有子章节 |
| 10 | `rename_chapter` | `book_path, chapter_id, new_title` | `()` | 更新 title |
| 11 | `move_chapter` | `book_path, chapter_id, target_id?, position` | `()` | 移动章节, position: "before" \| "after" \| "inner" |
| 12 | `move_chapter_up` | `book_path, chapter_id` | `()` | 与上一个兄弟节点交换 |
| 13 | `move_chapter_down` | `book_path, chapter_id` | `()` | 与下一个兄弟节点交换 |
| 14 | `git_status` | `book_path` | `String` | `git status --porcelain` |
| 15 | `git_commit` | `book_path, message` | `()` | `git add .` → `git commit -m` |
| 16 | `git_log` | `book_path, max_count?` | `Vec<CommitInfo>` | 解析 `git log --format=%H|||%s|||%an|||%ct` |

## 前端组件树

```
<App>
  ├─ <BookShelf>          首页（书架）
  │    ├─ 书列表（MUI Card）
  │    ├─ 新建书 Dialog
  │    ├─ 导入书（@tauri-apps/plugin-dialog 文件选择器）
  │    └─ 删除确认 Dialog
  └─ <BookDetail>         详情页
       ├─ [左侧 Drawer 280px] <ChapterTree>
       │    ├─ 递归渲染的章节节点
       │    ├─ 展开/折叠（有子节点 + 文件夹图标）
       │    ├─ 内联重命名（TextField）
       │    ├─ 右键菜单：添加子章节 / 重命名 / 删除
       │    └─ 鼠标拖拽重排（基于 mousedown/mousemove/mouseup，position 分上中下 25%）
       └─ [右侧主区域] <ChapterEditor>
            ├─ 章节标题头
            └─ Milkdown WYSIWYG 编辑器 (Nord 主题 + CommonMark + 500ms 防抖自动保存)
```

## 关键技术决策

### 1. 拖拽方案
Tauri 的 WKWebView 对原生 HTML5 Drag & Drop API（`draggable`, `dragStart`, `dragOver`, `drop`）支持不完善，点击事件直接触发 `dragStart`+`dragEnd` 但不触发 `dragOver`/`drop`。因此采用**自定义鼠标事件方案**：
- `onMouseDown` 开始追踪
- 全局 `mousemove` 监听器，移动 >5px 进入拖拽模式
- `document.elementFromPoint()` + `[data-chapter-id]` 属性定位目标
- 根据鼠标 Y 位置在目标元素高度中的百分比判定：上 25% = before，下 25% = after，中间 50% = inner

### 2. 编辑器自动保存
Milkdown `listener` 插件监听内容变化，500ms 防抖后通过 Tauri invoke 写入文件。编辑器组件通过 `key={selectedChapter.id}` 强制重建（章节切换时），`useEditor` 空依赖 `[]` 避免输入过程中重建。

### 3. 内容加载顺序
`selectChapter` 先读取文件内容再设置 `selectedChapterId`，确保编辑器挂载时内容已就绪。

## 开发命令

```bash
npm run tauri dev       # 开发模式（热更新 + Tauri 窗口）
npm run tauri build     # 生产构建
npm run build           # 仅前端构建
npm run dev             # 仅前端开发服务器
cargo build             # 仅 Rust 后端构建
```

## 已知问题

1. 编辑器仅加载了 `commonmark` preset，未启用 `gfm`、`math`、`diagram` 等插件（需安装对应 `@milkdown/plugin-*` 包并注册）
2. Git 操作通过调用 `git` CLI 实现，依赖系统安装 Git
3. 新建书默认保存到 `{app_data_dir}/books/`，不支持用户自定义路径
4. 章节文件命名使用 UUID，无直观文件名

## 可能的扩展方向

1. 添加 `gfm`、`math`、`diagram` 插件到编辑器
2. 章节拖拽时支持跨父级结构的动画过渡
3. Git 面板：查看 diff、提交历史、分支切换
4. 导入/导出为 ZIP
5. 书的自定义存储路径
6. 搜索功能（全文搜索章节内容）
7. 文档导出（PDF/HTML）
