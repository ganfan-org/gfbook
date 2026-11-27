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
| `kind` | string | 否 | 书的形态：`book`（默认）或 `diary`（日记本） |
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
| `date` | string | 否 | 日记条目日期 `YYYY-MM-DD`，仅日记本使用；同一天允许多条 |
| `chapters` | array | 否 | 子章节列表；叶子章节为 `[]` |

约定：

- 时间戳统一写毫秒。读取旧数据时，小于 `1e12` 的值按秒处理（`秒 × 1000`）。
- `id` 只允许 `A-Za-z0-9_-`，推荐 UUID v4；同一本书内必须唯一，且创建后不应修改（它同时是文件名与导出页面名的一部分）。日记本中 `id` 与 `date` 相互独立，不要再用日期充当 `id`。
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

### 日记本

日记本（`kind: diary`）仍是同一套书结构，只是章节带 `date` 字段并按日期组织：

- 每个顶层章节是一条日记，`date` 为 `YYYY-MM-DD`；**同一天允许多条**，`date` 不再唯一。
- `id` 与 `date` 相互独立：新数据使用独立 id（UUID v4），不再用日期当 id；历史数据里 `id` 恰好等于日期的条目仍能正常读取，无需迁移。
- 排序：顶层 `chapters` 按 `date` 倒序；同一天内按 `created_time` 正序（先写的在前）。
- 日记条目不再嵌套子章节。
- `title` 是展示名：等于 `date` 时视为“未自定义”，界面回退显示日期标签；自定义后 `date` 仍是组织与排序的唯一依据。
- 未写 `kind` 的书按 `book` 处理，普通书的章节不写 `date` 字段，因此旧数据无需迁移。
- 搜索、Git 同步与导出站点逻辑与普通书一致。

外部导入（例如 iOS 端 gfjournal 导出）使用下面的目录包，**不需要额外格式**，在书架「导入 → 导入书」选择该目录即可（若导出为 zip，解压后选择解压出的目录）：

```
<日记本名称>/
├── gfbook.yaml
├── chapters/
│   ├── 6f0a1c7e-4b0e-4b7e-9d6a-0a1b2c3d4e5f.md
│   ├── 2b9d4e10-8c3a-4f52-b1c4-7e9f0a1b2c3d.md
│   └── 2026-11-12.md          # 旧格式：id 恰好等于日期，仍可读取
└── assets/
    └── photo-1.jpg
```

`gfbook.yaml` 示例（同一天两条）：

```yaml
title: 我的日记
schema_version: 1
kind: diary
created_time: 1794470400000
updated_time: 1794556800000
chapters:
  - id: 2b9d4e10-8c3a-4f52-b1c4-7e9f0a1b2c3d
    title: 深夜补记
    date: 2026-11-13
    created_time: 1794560400000
    updated_time: 1794560400000
    chapters: []
  - id: 6f0a1c7e-4b0e-4b7e-9d6a-0a1b2c3d4e5f
    title: 2026-11-13
    date: 2026-11-13
    created_time: 1794556800000
    updated_time: 1794556800000
    chapters: []
  - id: 2026-11-12
    title: 2026-11-12
    date: 2026-11-12
    created_time: 1794470400000
    updated_time: 1794470400000
    chapters: []
```

上例中 11 月 13 日两条按 `created_time` 正序排列（先写的 `2026-11-13` 在前，`深夜补记` 在后）；`2026-11-12` 是旧格式 id，gfbook 不依赖 id 与日期的关系。

导出方需要遵守的约定：

| 项目 | 约定 |
| --- | --- |
| 拆分 | 一条日记对应一个顶层章节；同一天的多条必须拆成多个章节、多个 Markdown 文件，不要合并成一篇 |
| id | 每条唯一，推荐 UUID v4；不要用日期作 id（同一天多条会冲突）。已有 `id` 等于日期的旧数据可以继续沿用 |
| 日期 | `date` 用本地日历日 `YYYY-MM-DD`，不带时间与时区；同一天可以重复出现 |
| 顺序 | `chapters` 按 `date` 倒序，同一天按 `created_time` 正序；顺序不对时导入会自动重排，不会丢数据 |
| 标题 | `title` 是展示名，可直接用日期字符串表示“未自定义”；日期本身始终以 `date` 为准 |
| 正文 | `chapters/<id>.md` 为纯 Markdown，可带也可不带 `# 标题`，渲染层会按需补标题 |
| 资源 | 图片放 `assets/`，正文用相对路径 `../assets/<文件名>` 引用（也兼容 `assets/<文件名>`） |
| 时间戳 | `created_time` / `updated_time` 写毫秒；缺失时按 0 处理，不影响打开。同一天多条请务必写 `created_time`，否则同日顺序不保证 |
| 扩展字段 | 导出方可写入自定义字段，gfbook 读取时会忽略，但请勿改变已有字段语义 |

导入时会校验：`kind: diary` 的每个顶层章节必须有合法的 `date`，且不能带子章节；同一天的多条会被保留，并按“日期倒序、同日创建时间正序”重排后写回。`date` 不再要求唯一。

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
- 「日记本允许同一天多条、id 与日期解耦」没有新增或删除字段，磁盘结构不变，因此仍使用 `schema_version: 1`；旧数据（含 `id` 等于日期的条目）无需迁移。依赖“日期唯一”的旧工具需要按新规则调整。
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
- 日记本每条日记各自生成一个 `ch-<id>.html`（id 独立，同一天多条不会互相覆盖）；书籍目录页按月份和日期分块，同一天多条在块内依次展开。
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
