# usage-band

A Claude Code mod that puts a one-line band above the prompt with what you need to keep an eye on while you work:

- **5h / 7d** — how much of your 5-hour and 7-day rate-limit windows is used, and when each resets
- **Context** — tokens in the context window out of its size
- **Cache hit** — how much of the last turn's input the prompt cache served

The figures stay neutral and the graphics carry Claude's brand colors (blue for the limits, Claude orange for the context, olive for the cache); a metric turns red when it needs attention: by default a limit or the context past 80%, or a cache hit rate under 50% (both configurable, see Settings). The limit bars carry a slow shine that sweeps left to right, in step across bars.

> **What's new in 2.0.0**
>
> - On the desktop, Claude now draws the text, so it uses the app's own font (Anthropic Sans) and follows light and dark mode.
> - Colors that match Claude: neutral figures, with the bars, dots and icons in Claude's brand colors (since 1.9.0).
> - Warning text at a lightness that reads on both light and dark bands.
>
> Already installed? Run `/plugin marketplace update sorcerer-usage-band`, then `/plugin update usage-band@sorcerer-usage-band`, and open a new session. The full list is in the [changelog](https://github.com/SorcererAres/CC-Usage-Band/blob/main/CHANGELOG.md).

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
/plugin install usage-band@sorcerer-usage-band
```

Then open a new session (or run `/reload-plugins`). Nothing to configure. Best in [Ghostty](https://ghostty.org), which ships the icon font.

If `/plugin` isn't available (on the desktop, say), run the same commands in a system terminal with `claude plugin` in place of `/plugin`.

To update, run both of these, then open a new session:

```
/plugin marketplace update sorcerer-usage-band
/plugin update usage-band@sorcerer-usage-band
```

## Settings

Terminal icons are picked automatically: Nerd Font icons in Ghostty, plain Unicode elsewhere. To override, set `USAGE_BAND_ICONS` in your shell profile to `auto`, `nerd`, `unicode` or `ascii`, e.g. `export USAGE_BAND_ICONS=unicode`.

The warning thresholds and the colors are plugin options: `limitWarn` (default 80), `contextWarn` (80), `cacheWarn` (50), and `colorFiveHour`, `colorSevenDay`, `colorContext`, `colorCache`, `colorWarn` as `#rrggbb` or `#rgb` hex colors. An invalid value falls back to its default. Set them in `/config` or with `/plugin configure usage-band@sorcerer-usage-band`; in a system terminal, pipe them as JSON to `claude plugin configure usage-band@sorcerer-usage-band --values-stdin` and restart Claude Code.

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

See [CHANGELOG.md](https://github.com/SorcererAres/CC-Usage-Band/blob/main/CHANGELOG.md) for every version.

## License

[MIT](./LICENSE)
