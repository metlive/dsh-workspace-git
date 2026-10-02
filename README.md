# dsh-workspace-git

DSH Web 插件：**显示工作区项目的 Git 分支**。有仓库就显示，没有就什么都不显示。

- **选择模式右侧**一个分支胶囊，点击展开该仓库的**本地 + 远程**分支列表（官方插槽 `conversation.input.left`）。
- 会话视图环「轨迹」右侧注册 **Git 图谱** 标签（`conversation.view` / `workspace-git-graph` / order 20）；有 HEAD（含游离）时展示详细提交列表，非仓库时显示**空态说明文案**（标签环显隐由 shell 决定，见「Git 图谱」一节）。
- 胶囊与列表的**每一行都以分支图标开头**（官方 `IconBranchOutline16` 同款形状，内联在
  `src/client/BranchIcon.tsx`，`currentColor` 跟随所在行着色）；胶囊原先是一个强调色圆点。
- 列表按「本地分支 / 远程分支」分组，**默认每组最多 10 个**；搜索时放宽到 200。排序见「已知限制 5」：
  松散 ref 按 mtime 降序优先，**打包在 `packed-refs` 里的条目没有 mtime，会退化为按名称排序**，因此
  老仓库里默认展示的是「名称靠前的前 10 个」而非「最近用过的 10 个」。当前分支始终保留在列表中。
- 列表里当前分支带勾选标记；**点击本地分支会执行 `git switch` 切换**；**点击远程分支会 `git switch --track`**（已有同名本地分支则直接切过去）。工作区有未提交改动时可能失败，失败信息显示在胶囊 tip 上。
- 列表底部（「Git 图谱」上方）有 **创建并检查新分支…**：弹出输入框，`git switch -c` 创建并切换过去（分支已存在或名称非法时在弹框内展示 git 报错）。
- 菜单用 `portal` 渲染到 `document.body` 并向**上**展开，因此不会被输入框的 `overflow` 裁掉、也不会跑出视口下边缘。
- 侧边栏工作区/项目行显示各自的分支 chip（阶段 4，见「路线图」）。
- **不是 Git 仓库 → 分支胶囊完全不渲染**；解析失败、路由不可用、目录已删除 → 同样不渲染。本插件没有错误占位符。
  （**例外**：会话视图里的 Git 图谱标签页对非仓库渲染空态文案，原因见「Git 图谱」一节——这与上面并不矛盾：胶囊是「有就显示」的装饰，
  标签页是 shell 已经渲染出来的一个空容器。）

## 安装

```bash
dsh plugin --profile web add /Users/admin/wwwroot/dsh-workspace-git
```

CLI 会读取包内 `dsh.bundle.patch`（`cordis.patch.yml`），自动把 `dsh-workspace-git` 追加进
`~/.dsh/profiles/web/package.json` 的 `dsh.profile.bundles`，无需手改 profile 文件。

**重启 DSH Web 后生效**（host 路由与 client bundle 都在启动时装载）：

```bash
# 若用 pm2
pm2 restart dsh-web
```

卸载：

```bash
dsh plugin --profile web remove dsh-workspace-git
```

## 它如何判断分支

直接读 `.git/HEAD`，**不调用 `git` 可执行文件**：

| HEAD 内容 | 显示 |
|---|---|
| `ref: refs/heads/main` | `main` |
| `ref: refs/heads/feature/x` | `feature/x` |
| 40/64 位 hex（detached） | 短 SHA，如 `a1b2c3d` |
| 其他 / 读不到 | **不显示** |

这样做的好处：没有子进程、不依赖 PATH、没有 shell 转义面、每次查询是 O(1) 的几次小文件读取，
而不是 O(repo) 的 git 调用。

发现规则：从工作区目录向上最多 12 层找 `.git`；`.git` 是**文件**时（linked worktree /
submodule）读取其中的 `gitdir:` 指针。最近的那个仓库生效，因此 monorepo 里的嵌套仓库报告自己的分支。

