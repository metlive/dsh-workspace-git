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
- 切换前会先做一次**脏工作区检查**（`git status --porcelain=v1 -z`，只读）：工作区有未提交改动时**先弹对话框**列出这些文件，
  由用户决定「保留我的改动」还是「仍然切换」，而不是让 `git switch` 事后报错。**未跟踪文件（新增 / 正在写的内容）同样计入**，
  它们本身挡不住 `git switch`，但确实是用户可能没意识到的未提交内容，所以两种情形走的是同一个对话框。
  该对话框宽度为 **600px**（`src/client/switchGuardStyles.ts`，由 `ensureSwitchGuardStyles()` 在打开时注入一次）：
  Modal 默认是 `min(380px, 100%)`，这层样式用 `!important` 覆盖 `width` 并**同时钉住 `min-width`**——只改 `width` 的话，
  卡片在受限的 flex 上下文里仍可能被压到 600px 以下。窄视口（≤648px）回退成 `calc(100vw - 48px)`，因为 Modal 根节点两侧各留了 24px。
  对话框内**文件列表的行高为 1.5**（`fontSize: 12px` + `lineHeight: 1.5` → 实际 18px，写在 `BranchSelect.tsx` 的列表容器上）：
  列表的行 `<div>` 与路径 `<span>` 都**不设自己的 `line-height`**，靠继承拿到这个值——所以改这一处就等于改整个列表的行距。
  用无单位比值而不是直接写 `18px`，是为了让字号与行距不会各自漂移（浏览器算出的结果完全相同）。
  除此以外**不改动该对话框的任何布局、文案与交互**，也不影响 Git 图谱 / 创建分支这两个对话框（它们各有自己的宽度）。
- 列表底部（「Git 图谱」上方）有 **创建并检查新分支…**：弹出输入框，`git switch -c` 创建并切换过去（分支已存在或名称非法时在弹框内展示 git 报错）。
- 菜单用 `portal` 渲染到 `document.body` 并向**上**展开，因此不会被输入框的 `overflow` 裁掉、也不会跑出视口下边缘。
- **卡片高度上限 500px**（`max-height: min(500px, calc(100vh - 24px))`，见 `MENU_MAX_HEIGHT`）：这是**上限不是固定高度**，
  分支少时卡片仍然只有内容那么高。搜索会把每组上限放宽到 200 条，没有这层上限时高窗口下列表会一路顶到视口顶部、把对话盖住。
  补充细节：卡片本身是**内容高度**的 flex 列，所以这层上限同时写在中间那层滚动宿主上——只写在卡片上时，
  宿主会量到自己的完整内容高度、撑破卡片的上限，结果是底部两行（创建分支 / Git 图谱）被裁掉而不是列表滚动。
  搜索框、分隔线、底部两行都是 `flex:none`；宿主是 `flex:1 1 auto; min-height:0`，超过上限的部分在列表内部滚动。
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

> **改了宿主半（`src/*.ts` → `lib/index.js`）就必须重启。** 客户端半有 HMR
> （`dsh-client-hmr` 每 500ms 轮询 bundle 并推送），**宿主半没有任何热重载**。
> 只重新构建时：浏览器里是新客户端，服务器上还是旧路由 —— 表现为功能「看起来装了、
> 点下去报 400」。`npm run verify:live` 只校验客户端字节，**发现不了这种情况**。

卸载：

```bash
dsh plugin --profile web remove dsh-workspace-git
```

### 与 `dsh-model-visibility` 并存（不要合并两个包）

