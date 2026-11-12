import Image from '@tiptap/extension-image'
import { Mathematics } from '@tiptap/extension-mathematics'
import TableCellExtension from '@tiptap/extension-table-cell'
import TableHeaderExtension from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import { MarkdownManager } from '@tiptap/markdown'
import { generateHTML, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import i18next from 'i18next'
import katex from 'katex'

import { CustomTable } from '../editor/customTable'
import type { BookInfo, BookMeta, Chapter } from '../types'
import {
  exportSite as exportSiteCommand,
  getBookMeta,
  readChapter,
  readSiteTemplates,
  type ExportAsset,
  type ExportBinary,
  type ExportFile,
  type ExportSummary,
} from './commands'

export interface ExportProgress {
  /** 阶段：prepare 读取书目 / render 渲染章节 / write 写入磁盘 */
  stage: 'prepare' | 'render' | 'write'
  done: number
  total: number
  label: string
}

export interface ExportResult {
  outputDir: string
  /** 站点入口 index.html 的绝对路径 */
  entryPath: string
  pageCount: number
  bookCount: number
  missingAssets: string[]
}

interface RenderedChapter {
  id: string
  title: string
  depth: number
  file: string
  html: string
}

interface RenderedBook {
  info: BookInfo
  slug: string
  chapters: RenderedChapter[]
}

function createExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { autolink: false, linkOnPaste: false, openOnClick: false },
    }),
    Image,
    Mathematics.configure({ katexOptions: { throwOnError: false } }),
    CustomTable,
    TableRow,
    TableCellExtension,
    TableHeaderExtension,
  ]
}

let markdownManager: MarkdownManager | null = null
function getMarkdownManager(): MarkdownManager {
  if (!markdownManager) {
    markdownManager = new MarkdownManager({ extensions: createExtensions() })
  }
  return markdownManager
}