## 接口

五个方法，都是 `POST`：

**`/workspace-git/api/branches`** —— 批量查「这个目录当前在哪个分支」（侧边栏行装饰器用）

```jsonc
// 请求（paths 必须为绝对路径，最多 64 个，自动去重）
{ "paths": ["/abs/ws1", "/abs/ws2"] }

// 响应
{ "ok": true, "value": { "branches": {
  "/abs/ws1": { "branch": "master", "detached": false },
  "/abs/ws2": { "branch": null,   "detached": false }   // 非仓库 / 读不到
} } }
```

**`/workspace-git/api/refs`** —— 查一个仓库的本地 + 远程分支列表（下拉菜单用，仅展开时调用）

```jsonc
// 请求
{ "path": "/abs/ws1" }

// 响应（按 kind 分组由客户端完成；数组内本地在前、远程在后，同组内松散 ref 按 mtime 降序，
// packed-refs 条目无 mtime、排在带 mtime 的条目之后并按名称排序；每组最多渲染 10 行）
{ "ok": true, "value": {
  "detached": false,
  "refs": [
    { "name": "main", "current": true, "kind": "local" },
    { "name": "feature/x", "current": false, "kind": "local" },
    { "name": "origin/main", "current": false, "kind": "remote" }
  ]
} }
```

分支名来自两处并合并去重：`.git/refs/heads/**` + `.git/refs/remotes/**`（松散 ref，支持嵌套名；跳过 `*/HEAD`）与
`.git/packed-refs`（紧凑格式）。非仓库返回空列表。

**`/workspace-git/api/checkout`** —— 在工作区执行 `git switch`（本地）或 `git switch --track`（远程）

```jsonc
// 本地
{ "path": "/abs/ws1", "branch": "feature/x", "kind": "local" }

// 远程跟踪（已有同名本地分支则直接 switch；否则 --track 创建）
{ "path": "/abs/ws1", "branch": "origin/feature/x", "kind": "remote" }

// 响应（始终为最终检出的本地分支名）
{ "ok": true, "value": { "branch": "feature/x" } }
```

工作区有冲突/未提交改动导致 git 拒绝时，返回 `{ ok: false, error: { message } }`，客户端在胶囊 tip 上展示。

**`/workspace-git/api/create-branch`** —— 在当前 HEAD 处 `git switch -c` 创建并切换新分支

```jsonc
// 请求（branch 为新分支短名，走同一套安全校验：不能以 `-` 开头、不能含 `..`）
{ "path": "/abs/ws1", "branch": "feature/new" }

// 响应
{ "ok": true, "value": { "branch": "feature/new" } }
```

分支已存在 / 名称非法 / git 拒绝时，返回 `{ ok: false, error: { message } }`，客户端在创建弹框内展示。

**`/workspace-git/api/graph`** —— 分页拉取提交图谱（`git log`）

路由与 DSH 的 `/api` 网关使用同一套信任围栏：Host 头为 loopback 或 `--trusted-host` 授权地址才放行，
跨站标记（`sec-fetch-site: cross-site`、`Origin: null`）一律拒绝。这是 DNS-rebinding / 跨站防护，
不是身份认证。

`branch: null` 与「路径不在返回表里」在客户端是同一件事：不渲染。

## 客户端如何挂载

分支胶囊注册进 `conversation.input.left`（`ui-conversation` 声明的 session 作用域 `list` 插槽，
渲染在 `.modes` 簇**之后**，即选择模式右边、输入框尾部组左边）。
**该插槽给每个占用者传入的是标准 props**：

| prop | 用途 |
|---|---|
| `sessionId` | 本次 seat 渲染的会话 |
| `useSessions` | 会话列表选择器 hook —— 从中读 `byId[sessionId].cwd` |
| `t` | 命名空间绑定的翻译函数 |

