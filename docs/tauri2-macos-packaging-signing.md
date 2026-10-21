# Tauri 2 开发与 macOS 打包签名

本文记录 gfbook 在 Tauri 2 下的关键配置、macOS 应用命名机制、Developer ID 签名 + Apple 公证的完整链路及踩过的坑。

## 1. tauri.conf.json 关键配置

```json
{
  "productName": "Ganfan Book",
  "mainBinaryName": "GanfanBook",
  "version": "0.1.0",
  "identifier": "org.ganfan.app.gfbook",
  "app": {
    "windows": [{ "title": "Ganfan Book", "width": 1200, "height": 800 }]
  },
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: Bangshun Huang (3D6FY977ZR)"
    }
  }
}
```

| 字段 | 作用 |
|------|------|
| `productName` | 面向用户的显示名：bundle 的 CFBundleDisplayName、Finder、Dock（打包后）、窗口标题。可含空格 |
| `mainBinaryName` | 可执行文件名。决定 dev 模式 Dock 显示名。**不能含空格**（见第 2 节） |
| `identifier` | Bundle ID，反向域名格式，签名/公证/钥匙串条目的身份依据 |
| `signingIdentity` | 签名证书名，必须与钥匙串中证书全名完全一致 |

## 2. macOS Dock 命名机制（重要）

### 结论

- **打包后的 .app**：Dock 显示 `productName`（读 CFBundleDisplayName），无需额外处理
- **`tauri dev` 模式**：没有 bundle，Dock 显示**可执行文件名**（LaunchServices/CPS 注册名），由 `mainBinaryName` / Cargo bin name 决定

### 坑 1：bin 名不能含空格

Cargo 把 `[[bin]] name` 直接作为 rustc 的 `--crate-name`，空格会导致编译失败：

```
error: invalid character ' ' in crate name: 'Ganfan Book'
```

尝试用 `#![crate_name = "..."]` 覆盖也行不通——Cargo 要求两者完全一致。

**方案**：bin 名用无空格形式（`GanfanBook`），显示名靠 `productName`（`Ganfan Book`）。两者并存，dev 和 release 都能正确显示。

### 坑 2：setProcessName 无效

在 Rust 里调 `NSProcessInfo::processInfo().setProcessName(...)`（objc2-foundation）只影响 Foundation 层的进程名，**LaunchServices 注册名不变**，`lsappinfo` / Dock 仍显示旧名。不要走这条路。

### 验证 dev 模式 Dock 名

```bash
# 应用运行中，用 pid 查 LaunchServices 注册名
lsappinfo info -only name <pid>
```

## 3. 签名：Developer ID Application

### 证书类型区别

| 证书 | 用途 |
|------|------|
| Apple Development | 仅本机开发调试，不能分发 |
| **Developer ID Application** | 分发到 App Store 之外（官网/dmg 下载），本项目用此 |
| Developer ID Installer | 签名 .pkg 安装包 |

