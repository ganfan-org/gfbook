# gfbook 书库格式规范

> 本规范描述 gfbook 保存书稿的磁盘格式，以及导出静态站点时可覆盖的模板。机器校验见 [`schemas/gfbook.schema.json`](../schemas/gfbook.schema.json)。

## 1. 目录结构

书库根目录默认为 `~/gfbooks`，每本书是一个独立目录：

```
~/gfbooks/
├── <book>/
│   ├── gfbook.yaml        # 必需的元数据文件
│   ├── chapters/
│   │   ├── <chapter-id>.md
│   │   └── ...
│   └── assets/            # 可选，存放图片等附件
└── .gfbook/
    └── templates/         # 可选，导出站点模板（见第 7 节）
```

- 书库扫描规则：包含 `gfbook.yaml` 的一级子目录才被视为一本书；`.gfbook` 等无元数据的目录会被忽略。
- 章节目录 `chapters/` 与资源目录 `assets/` 名称固定，大小写敏感。

## 2. `gfbook.yaml`

以 UTF-8 编码的 YAML 保存，字段如下：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `title` | string | 是 | 书名，用于书架显示与导出站点路径 |
| `schema_version` | integer | 否 | 格式版本，缺省视为 `1` |
| `created_time` | integer | 否 | 创建时间（毫秒时间戳） |
| `updated_time` | integer | 否 | 最近更新时间（毫秒时间戳） |
| `chapters` | array | 是 | 顶层章节列表，元素为章节对象 |

章节对象（可无限嵌套，嵌套即子章节）：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 章节标识，同时在 `chapters/<id>.md` 中作为文件名 |
| `title` | string | 是 | 章节标题 |
| `created_time` | integer | 否 | 毫秒时间戳 |
| `updated_time` | integer | 否 | 毫秒时间戳 |
| `chapters` | array | 否 | 子章节列表；叶子章节为 `[]` |

约定：

- 时间戳统一写毫秒。读取旧数据时，小于 `1e12` 的值按秒处理（`秒 × 1000`）。
- `id` 只允许 `A-Za-z0-9_-`，推荐 UUID v4；同一本书内必须唯一，且创建后不应修改（它同时是文件名与导出页面名的一部分）。
- 解析器必须忽略未知字段，以便未来扩展；新增字段时不得改变已有字段语义。

示例：

```yaml
title: 开发日常
schema_version: 1
created_time: 1784197619836
updated_time: 1784616979884
chapters:
  - id: b41ff281-656b-44d1-8099-c6a17180db1a
    title: 环境准备
    created_time: 1784197619836
    updated_time: 1784198134633
    chapters: []
```

## 3. 章节正文

- 位置：`<book>/chapters/<id>.md`，UTF-8 Markdown（CommonMark + GFM 表格）。
- 正文首行可以是 `# 标题`；若没有一级标题，导出时会自动补上章节标题。
- 删除章节时，应同时从 `gfbook.yaml` 的章节树和对应 `.md` 文件移除。

## 4. 资源与图片引用

图片文件建议放在 `<book>/assets/`，Markdown 中按相对路径引用：

```markdown
![说明](../assets/pic.png)   # 推荐
![说明](assets/pic.png)
![说明](@/assets/pic.png)    # 兼容旧版 iOS 客户端
![说明](pic.png)              # 兼容：文件实际位于 chapters/ 内
```

导出时统一把图片复制到站点的 `<book>/assets/<basename>` 并改写引用；同名文件会加序号避免覆盖。引用无法解析时导出继续，缺失项在导出结果中列出。

## 5. 公式

支持行内公式 `$...$` 与块级公式 `$$...$$`，导出时用 KaTeX 渲染，所需 CSS 与字体复制到站点的 `katex/` 目录，不依赖 CDN。仓库内保留的字形为 `public/katex/` 下的 woff2 字体。

## 6. 兼容层

以下历史写法在解析阶段兼容，新内容不应继续使用：

| 历史写法 | 处理方式 |
| --- | --- |
| `@/assets/...`、裸文件名图片 | 依次尝试 `assets/`、`chapters/` 定位 |
| 表格单元格内的 `\x1f` 分隔符 | 读取时转换为换行 |
| 秒级时间戳 | 读取时换算为毫秒 |
| 驼峰字段（`createdTime` 等） | 已迁移为下划线字段，不再支持 |

## 7. 版本演进

- 字段语义变化、必填项增加、文件布局调整时递增 `schema_version`。
- 小版本内只做向后兼容的新增（解析器忽略未知字段即可）。
- 升级前必须备份：书库整体是普通目录，可直接复制或用 `git` 管理。
- 旧版本数据缺少 `schema_version` 时按 `1` 处理；迁移脚本应幂等，重复执行不改变结果。

## 8. 导出静态站点

在书架选择书并导出后得到：

```
<输出目录>/
├── index.html            # 站点入口，列出所选书籍
├── style.css             # 站点样式（可被自定义模板覆盖）
├── katex/                # 仅当内容含公式时生成
│   ├── katex.min.css
│   └── fonts/*.woff2
└── <book-slug>/
    ├── index.html        # 书籍目录页
    ├── ch-<chapter-id>.html
    └── assets/*          # 图片等资源副本
```

