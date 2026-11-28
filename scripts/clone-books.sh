#!/usr/bin/env bash
set -euo pipefail

# 用 APFS clonefile 把生产书库克隆成开发书库。
# 克隆是写时复制：开发书库里的修改不会影响生产书库，删除开发书库也不会影响生产书库。

SRC="${GFBOOKS_SOURCE:-$HOME/gfbooks}"
DEST="${GFBOOKS_DEV:-$HOME/gfbooks-dev}"
FORCE=0

usage() {
  cat <<EOF
用法: npm run books:clone [-- --force]

作用:
  使用 APFS clonefile (cp -c -R) 把:
    $SRC
  克隆到:
    $DEST

说明:
  - 克隆是写时复制，开发版修改不会写回生产书库。
  - 目标已存在时默认拒绝，避免覆盖你正在开发的书。
  - 加 --force 会先删除目标目录，再从生产书库完整重建。
  - 测试或临时使用时可用环境变量覆盖路径:
      GFBOOKS_SOURCE=/path/to/source GFBOOKS_DEV=/path/to/dest npm run books:clone
EOF
}

for arg in "$@"; do
  case "$arg" in
    --force)
      FORCE=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数: $arg" >&2
      echo "运行 npm run books:clone -- --help 查看说明。" >&2
      exit 2
      ;;
  esac
done

if [[ ! -d "$SRC" ]]; then
  echo "源书库不存在: $SRC" >&2
  exit 1
fi

if [[ "$SRC" == "$DEST" ]]; then
  echo "源目录和目标目录相同，拒绝执行: $SRC" >&2
  exit 1
fi

if [[ -e "$DEST" ]]; then
  if [[ "$FORCE" -ne 1 ]]; then
    cat <<EOF >&2
目标已存在: $DEST

为了避免覆盖开发中的修改，默认不重建。
如果确认要删除它并从生产书库重新克隆，请运行:
  npm run books:clone -- --force

注意: --force 会删除目标目录里尚未提交或尚未合并回真书库的内容。
EOF
    exit 1
  fi

  echo "正在删除旧开发书库: $DEST"
  rm -rf -- "$DEST"
fi

echo "正在使用 APFS clonefile 克隆书库..."
echo "  源:   $SRC"
echo "  目标: $DEST"
cp -c -R "$SRC" "$DEST"

echo "完成。开发书库已就绪: $DEST"
echo "开发版请使用: npm run dev:isolated"
echo "开发书库的修改不会影响生产书库；需要合回时请按 README 的 Git 流程操作。"
