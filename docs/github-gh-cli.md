# GitHub 与 gh CLI 使用指南

本项目 Release 通过 GitHub 托管。本文记录 gh CLI 的安装、认证、创建 Release 的完整流程，以及国内网络环境下的代理方案。

## 1. 安装 gh

### 方式 A：Homebrew（网络慢时可能卡住）

```bash
brew install gh
```

> 注意：brew 下载 ghcr.io 的 bottle 在国内可能只有几十 KB/s，耐心等待或改用方式 B。

### 方式 B：直接下载官方二进制（推荐，配合代理）

```bash
# 检测本地代理端口（Clash 系默认 7890）
nc -z -w 1 127.0.0.1 7890 && echo "proxy OK"

# 通过代理下载 macOS arm64 版本
curl -sL -x http://127.0.0.1:7890 \
  -o /tmp/gh_macOS_arm64.zip \
  "https://github.com/cli/cli/releases/download/v2.102.0/gh_2.102.0_macOS_arm64.zip"

unzip -q /tmp/gh_macOS_arm64.zip -d /tmp
mkdir -p ~/.local/bin
cp /tmp/gh_2.102.0_macOS_arm64/bin/gh ~/.local/bin/
gh --version
```

## 2. 认证

### 2.1 token 所需 scope

gh CLI 登录时会校验 scope，**必须包含 `read:org`**，否则报 `missing required scope 'read:org'`。完整推荐 scope：

| scope | 用途 |
|-------|------|
| `repo` | 读写仓库、创建 Release、上传附件 |
| `read:org` | gh CLI 自身校验（组织成员关系） |
| `workflow` | 操作 GitHub Actions |
| `gist` | 创建 gist |

> 坑：macOS 钥匙串里其他工具（如 git credential）存的 token 往往只有 `repo` scope，`gh auth login --with-token` 会被拒，但直接调 REST API 是够用的（见第 4 节）。

### 2.2 设备码流程（无需手动创建 PAT）

适合没有现成 token 的场景，用户在浏览器点一下即可：

```bash
# 1. 请求设备码（client_id 是 gh CLI 的官方 OAuth App ID）
curl -s -x http://127.0.0.1:7890 -X POST -H "Accept: application/json" \
  -d "client_id=178c6fc778ccc68e1d6a&scope=repo,read:org,workflow,gist" \
  https://github.com/login/device/code
# 返回: {"device_code":"...","user_code":"XXXX-XXXX","verification_uri":"https://github.com/login/device",...}

# 2. 用户打开 https://github.com/login/device 输入 user_code 授权

# 3. 每 5 秒轮询换取 token（authorization_pending 时继续等）
curl -s -x http://127.0.0.1:7890 -X POST -H "Accept: application/json" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:device_code&client_id=178c6fc778ccc68e1d6a&device_code=<device_code>" \
  https://github.com/login/oauth/access_token
# 授权后返回: {"access_token":"gho_...","scope":"gist,read:org,repo,workflow",...}

# 4. 登录
echo "<access_token>" | gh auth login --with-token
gh auth status
```

token 存入 macOS 钥匙串（keyring），之后 `gh` 命令免认证。

## 3. 用 gh 管理 Release

```bash
# 创建 tag 并推送
git tag -a v0.1.0 -m "Ganfan Book v0.1.0 — first public release"
git push origin v0.1.0

# 创建 Release 并上传附件（路径含空格要加引号）
gh release create v0.1.0 \
  "target/release/bundle/dmg/Ganfan Book_0.1.0_aarch64.dmg" \
  --repo ganfan-org/gfbook \
  --target dev \
  --title "Ganfan Book v0.1.0" \
  --notes "首个公开发布版本..."

# 查看 / 下载
gh release view v0.1.0 --repo ganfan-org/gfbook
gh release download v0.1.0 --repo ganfan-org/gfbook
```

## 4. 兜底：REST API 直接创建 Release

当 gh 不可用（未认证 / scope 不足但含 `repo`）时，用 curl 调 API：

```bash
TOKEN=gho_xxx

# 创建 Release
curl -s -X POST -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d '{
    "tag_name": "v0.1.0",
    "target_commitish": "dev",
    "name": "Ganfan Book v0.1.0",
    "draft": false,
    "body": "release notes..."
  }' \
  https://api.github.com/repos/ganfan-org/gfbook/releases
# 返回的 id 用于上传附件

# 上传附件（文件名中的空格会被 GitHub 规范化为点号）
curl -s -X POST -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @"Ganfan Book_0.1.0_aarch64.dmg" \
  "https://uploads.github.com/repos/ganfan-org/gfbook/releases/<id>/assets?name=Ganfan%20Book_0.1.0_aarch64.dmg"
```

### 查看 token 的实际 scope

```bash
curl -s -H "Authorization: token $TOKEN" https://api.github.com/user -D - -o /dev/null \
  | grep -i x-oauth-scopes
```

### 从 macOS 钥匙串读取已有 token

```bash
# git credential / 其他工具存的 github.com 凭据
security find-internet-password -s github.com -w
```

## 5. 国内网络代理速查

| 场景 | 命令 |
|------|------|
| 探测本地代理端口 | `for p in 7890 1087 8080 1080; do nc -z -w 1 127.0.0.1 $p && echo $p; done` |
| curl 走代理 | `curl -x http://127.0.0.1:7890 <url>` |
| git 走代理（仅 github） | `git config --global http.https://github.com.proxy http://127.0.0.1:7890` |
| brew 走代理 | `export ALL_PROXY=http://127.0.0.1:7890` 再执行 brew |
| Go 模块 | 已在环境变量：`GOPROXY=https://goproxy.cn,direct` |

> 经验：ghcr.io（brew bottle 源）直连可能可达但很慢；github.com 的 release 附件直连可能完全不通，走代理最稳。