- `book-slug` 由书名清洗得到（去掉 `\/:*?"<>|&#'%`，空白转 `-`），重名时追加 `-2`、`-3`。
- 站点为纯静态页面，无 JavaScript，可直接放到任意静态托管（GitHub Pages、对象存储、Nginx）。
- 页面使用相对路径，整个目录可压缩上传，也可本地双击 `index.html` 浏览。

## 9. 导出自定义模板

在书库根目录创建 `.gfbook/templates/`，放入以下任意文件即可覆盖内置模板（缺失的文件回退到内置版本）：

| 文件 | 作用 |
| --- | --- |
| `chapter.html` | 章节页骨架，必须包含 `{{content}}` |
| `book.html` | 书籍目录页骨架，必须包含 `{{content}}` |
| `home.html` | 站点入口页骨架，必须包含 `{{book_list}}` |
| `style.css` | 站点样式，整体替换内置样式 |

占位符使用 `{{name}}` 形式，未提供的占位符会被替换为空字符串。

`chapter.html` / `book.html` 可用占位符：

| 占位符 | 内容 |
| --- | --- |
| `{{lang}}` | 页面语言，`zh-CN` 或 `en` |
| `{{title}}` | `<title>` 文本 |
| `{{site_title}}` | 站点名（书库入口名） |
| `{{book_title}}` | 当前书名 |
| `{{css_href}}` | 样式相对路径（`../style.css`） |
| `{{katex_link}}` | KaTeX 样式 `<link>` 标签；无公式时为空 |
| `{{home_href}}` | 返回站点入口的相对路径（`../index.html`） |
| `{{toc_label}}` | 「目录」文案 |
| `{{sidebar}}` | 侧边栏导航 HTML |
| `{{content}}` | 正文/目录 HTML |
| `{{pager}}` | 上一篇/下一篇 HTML（仅 `chapter.html`） |

`home.html` 可用占位符：`{{lang}}`、`{{site_title}}`、`{{subtitle}}`、`{{book_list}}`、`{{footer}}`。注意入口页样式路径固定为同级的 `style.css`。

模板只做字符串替换，不支持条件与循环；占位符写错会得到空内容，导出前会校验必须的占位符，缺失则自动回退内置模板。

导出对话框中的「安装示例模板」会把一套单栏阅读版（无侧边栏、衬线正文、窄栏排版）写入 `.gfbook/templates/`，可直接在此基础上修改。若目标文件已存在则拒绝覆盖，避免冲掉自定义模板。

## 10. 从 Markdown 目录导入

书架「导入 → 导入 Markdown 目录」可以把一个普通的 Markdown 笔记目录转成一本书，无需先手工编写 `gfbook.yaml`：

| 源目录内容 | 导入结果 |
| --- | --- |
| 根目录下的 `*.md` | 顶层章节，标题取第一个 `# 一级标题`，缺失时用文件名（去掉开头的 `01-` 等序号） |
| 子目录 | 一个分组章节；目录内有 `index.md` / `README.md` 时用其正文和标题，否则生成只含标题的空章节 |
| 子目录内的 `*.md` | 该分组的子章节，可继续嵌套 |
| 被引用的图片 | 复制到 `assets/`（同名自动加序号），正文中的相对路径改写为 `assets/<name>` |

- 跳过隐藏目录与 `node_modules`；`.md` / `.markdown` 文件按文件名中的数字前缀自然排序。
- 图片引用支持 `![alt](相对路径)` 与 HTML `<img src="...">`，`http(s)://`、`data:` 等外链保持不变。
- 导入前会先扫描并展示目录结构和篇数、图片数，确认后才写入书库。
- 已含 `gfbook.yaml` 的目录请使用「导入书」，导入 Markdown 目录会拒绝处理。

## 11. 命令行导出

不启动桌面应用也可以导出站点（依赖 `tsx` 与 `jsdom`，已列入 devDependencies）：

```bash
npm run export -- --out ./site                    # 导出书库中的全部书
npm run export -- --out ./site --books ~/gfbooks/算法,~/gfbooks/c
npm run export -- --out ./site --all --root ~/gfbooks --lang en
```

| 参数 | 说明 |
| --- | --- |
| `--out <目录>` | 必填，站点输出目录 |
| `--root <目录>` | 书库根目录，默认 `~/gfbooks` |
| `--books <路径>` | 要导出的书目录，逗号分隔，可重复传入 |
| `--all` | 导出书库根目录下的全部书（未指定 `--books` 时的默认行为） |
| `--lang <zh\|en>` | 导出站点语言，默认 `zh` |

命令行与桌面端使用同一套 `src/utils/exportHtml.ts` 渲染逻辑和同一份 `.gfbook/templates/` 模板，输出结构完全一致。

## 12. 机器校验

使用 JSON Schema 校验元数据（需先安装 `check-jsonschema` 或任意 JSON Schema 校验器）：

```bash
npx check-jsonschema --schemafile schemas/gfbook.schema.json ~/gfbooks/<book>/gfbook.yaml
```

由于 YAML 是 JSON 的超集，同一份 schema 也适用于从 YAML 转换出的 JSON。
