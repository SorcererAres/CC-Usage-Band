<div align="center">

# CC-Usage-Band

**额度、上下文、缓存命中率，在输入框上方一眼看清。**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-2.1.287%2B-d97757?style=flat-square)](https://claude.com/claude-code)
[![Type: mod](https://img.shields.io/badge/type-mod-6f7be0?style=flat-square)](https://claude.com/blog/claude-code-mods)
![Surfaces](https://img.shields.io/badge/surfaces-terminal%20%7C%20desktop-6a9bcc?style=flat-square)

[English](./README.md) · 简体中文

<img src="docs/images/banner.png" alt="usage-band 在 Claude Code 桌面端（上）和终端（下）的效果（渲染预览）" width="760">

<sub>由插件输出渲染的预览图，并非应用截图，详见<a href="#预览图">预览图</a>。</sub>

</div>

---

`usage-band` 是一个 [Claude Code 模组（mod）](https://claude.com/blog/claude-code-mods)。它在输入框上方显示一行状态，包含工作时最值得留意的四个数据。终端和桌面端各有一套专门的布局，每一轮对话结束后自动更新，平时安静地待着，只在需要注意时才变红提醒你。

> **让 AI 助手帮你安装？** 让它运行[安装](#安装)里的两条命令即可。给 AI 助手的说明：安装成功后，用户只需要知道下面这段话：
>
> *usage-band 已安装。新开一个会话（或输入 `/reload-plugins`），输入框上方就会显示 5h 和 7d 额度、上下文窗口和缓存命中率。不需要任何配置。*

> **2.0.0 有什么新变化**
>
> - 桌面端的文字改由 Claude 自己绘制，字体与界面一致（Anthropic Sans），浅色、深色模式自动切换。
> - 配色跟 Claude 一致：数字保持中性，进度条、点阵和图标用 Claude 的品牌色（1.9.0 起）。
> - 警示文字调到在浅色和深色底上都看得清的亮度。
>
> 已安装的用户依次运行 `/plugin marketplace update sorcerer-usage-band` 和 `/plugin update usage-band@sorcerer-usage-band`，再新开一个会话即可更新。完整内容见[更新日志](./CHANGELOG.zh-CN.md)。

## 目录

- [功能](#功能)
- [使用要求](#使用要求)
- [安装](#安装)
- [设置](#设置)
- [数据说明](#数据说明)
- [终端兼容性](#终端兼容性)
- [隐私与权限](#隐私与权限)
- [开发](#开发)
- [预览图](#预览图)
- [更新日志](#更新日志)
- [许可证](#许可证)

## 功能

| 指标 | 显示内容 |
| --- | --- |
| **5h** 额度 | 5 小时滚动额度已用了多少，以及还有多久重置 |
| **7d** 额度 | 7 天额度的用量和重置时间 |
| **上下文窗口**（图层图标） | 当前上下文占用的 token 数和模型窗口大小，例如 `398K/1M` |
| **缓存命中率**（靶心图标） | 上一轮输入中有多少由提示缓存提供 |

- **一眼看清，配色跟 Claude 一致**：数字保持中性，进度条、点阵和图标用 Claude 的品牌色（额度用蓝、上下文用 Claude 橙、缓存用橄榄绿）。只有在需要注意时才会变红：默认是额度或上下文超过 80%，或者缓存命中率低于 50%。阈值和颜色都可以[自己设置](#设置)。
- **有动感但不打扰**：额度进度条上有一道缓慢的扫光，所有进度条同步移动。
- **两端原生适配**：
  - 终端里是一行字符，图标可以用 Nerd Font 或普通 Unicode 字符，并且会根据窗口宽度自动调整显示的内容。
  - 桌面端是一行 SVG 图形，横向铺满整行，额度进度条和上下文点阵随窗口宽度伸缩，只剩上下文一组时左侧显示它的名称，窗口太窄时自动换行；额度用进度条显示，上下文用两行点阵灯显示（2×10 到 2×50 分档），并且支持浅色和深色模式。
- **轻量**：不读文件、不运行程序、不联网，只读取 Claude Code 本来就有的用量数据。

## 使用要求

- Claude Code **2.1.287 或更新版本**（模组功能是从这个版本开始提供的），终端和桌面端的 Code 页都可以用。
- 5h 和 7d 额度只有订阅账号才有数据。没有订阅时，这一行显示上下文和缓存命中率；桌面端在只剩上下文一组时，左侧会显示它的名称 `Context`。
- **推荐搭配 [Ghostty](https://ghostty.org) 终端使用。** Ghostty 自带这一行用到的图标字体，不用做任何设置就能看到完整效果。其他终端也能用，图标会简单一些。

## 安装

在 Claude Code 里输入这两条命令：

```
/plugin marketplace add SorcererAres/CC-Usage-Band
/plugin install usage-band@sorcerer-usage-band
```

然后**新开一个会话**，输入框上方就会出现这一行。就这么简单，不需要任何配置。

- 想在当前会话里马上看到？输入 `/reload-plugins`。
- 5h 和 7d 额度要等会话里 Claude 第一次回复后才会显示。
- **用不了 `/plugin` 命令？**（比如在桌面端）在系统终端里运行同样的两步：

  ```bash
  claude plugin marketplace add SorcererAres/CC-Usage-Band
  claude plugin install usage-band@sorcerer-usage-band
  ```

- 用旧名称 `cc-usage-band` 装过的，先按[更新日志](./CHANGELOG.zh-CN.md)里 2.0.1 的迁移步骤换成新名称。

如果只想在一个会话里临时试用，可以从本地克隆后加载：

```bash
git clone https://github.com/SorcererAres/CC-Usage-Band.git
claude --plugin-dir CC-Usage-Band/usage-band
```

**更新**

```
/plugin marketplace update sorcerer-usage-band
/plugin update usage-band@sorcerer-usage-band
```

第一条刷新插件市场里的版本信息，第二条才会把已装的插件更新到最新版本。更新后新开一个会话才会生效。在系统终端里把 `/plugin` 换成 `claude plugin` 也一样。

**卸载**

```
/plugin uninstall usage-band@sorcerer-usage-band
/plugin marketplace remove sorcerer-usage-band
```

第二条可选：把插件市场也一并移除。

## 设置

不需要任何设置。终端里的图标会自动选择：在 Ghostty 里用 Nerd Font 图标，在其他终端里用普通 Unicode 字符。桌面端的图标是自己画的。

如果终端里的图标显示成方框，或者你在别的终端里也装了 Nerd Font，可以在 shell 配置文件（比如 `~/.zshrc`）里加一行，然后新开一个会话：

```bash
export USAGE_BAND_ICONS=unicode   # auto（默认）· nerd · unicode · ascii
```

**阈值和颜色**也可以改，但不是必须的，默认就是上面「功能」里说的效果。可以改的选项如下，表格下面是三种修改方式：

| 选项 | 默认值 | 作用 |
| --- | --- | --- |
| `limitWarn` | `80` | 5h 和 7d 额度用量达到这个百分比时变成警示色 |
| `contextWarn` | `80` | 上下文占用达到这个百分比时变成警示色 |
| `cacheWarn` | `50` | 缓存命中率低于这个百分比时变成警示色 |
| `colorFiveHour` | `#6a9bcc` | 5h 额度的颜色 |
| `colorSevenDay` | `#4f7aa6` | 7d 额度的颜色 |
| `colorContext` | `#d97757` | 上下文的颜色 |
| `colorCache` | `#788c5d` | 缓存命中率的颜色 |
| `colorWarn` | `#b8433b` | 警示色 |

阈值的取值范围是 0–100。颜色写成 `#rrggbb` 或 `#rgb`，填错时会退回默认值。

**修改方式**

- **`/config`**：在 Claude Code 里打开，找到 usage-band 的这几项，改完插件会自动重新加载。
- **`/plugin configure usage-band@sorcerer-usage-band`**：在 Claude Code 里列出这几项并逐个设置。
- **系统终端**（用不了上面两个命令时，比如在桌面端）：把要改的项写成 JSON 传给 `claude plugin configure`，值都写成字符串，没写到的项保持原样。改完要重启 Claude Code 才会生效。

  ```bash
  echo '{"limitWarn":"70","colorWarn":"#ff0000"}' | claude plugin configure usage-band@sorcerer-usage-band --values-stdin
  ```

这些值保存在 `settings.json` 的 `pluginConfigs["usage-band@sorcerer-usage-band"].options` 里，也可以直接编辑这个文件，改完同样要重启 Claude Code。

## 数据说明

| 指标 | 数据来源 | 说明 |
| --- | --- | --- |
| 5h / 7d | Claude Code 从每次 API 响应中读到的额度窗口 | 四舍五入到整数百分比。重置倒计时不足 1 小时显示为 `42m`，不足 1 天为 `3h14m`，1 天以上为 `5d3h`；每分钟检查一次，显示的数字变了才更新，所以超过一天时大约每小时变一次。重置时间到了而会话里还没有新的响应时，按 0% 显示，不再显示倒计时。 |
| 上下文 | 最后一次请求的输入总量：未缓存部分 + 缓存读取 + 缓存写入 | 按当前模型的窗口大小计算，1M 和 200K 的模型都能正确显示。桌面端的点阵随宽度分档增加列数：2×10、2×20、2×25、2×50，每个点分别代表窗口的 5%、2.5%、2%、1%。先点亮上排，再点亮下排。 |
| 缓存命中率 | 上一轮的 `缓存读取 / (未缓存输入 + 缓存读取 + 缓存写入)` | 把这一轮里所有请求加总后计算，不包括子代理的轮次。会话里第一轮完成之前不显示。被中断或 API 出错的轮次没有用量数据，这时继续显示上一轮的命中率。 |

## 终端兼容性

| 终端 | `auto` 下的图标 | 颜色 |
| --- | --- | --- |
| Ghostty | Nerd Font（自带） | 真彩色 |
| iTerm2、WezTerm、kitty、Warp | Unicode（`≡` `●`） | 真彩色 |
| macOS 自带终端 | Unicode | 256 色（由 Claude Code 自动换算） |
| 其他终端 | Unicode | 按终端支持的颜色显示 |
| VS Code 扩展面板 | 始终是 Unicode | 真彩色 |

插件输出的始终是真彩色；终端只支持 256 色时，由 Claude Code 自动换算成最接近的颜色。

几种需要手动设置图标的情况（设置方法见[设置](#设置)）：

- **图标显示成方框**：如果是 Nerd Font 图标显示不出来，设置 `USAGE_BAND_ICONS=unicode`；如果连 `≡`、`●` 也显示成方框，设置 `USAGE_BAND_ICONS=ascii`，改用 `ctx`、`hit` 这样的文字。
- **在 tmux 或 SSH 里**：插件靠环境变量 `TERM_PROGRAM` 识别 Ghostty。tmux 会把它改成 `tmux`，SSH 默认不传这个变量，所以在 Ghostty 里也会退回 Unicode 图标。想用 Nerd Font 图标，设置 `USAGE_BAND_ICONS=nerd`。
- **VS Code 扩展面板**：固定用 Unicode 图标，`USAGE_BAND_ICONS` 不起作用。在 VS Code 的内置终端里运行 `claude` 不受影响，按终端处理。

`■`、`●`、`≡`、`·` 和 Nerd Font 图标属于东亚「宽度不确定」字符，在中文、日文等 CJK 环境或开启了双宽显示的终端里会占两列。这一行估算宽度时一律按两列计算，所以不会溢出折行，代价是窄终端里会稍早去掉进度条。可以运行 `/usage-band-preview`，在你自己的终端里对比所有样式。

## 隐私与权限

模组运行时的权限和 Claude Code 本身一样，没有沙箱隔离。所以这里列出这个模组会接触的全部内容：

- **读取**：会话的用量数据（`session.measure`、`turn.complete`、`$.session.usage`），环境变量 `TERM_PROGRAM` 和 `USAGE_BAND_ICONS`，以及你在 `/config` 里设置的阈值和颜色
- **注册**：一个命令 `/usage-band-preview`
- **绘制**：输入框上方的这一行；第一次安装后弹一条欢迎提示（`$.ui.toast`），只弹一次
- **保存**：在 Claude Code 为插件保留的存储里（`$.store`）记一个「已经显示过欢迎提示」的标记，跨会话保留，这样提示只弹一次

`turn.complete` 事件里也带着 Claude 那一轮的回复正文，插件只从中取 token 用量来算缓存命中率，不读取、不保存回复内容。

它不直接读写文件、不运行程序、不联网，也不会把任何数据发送到任何地方。上面那个标记由 Claude Code 代为保存。模组代码只有一个文件：[`usage-band/hooks/register.tsx`](./usage-band/hooks/register.tsx)。

想自己核实，可以把仓库克隆下来，在仓库根目录运行校验命令。它会列出模组挂接的全部事件、调用的全部接口和读写的环境变量，和这一节对得上：

```bash
git clone https://github.com/SorcererAres/CC-Usage-Band.git
cd CC-Usage-Band
claude plugin validate usage-band
```

## 开发

```
.
├── .claude-plugin/marketplace.json   # sorcerer-usage-band 插件市场
├── .github/                          # 自动检查（GitHub Actions）与 Issue 模板
├── CHANGELOG.zh-CN.md                # 更新日志（英文版为 CHANGELOG.md）
└── usage-band/
    ├── .claude-plugin/plugin.json    # 插件信息
    ├── hooks/hooks.json              # 指明要加载的模组文件
    ├── hooks/register.tsx            # 模组代码
    ├── types/index.d.ts              # 状态类型定义
    ├── tests/band.test.ts
    └── tsconfig.json                 # 供编辑器做类型检查
```

在仓库根目录运行检查：

```bash
claude plugin validate .            # 校验插件市场
claude plugin validate usage-band   # 校验插件
claude plugin test usage-band       # 运行测试
```

修改时用 `claude --plugin-dir ./usage-band` 加载，文件一保存，会话就会自动重新加载。`usage-band/tsconfig.json` 继承的 `usage-band/.claude-plugin/types/` 由 Claude Code 在加载模组时生成（已加入 `.gitignore`），所以第一次用编辑器做类型检查之前，需要先这样加载一次。

推送到 `main` 或提交 Pull Request 时，GitHub Actions 会自动运行同样的校验和测试。

欢迎提交 Issue 和 Pull Request，提交 Issue 时可以选「问题反馈」或「功能建议」模板。

## 预览图

以下图片由插件实际输出渲染而成，外框按 Claude Code 的样式仿制，并非应用界面截图。桌面端的图形是插件输出的 SVG，文字按 Claude 的方式以 Anthropic Sans 排版；文字的字号和颜色由 Claude 决定（警示色除外，由插件指定），图中为近似值。

**桌面端，浅色模式**

<img src="docs/images/desktop-light.png" alt="usage-band 在桌面端的浅色模式效果" width="760">

**桌面端，深色模式**（5h 额度超过阈值，显示警示色）

<img src="docs/images/desktop-dark.png" alt="usage-band 在桌面端的深色模式效果：5h 额度超过阈值，显示警示色" width="760">

**终端**（Unicode 图标样式）：宽度不够时会先去掉进度条，再去掉重置时间。在 Ghostty 里会自动换成 Nerd Font 图标。运行 `/usage-band-preview` 可以并排对比所有终端样式。

<img src="docs/images/terminal.png" alt="usage-band 在终端里的效果" width="760">

## 更新日志

每个版本的变化见 [CHANGELOG.zh-CN.md](./CHANGELOG.zh-CN.md)，也可以在 [Releases](https://github.com/SorcererAres/CC-Usage-Band/releases) 页面查看。

## 许可证

[MIT](./LICENSE)