分支 store 通过 `inject` 工厂作为**普通值**传进去，组件自己订阅它，因此「挂载之后才解析出分支」
也能触发重渲染。**不要**指望 `inject` 返回 `hooks: { xxx }` 会自动变成 `useXxx` 传给组件——
seat 只按上面的方式传 props（`dsh-client-ui-open-in-app` 与 `dsh-client-ui-jobs` 的占用者都是这么写的）。

**Git 图谱** 标签注册进 `conversation.view`（`id: workspace-git-graph`，`order: 20`，在「轨迹」右侧）。
`GitGraphView` 同样通过 `inject` 接收共享的 `BranchStore`；有 HEAD 时展示提交图谱，非仓库时显示空态文案。

### 为什么非仓库也要渲染空态（不要改回 `return null`）

shell 的标签环是这样长出来的（`@deepseek-ai/dsh-client-ui-conversation`）：

```js
tabs.length > 1 && jsx("div", { className: "...tabs", role: "tablist" }, ...)   // 标签环
const viewTabs = () => { for (const entry of slots.entries("conversation.view")) ... }  // 按注册账本生成
```

两点推论，直接决定了本视图的渲染契约：

1. **标签是按注册账本生成的，与组件是否渲染内容无关。** 只要本插件注册了 `conversation.view`，
   `tabs.length` 就是 2，「轨迹 / Git 图谱」标签环必然出现——**注册是静态的，`label` 是无参回调，
   注册时无法预知 cwd 有没有分支**，所以「非仓库时隐藏标签」做不到（只能注册后 dispose，
   会造成标签顺序抖动与切仓库闪烁）。
2. **所以 `GitGraphView` 一旦知道 cwd 就绝不能 `return null`。** 那样标签会指向一片空白，看起来就是 bug。
   非仓库是**正常状态不是错误**，因此给一段中性空态文案（`gitGraphNoRepo` + `gitGraphNoRepoHint`），
   不用错误色、不放 spinner。

只有 cwd 本身未知（`undefined` / 空串）时才 `return null` —— 那时连标签页属于哪个会话都判断不了。

配套约束：**`ensureGitGraphViewStyles()` 只在 `graphEnabled` 为真时才注入**（`GitGraphView` 里那个 gated
`useEffect`）。样式表里有全局的 `body:has([data-workspace-git-graph-view])` 规则，
若在空态就注入，`document.head` 里会长期留一条没有对应视图的规则。

分支**胶囊**（composer 座位）不受这套约束：它没有这样的空容器，非仓库仍然完全不渲染。

### 图谱的滚动契约（与「轨迹」同构）

**提交列表、点击详情是两个独立滚动条**，这点靠**单轴 flex** 保证，不要改回 grid：

| 元素 | 规则 | 作用 |
|---|---|---|
| `[data-workspace-git-graph-split]` | `display:flex` + `container-type:inline-size` | 一行两列；列宽由**剩余空间**推导，不是轨道 |
| `[data-workspace-git-graph-list]` | `flex:1 1 0%; min-width:0` | 吸收剩余宽度 → 滚动条 1 真的会裁剪 |
| `[data-workspace-git-graph-detail]` | `flex:none; width:clamp(320px,38%,440px); max-width:calc(100% - 280px)` | 固定宽度详情栏 |
| `[data-git-graph-body]` | `flex:1 1 0%; min-height:0; overflow:auto; scrollbar-gutter:stable` | **滚动条 1**（提交列表） |
| `[data-workspace-git-graph-detail-scroll]` | 同上 | **滚动条 2**（提交详情），**始终挂载** |

两个必须保留的细节：

1. **不要在 split 或其子元素上写 `grid-template-columns` / `grid-template-rows`。** grid 轨道按**行盒**解析，
   提交描述的 min-content 宽度会把列表撑开而不滚动、详情栏被挤出视口——这正是曾经的故障。
   `max-height:100%` 同理（在内容尺寸的盒子上解析），已全部移除。
