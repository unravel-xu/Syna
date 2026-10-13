# Syna · P3.0 Library Explorer

独立 Electron 工程，保留已确认的 Shell 与 Markdown 保存链路。本轮接入真实 **Library Explorer → Folder / Note 管理 → 排序与拖拽 → Trash / 恢复**，完成 P3.0 后停止，不推进其他业务。

架构依据与契约调整：[docs/architecture.md](docs/architecture.md#21-p30-已落地的-library-边界)。旧工程仅用于只读参考，没有导入旧 App、数据库或个人数据。

## 运行

需要 Node.js 24、npm 11，依赖由 lockfile 固定。

```bash
npm ci
npm run dev:ui             # Browser Mock，http://127.0.0.1:5173
npm run dev                # Electron + SQLite，React/CSS HMR
npm run check              # TypeScript、ESLint、依赖边界、布局/DocumentSession 检查
npm run test:contracts     # 同一套内存 / SQLite Repository 契约
npm run test:e2e           # 三模式、Slash、选区、块操作与 Shell 回归
npm run build              # Renderer / Main / preload / Storage Worker
npm run test:p2:electron   # 构建后：真实 SQLite / IPC / IME / 重启 / 草稿 / 冲突
npm run test:p2:electron -- --dev  # 先启动 Vite；另验证编辑器 CSS HMR
npm run test:library:electron # P3.0 Explorer、真实 SQLite/IPC、排序/拖拽/恢复/重启
npm run test:layout:electron # P2.4 百分比布局、四种 Electron 尺寸、偏好与重启恢复
npm run test:editor:electron # P2 编辑器完整 SQLite/剪贴板/模式/重启回归
npm run test:editor:electron -- --dev # Vite + CSS HMR 回归
npm start                 # 构建后的 Electron
```

`dev:ui` 和 `dev` 共用 5173，二选一启动。修改 Main/preload/Worker 仍需重启；修改 React/CSS 不需要重启。Browser Mock 使用同一 NoteService、DocumentSession、导航保存屏障，Repository/Scene ports 换为内存；其笔记仅保留于当前页面会话，刷新会清空，Library 空态有明确说明。

`npm run dev` 的业务目录是 `.artifacts/workspaces/p2-dev/.syna/state.sqlite`；Chromium 配置在 `.artifacts/runtime/dev/`。构建版默认在独立的 `Syna Shell Preview/p2-development-workspace/.syna/state.sqlite`，仍是新工程的开发工作区。编辑器不再常驻显示开发说明，工作区隔离由启动参数保证。原有配置目录名称保留，以延续主题与宽度偏好，不会读取旧 NoteAPP 的库。

自动化创建系统临时目录，显式传入 `SYNA_WORKSPACE` / `SYNA_USER_DATA`，测试结束清理。SQLite 故障注入必须同时开启 `SYNA_TEST_MODE=1`，并在该测试目录创建 `.syna/test-fail-save`，普通模式不读取此标记。`.syna/test-delay-save` 同样仅在测试模式生效，用于观察真实在途保存和保存中导航。

## 当前行为

- GlobalRail 五入口、Activity Bar 再次点击、ContextSidebar 宽度/树状态、Focus、深浅主题和独立 Assistant Demo 保留。
- 默认 Library 展示真实 Notes。Library 标题 + 提供 New Note / New Folder；创建笔记后立即打开并聚焦标题，Cmd/Ctrl+Shift+N 保留；标题、正文、Markdown 语法高亮、基础格式命令、撤销/重做、查找与中文 composition 可用。
- Page Width 独立选择 Centered 80% / Full Width 100%，按当前工作面可用空间计算。≤900px/650px 时 Centered 临时提高为 90%/100%，安全边距 24px/16px；三模式共享正文列和行号/块手柄基准，按文档恢复宽度偏好，不改变正文 revision。
- 默认 Live Preview；顶部下拉直接选择 Live Preview / Reading Mode / Source Mode。两种编辑模式共用 CodeMirror 状态和撤销历史，Reading 只读派生当前正文。大纲导航基于当前 Markdown。
- `/` 在空行或块前缀后触发十种真实 Markdown 命令，支持筛选、方向键、Enter、Esc、鼠标和单步撤销；代码、URL、路径和转义场景保持字面输入。
- 非空选区出现浮动工具栏：文本类型、Bold、Italic、Link、More（行内代码、删除线和复制 Markdown）。不再常驻格式或保存按钮。
- 段落悬停或 Shift+F10 打开块菜单：复制 UUIDv7 块链接、复制 Markdown、转换类型和删除。复制块链接先通过保存屏障；内部链接可定位当前或其他笔记，未接入 OS 全局协议唤醒。
- 状态栏显示已保存与真实提交时间、未保存、保存中、失败重试或冲突详情；约 500ms debounce，单篇笔记最多一条在途保存。
- 切换 Note、全局导航、前进/后退共用现有导航 façade；执行 IME/保存/现场屏障。失败保留当前位置和草稿，快速请求仅最新意图可提交。
- 保存失败可 Retry save；冲突不会静默覆盖，保留本地编辑和远端已提交版本，可 Save a copy。窗口关闭同样等待 flush/scene，失败保持窗口打开。
- 重启恢复最近 Note、显示模式、选区、编辑滚动与阅读滚动。独立恢复草稿在相同 revision 时要求 Restore draft / Use saved version；旧 baseRevision 的草稿以冲突打开，禁止自动保存覆盖新版本。
- UUIDv7 note/block/command ID；SQLite CAS + history + 幂等回执在同一事务，未知扩展 payload 保留。
- Settings Appearance 支持 System / Light / Dark，Rail 快捷切换与设置同步并跨启动保持。

内容操作位于光标/选区附近，文档顶部只保留标题、大纲和模式。Sidebar 折叠、Focus 和辅助面板不替换 EditorState。Ctrl/Cmd+S 显式保存，Ctrl/Cmd+Z / Shift+Z 撤销/重做，Ctrl/Cmd+F 编辑器查找，Ctrl/Cmd+Shift+Space 聚焦选区工具栏，Ctrl/Cmd+Alt+1/2/3 分别切换 Live / Reading / Source；保留 CodeMirror 既有 Ctrl/Cmd+I 语法选区快捷键。现有 Ctrl/Cmd+K、Ctrl/Cmd+Shift+F、Ctrl/Cmd+Backslash 与 Esc 继续有效。

## 目录与边界

```text
packages/contracts/src/
  notes.ts, noteSchemas.ts       DTO、NoteService、Buffer/Session/Scene ports、IPC schema
packages/core/src/
  notes/                        NoteService、Repository Port、UUIDv7 / 块映射
  workspace/                    DocumentSession、NotesWorkspace
  testing/InMemoryWorkspace.ts  与 SQLite 同语义的可控 Mock
packages/storage/src/
  SQLiteWorkspace.ts            SQLite 事务、历史、回执、块索引、现场和恢复草稿
apps/desktop/src/
  main/                         窗口、受控协议、IPC gateway、Storage client
  workers/storage.ts            独立数据库线程及串行请求队列
  preload/index.ts              protocol v2，固定方法与受控关闭握手
  renderer/
    app/                        唯一 composition / Provider / Shell
    adapters/                   Electron client、UI 偏好、系统主题
    features/editor/            MarkdownSurface、CodeMirrorBufferAdapter、模式/阅读/状态栏
      LivePreview/              CodeMirror Decorations
      SlashCommands/            注册表、事务和光标 Tooltip
      SelectionToolbar/         选区事务、浮动工具栏
      BlockActions/             稳定块操作 UI
    features/Notes*.tsx         Notes 列表、侧栏、工作面组合
    shell/, styles/             原 Shell 与 Tokens、editor.css
```

Renderer 不访问 Node、SQLite、Main 或任意 IPC。开启 contextIsolation、sandbox、webSecurity，关闭 Node integration；固定 `syna://app/` 来源，拒绝外站导航、Renderer 弹窗、下载、webview 和非必要权限。Markdown 显式链接只允许 http/https/mailto 交由系统打开；剪贴板写入通过来源校验、长度限制的专用能力，不能任意调用 IPC。阅读 HTML 经 DOMPurify 清理，不执行原始脚本或启用可编辑 HTML。

## 验证与截图

- `tests/notes.contract.test.ts`：内存 / 临时 SQLite 的创建、CAS、重复命令、键冲突、故障、现场、草稿清理边界、未知扩展和块身份。
- `tests/document-session.test.ts`：串行队列、编辑中的旧回执、已提交但回执丢失、失败导航/历史、过期目标与加载期间新增输入。
- `tests/e2e/notes.spec.ts`：Browser Mock 的创建/编辑/切换、undo/redo、布局与失败重试。
- `tests/e2e/editor.spec.ts`：模式/单一编辑器/历史/选区、十种 Slash 命令、字面斜杠、菜单 Esc、IME、格式事务、块菜单、四尺寸和主题截图。
- `scripts/verify-p2.mjs --editor`：三模式不新增 revision、提交时间、真实系统剪贴板与跨笔记链接、Live IME、阅读模式重启、在途保存与导航，以及基础 P2 全链路。
- `scripts/verify-p2.mjs`：真实 Electron、两篇 SQLite 笔记、Chromium IME、关闭/完整重启、选区/滚动、真实存储失败、强制退出恢复、外部 revision 冲突和另存。

P2.4 布局截图、96 组 Browser 几何测量和 Electron 四尺寸结果在 `.artifacts/p2-layout/`。编辑器交互截图与原始结果在 `.artifacts/p2-editor/`，`index.html` 汇总三模式、Slash、选区、块菜单、各保存状态和 Electron 结果；原 P2 截图保留在 `.artifacts/p2/`。P1a 回归截图仍在 `.artifacts/p1a/`。

旧 P1a `/?scene=dashboard|workspaces|library|compact|focus|narrow` 等场景继续使用非持久化 Fixtures，仅用于原 Shell 视觉回归；默认入口 `/` 使用真实 Library Explorer 契约。Browser Mock 可用 `/?fault=save` 注入一次保存失败。

## 本轮限制

Live Preview 第一版覆盖 ATX 标题、强调、链接、列表、引用、行内代码和围栏代码；当前编辑语法范围保留标记。块类型转换首版支持段落和标题，复杂列表/代码块保留复制与删除操作。复杂表格/数学的实时 Decoration、KaTeX 和公式引用解析尚未接入，Reading 可渲染普通 GFM 表格。`\label` / `\eqref` 原文和 UUIDv7 块索引保存，未把旧工程整套公式/插件/项目系统搬入 P2。

Undo 栈保留于当前工作面的生命周期，不跨重新打开/重启恢复。恢复 checkpoint 有节流：正常关闭等待完整保存；强制杀进程只能恢复已成功落盘的 checkpoint。IME 自动化通过 Chromium composition 协议，真实系统输入法候选窗仍需要人工交互验收。

已实现 Notes、Folders 和 Trash；Collections、Assets、PDF、真实 AI、Inbox 捕获、Plugin SDK、旧数据导入和多窗口协作仍未接入。当前约 1.09MB minified Renderer 包包含 CodeMirror、Marked 与 DOMPurify，构建有 chunk size 提示；本轮不引入额外加载框架。Node 24 的内置 SQLite 会打印实验性 API 提示；Electron 已验证其实际读写。


## P3.0 Library Explorer

Library 视图与实体目录分开：All Notes / Recent / Favorites 是虚拟视图；FOLDERS 展示真实嵌套目录与 Uncategorized；Trash 固定底部。Collections / References / Assets / Daily Notes 尚未接入，UI 明确显示不可用说明。

Folder/Note 的悬停、键盘 Focus、More 和 Shift+F10 / 右键可访问真实创建、重命名、收藏、移动、复制 Note 链接及回收站操作。Folder 删除前显示实际后代与项目关系影响，项目共享笔记保留在 Uncategorized；软删除可按原 ID 恢复。本阶段不提供永久删除或 Project Pipeline。

All Notes 和 Folder Contents 提供七种 Sort；Recent 按真实访问时间排序。Manual order 属于 folder/view placement，切换自动排序不会改写。拖动手柄支持同级插入线与 Folder 行高亮两种反馈，折叠目录悬停延迟展开；自动排序禁止手动重排。键盘可用 Move Up / Move Down / Move to Folder，持久化失败恢复原顺序并报告错误。

新增边界：`contracts/library*.ts`（DTO/校验）、`core/library/`（纯规则、Port、Explorer 协调）、`storage/SQLiteLibraryStore.ts`（schema v2 迁移与元数据）、`renderer/features/library/`（菜单、行、拖拽）。完整目录/手动顺序、收藏、访问时间和 Trash 均保存到 SQLite，重启保持。v1 自动升级前生成 `state.sqlite.before-v2-<timestamp>.sqlite` 一致性备份。

测试：`tests/library.contract.test.ts`、`tests/e2e/library.spec.ts`、`scripts/verify-library.mjs`。截图、结果和复核画廊在 `.artifacts/p3/`。Browser Mock 的 `/?fault=library` 可注入一次真实契约失败，Electron 故障标记为隔离测试工作区 `.syna/test-fail-library`，需开启 SYNA_TEST_MODE。
