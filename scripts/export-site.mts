/**
 * 命令行导出静态站点（无需启动桌面应用）。
 *
 * 用法：
 *   npm run export -- --out ./site                 # 导出书库中的全部书
 *   npm run export -- --out ./site --books ~/gfbooks/算法,~/gfbooks/c
 *   npm run export -- --out ./site --all --root ~/gfbooks --lang en
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import yaml from 'js-yaml'
import { JSDOM } from 'jsdom'

interface CliOptions {
  out: string
  root: string
  books: string[]
  all: boolean
  lang: 'zh' | 'en'
}

interface BookInfo {
  title: string
  path: string
  created_time: number
  updated_time: number
}

interface ExportFile {
  path: string
  content: string
}

interface ExportBinary {
  path: string
  data_base64: string
}

interface ExportAsset {
  book_path: string
  src: string
  dest: string
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function usage(): string {
  return [
    '用法: npm run export -- --out <目录> [选项]',
    '',
    '选项:',
    '  --out <目录>     必填，站点输出目录',
    '  --root <目录>    书库根目录，默认 ~/gfbooks',
    '  --books <路径>   要导出的书目录，逗号分隔，可重复',
    '  --all            导出书库根目录下的全部书（默认行为）',
    '  --lang <zh|en>   导出站点语言，默认 zh',
  ].join('\n')
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    out: '',
    root: path.join(os.homedir(), 'gfbooks'),
    books: [],
    all: false,
    lang: 'zh',
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const [flag, inline] = arg.includes('=') ? arg.split('=', 2) : [arg, undefined]
    const takeValue = (): string => {
      if (inline !== undefined) return inline
      const next = argv[++i]
      if (!next) throw new Error(`缺少 ${flag} 的参数值`)
      return next
    }
    switch (flag) {
      case '--out':
        options.out = takeValue()
        break
      case '--root':
        options.root = path.resolve(takeValue())
        break
      case '--books':
        options.books.push(
          ...takeValue()
            .split(',')
            .map(item => item.trim())
            .filter(Boolean),
        )
        break
      case '--all':
        options.all = true
        break
      case '--lang':
        options.lang = takeValue() === 'en' ? 'en' : 'zh'
        break
      case '--help':
      case '-h':
        console.log(usage())
        process.exit(0)
        break
      default:
        throw new Error(`未知参数: ${arg}`)
    }
  }
  if (!options.out) throw new Error('必须通过 --out 指定输出目录')
  options.out = path.resolve(options.out)
  if (!options.books.length) options.all = true
  return options
}

function loadMeta(bookPath: string): BookInfo {
  const raw = fs.readFileSync(path.join(bookPath, 'gfbook.yaml'), 'utf8')
  const meta = (yaml.load(raw) ?? {}) as {
    title?: string
    created_time?: number
    updated_time?: number
  }
  const now = Date.now()
  return {
    title: String(meta.title ?? path.basename(bookPath)),
    path: bookPath,
    created_time: Number(meta.created_time ?? 0) || now,
    updated_time: Number(meta.updated_time ?? 0) || now,
  }
}

function isBookDir(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'gfbook.yaml'))
}

function discoverBooks(options: CliOptions): BookInfo[] {
  if (!options.all) {
    return options.books.map(item => {
      const resolved = path.resolve(item)
      if (!isBookDir(resolved)) {
        throw new Error(`不是一本书（缺少 gfbook.yaml）: ${resolved}`)
      }
      return loadMeta(resolved)
    })
  }
  if (!fs.existsSync(options.root)) {
    throw new Error(`书库目录不存在: ${options.root}`)
  }
  return fs
    .readdirSync(options.root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => path.join(options.root, entry.name))
    .filter(isBookDir)
    .sort()
    .map(loadMeta)
}

function safeRelative(raw: string): string {
  if (path.isAbsolute(raw)) throw new Error(`非法的导出路径: ${raw}`)
  const normalized = raw.replace(/\\/g, '/')
  if (normalized.split('/').includes('..')) {
    throw new Error(`非法的导出路径: ${raw}`)
  }
  return normalized
}

function writeOutputFile(outDir: string, rel: string, data: Buffer | string): void {
  const dest = path.join(outDir, safeRelative(rel))
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, data)
}

function resolveAssetSource(bookPath: string, src: string): string | null {
  const normalized = src.replace(/^@\//, '').replace(/^\/+/, '')
  const base = path.basename(normalized)
  const candidates = [
    path.join(bookPath, normalized),
    path.join(bookPath, 'assets', base),
    path.join(bookPath, 'chapters', base),
    path.join(bookPath, 'chapters', normalized),
  ]
  return candidates.find(candidate => {
    try {
      return fs.statSync(candidate).isFile()
    } catch {
      return false
    }
  }) ?? null
}

function setDomGlobals(): void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
  })
  const g = globalThis as unknown as Record<string, unknown>
  g.window = dom.window
  g.document = dom.window.document
  g.DOMParser = dom.window.DOMParser
  g.Node = dom.window.Node
  g.Element = dom.window.Element
  g.HTMLElement = dom.window.HTMLElement
  g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
  })
}

function installIpcStub(options: CliOptions): void {
  const invoke = async (cmd: string, args?: Record<string, unknown>): Promise<unknown> => {
    switch (cmd) {
      case 'get_book_meta':
        return yaml.load(
          fs.readFileSync(
            path.join(String(args?.bookPath), 'gfbook.yaml'),
            'utf8',
          ),
        )
      case 'read_chapter': {
        const file = path.join(
          String(args?.bookPath),
          'chapters',
          `${String(args?.chapterId)}.md`,
        )
        return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
      }
      case 'read_site_templates': {
        const dir = path.join(options.root, '.gfbook', 'templates')
        const read = (name: string): string | null => {
          const file = path.join(dir, name)
          return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
        }
        return {
          chapter: read('chapter.html'),
          book: read('book.html'),
          home: read('home.html'),
          css: read('style.css'),
        }
      }
      case 'export_site': {
        const outDir = String(args?.outputDir)
        fs.mkdirSync(outDir, { recursive: true })
        let written = 0
        for (const file of (args?.files ?? []) as ExportFile[]) {
          writeOutputFile(outDir, file.path, file.content)
          written++
        }
        for (const binary of (args?.binaries ?? []) as ExportBinary[]) {
          writeOutputFile(
            outDir,
            binary.path,
            Buffer.from(binary.data_base64, 'base64'),
          )
          written++
        }
        let copied = 0
        const missing: string[] = []
        for (const asset of (args?.assets ?? []) as ExportAsset[]) {
          const source = resolveAssetSource(asset.book_path, asset.src)
          if (!source) {
            missing.push(asset.src)
            continue
          }
          writeOutputFile(outDir, asset.dest, fs.readFileSync(source))
          copied++
        }
        return {
          files_written: written,
          assets_copied: copied,
          missing_assets: missing,
        }
      }
      default:
        throw new Error(`CLI 未实现的命令: ${cmd}`)
    }
  }
  ;(globalThis as unknown as { window: { __TAURI_INTERNALS__: unknown } }).window
    .__TAURI_INTERNALS__ = { invoke }
}

function installKatexFetch(): void {
  const katexDir = path.join(repoRoot, 'public', 'katex')
  const notFound = {
    ok: false,
    async json() {
      throw new Error('404')
    },
    async text() {
      return ''
    },
    async arrayBuffer() {
      return new ArrayBuffer(0)
    },
  }
  const fakeFetch = async (input: unknown) => {
    const url = String(input)
    const marker = '/katex/'
    const index = url.indexOf(marker)
    if (index === -1) return notFound
    const rel = decodeURIComponent(url.slice(index + marker.length))
    const file = path.resolve(katexDir, rel)
    if (!file.startsWith(katexDir) || !fs.existsSync(file)) return notFound
    const buffer = fs.readFileSync(file)
    return {
      ok: true,
      async json() {
        return JSON.parse(buffer.toString('utf8'))
      },
      async text() {
        return buffer.toString('utf8')
      },
      async arrayBuffer() {
        return buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        )
      },
    }
  }
  ;(globalThis as unknown as { fetch: unknown }).fetch = fakeFetch
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const books = discoverBooks(options)
  if (!books.length) throw new Error('没有找到可导出的书')

  setDomGlobals()
  installIpcStub(options)
  installKatexFetch()

  const i18next = (await import('i18next')).default
  const { default: zh } = await import('../src/i18n/zh')
  const { default: en } = await import('../src/i18n/en')
  await i18next.init({
    resources: { zh: { translation: zh }, en: { translation: en } },
    lng: options.lang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

  const { exportBooksSite } = await import('../src/utils/exportHtml')

  console.log(`导出 ${books.length} 本书到 ${options.out}`)
  const result = await exportBooksSite({
    books,
    outputDir: options.out,
    onProgress: progress => {
      if (progress.stage === 'render' && progress.total > 0) {
        process.stdout.write(
          `\r渲染 ${Math.min(progress.done + 1, progress.total)}/${progress.total} ${progress.label}`.slice(0, 120),
        )
      } else if (progress.stage === 'write') {
        process.stdout.write('\r写入文件…')
      }
    },
  })
  process.stdout.write('\n')
  console.log(`完成：${result.bookCount} 本书，${result.pageCount} 个页面`)
  console.log(`入口：${result.entryPath}`)
  if (result.missingAssets.length) {
    console.warn(`缺失图片 ${result.missingAssets.length} 张：`)
    result.missingAssets.forEach(item => console.warn(`  - ${item}`))
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
