# 图片加载方案：Data URL → Tauri Asset Protocol

## 背景

GTBook 编辑器中支持图片（粘贴、插入本地文件、网络下载）。图片存储为 Markdown 相对路径 `assets/uuid.png`，需要解决如何在 WebView 中展示这些本地磁盘文件。

## 方案对比

### 方案 A：Data URL（已废弃）

**原理**：Rust 侧 `fs::read` 读取图片全量 → base64 编码 → 返回 `data:image/png;base64,...` → DOM 内嵌。

```
图片文件 → Rust fs::read → base64_encode → Data URL → <img src="data:...">
```

**优点**：
- 逻辑简单，一次 IPC 调用完成
- 开发/生产行为一致
- Markdown 存储保持 `assets/uuid.png`（`src` 属性存相对路径，`dataSrc` 存 Data URL）

**缺点**：
- 图片内容全量嵌入 DOM，1MB 图片 → 1.3MB base64 字符串
- 所有图片同时解码，大文档加载卡顿
- 100 张 1MB 图片 → DOM 中约 130MB base64，内存压力大
- `download_image_url` 中 `response.bytes()` 全量加载，大文件 OOM

### 方案 B：Tauri Asset Protocol（当前）

**原理**：Rust 侧校验路径安全 → 返回文件绝对路径 → 前端 `convertFileSrc()` 转为 `asset://localhost/...` URL → WebView 按需加载。

```
图片文件 → Rust canonicalize + 安全校验 → 绝对路径
         → convertFileSrc() → asset://localhost/%2FUsers%2F...
         → <img src="asset://..."> → WebView 拦截 → 读磁盘 → 按需返回
```

**优点**：
- 浏览器按需加载，视口外的图片不解码
- 内存占用低，图片内容不嵌入 DOM
- `src` 属性存相对路径，Markdown 可移植
- 利用 Tauri 原生的 asset protocol，无需手动拼 URL

**缺点**：
- 依赖 Tauri asset protocol 的正确配置（scope、CSP）
- URL 格式不可手动构造，必须通过 `convertFileSrc()`

### 踩坑记录

1. **`https` vs `http`**：早期手动拼 `https://asset.localhost/...` 无法显示。正确协议是 `asset://localhost/...`，由 `convertFileSrc()` 生成。

2. **URL 路径编码**：手动拼 URL 时没有 URL-encode 路径（`/` → `%2F`），导致协议处理器无法正确解析路径。`convertFileSrc()` 会自动处理。

3. **CSP 配置**：必须同时放行 `asset:` scheme 和 `http://asset.localhost`：

   ```
   img-src 'self' asset: http://asset.localhost https://asset.localhost blob: data:
   ```

4. **Scope 配置**：使用 `$HOME/**/*` 而非 `$HOME/**`。添加 `requireLiteralLeadingDot: false` 防止 `.config` 等点目录被拦截。

5. **路径安全**：所有图片路径均经过 `canonicalize()` + `starts_with(book_path)` 校验，防止 `../` 路径穿越攻击。

## 配置清单

### `tauri.conf.json`

```json
"security": {
  "csp": "... img-src 'self' asset: http://asset.localhost https://asset.localhost blob: data: ...",
  "assetProtocol": {
    "enable": true,
    "scope": {
      "requireLiteralLeadingDot": false,
      "allow": ["$HOME/**/*"]
    }
  }
}
```

### Rust — `get_asset_url` 命令

```rust
#[tauri::command]
pub fn get_asset_url(book_path: String, rel_path: String) -> Result<String, String> {
    let book_canonical = PathBuf::from(&book_path).canonicalize()?;
    let full_path = PathBuf::from(&book_path).join(&rel_path);
    let canonical = full_path.canonicalize()?;
    if !canonical.starts_with(&book_canonical) {
        return Err("Access denied");
    }
    Ok(canonical.to_string_lossy().to_string())
}
```

返回绝对路径，前端通过 `convertFileSrc()` 转为 asset URL：

```ts
import { convertFileSrc } from '@tauri-apps/api/core'

export async function getAssetUrl(bookPath: string, relPath: string): Promise<string> {
  const absolutePath = await invoke('get_asset_url', { bookPath, relPath })
  return convertFileSrc(absolutePath)
}
```

## 数据流

```
┌─ 粘贴图片 ────────────────────────────────────────────────────────┐
│ FileReader.readAsDataURL(blob) → base64                           │
│   → invoke('save_image_data') → fs::write("assets/uuid.png")     │
│   → getAssetUrl(bookPath, "assets/uuid.png")                     │
│     → invoke('get_asset_url') → 绝对路径                          │
│       → convertFileSrc() → asset://localhost/%2FUsers%2F...      │
│         → 插入节点 { src: "assets/uuid.png", dataSrc: assetUrl } │
├───────────────────────────────────────────────────────────────────┤
│ 打开已有文档                                                       │
│ useEffect 扫描 src="assets/*" 的图片节点                           │
│   → getAssetUrl(bookPath, src) → asset URL → 写入 dataSrc        │
├───────────────────────────────────────────────────────────────────┤
│ 渲染                                                              │
│ ImageWithAsset.renderHTML: dataSrc || src                         │
│   → <img src="asset://localhost/%2FUsers%2F...">                 │
│     → WebView 拦截请求 → 读磁盘 → 返回图片数据                      │
└───────────────────────────────────────────────────────────────────┘
```

## 已废弃的代码

| 文件 | 内容 |
|---|---|
| `commands.rs` | `read_image_as_data_url` 命令（已删除） |
| `lib.rs` | `read_image_as_data_url` 注册（已删除） |
| `ChapterEditor.tsx` | 4 处 `invoke('read_image_as_data_url')` 调用（已替换为 `getAssetUrl`） |

`read_file_base64` 和 `save_image_data` 仍保留，分别用于：
- `read_file_base64`：辅助调试用（未被前端调用）
- `save_image_data`：粘贴图片时存盘