2. **`GitGraphView` 根节点带 `data-conversation-composer-overlay`。** 这是与 shell 的握手：
   `ConversationRoot` 的 `.scrollBody:has([data-conversation-composer-overlay])` 会把外层切成
   `overflow:hidden auto` 并把确定高度让给视图；不带这个属性，内部 `overflow:auto` 就没有可裁剪的盒子。
   详情栏窄屏降级走 **容器查询**（`@container (max-width: 900px)`，按 split 宽度），不再用视口媒体查询猜列宽。

## 开发

```bash
pnpm install
pnpm typecheck
pnpm build       # → lib/index.js + lib/client.js + lib/types
```

改完源码后 `pnpm build` 再刷新页面即可（profile 是 `link:` 安装，不需要重装）。


## 设计约束

- **静默失败是契约**。非仓库是最常见的情况，不是错误。客户端对失败只做退避重试
  （3s → 10s → 30s），界面上始终什么都不显示。
  **唯一例外**是会话视图里的 Git 图谱标签页：它已经被 shell 渲染成一个空容器，必须自解释，
  因此给一段中性空态文案（见「为什么非仓库也要渲染空态」）。胶囊与侧边栏 chip 仍然完全静默。
- **客户端缓存 3 秒 TTL + 并发去重**。侧边栏每次 DOM 同步都会问一遍，所以批量合并成一次请求。
  无分支的路径不进客户端快照，因此下次同步会重新询问——`git init` 或切换分支后无需刷新即可出现。
- **不跨插件做 value import**。构建期 purity gate 会拒绝任何非模块表（`react` / `cordis` /
  `dsh-client-ui-slots` / `dsh-client-ui-primitives`）的 `@deepseek-ai/*` 值导入，
  跨插件协作只能走 cordis 服务。这让本包能作为独立 profile 层安装。
- **缓存按激活周期**，随 fiber 销毁，HMR 不会串状态。

## 路线图

- [x] 阶段 1–3：包骨架、host 半边（解析 + 路由 + 围栏）、输入框右侧分支下拉
- [ ] 阶段 4：侧边栏工作区行装饰器（`MutationObserver` + `[class*="_projectRow"]` 锚点）
- [ ] 阶段 5：设置页开关

## 已知限制

1. **输入框下拉用官方插槽，跨版本稳定**；侧边栏工作区行（阶段 4）需要 DOM 锚点
   （DSH 若更换侧边栏实现或 CSS Modules 命名策略会失效——届时下拉仍工作，插件整体不崩）。
2. **可切换 / 创建分支**：点击本地分支行执行 `git switch`；点击远程分支行执行 `git switch --track`
   （已有同名本地分支则直接 `git switch`）；「创建并检查新分支…」执行 `git switch -c`。不提供 pull / push。
3. **分支更新延迟 ≤3s**：TTL 缓存，不监听 `.git/HEAD` 文件变化（`fs.watch` 在 macOS 与网络盘上不可靠）。
   下拉每次展开都会重新拉取；UI 内切换会立刻更新胶囊文案。
4. **不做 ahead/behind；远端分支由本地 `refs/remotes/**` 得出，不做 `git fetch`**：只读
   `refs/heads/**`、`refs/remotes/**` 与 `packed-refs`，因此列表反映的是**上次 fetch 的本地快照**，
   不会主动联网更新远端分支（`origin/HEAD` 会被过滤掉，不作为分支列出）。
5. **「最近」排序的边界**：仅松散 ref 文件有 mtime。被 `git pack-refs` 打包进 `packed-refs` 的分支
   没有 mtime，与同组条目比较时视作 0，因此默认的「每组 10 个」在**长期存在的仓库里退化为按名称排序**，
   而不是按最近使用时间。需要精确定位近期分支时请用搜索框。
6. 单次 branches 请求最多 64 个路径，向上查找最多 12 层，嵌套分支名最深 8 层，菜单最多渲染 200 个分支。