// ═══════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sanitizeSegment(input: string, fallback: string): string {
  const cleaned = input
    .trim()
    .replace(/[\\/:*?"<>|&#'%]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
  return cleaned || fallback
}

function uniqueSlug(title: string, used: Set<string>, index: number): string {
  const base = sanitizeSegment(title, `book-${index + 1}`)
  let slug = base
  let n = 2
  while (used.has(slug.toLowerCase())) {
    slug = `${base}-${n}`
    n++
  }
  used.add(slug.toLowerCase())
  return slug
}

function flattenChapters(chapters: Chapter[], depth = 0): {
  id: string
  title: string
  depth: number
}[] {
  const result: { id: string; title: string; depth: number }[] = []
  for (const chapter of chapters) {
    result.push({ id: chapter.id, title: chapter.title, depth })
    if (chapter.chapters?.length) {
      result.push(...flattenChapters(chapter.chapters, depth + 1))
    }
  }
  return result
}

function chapterFileName(id: string): string {
  return `ch-${sanitizeSegment(id, 'chapter')}.html`
}

function formatDate(ts: number): string {
  const ms = ts < 1e12 ? ts * 1000 : ts
  if (!ms || ms <= 0) return ''
  return new Date(ms).toLocaleDateString(
    i18next.language === 'zh' ? 'zh-CN' : 'en-US',
    { year: 'numeric', month: 'short', day: 'numeric' },
  )
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

// ═══════════════════════════════════════════
// 资源（图片）收集
// ═══════════════════════════════════════════
interface AssetCollector {
  rewrite: (src: string) => string
  assets: ExportAsset[]
}

function createAssetCollector(bookPath: string, slug: string): AssetCollector {
  const bySrc = new Map<string, string>()
  const usedNames = new Set<string>()
  const assets: ExportAsset[] = []

  function rewrite(src: string): string {
    if (!src) return src
    if (/^(https?:|data:|file:|mailto:)/i.test(src)) return src
    const cached = bySrc.get(src)
    if (cached) return cached

    const clean = src
      .replace(/^@\//, '')
      .replace(/^\.?\//, '')
      .split('#')[0]
      .split('?')[0]
    const decoded = decodeURI(clean)
    const parts = decoded.split('/')
    const base = parts[parts.length - 1] || 'image'
    const dot = base.lastIndexOf('.')
    const stem = dot > 0 ? base.slice(0, dot) : base
    const ext = dot > 0 ? base.slice(dot) : ''

    let name = sanitizeSegment(base, `image${ext}`)
    let n = 2
    while (usedNames.has(name.toLowerCase())) {
      name = `${sanitizeSegment(stem, 'image')}-${n}${ext}`
      n++
    }
    usedNames.add(name.toLowerCase())

    const rel = `assets/${name}`
    bySrc.set(src, rel)
    assets.push({ book_path: bookPath, src: decoded, dest: `${slug}/${rel}` })
    return rel
  }

  return { rewrite, assets }
}

// ═══════════════════════════════════════════
// Markdown → HTML
// ═══════════════════════════════════════════
function rewriteImagesInDoc(node: any, rewrite: (src: string) => string): void {
  if (!node || typeof node !== 'object') return
  if (
    node.type === 'image' &&
    node.attrs &&
    typeof node.attrs.src === 'string'
  ) {
    node.attrs.src = rewrite(node.attrs.src)
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) rewriteImagesInDoc(child, rewrite)
  }
}

function hasMathNode(node: any): boolean {
  if (!node || typeof node !== 'object') return false
  if (node.type === 'blockMath' || node.type === 'inlineMath') return true
  if (Array.isArray(node.content)) {
    return node.content.some(hasMathNode)
  }
  return false
}

function fillMathInHtml(html: string): string {
  if (!html.includes('data-type=')) return html
  const container = document.createElement('div')
  container.innerHTML = html
  container
    .querySelectorAll('[data-type="block-math"], [data-type="inline-math"]')
    .forEach(el => {
      const latex = el.getAttribute('data-latex') ?? ''
      const displayMode = el.getAttribute('data-type') === 'block-math'
      if (!latex) {
        el.remove()
        return
      }
      try {
        el.innerHTML = katex.renderToString(latex, {
          displayMode,
          throwOnError: false,
        })
        el.className = displayMode ? 'math-block' : 'math-inline'
      } catch {
        el.textContent = displayMode ? `$$${latex}$$` : `$${latex}$`
      }
    })
  return container.innerHTML
}

function renderMarkdownToHtml(
  markdown: string,
  collector: AssetCollector,
): { html: string; hasMath: boolean } {
  let doc: JSONContent
  try {
    doc = getMarkdownManager().parse(markdown) as JSONContent
  } catch {
    return {
      html: `<pre class="markdown-fallback">${escapeHtml(markdown)}</pre>`,
      hasMath: false,
    }
  }
  const hasMath = hasMathNode(doc)
  rewriteImagesInDoc(doc, collector.rewrite)
  let html: string
  try {
    html = generateHTML(doc, createExtensions())
  } catch {
    html = `<pre class="markdown-fallback">${escapeHtml(markdown)}</pre>`
  }
  return { html: hasMath ? fillMathInHtml(html) : html, hasMath }
}

// ═══════════════════════════════════════════
// 页面片段
// ═══════════════════════════════════════════
function buildSidebar(
  bookTitle: string,
  chapters: RenderedChapter[],
  currentFile: string | null,
): string {
  const items = chapters
    .map(ch => {
      const active = currentFile && ch.file === currentFile ? ' active' : ''
      return `<a class="depth-${Math.min(ch.depth, 3)}${active}"${
        active ? ' aria-current="page"' : ''
      } href="${ch.file}">${escapeHtml(ch.title)}</a>`
    })
    .join('\n')
  return `<a class="book-link" href="index.html">${escapeHtml(
    bookTitle,
  )}</a>\n<nav class="toc">\n${items}\n</nav>`
}

function buildPager(
  prev: RenderedChapter | null,
  next: RenderedChapter | null,
): string {
  if (!prev && !next) return ''
  const left = prev
    ? `<a class="pager-prev" href="${prev.file}"><span>${escapeHtml(
        i18next.t('export.prev'),
      )}</span>${escapeHtml(prev.title)}</a>`
    : '<span></span>'
  const right = next
    ? `<a class="pager-next" href="${next.file}"><span>${escapeHtml(
        i18next.t('export.next'),
      )}</span>${escapeHtml(next.title)}</a>`
    : '<span></span>'
  return `<nav class="pager">${left}${right}</nav>`
}

// ═══════════════════════════════════════════
// 样式表
// ═══════════════════════════════════════════
const SITE_CSS = `:root {
  color-scheme: light dark;
  --bg: #fbfaf7;
  --panel: #f3f0ea;
  --fg: #231f1c;
  --muted: #8b837a;
  --line: #e6e0d6;
  --hover: #efeae2;
  --accent: #9a5b33;
  --font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --font-read: "Iowan Old Style", "Palatino Linotype", "Songti SC", "Noto Serif CJK SC", Georgia, "Microsoft YaHei", serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #151413;
    --panel: #1e1c1a;
    --fg: #e7e2da;
    --muted: #9b948b;
    --line: #2d2a26;
    --hover: #262320;
    --accent: #d59a6d;
  }
}
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-ui);
  font-size: 15px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

.topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  height: 54px;
  padding: 0 24px;
  border-bottom: 1px solid var(--line);
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 10;
}
.topbar .brand { font-weight: 600; font-size: 14px; letter-spacing: .01em; }
.topbar .book { color: var(--muted); font-size: 13px; }
.topbar .book::before { content: "/"; margin-right: 10px; color: var(--line); }

.sidebar { padding: 22px 14px 40px 18px; }
.sidebar .book-link {
  display: block;
  margin-bottom: 14px;
  font-weight: 600;
  font-size: 14.5px;
  color: var(--fg);
  line-height: 1.4;
}
.sidebar .toc a {
  display: block;
  padding: 6px 10px;
  margin: 1px 0;
  border-radius: 6px;
  color: var(--muted);
  font-size: 13.5px;
  line-height: 1.45;
}
.sidebar .toc a:hover { background: var(--hover); color: var(--fg); text-decoration: none; }
.sidebar .toc a.active { background: var(--hover); color: var(--fg); font-weight: 600; }
.sidebar .toc a.depth-1 { padding-left: 22px; }
.sidebar .toc a.depth-2 { padding-left: 34px; }
.sidebar .toc a.depth-3 { padding-left: 46px; }

.toc-toggle { display: none; }
.toc-toggle-label { display: none; }

.content { padding: 26px 0 72px; }
.content article {
  max-width: 720px;
  font-family: var(--font-read);
  font-size: 17px;
  line-height: 1.9;
}
.content article > h1:first-child { margin-top: 0; }
article h1, article h2, article h3, article h4, article h5, article h6 {
  font-family: var(--font-ui);
  line-height: 1.35;
  letter-spacing: -.005em;
  margin: 2em 0 .7em;
  font-weight: 650;
}
article h1 { font-size: 1.72rem; margin-top: 0; }
article h2 { font-size: 1.3rem; padding-bottom: .25em; border-bottom: 1px solid var(--line); }
article h3 { font-size: 1.08rem; }
article p { margin: 1em 0; }
article ul, article ol { padding-left: 1.5em; margin: 1em 0; }
article li { margin: .35em 0; }
article li > p { margin: .3em 0; }
article blockquote {
  margin: 1.4em 0;
  padding: .2em 0 .2em 1em;
  border-left: 3px solid var(--line);
  color: var(--muted);
}
article blockquote p { margin: .5em 0; }
article hr { border: none; border-top: 1px solid var(--line); margin: 2.4em 0; }
article img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1.4em auto;
  border-radius: 6px;
}
article a { text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: .06em; }
article code {
  font-family: var(--font-mono);
  font-size: .84em;
  background: var(--panel);
  padding: .15em .38em;
  border-radius: 4px;
}
article pre {
  background: var(--panel);
  padding: 14px 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1.4em 0;
  line-height: 1.55;
}
article pre code { background: none; padding: 0; font-size: .82em; }
article table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.4em 0;
  font-family: var(--font-ui);
  font-size: .86em;
  display: block;
  overflow-x: auto;
}
article th, article td {
  border: 1px solid var(--line);
  padding: 7px 11px;
  text-align: left;
  vertical-align: top;
}
article th { background: var(--panel); font-weight: 600; }
article .math-block { overflow-x: auto; text-align: center; margin: 1.5em 0; }
article .markdown-fallback { white-space: pre-wrap; }

.pager {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  max-width: 720px;
  margin: 56px 0 0;
  padding-top: 20px;
  border-top: 1px solid var(--line);
  font-size: 13px;
}
.pager a {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 46%;
  color: var(--fg);
  line-height: 1.4;
}
.pager a:hover { color: var(--accent); text-decoration: none; }
.pager a span { color: var(--muted); font-size: 11.5px; letter-spacing: .04em; text-transform: uppercase; }
.pager-next { text-align: right; margin-left: auto; }

.book-intro { max-width: 720px; }
.book-intro h1 { font-size: 1.9rem; margin: 0 0 .4em; font-weight: 650; letter-spacing: -.01em; }
.book-intro .meta { color: var(--muted); font-size: 13px; margin-bottom: 2.4em; }
.chapter-list { list-style: none; padding: 0; margin: 0 auto; max-width: 720px; }
.chapter-list li { border-bottom: 1px solid var(--line); }
.chapter-list a {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 13px 4px;
  color: var(--fg);
  font-size: 15px;
}
.chapter-list a:hover { color: var(--accent); text-decoration: none; }
.chapter-list .depth-1 { padding-left: 26px; }
.chapter-list .depth-2 { padding-left: 48px; }
.chapter-list .depth-3 { padding-left: 70px; }
.chapter-list .index { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; min-width: 1.6em; }
.empty { color: var(--muted); font-size: 14px; }

.home { padding: 72px 24px 96px; }
.home-inner { max-width: 720px; margin: 0 auto; }
.home h1 { font-size: 2rem; margin: 0 0 .3em; font-weight: 650; letter-spacing: -.02em; }
.home .subtitle { color: var(--muted); font-size: 14px; margin-bottom: 3em; }
.book-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.book-list a {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 20px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--bg);
  transition: background .16s ease, border-color .16s ease;
}
.book-list a:hover { background: var(--panel); border-color: var(--muted); text-decoration: none; }
.book-list .title { font-size: 15.5px; font-weight: 600; color: var(--fg); }
.book-list .info { color: var(--muted); font-size: 12.5px; white-space: nowrap; }
.home footer { margin-top: 4em; color: var(--muted); font-size: 12px; }

@media (max-width: 979px) {
  .sidebar { padding: 14px 20px; border-bottom: 1px solid var(--line); }
  .sidebar .book-link { margin-bottom: 10px; font-size: 14px; }
  .toc-toggle-label {
    display: inline-flex;
    align-items: center;
    margin-bottom: 4px;
    padding: 5px 11px;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--muted);
    font-size: 12.5px;
    cursor: pointer;
    user-select: none;
  }
  .toc-toggle:checked ~ .toc { display: block; }
  .toc-toggle:not(:checked) ~ .toc { display: none; }
  .sidebar .toc { margin-top: 8px; }
  .content { padding: 22px 20px 64px; }
  .content article { font-size: 16.5px; }
}
@media (min-width: 980px) {
  .layout {
    display: grid;
    grid-template-columns: 274px minmax(0, 1fr);
    max-width: 1160px;
    margin: 0 auto;
  }
  .sidebar {
    position: sticky;
    top: 54px;
    align-self: start;
    max-height: calc(100vh - 54px);
    overflow-y: auto;
    border-right: 1px solid var(--line);
  }
  .content { padding: 44px 60px 96px; }
  .toc-toggle, .toc-toggle-label { display: none; }
}
@media print {
  .topbar, .sidebar, .pager { display: none; }
  .content { padding: 0; }
}
`

// ═══════════════════════════════════════════
// 可替换模板：书库根目录 .gfbook/templates/ 覆盖内置模板
// ═══════════════════════════════════════════
interface SiteTemplateSet {
  chapter: string
  book: string
  home: string
  css: string
}

const DEFAULT_TEMPLATES: SiteTemplateSet = {
  chapter: `<!doctype html>
<html lang="{{lang}}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{title}}</title>
<link rel="stylesheet" href="{{css_href}}">
{{katex_link}}
</head>
<body>
<header class="topbar">
<a class="brand" href="{{home_href}}">{{site_title}}</a>
<span class="book">{{book_title}}</span>
</header>
<div class="layout">
<aside class="sidebar">
<input id="toc-toggle" class="toc-toggle" type="checkbox">
<label for="toc-toggle" class="toc-toggle-label">{{toc_label}}</label>
{{sidebar}}
</aside>
<main class="content">
{{content}}
{{pager}}
</main>
</div>
</body>
</html>
`,
  book: `<!doctype html>
<html lang="{{lang}}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{title}}</title>
<link rel="stylesheet" href="{{css_href}}">
{{katex_link}}
</head>
<body>
<header class="topbar">
<a class="brand" href="{{home_href}}">{{site_title}}</a>
<span class="book">{{book_title}}</span>
</header>
<div class="layout">
<aside class="sidebar">
<input id="toc-toggle" class="toc-toggle" type="checkbox">
<label for="toc-toggle" class="toc-toggle-label">{{toc_label}}</label>
{{sidebar}}
</aside>
<main class="content">
{{content}}
</main>
</div>
</body>
</html>
`,
  home: `<!doctype html>
<html lang="{{lang}}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{site_title}}</title>
<link rel="stylesheet" href="style.css">
</head>
<body class="home">
<div class="home-inner">
<h1>{{site_title}}</h1>
<p class="subtitle">{{subtitle}}</p>
<ul class="book-list">
{{book_list}}
</ul>
<footer>{{footer}}</footer>
</div>
</body>
</html>
`,
  css: SITE_CSS,
}

function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '')
}

async function loadSiteTemplates(): Promise<SiteTemplateSet> {
  try {
    const custom = await readSiteTemplates()
    // 自定义模板必须包含关键占位符，否则回退到内置模板，避免导出空页面
    const pick = (tpl: string | null, fallback: string, required: string) =>
      tpl && tpl.includes(required) ? tpl : fallback
    return {
      chapter: pick(custom.chapter, DEFAULT_TEMPLATES.chapter, '{{content}}'),
      book: pick(custom.book, DEFAULT_TEMPLATES.book, '{{content}}'),
      home: pick(custom.home, DEFAULT_TEMPLATES.home, '{{book_list}}'),
      css: custom.css?.trim() ? custom.css : DEFAULT_TEMPLATES.css,
    }
  } catch (e) {
    console.warn('读取自定义导出模板失败，使用内置模板', e)
    return DEFAULT_TEMPLATES
  }
}

// ═══════════════════════════════════════════
// 导出主流程
// ═══════════════════════════════════════════
export async function exportBooksSite(options: {
  books: BookInfo[]
  outputDir: string
  onProgress?: (p: ExportProgress) => void
}): Promise<ExportResult> {
  const { books, outputDir, onProgress } = options
  if (!books.length) throw new Error(i18next.t('export.noBooks'))

  const siteTitle = i18next.t('export.siteTitle')

  // 阶段一：读取书目
  const metas: BookMeta[] = []
  for (let i = 0; i < books.length; i++) {
    onProgress?.({
      stage: 'prepare',
      done: i,
      total: books.length,
      label: books[i].title,
    })
    metas.push(await getBookMeta(books[i].path))
  }

  // 阶段二：渲染章节
  const usedSlugs = new Set<string>()
  const rendered: RenderedBook[] = []
  const allAssets: ExportAsset[] = []
  let pageTotal = 0
  let chapterTotal = 0
  for (const meta of metas) chapterTotal += flattenChapters(meta.chapters).length

  let chapterDone = 0
  let mathUsed = false

  for (let i = 0; i < books.length; i++) {
    const book = books[i]
    const meta = metas[i]
    const slug = uniqueSlug(book.title, usedSlugs, i)
    const collector = createAssetCollector(book.path, slug)
    const flat = flattenChapters(meta.chapters)
    const chapters: RenderedChapter[] = []

    for (const item of flat) {
      onProgress?.({
        stage: 'render',
        done: chapterDone,
        total: chapterTotal,
        label: `${book.title} · ${item.title}`,
      })
      let markdown = ''
      try {
        markdown = await readChapter(book.path, item.id)
      } catch (e) {
        console.warn(`读取章节失败：${book.title} / ${item.title}`, e)
      }
      const { html, hasMath } = renderMarkdownToHtml(markdown, collector)
      if (hasMath) mathUsed = true
      chapters.push({
        id: item.id,
        title: item.title,
        depth: item.depth,
        file: chapterFileName(item.id),
        html,
      })
      chapterDone++
    }

    allAssets.push(...collector.assets)
    rendered.push({ info: book, slug, chapters })
  }

  // 阶段三：组装页面
  const files: ExportFile[] = []
  const binaries: ExportBinary[] = []
  const tocLabel = i18next.t('export.toc')
  const templates = await loadSiteTemplates()
  const lang = i18next.language === 'zh' ? 'zh-CN' : 'en'

  for (const book of rendered) {
    const bookTitle = book.info.title
    const cssHref = '../style.css'
    const katexHref = mathUsed ? '../katex/katex.min.css' : null
    const katexLink = katexHref
      ? `<link rel="stylesheet" href="${katexHref}">`
      : ''

    book.chapters.forEach((chapter, index) => {
      const prev = index > 0 ? book.chapters[index - 1] : null
      const next =
        index < book.chapters.length - 1 ? book.chapters[index + 1] : null
      const body = chapter.html.trimStart().startsWith('<h1')
        ? chapter.html
        : `<h1>${escapeHtml(chapter.title)}</h1>\n${chapter.html}`
      files.push({
        path: `${book.slug}/${chapter.file}`,
        content: renderTemplate(templates.chapter, {
          lang,
          title: escapeHtml(`${chapter.title} · ${bookTitle}`),
          site_title: escapeHtml(siteTitle),
          book_title: escapeHtml(bookTitle),
          css_href: cssHref,
          katex_link: katexLink,
          home_href: '../index.html',
          toc_label: escapeHtml(tocLabel),
          sidebar: buildSidebar(bookTitle, book.chapters, chapter.file),
          content: `<article>\n${body}\n</article>`,
          pager: buildPager(prev, next),
        }),
      })
      pageTotal++
    })

    // 书籍目录页
    const chapterList = book.chapters.length
      ? `<ul class="chapter-list">\n${book.chapters
          .map(
            (ch, index) =>
              `<li><a class="depth-${Math.min(ch.depth, 3)}" href="${
                ch.file
              }"><span class="index">${index + 1}</span><span>${escapeHtml(
                ch.title,
              )}</span></a></li>`,
          )
          .join('\n')}\n</ul>`
      : `<p class="empty">${escapeHtml(i18next.t('export.noChapters'))}</p>`

    const intro = `<div class="book-intro"><h1>${escapeHtml(
      bookTitle,
    )}</h1><div class="meta">${escapeHtml(
      i18next.t('export.chapterCount', { n: book.chapters.length }),
    )}${
      book.info.updated_time
        ? ` · ${escapeHtml(
            i18next.t('export.updated', {
              date: formatDate(book.info.updated_time),
            }),
          )}`
        : ''
    }</div></div>`

    files.push({
      path: `${book.slug}/index.html`,
      content: renderTemplate(templates.book, {
        lang,
        title: escapeHtml(bookTitle),
        site_title: escapeHtml(siteTitle),
        book_title: escapeHtml(bookTitle),
        css_href: cssHref,
        katex_link: katexLink,
        home_href: '../index.html',
        toc_label: escapeHtml(tocLabel),
        sidebar: buildSidebar(bookTitle, book.chapters, null),
        content: `${intro}\n${chapterList}`,
      }),
    })
    pageTotal++
  }

  // 站点入口
  const listItems = rendered
    .map(
      book =>
        `<li><a href="${escapeHtml(
          book.slug,
        )}/index.html"><span class="title">${escapeHtml(
          book.info.title,
        )}</span><span class="info">${escapeHtml(
          i18next.t('export.chapterCount', { n: book.chapters.length }),
        )}</span></a></li>`,
    )
    .join('\n')
  files.push({
    path: 'index.html',
    content: renderTemplate(templates.home, {
      lang,
      site_title: escapeHtml(siteTitle),
      subtitle: escapeHtml(
        i18next.t('export.bookCount', { n: rendered.length }),
      ),
      book_list: listItems,
      footer: escapeHtml(
        i18next.t('export.generatedAt', { date: formatDate(Date.now()) }),
      ),
    }),
  })
  files.push({ path: 'style.css', content: templates.css })

  // KaTeX 本地资源
  if (mathUsed) {
    try {
      const viteEnv = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env
      const base = `${viteEnv?.BASE_URL ?? '/'}katex/`
      const manifest = (await (
        await fetch(`${base}manifest.json`)
      ).json()) as { css: string; fonts: string[] }
      const css = await (await fetch(`${base}${manifest.css}`)).text()
      files.push({ path: 'katex/katex.min.css', content: css })
      for (const font of manifest.fonts) {
        const res = await fetch(`${base}fonts/${font}`)
        if (!res.ok) continue
        const buf = new Uint8Array(await res.arrayBuffer())
        binaries.push({
          path: `katex/fonts/${font}`,
          data_base64: toBase64(buf),
        })
      }
    } catch (e) {
      console.warn('KaTeX 资源加载失败，公式将只显示原始 LaTeX', e)
    }
  }

  // 阶段四：写入磁盘
  onProgress?.({
    stage: 'write',
    done: 0,
    total: files.length,
    label: outputDir,
  })
  const summary: ExportSummary = await exportSiteCommand(
    outputDir,
    files,
    binaries,
    allAssets,
  )
  onProgress?.({
    stage: 'write',
    done: files.length,
    total: files.length,
    label: outputDir,
  })

  return {
    outputDir,
    entryPath: `${outputDir.replace(/[\\/]$/, '')}/index.html`,
    pageCount: pageTotal,
    bookCount: rendered.length,
    missingAssets: summary.missing_assets,
  }
}