模型可见性插件（[`Lzh3070/dsh-model-visibility`](https://github.com/Lzh3070/dsh-model-visibility)，控制模型选择器里显示哪些模型）
与本插件是**两个独立的 profile 层**，各自 `insert` 自己的条目，互不依赖：

```bash
dsh plugin --profile web add dsh-model-visibility
```

`dsh` 会把两个包都追加进 `dsh.profile.bundles`，之后各自包内的 `cordis.patch.yml`
分别插入 `- id: model-visibility` 和 `- id: workspace-git` 两条行。本仓库**不包含**它。

**为什么不把它合进本包**——三条都是硬约束，不是偏好：

1. **Loader 身份冲突。** 两边都靠固定 id 挂载。嵌套进本包后插件 id 变成
   `workspace-git/model-visibility`，而它的客户端半以 `id: "model-visibility"` 注册
   `settings.section`——设置导航图标是按这个 id 反查的，认不出来就退回自己的默认齿轮；
   `ctx.configForms.get('model-visibility')` 读的也是同一个**已持久化在 profile 里**的命名空间。
   合并会静默打断这些。
2. **没有任何代码级接缝。** 两者的 slot、服务、宿主 inject 全都不重合：它占
   `settings.section`，本包占 `conversation.input.left` / `.input.right` / `.view` /
   `.hero.agentPreset` / `.session.header.actions`；它客户端 inject 是
   `slots, locale, configForms, remote, remote.session`，本包是 `slots, sessions, locale`；
   它宿主 inject 是 `['llm']`（包装 `llm.listModels`），本包是 `['webServer', 'sessions']`。
   合并只是把两个 `apply` 塞进一个 fiber，零复用。
3. **会把本包拖回 GitHub tarball。** 本包在 `web` profile 是 `link:` 本地安装、改完源码
   `pnpm build` 即生效；合进来就意味着每次改动都要走一次 GitHub 发布。

**它们已经能正确协作，无需接线。** 它包装 `ctx.llm.listModels`，所以任何走模型目录的代码
拿到的都是过滤后的结果——本插件的 `src/prompt-enhance.ts` 正是用 `ctx.get('llm')` 取目录的，
被隐藏的模型会自动不出现。跨插件协作只走 cordis 服务，这也是本包能作为独立 profile 层安装的前提。

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

### 切换分支后「外显」不更新（两个独立缺陷）

症状都是「点了分支，下面什么都没变」，但成因是两件事：

**1. 切换失败时没有任何可见反馈。** git 在本地改动会被覆盖时**拒绝**切换，路由返回 400，
磁盘上的 HEAD 不动 —— 于是胶囊保持旧分支名（**这是对的**）、图谱也不变（**也是对的**），
唯一的证据只是一个挂在 trigger 上的 `title`：要悬停才看得到，而且 **~2.4s 后自动清除**。
用户看到的就是「点了没反应」。

现在失败会渲染一条**常驻的内联提示**（`data-workspace-git-switch-error`），直接展示 git 的原文 ——
`Your local changes to the following files would be overwritten by checkout` 本身就告诉了用户该怎么做。
自动清除时间放宽到 12s，且成功切换会立刻清掉旧的失败信息。
提示用绝对定位 + `pointerEvents: none`，因此不会撑动 composer 那一行，也不会吃掉指向胶囊的点击。

**2. 成功切换后图谱不刷新。** 路由跑的是 `git log HEAD --branches --tags --remotes`，
所以**换分支并不会改变返回的提交集合** —— 但它改变**装饰**：`HEAD -> <分支名>` 会移到新的 HEAD 上。
`useCommitGraph` 原先只以 `cwd` + `enabled` 为依赖，两者都不随切换变化，于是视图保留旧的一页，
HEAD 标签停在旧提交上。现在把**分支名**作为第三个身份参数传进去（用名字而不是 hash：
两个分支指向同一提交时装饰仍然不同，一样需要重载）。

实测 `main -> zz-switch-test`：胶囊更新、HEAD 标签从第 1 行移到第 0 行，
且请求序列为 `checkout -> tips -> graph`，即图谱确实重新加载。

顺带修的一处：分支切换会替换提交页，若筛选里还留着一个已不存在的分支名，
图谱会被筛成空的 —— 与「仓库是空的」无法区分。因此 `GitGraphSplit` 会在提交集变化时
**剪掉解析不到的选择**（空提交列表是加载态，不当作「全部消失」）。

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

### Agent 预设选择器（绕过官方 Developer tools 门控）

**Agent 预设**芯片注册进 `conversation.hero.agentPreset` —— 新会话界面里
`conversation.hero.workspace`（「选择工作区」）**右侧**的座位；只读标签注册进
`conversation.session.header.actions`（`id: workspace-git-agent-preset`，`order: -10`）。

**为什么本插件要自己画一个，而不是复用官方芯片。** 官方
`@deepseek-ai/dsh-client-ui-agent-preset` 确实注册进同一个座位，但它在
`ap-client.js:480` 硬性门控：

```js
if (!main || !developerTools || !ready) return null;
```

### 加载顺序：必须用 `ctx.inject`，不能内联 `ctx.get`

客户端插件之间的**激活顺序没有约束**，所以 `apply()` 执行时 `remote` 可能还没就绪。
内联读取会拿到 `undefined`，而「拿不到就什么都不注册」的守卫会**静默吞掉**这个情况 ——
表现为**没有芯片、没有标签、也没有任何报错**：

```js
// 错误：remote 未就绪时静默不注册
const remote = ctx.get('remote')
const store = remote?.agentPresets === undefined ? undefined : new AgentPresetStore(remote)

// 正确：把依赖交给 cordis，等它就绪后再注册（并在此后服务重启时自动重跑）
ctx.inject(['remote', 'remote.agentPresets'], (scope) => { /* 注册两个座位 */ })
```

注意 `remote` **不放进** `export const inject`：那会让缺少 agent-preset registry 的部署
整个激活失败，连带分支胶囊与 Git Graph 一起挂掉。放在 `ctx.inject` 上则精确得多 ——
没有该 registry 的部署只是**没有这两个控件**，其余功能照常。

`developerTools` 取自设置 → 通用 → Developer tools。关键点在于
**该座位被 `ui-conversation` 声明为 `kind: "single"`**（`client.js:18179`）；
而 `ui-slots` 的注册表对 `single` 座位是**按 priority 逐格判定**的
（`SlotCore.register`，`slot "... already has a registration at priority 0 ..."`）：

- **同一 priority 再注册一次会直接抛错**，而该异常会中断本插件整个 `apply()`，
  连带把分支胶囊与 Git 图谱一起拖下水；
- **不同 priority 则允许共存**，`priority` 是文档化的「格位遮蔽排名」（**数值最低者渲染**）。

因此顺序很关键，**不可省略 `priority: -1`**：

```js
ctx.slots.register({ name: 'conversation.hero.agentPreset', priority: -1, ... }, AgentPresetChip)
```

官方芯片用的是默认 priority `0`，所以 `-1` 既能避开抛错，又能拿下这个格位。
拿下之后**不等于一直显示**——两个渲染组件都会跟随该设置实时让位：

| Developer tools | hero 座位显示 | 会话头部标签 |
|---|---|---|
| **开** | 官方芯片（本插件渲染 `null` 让位） | 官方标签（本插件渲染 `null`） |
| **关** | **本插件芯片**（官方被门控为 `null`） | **本插件标签** |

即：给主动打开 Developer tools 的用户保留原生控件，同时精确覆盖本插件存在的理由——门控关闭时那个位置不再空着。
官方头部标签**并不**受该设置门控（只有 hero 芯片受），所以开着时它已经在显示，本插件同样让位以免重复。

**本插件的做法**：门控是**纯客户端的显示规则，不是宿主限制** —— `agentPresets.list`
与 `agentPresets.select` 两个 remote 方法照常应答。因此我们直接读同一份宿主数据
（`ctx.remote.agentPresets`）并自绘控件，无需改宿主、无需打补丁：

| 文件 | 作用 |
|---|---|
| `src/client/agent-preset/api.ts` | 宿主 remote 契约的类型化封装；优先取 `error.details.reason` |
| `src/client/agent-preset/store.ts` | 名单与选择状态；`gateway/invocation-unavailable` 视为「本部署无预设」而非错误 |
| `src/client/agent-preset/AgentPresetChip.tsx` | hero 座位上的芯片（含让位逻辑） |
| `src/client/agent-preset/AgentPresetLabel.tsx` | 会话头部的只读标签 |
| `src/client/agent-preset/labels.ts` | 内置预设（`standard`/`ptc`/`minimal`/`cordis`）的本地化文案 |
| `src/client/agent-preset/AgentPresetIcon.tsx` | `currentColor` 图标 |

**两点与官方的有意差异**：去掉逐字进场动画；芯片**切换当前会话**的预设，
而不是像官方那样「暂存给下一个会话」—— 暂存机制存在的原因是官方芯片还要负责
尚无会话的新建页，而本芯片作用于它实际挂着的那个会话。

**降级契约**（与分支胶囊一致）：名单为空、部署未挂载预设注册表、或没有可用预设时，
**什么都不渲染**，既不报错也不留空控件。

**`remote` 不是硬依赖。** 它没有写进 `inject` 数组：缺少预设注册表的部署只是少两个控件，
不该让整个插件激活失败（那会连带把分支胶囊和 Git 图谱一起拖下水）。因此用
`ctx.get('remote')` 探测，缺失时直接跳过这两处注册。

仓库内自带两个测试，覆盖两层不同的风险：

**1. `npm test` —— 把构建产物当浏览器模块加载。** 它用**真实的 `SlotCore`**
先声明这些座位、并让官方插件以默认 priority 先占住 `single` 座位，再加载本插件的构建产物。
因此它覆盖的是真实冲突路径，而不只是「函数被调用了」——去掉 `priority: -1` 该测试就会失败。

**2. `npm run verify:live` —— 验证运行中的 GUI 真的在提供这份构建。**
磁盘上的文件正确，**不等于**浏览器收到的字节正确：客户端半边走的是带 revision 的
`/plugins/??…&rev=…` 路由。该脚本用 profile 自己存储的 browser-session 凭据
（`~/.dsh/.credentials.yaml`，按 `client-connection` 的 `v1.<payload>.<hmac>` 编码签出 cookie）
认证后读取页面里的 `window.__DSH_BOOT__`，取出本插件那一行的 URL 并抓取，
断言其中确实包含两个座位注册、`priority: -1` 与 `agentPresets` 读取。

```bash
npm test            # 座位注册与渲染契约（真实 SlotCore）
npm run verify:live # 运行中的 GUI 提供的字节（默认 http://127.0.0.1:19387）
```

> 注意：combo 路由里的 `??` 必须**按字面**发出去。`fetch`/`URL` 会把它规范化成 `%3F%3F`
> 从而 404，所以脚本用 `node:http` 逐字节写请求行。

### 提示词增强器（模型选择器左边的增强图标）

输入框右侧、**紧邻模型选择器左边**有一个增强图标：点它就用**该会话当前选中的模型**把
（可能极简/模糊的）草稿重写成结构清晰的提示词，并**直接覆盖**回输入框。
执行期间该图标**换成转圈 spinner**。座位是 `conversation.input.right`
（与分支胶囊的 `input.left` **不同簇**，见下）。

| 文件 | 作用 |
|---|---|
| `src/prompt-enhance.ts` | 宿主半：解析当前会话模型、调 `ctx.llm.stream`、规整输出 |
| `src/client/prompt-enhance/PromptEnhancer.tsx` | 客户端半：图标按钮、`setDraft` 回写、失败提示 |
| `src/client/prompt-enhance/EnhanceIcon.tsx` | 增强图标（WorkBuddy 原版路径）与 spinner |

#### 图标与 spinner 的来源

两者都直接取自 WorkBuddy 自身的「增强提示词」按钮
（`app.asar.unpacked/resources/extensions/im-channels/ui/assets/plan-input-*.js`），
**逐路径照搬**，不做改绘：同一个 Composer 行里出现两个长得不一样的「增强」控件，
会被当成两个不同功能。

| | 图形 | 网格 |
|---|---|---|
| `EnhanceIcon` | 四角星 + 斜杠（WorkBuddy 组件 `fV`） | `viewBox="0 0 16 16"`，`fillOpacity 0.7` |
| `EnhanceSpinner` | `r=6` 圆弧 `strokeDasharray="28 10"`（组件 `hV`） | `viewBox="0 0 16 16"` |

两个约定不要改：

1. **都用 `currentColor`**，按钮靠自己的 `color` 给所有状态（常态/悬停/执行中/禁用）上色，
   不需要按状态切图。
2. **spinner 的旋转是内联 `animation` + 组件内一个 `<style>`**（`@keyframes dsw-enhance-spin`），
   因为本插件**不带任何 CSS**，为一个动画引入样式表不划算。keyframes 用 `dsw-` 前缀避免全局冲突，
   并带 `prefers-reduced-motion: reduce` 分支把圆弧停住 —— 无限旋转正是这个设置要抑制的东西。

#### 状态可从外部观察

按钮带 `data-enhance-state="idle|busy"`，spinner 容器带 `data-icon="prompt-enhance-spinner"`。
挂载测试靠这两个属性断言 idle/busy 的 markup 确实不同（`busy` 是内部 state，
无 DOM 环境点不到，因此 busy 分支从 bundle 源码断言）。

> busy 期间按钮 `opacity` 保持 `1`，只有空草稿才降到 `0.4`：转圈是此刻唯一的状态提示，
> 再压暗就看不见了。不可点的语义由 `disabled` + `cursor: default` 承担。

#### 为什么是 `conversation.input.right`（不是 `input.left`，也不是 `input.model`）

`ui-conversation` 把工具行拆成**两个容器**：

```
[ leading  ]  ＋ · permission · plan · input.left
[ trailing ]  input.right · input.model · submit
```

关键点：`input.left` 与 `input.model` **分属不同容器**。所以把 `order` 调大
（曾是 `order: 30`）只能让控件成为 **leading 簇内最右**，**并不等于「模型选择器左边」**——
中间还隔着整个 leading 簇的尾部。`order` 表达不了这个位置，**只有座位能表达**。

因此改用 `conversation.input.right`。运行时自省契约（`dsh-cordis-client-runner` 里的
slot contract，rev `d5562dc82e23`）原文：

| 字段 | 值 |
|---|---|
| `summary` | `Compact controls before the composer submit action.` |
| `kind` / `scope` | `list` / `session` |
| `occupants` | `[]`（**无人占用**） |
| `replaceRisk` | `none` |

即：位置正是「模型选择器紧左侧」，且因为是 `list` 槽、当前空着，
**不需要 `priority: -1` 去抢别人不拥有的控件**（对比 `conversation.input.model`
是 `single` 槽、被官方模型选择器以 priority 0 占据）。

注册时**不设 `order`**：该座位当前只有本插件一个占用者，位置由座位本身决定；
一旦有第二个占用者，排名先后是**别人的**决定，不该由本插件替他们猜。

> ⚠️ 上述结论来自**抓取运行中的 DSH 实例**（`127.0.0.1:19387`）核对真实 bundle，
> 不是读文档推断。若日后 DSH 改版调整了布局，**不要沿用本节的推理**，请重新核对：
>
> 0. **不需要自己启服务**。`/Applications/DeepSeek Harness.app` 桌面客户端自带 web
>    服务，客户端运行时它就在监听 19387。**不要**用 `npx @deepseek-ai/dsh web` 去做这件事
>    （在 npm 缓存异常时会安装失败，而误杀客户端进程的风险是真的）。
>    动手前先 `lsof -nP -iTCP:19387 -sTCP:LISTEN` 确认 `COMMAND` 列是 `DeepSeek`。
> 1. 从 `~/.dsh/.credentials.yaml` 的 `client-connection/browser-session` 读 `secret`，
>    按 `v1.<base64url(payload)>.<base64url(hmac-sha256)>` 签出 cookie
>    （`payload` 含 `version/authority/issuedAt/expiresAt`；`authority` 为 `host:port`，
>    cookie 名 = `dsh-auth-` + base64url(sha256(authority))）。
> 2. 取首页，**手工括号配对**截出 `window.__DSH_BOOT__` 里的 JSON（嵌套很深，
>    直接 `JSON.parse` 整段会失败），得到 `entries`。
> 3. 抓 `@deepseek-ai/dsh-client-ui-conversation/client.js` 看 `renderSlot` 的**实际容器顺序**；
>    抓 `@deepseek-ai/dsh-cordis-client-runner/client.js` 看**插槽契约自省**
>    （每个座位的 `summary` / `kind` / `occupants` / `replaceRisk`）—— 比任何文档都权威。
>
> 注意：combo 路由里的 `??` 必须**按字面**发送，`fetch`/`URL` 会规范化成 `%3F%3F` 导致 404，
> 所以要用 `node:http` 逐字节写请求行。

#### 草稿的读写走 `uiSession`，不碰 DOM

`ui-conversation` 通过 `uiSession.provide({ hooks: ["input"], props: ["inputActions"] })`
把 `useInput`（草稿选择器）与 `inputActions`（`setDraft`）发布到 session 作用域，
槽位运行时按会话物化后作为**组件的普通 props** 传入 —— 与 `InputBar` 自己收到的两个
prop 完全一致。所以**不要**在注册时再声明同名 `inject`：`uiSession.provide` 对重复 prop
会抛 `duplicate ... at prop`（与 `single` 槽同类陷阱），测试里有一条断言锁住这点。

#### 三条不可退让的性质

1. **失败绝不改动用户文本。** 只有成功才写回；所有失败路径都保持草稿原样并说明原因。
   `test/prompt-enhance-host.mjs` 用 28 条断言逐条覆盖（空草稿、超大、会话关闭、
   无模型、无 llm 服务、模型报错、超时、截断、空输出、纯空白输出，以及
   **「流未收到 finish 就结束」**——这一条曾是真缺陷：`finishKind` 初始值是成功值
   `'stop'`，导致半截输出被当成完整改写写回输入框）。
2. **模型的回答是数据，不是指令。** 草稿以 JSON 嵌套进 user message，system prompt
   明确要求「重写而非回答」；返回值若被整段 ``` 包裹会先剥掉。
3. **取消不是失败。** 卸载（切会话）会 abort 在途请求，避免把结果写进下一个会话的
   输入框；abort 不弹提示。

#### 宿主半需要重启才生效

客户端半有 HMR（每 500ms 轮询 bundle），**宿主半没有**。新增路由后必须重启 `dsh web`，
否则路由返回 `unknown workspace-git API method "enhance-prompt"` —— 客户端看起来
一切正常，点下去却总是这个 400。

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
6. 单次 branches 请求最多 64 个路径，向上查找最多 12 层，嵌套分支名最深 8 层，菜单最多渲染 200 个分支；
   卡片可视高度上限 500px，超出部分在列表内部滚动。
