# Ganfan Book

A local-first book writing app built with Tauri, React, TypeScript, and Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Development and Production Book Libraries

Development builds use `~/gfbooks-dev`; release builds use `~/gfbooks`. The development build creates `~/gfbooks-dev` on first launch, but cloning the production library first is recommended:

```bash
npm run books:clone
npm run dev:isolated
```

If a development build has already created an empty `~/gfbooks-dev`, the clone script refuses by default. In that case, rebuild it with `npm run books:clone -- --force`.

`books:clone` uses `cp -c -R` for an APFS copy-on-write clone:

- Source: `~/gfbooks`; destination: `~/gfbooks-dev`.
- If the destination already exists, the script refuses by default to avoid overwriting development work.
- Only `npm run books:clone -- --force` deletes the destination and clones again.
- Changes in the development library never write back to the production library. Deleting the development library does not affect the production library.

### Debugging Rust in VS Code

1. Install the **CodeLLDB** extension. The repository recommends `vadimcn.vscode-lldb` in `.vscode/extensions.json`.
2. Open Run and Debug in VS Code, select **Tauri Dev (Rust, dev books)**, and press F5.

This configuration:

- Runs the `tauri:build-dev` debug build through the `vite:dev` task, then starts the frontend development server.
- Forces `Ganfan Book Dev` and `org.ganfan.app.gfbook.dev` through `TAURI_CONFIG` during the build.
- Runs the debug `GanfanBook` binary, so the book library is `~/gfbooks-dev` and the production library is not read.
- Supports breakpoints directly in `src-tauri/src/*.rs`.

If port 1420 is already in use by an existing `npm run dev`, stop that Vite server before starting the debug session. If the Vite task is still running after the session ends, stop `vite:dev` in the VS Code Tasks panel.

#### CodeLLDB reports `liblldb ... symbol not found`

If the launch log shows:

```text
liblldb: /Applications/Xcode.app/Contents/SharedFrameworks/LLDB.framework/Versions/A/LLDB
Unable to resolve liblldb symbol: "...GetValueForVariablePath..."
```

CodeLLDB is being forced to use the LLDB bundled with Xcode by a global VS Code setting, and its version is incompatible with the `liblldb` that CodeLLDB expects. To fix it:

1. Search for `lldb.library` in VS Code settings, then delete the custom value or clear it in user/workspace settings.
2. Do not point it at `/Applications/Xcode.app/.../LLDB.framework/...`.
3. Reload the VS Code window, then press F5 again.

CodeLLDB uses the library bundled with the extension by default, for example:

```text
~/.vscode/extensions/vadimcn.vscode-lldb-1.12.3/lldb/lib/liblldb.dylib
```

You do not need to install or switch to the Xcode LLDB for this debugger.

### Frontend breakpoints

Tauri uses WKWebView on macOS, so the VS Code Chrome debugger does not apply. Use Safari for frontend breakpoints:

1. Safari > Settings > Advanced > enable "Show features for web developers".
2. With the development build running, open Safari's Develop menu > your Mac > **Ganfan Book Dev**.
3. Set breakpoints in the Sources panel for React/TS source files, then reload the page.

### When to re-clone

- The production library has new books or content changes, and the development build needs to test against the latest data.
- You want to discard temporary experiments in the development library and return to a clean snapshot of the production library.
- A clone is a snapshot taken at creation time. It does not automatically sync later changes from the production library.

If the development library contains changes you want to keep, commit or export them before running `--force`; otherwise uncommitted work is deleted together with the old directory.

### Merging validated changes back into the real library

First commit the changes in the development clone:

```bash
cd ~/gfbooks-dev/<book>
git status
git add <files>
git commit -m "Describe this change"
```

Then close both the development and release apps, back up the production library, and confirm the target book's Git working tree is clean:

```bash
cd ~/gfbooks/<book>
git status
git pull --ff-only ~/gfbooks-dev/<book> "$(git -C ~/gfbooks-dev/<book> branch --show-current)"
```

If the production book also has new commits after the clone, do not force-push or overwrite. Merge or rebase in the development clone and resolve conflicts first, or push the development commits to the actual remote repository and run a normal `git pull` in the production book. Reopen the release app to verify after merging.

### Constraints when sharing the real library

With the default clone workflow, the two builds should not open the same book at the same time. If you temporarily point the development build at `~/gfbooks`, make sure that:

- The release and development builds are never running at the same time.
- You quit the release build before opening the development build, and vice versa.
- You back up the library before making changes, so two processes do not modify the same files.

The app has no single-instance lock. Two processes writing to the same book can overwrite data or corrupt the Git working state.

### About `books_dir`

In the current version, the `books_dir` setting is written but never read by library scanning, book creation, import, or template logic. It does not take effect yet. Do not rely on it for isolation; use `npm run dev:isolated` and the cloned library instead. The static export CLI defaults to `~/gfbooks-dev` in development. It reads the production library only when `NODE_ENV=production` is set explicitly or `--root ~/gfbooks` is passed.