在 [developer.apple.com](https://developer.apple.com/account/resources/certificates) 创建，导入钥匙串后确认：

```bash
security find-identity -v -p codesigning
# 应看到: "Developer ID Application: Your Name (TEAM_ID)"
```

配置进 `tauri.conf.json` 的 `bundle.macOS.signingIdentity`（见第 1 节），`tauri build` 会自动用它签名。

## 4. 公证（Notarization）

仅签名不够——macOS Gatekeeper 对联网下载的 app 还要求 Apple 公证票据，否则报「无法验证开发者」。

### 4.1 凭据：App Store Connect API Key

在 [App Store Connect → 用户和访问 → 集成 → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api) 创建，得到三样东西：

- **Key ID**：如 `6Y3UU7B4QF`
- **Issuer ID**：UUID 格式
- **私钥文件**：`AuthKey_<KeyID>.p8`（只能下载一次）

> **本项目约定**：密钥放在 `~/.ganfan/AuthKey_6Y3UU7B4QF.p8`。
> **不要放 `~/Downloads`**——见 4.3 的 TCC 坑。

### 4.2 构建时传入环境变量

```bash
export APPLE_API_KEY_PATH="$HOME/.ganfan/AuthKey_6Y3UU7B4QF.p8"
export APPLE_API_KEY="6Y3UU7B4QF"
export APPLE_API_ISSUER="4496c5e6-f0c8-4f2d-bcaa-263b3f1598ff"

npm run tauri build
```

Tauri 检测到这三个变量会自动：签名 → 上传公证 → 等待结果 → `stapler` 内嵌票据。整个过程几分钟到十几分钟，构建日志可见公证 ID 和状态。

### 4.3 坑：TCC 隐私保护

macOS 对 `~/Downloads`、`~/Desktop`、`~/Documents` 有 TCC 保护。**未授权进程（如终端里跑的 notarytool）读不到这些目录里的 .p8**，报：

```
The file couldn't be opened because you don't have permission to view it
```

这不是文件权限问题（chmod 无用），也不是 shell 沙箱问题。**方案：把密钥移到非保护目录**，如 `~/.ganfan/`：

```bash
mkdir -p ~/.ganfan && mv ~/Downloads/AuthKey_*.p8 ~/.ganfan/
```

## 4.4 坑：二进制链接了 Homebrew 的 dylib（启动即崩溃）

### 现象

打包签名后的 app 打开直接崩溃，崩溃报告：

```
Termination Reason: Namespace DYLD, Code 1, Library missing
Library not loaded: /opt/homebrew/*/libssl.3.dylib
Reason: ... code signature ... not valid for use in process:
mapping process and mapped file (non-platform) have different Team IDs
```

### 原因

`git2` 的依赖链（libssh2 → openssl-sys）编译时会自动探测系统 OpenSSL——本机装了 Homebrew 就链接 `/opt/homebrew/opt/openssl@3/lib/libssl.3.dylib` 和 `libcrypto.3.dylib`。两个后果：

1. 其他 Mac 没有 Homebrew OpenSSL → 库缺失，dyld 直接终止
2. 即使本机有，Developer ID 签名开启的库校验要求所有加载的 dylib 与主程序同 Team ID，Homebrew 的 dylib 是 ad-hoc 签名 → 拒绝加载

注意：**本机自测启动正常不代表没问题**——未签名的 dev 构建不做库校验，且本机恰好有这些库。

### 排查

```bash
# 列出二进制动态链接的所有库，凡是不以 /System 或 /usr/lib 开头的都是隐患
otool -L target/release/GanfanBook
```

### 解决：vendored 静态链接

[Cargo.toml](../src-tauri/Cargo.toml) 给 git2 开 vendored feature，把 OpenSSL 从源码静态编进二进制：

```toml
git2 = { version = "0.19", features = ["vendored-libgit2", "vendored-openssl"] }
```

重新构建后用 `otool -L` 确认不再出现 `/opt/homebrew` 路径。代价是编译变慢（OpenSSL 从源码构建）且二进制略大。

> 凡是间接依赖 openssl-sys 的 crate（git2、部分 reqwest 配置）都有此问题；reqwest 在 macOS 默认走 Security.framework，不受影响。

## 5. 验证签名与公证

构建产物（本项目自定义了 cargo target dir）：

```
target/release/bundle/macos/Ganfan Book.app
target/release/bundle/dmg/Ganfan Book_0.1.0_aarch64.dmg
```

逐项验证：

```bash
# 1. 签名信息：应显示 Developer ID Application 和 team ID
codesign -dv --verbose=4 "target/release/bundle/macos/Ganfan Book.app" 2>&1 | grep -E "Authority|TeamIdentifier"

# 2. 签名完整性
codesign --verify --deep --strict "target/release/bundle/macos/Ganfan Book.app"

# 3. Gatekeeper 评估：关键一句 accepted source=Notarized Developer ID
spctl -a -vv "target/release/bundle/macos/Ganfan Book.app"

# 4. 公证票据已内嵌
xcrun stapler validate "target/release/bundle/macos/Ganfan Book.app"
```

四项全过 = 任意 Mac 双击打开无警告。

## 6. 常用构建命令

```bash
npm run tauri dev      # 开发（Dock 名 = mainBinaryName）
npm run tauri build    # 打包（自动签名+公证，需第 4.2 节环境变量）
```

## 7. 发布 Checklist

1. 确认 `version` 已 bump（tauri.conf.json 与 Cargo.toml）
2. 导出 `APPLE_API_KEY_PATH` / `APPLE_API_KEY` / `APPLE_API_ISSUER`
3. `npm run tauri build`，确认日志中公证 `Accepted`
4. 跑第 5 节四项验证
5. `otool -L` 检查二进制无 `/opt/homebrew` 等第三方 dylib（见 4.4）
6. 从产物 .app 实际启动一次（spctl 通过 ≠ 能启动，dyld 问题只有启动才暴露）
7. 提交配置并推送分支
8. 打 tag → 推送 → GitHub Release 上传 dmg（见 [github-gh-cli.md](github-gh-cli.md)）
