# 项目优化记录

## 已完成

### 1. 路径穿越修复 + CSP 启用

| 文件 | 改动 |
|---|---|
| `commands.rs:679-690` | `read_file_base64` 新增 `canonicalize()` + `$HOME` 前缀校验 |
| `commands.rs:721-736` | `get_asset_url` 新增 `canonicalize()` + 校验路径在 book_path 内 |
| `commands.rs:286-289` | 删除 `new_book` 中重复的 `create_dir_all` |
| `tauri.conf.json:22-29` | `"csp": null` → 设置合理策略（default-src/script-src/style-src/img-src 等） |
| `tauri.conf.json:24-28` | asset protocol 启用 `enable: true`，scope 改为 `$HOME/**/*`，添加 `requireLiteralLeadingDot: false` |

### 2. 移除 unwrap() 崩溃点

| 文件 | 改动 |
|---|---|
| `git.rs:245` | `repo.statuses(None).unwrap()` → `.map_err(...)` 返回 Result |

### 3. 拆分 ChapterEditor（1098 → 767 行）

| 新文件 | 行数 | 职责 |
|---|---|---|
| `EditorToolbar.tsx` | 205 | 工具栏（P/H1/H2/H3/B/I/UL/OL/链接/公式/图片/表格/TOC） |
| `LinkDialog.tsx` | 105 | 链接编辑弹窗 |
| `MathDialog.tsx` | 117 | 数学公式弹窗（LaTeX + Katex 预览） |
| `ChapterEditor.tsx` | 767 | 编排逻辑、事件处理、滚动管理 |

### 4. 拆分 useBook（215 → 组合式）

| 新文件 | 行数 | 职责 |
|---|---|---|
| `useBookChapters.ts` | 130 | 章节 CRUD |
| `useBookGit.ts` | 98 | Git 操作 |
| `useBookGitRemote.ts` | 69 | 远程操作 |
| `useBook.ts` | 23 | 组合三个 hook + 初始化 effect |

### 5. 图片方案：Data URL → Tauri Asset Protocol

详见 `docs/image-asset-protocol.md`

| 改动 |
|---|
| 新增 `get_asset_url` Rust 命令（路径安全校验 + 返回绝对路径） |
| 前端 `getAssetUrl()` 使用 `convertFileSrc()` 生成正确 URL |
| 4 处 `read_image_as_data_url` 调用全部替换为 `getAssetUrl` |
| 删除 `read_image_as_data_url` Rust 命令 |

### 6. 滚动条跳转修复

| 改动 |
|---|
| 滚动容器从 `flex: 1` 改为 `position: absolute; inset: 0`，脱离 flex 布局流 |
| 提取 `EditorArea` 组件（`React.memo`），弹窗状态变化时不重新渲染 |
| `mousedown` 捕获拦截（阻止 ProSeMirror 在链接点击时滚动） |
| `useLayoutEffect` + `requestAnimationFrame` 双重滚动恢复 |
| Dialog 添加 `disableScrollLock` |

---

## 待优化

### 安全（高优）

| # | 问题 | 位置 |
|---|---|---|
| 1 | `download_image_url` — 无 URL 白名单，可 SSRF / 读 `file://` | `commands.rs:781` |
| 2 | `download_image_url` — `reqwest::blocking::get` 无超时，可阻塞主线程 | `commands.rs:786` |
| 3 | `download_image_url` — `response.bytes()` 全量加载，大文件 OOM | `commands.rs:813` |
| 4 | `download_image_url` — 不校验 Content-Length | `commands.rs:813` |
| 5 | `save_image_data` — base64 字符串无大小限制 | `commands.rs:825` |
| 6 | `save_image_to_book` — 不校验源文件大小 | `commands.rs:851` |
| 7 | `read_file_base64` — 无文件大小限制 | `commands.rs:679` |
| 8 | Push 硬编码 `main`/`master` 分支名 | `git.rs:329-335` |

### 类型安全（高优）

| # | 问题 | 位置 |
|---|---|---|
| 9 | `"strict": true` 被注释 | `tsconfig.json:22` |
| 10 | `eslint no-explicit-any` 被关闭 | `eslint.config.ts:93` |
| 11 | 大量 `any` 类型参数（`view: any`、`_node: any`、`stripMailtoLinks`） | `ChapterEditor.tsx` |
| 12 | 多处 `as any` 强制转换 | `ChapterEditor.tsx` |

### 性能（中优）

| # | 问题 | 位置 |
|---|---|---|
| 13 | `BookCover`、`ChapterItem` 未 `React.memo` | `BookShelf.tsx`、`ChapterTree.tsx` |
| 14 | 工具栏按钮用内联 `onClick={() => ...}`，每次渲染创建新函数 | `EditorToolbar.tsx` |
| 15 | `hashColor`、`formatDate` 在渲染中直接调用，未 `useMemo` | `BookShelf.tsx` |
| 16 | `editMath`、`handleMathSubmit`、`handleLinkUpdate` 未 `useCallback` | `ChapterEditor.tsx` |
| 17 | `forceUpdate` hack（`const [, forceUpdate] = useState(0)`） | `ChapterEditor.tsx` |

### 错误处理（中优）

| # | 问题 |
|---|---|
| 18 | 大量 `catch { console.error(...) }` 静默吞错，用户无反馈 |
| 19 | `git_status` / `git_log` 失败时 `catch {}` 完全静默 |
| 20 | 图片相关操作失败只有 `console.error` |

### 可访问性（中优）

| # | 问题 | 位置 |
|---|---|---|
| 21 | 工具栏 IconButton 无 `aria-label`，仅靠 Tooltip | `EditorToolbar.tsx` |
| 22 | 章节树无 ARIA 角色、无键盘导航 | `ChapterTree.tsx` |
| 23 | 暗色模式切换、设置按钮、更多菜单无 `aria-label` | `BookShelf.tsx` |
| 24 | 章节展开/折叠无 `aria-expanded` | `ChapterTree.tsx` |

### CSS / 主题（低优）

| # | 问题 | 位置 |
|---|---|---|
| 25 | 硬编码颜色不响应暗色模式 | `ChapterEditor.css` |
| 26 | 内联 `<style>` 注入 | `BookDetail.tsx` |

### Rust 侧（中优）

| # | 问题 | 位置 |
|---|---|---|
| 27 | 手写 base64 编解码，应用 `base64` crate | `commands.rs` |
| 28 | `let _ =` 忽略错误 | `git.rs` |
| 29 | `HOME` 回退空字符串 | `git.rs` |
| 30 | `slugify` 过滤中日韩字符 | `commands.rs` |

### 工程化（中优）

| # | 问题 |
|---|---|
| 31 | ~35 个未使用的 npm 依赖 |
| 32 | 无测试框架，零测试文件 |
| 33 | `Makefile.toml` 引用不存在脚本 |
| 34 | `package.json` name 为 `"tauri-app"` |
| 35 | `Cargo.toml` author 为 `"you"` |
| 36 | `vite.config.mts` 中 TypeScript checker 被注释 |
