<div align="center">

# CC-Usage-Band

**Your Claude Code limits, context and cache, one glance above the prompt.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-2.1.287%2B-d97757?style=flat-square)](https://claude.com/claude-code)
[![Type: mod](https://img.shields.io/badge/type-mod-6f7be0?style=flat-square)](https://claude.com/blog/claude-code-mods)
![Surfaces](https://img.shields.io/badge/surfaces-terminal%20%7C%20desktop-6a9bcc?style=flat-square)

English · [简体中文](./README.zh-CN.md)

<img src="docs/images/banner.png" alt="usage-band in the Claude Code desktop app (top) and in a terminal (bottom)" width="760">

</div>

---

`usage-band` is a [Claude Code mod](https://claude.com/blog/claude-code-mods) that draws a single line above the prompt with the four numbers worth watching while you work. It has its own layout for the terminal and for the desktop app, updates itself after every turn, and stays out of the way until something needs attention.

> **Installing with an AI agent?** Have it run the two commands under [Installation](#installation). Agents: once it succeeds, this is all the user needs to hear:
>
> *usage-band is installed. Open a new session (or run `/reload-plugins`) and a line above the prompt shows your 5h and 7d limits, context window and cache hit rate. Nothing to configure.*

> **What's new in 2.0.0**
>
> - On the desktop, Claude now draws the text, so it uses the app's own font (Anthropic Sans) and follows light and dark mode.
> - Colors that match Claude: neutral figures, with the bars, dots and icons in Claude's brand colors (since 1.9.0).
> - Warning text at a lightness that reads on both light and dark bands.
>
> Already installed? Run `/plugin marketplace update sorcerer-usage-band`. The full list is in the [changelog](#changelog).

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [What the numbers mean](#what-the-numbers-mean)
- [Terminal compatibility](#terminal-compatibility)
- [Privacy and permissions](#privacy-and-permissions)
- [Development](#development)
- [Screenshots](#screenshots)
- [Changelog](#changelog)
- [License](#license)

## Features

| Metric | Shows |
| --- | --- |
| **5h** limit | How much of the rolling 5-hour window you have used, and when it resets |
| **7d** limit | The same for the weekly window |
| **Context window** (layers icon) | Tokens in the context out of the model's window, e.g. `398K/1M` |
| **Cache hit rate** (target icon) | How much of the last turn's input the prompt cache served |

- **Glanceable, in Claude's colors.** The figures stay neutral; the bars, dots and icons carry Claude's brand colors (blue for the limits, Claude orange for the context, olive for the cache). A metric turns red only when it needs you: by default a limit or the context past 80%, or a cache hit rate under 50%. Both the thresholds and the colors are [configurable](#configuration).
- **Alive, not noisy.** A slow shine sweeps across the limit bars, every bar in step.
- **Native on both surfaces.** Terminal: a character line with Nerd Font or Unicode icons that fits itself to the window width. Desktop app: an SVG row that spreads across the full width and wraps when the window is narrow, with limit bars and a context dot matrix that both stretch with the window, and light and dark mode.
- **Light.** No files read, no processes, no network. It only listens to the usage figures Claude Code already has.

## Requirements

- Claude Code **2.1.287 or newer** (the release that introduced mods), in the terminal or the desktop app's Code tab
- A Claude subscription for the 5h and 7d figures. Without one, the band shows the context window and cache hit rate; on the desktop, while the context window is the only group, its name `Context` fills the left side.
- **Recommended terminal: [Ghostty](https://ghostty.org).** It ships the icon font the band uses, so you get the full look with no setup. Other terminals work too, with simpler icons.

## Installation

Run these two commands inside Claude Code:

```
/plugin marketplace add SorcererAres/CC-Usage-Band
/plugin install usage-band@sorcerer-usage-band
```

Then **open a new session**. The band appears above the prompt. That's it, nothing to configure.

- Want it in the current session right away? Run `/reload-plugins`.
- The 5h and 7d figures show up after Claude's first reply in the session.

To try it for one session from a local checkout instead:

```bash
git clone https://github.com/SorcererAres/CC-Usage-Band.git
claude --plugin-dir CC-Usage-Band/usage-band
```

**Update**

```
/plugin marketplace update sorcerer-usage-band
```

**Uninstall**

```
/plugin uninstall usage-band@sorcerer-usage-band
```

## Configuration

Nothing to set up. The band picks its terminal icons by itself: Nerd Font icons in Ghostty, plain Unicode elsewhere. The desktop app draws its own icons.

If your terminal shows boxes instead of icons, or you use a Nerd Font in another terminal, set `USAGE_BAND_ICONS` in your shell profile (e.g. `~/.zshrc`) and start a new session:

```bash
export USAGE_BAND_ICONS=unicode   # auto (default) · nerd · unicode · ascii
```

**Thresholds and colors** can be changed too, though you never have to: the defaults are what [Features](#features) describes. Open `/config` in Claude Code and find the usage-band rows; the mod reloads when one changes.

| Option | Default | What it does |
| --- | --- | --- |
| `limitWarn` | `80` | The 5h and 7d limits turn the warning color at this percent used |
| `contextWarn` | `80` | The context window turns the warning color at this percent full |
| `cacheWarn` | `50` | The cache hit rate turns the warning color below this percent |
| `colorFiveHour` | `#6a9bcc` | Color of the 5h limit |
| `colorSevenDay` | `#4f7aa6` | Color of the 7d limit |
| `colorContext` | `#d97757` | Color of the context window |
| `colorCache` | `#788c5d` | Color of the cache hit rate |
| `colorWarn` | `#b8433b` | The warning color |

Thresholds run from 0 to 100. Colors are `#rrggbb` or `#rgb`; an invalid one falls back to its default. The values live in `settings.json` under `pluginConfigs["usage-band"].options`, which you can also edit by hand.

## What the numbers mean

| Metric | Source | Notes |
| --- | --- | --- |
| 5h / 7d | The rate-limit windows Claude Code reads from each API response | Rounded to whole percent. The reset time counts down every minute. Once the reset time passes with no new response in the session, the window shows 0% and no countdown. |
| Context | The last request's input: uncached + cache reads + cache writes | Against the current model's window, so 1M and 200K models both read right. On desktop the dot matrix steps up in columns as the window widens: 2×10, 2×20, 2×25 or 2×50, each dot 5%, 2.5%, 2% or 1% of the window. It fills the top row first. |
| Cache hit | Last turn's `cache_read / (input + cache_read + cache_write)` | Summed over every request in the turn. Subagent turns are not counted. |

## Terminal compatibility

| Terminal | Icons with `auto` | Colors |
| --- | --- | --- |
| Ghostty | Nerd Font (built in) | Truecolor |
| iTerm2, WezTerm, kitty, Warp | Unicode (`≡` `●`) | Truecolor |
| macOS Terminal | Unicode | 256 colors, mapped automatically |
| Anything else | Unicode | Whatever the terminal reports |

If icons show as boxes, set `USAGE_BAND_ICONS=unicode` (see [Configuration](#configuration)).

`■`, `●`, `≡`, `·` and the Nerd Font icons are East Asian Ambiguous width: a CJK locale, or a terminal set to draw them double-width, gives each two columns. The band budgets them two columns when it fits itself to the width, so it never wraps; on a narrow terminal it drops the bars a little sooner. Run `/usage-band-preview` to compare every style in your own terminal.

## Privacy and permissions

Mods run with the same access as Claude Code itself and are not sandboxed, so here is everything this one touches:

- **Reads** the session's usage figures (`session.measure`, `turn.complete`, `$.session.usage`) the `TERM_PROGRAM` and `USAGE_BAND_ICONS` environment variables, and the thresholds and colors you set in `/config`
- **Registers** one command, `/usage-band-preview`
- **Draws** the band above the prompt

It does not read or write files, run processes, call the network or send any data anywhere. The whole mod is one file: [`usage-band/hooks/register.tsx`](./usage-band/hooks/register.tsx).

## Development

```
.
├── .claude-plugin/marketplace.json   # the sorcerer-usage-band marketplace
└── usage-band/
    ├── .claude-plugin/plugin.json    # manifest
    ├── hooks/register.tsx            # the mod
    ├── types/index.d.ts              # state contract
    └── tests/band.test.ts
```

```bash
cd usage-band
claude plugin validate .
claude plugin test .
```

While editing, load it with `claude --plugin-dir ./usage-band`; the session reloads it when a file changes. `tsconfig.json` extends `.claude-plugin/types/`, which Claude Code writes when it loads the mod (it is git-ignored), so load it this way once before type-checking in an editor.

Issues and pull requests are welcome.

## Screenshots

These images are rendered from what the mod outputs, inside a frame styled after Claude Code; they are not screenshots of the app. On the desktop the graphics are the mod's SVG and the text is set in Anthropic Sans the way Claude draws it; Claude decides the text size and color, so those are approximate here.

**Desktop app, light mode**

<img src="docs/images/desktop-light-app.png" alt="usage-band in the desktop app, light mode" width="760">

**Desktop app, dark mode** (the 5h limit past its threshold, in the warning color)

<img src="docs/images/desktop-dark.png" alt="usage-band in the desktop app, dark mode" width="760">

**Terminal** (Unicode icon style). Narrow terminals drop the bars first, then the reset times. In Ghostty the icons switch to Nerd Font glyphs. Run `/usage-band-preview` to see every terminal style side by side.

<img src="docs/images/terminal.png" alt="usage-band in a terminal" width="760">

## Changelog

### 2.0.1 (2026-10-04)

The author and marketplace name are now SorcererAres's own, so it no longer clashes with another marketplace of the same name.

- **Author**: the plugin and the marketplace list SorcererAres as author.
- **Marketplace renamed**: from `cc-usage-band` to `sorcerer-usage-band`, so it no longer clashes with another marketplace of the same name. The install command is now `/plugin install usage-band@sorcerer-usage-band`.
- **Moving from the old name**: if you installed under the old name, remove it and install under the new one:

  ```
  /plugin uninstall usage-band@cc-usage-band
  /plugin marketplace remove cc-usage-band
  /plugin marketplace add SorcererAres/CC-Usage-Band
  /plugin install usage-band@sorcerer-usage-band
  ```

### 2.0.0 (2026-10-04)

On the desktop, Claude now draws the text, so it matches the app's font.

- **Claude's own font**: text such as `5h`, `29%`, `3h41m` and `412K/1M` is no longer drawn inside the SVG; Claude draws it, in the app's Anthropic Sans and its text color, following light and dark mode. Text inside the SVG could not use the app's bundled font and showed in the system font, SF Pro.
- **Only the graphics stay SVG**: bars, dots, icons and separators are unchanged, and the shine still runs in step.
- **A mid-tone warning color for text**: app text takes a single color, so the warning red is set to a lightness that reads on both the light and the dark band (about 3.7:1).
- **Accessibility**: the first graphic of each group carries that group's description (e.g. "5-hour limit 29% used") for screen readers.
- Claude now sets the text size and weight; figures may shift by a pixel or two as they change.
- Version 2.0.0, since the desktop band is drawn in a new way.
- **Docs**: the README previews are re-rendered for the new drawing, with the desktop text set in Anthropic Sans.

### 1.9.0 (2026-10-04)

The palette now follows Claude's brand colors.

- **New default colors**: the 5h limit in blue `#6a9bcc`, the 7d limit in a deeper blue `#4f7aa6`, the context window in Claude orange `#d97757` and the cache hit rate in olive `#788c5d`. The warning color is a deeper red, `#b8433b`, set well apart from the orange.
- **Neutral figures**: numbers and labels stay a neutral warm dark gray (a warm light gray in dark mode) and take the warning color only past a threshold. In the terminal they use the terminal's own foreground color.
- **Color only on the graphics**: bars, dots and icons are slightly deepened in light mode and lifted in dark mode so they read on both; the tracks under the bars and dots are a shared warm gray.
- **Easier to read**: secondary text such as the countdowns and `/1M` is darker in light mode, raising its contrast from 3.28 to 4.6. Graphics stay at 3:1 or more and text at 4.5:1 or more in both modes.
- The color options in `/config` default to the new palette; set them there to bring the old colors back.
- **Docs**: the README screenshots are replaced with previews of the band rendered in the new palette, in place of the earlier app screenshots, and are marked as rendered previews rather than app screenshots.

### Earlier versions

- **1.8.0**: a shorter band on the desktop, about 41px tall instead of about 51px.
- **1.7.0**: the session cost is gone (before the first reply a subscription looked like a pay-as-you-go account and showed a cost it would never be charged). When the context window is the only group on the desktop, its name `Context` shows on the left.
- **1.6.0**: the session cost in the terminal too (removed in 1.7.0).
- **1.5.0**: the context dot matrix steps through whole-percent sizes (2×10, 2×20, 2×25, 2×50); a lone group sits centered; pay-as-you-go accounts saw the session cost (removed in 1.7.0).
- **1.4.0**: the desktop context dot matrix stretches with the window.
- **1.3.0**: the desktop limit bars stretch with the window.
- **1.2.0**: the desktop band spreads across the full width and wraps when the window is narrow.
- **1.1.0 / 1.0.7**: fixes the band wrapping in CJK terminals, the terminal animation redrawing nonstop, stale readings after a limit resets and a possible `NaN%` cache hit rate; thresholds and colors are configurable in `/config`.

## License

[MIT](./LICENSE)
