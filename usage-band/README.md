# usage-band

A Claude Code mod that puts a one-line band above the prompt with what you need to keep an eye on while you work:

- **5h / 7d** — how much of your 5-hour and 7-day rate-limit windows is used, and when each resets
- **Context** — tokens in the context window out of its size
- **Cache hit** — how much of the last turn's input the prompt cache served

The figures stay neutral and the graphics carry Claude's brand colors (blue for the limits, Claude orange for the context, olive for the cache); a metric turns red when it needs attention: by default a limit or the context past 80%, or a cache hit rate under 50% (both configurable, see Settings). The limit bars carry a slow shine that sweeps left to right, in step across bars.

## How it looks

**Terminal**

```
5h ■■■■■■■■ 78% · 1h18m  7d ■■■■■■■■ 48% · 5d3h  󰌨 398K/1M  󰓾 100%
```

The line fits itself to the terminal width: on a narrow terminal it drops the bars first, then the countdowns.

**Desktop app (Code tab)**

A row of SVG groups that spreads across the full width of the band and wraps onto a second line when the window is narrow: limit bars that stretch with the window, with the figure and reset time beside them, the context window as a two-row dot matrix that steps up from 2×10 to 2×50 as the window widens (each dot 5%, 2.5%, 2% or 1% of the window), and the cache hit rate. When the context window is the only group (no rate limits and no cache hit rate yet), its name `Context` sits on the left and the dots on the right. Hairlines separate the groups. It follows the app's light and dark mode.

## Install

```
/plugin marketplace add SorcererAres/CC-Usage-Band
/plugin install usage-band@cc-usage-band
```

Then open a new session (or run `/reload-plugins`). Nothing to configure. Best in [Ghostty](https://ghostty.org), which ships the icon font.

## Settings

Terminal icons are picked automatically: Nerd Font icons in Ghostty, plain Unicode elsewhere. To override, set `USAGE_BAND_ICONS` in your shell profile to `auto`, `nerd`, `unicode` or `ascii`, e.g. `export USAGE_BAND_ICONS=unicode`.

The warning thresholds and the colors are plugin options, set in `/config`: `limitWarn` (default 80), `contextWarn` (80), `cacheWarn` (50), and `colorFiveHour`, `colorSevenDay`, `colorContext`, `colorCache`, `colorWarn` as `#rrggbb` hex colors. An invalid value falls back to its default.

Run `/usage-band-preview` to see the band in every terminal style side by side, including how a 256-color terminal shows the colors.

## Notes

- The 5h / 7d figures come from your subscription's rate-limit headers, so they appear after the first response of a session and only on a subscription.
- The cache hit rate is the last turn's cache reads over all its input (uncached + cache reads + cache writes), summed over the turn's requests.
- On the desktop the text is drawn by Claude itself, so it uses the app's own font (Anthropic Sans) and text color in both light and dark mode; only the bars, dots and icons are SVG.

## What it can reach

Mods run with the same access as Claude Code itself; they are not sandboxed. This one only:

- reads the session's usage figures (`$.session.usage`, `session.measure`, `turn.complete`)
- reads the `TERM_PROGRAM` and `USAGE_BAND_ICONS` environment variables to pick terminal icons, and its own plugin options for thresholds and colors
- registers the `/usage-band-preview` command and draws the band

It reads no files, runs no processes and makes no network requests.

## Development

```bash
claude plugin validate .
claude plugin test .
```

## Changelog

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
- **Docs**: the README screenshots are replaced with previews of the band rendered in the new palette, in place of the original author's app screenshots, and are marked as rendered previews rather than app screenshots.

### Earlier versions

- **1.8.0**: a shorter band on the desktop, about 41px tall instead of about 51px.
- **1.7.0**: the session cost is gone (before the first reply a subscription looked like a pay-as-you-go account and showed a cost it would never be charged). When the context window is the only group on the desktop, its name `Context` shows on the left.
- **1.6.0**: the session cost in the terminal too (removed in 1.7.0).
- **1.5.0**: the context dot matrix steps through whole-percent sizes (2×10, 2×20, 2×25, 2×50); a lone group sits centered; pay-as-you-go accounts saw the session cost (removed in 1.7.0).
- **1.4.0**: the desktop context dot matrix stretches with the window.
- **1.3.0**: the desktop limit bars stretch with the window.
- **1.2.0**: the desktop band spreads across the full width and wraps when the window is narrow.
- **1.1.0 / 1.0.7**: forked from [JetsonChan/CC-Usage-Band](https://github.com/JetsonChan/CC-Usage-Band) 1.0.6. Fixes the band wrapping in CJK terminals, the terminal animation redrawing nonstop, stale readings after a limit resets and a possible `NaN%` cache hit rate; thresholds and colors are configurable in `/config`.

## License

[MIT](./LICENSE)
