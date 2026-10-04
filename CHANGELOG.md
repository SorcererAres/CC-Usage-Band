# Changelog

English · [简体中文](./CHANGELOG.zh-CN.md)

Every change to usage-band, newest first. Versions follow [Semantic Versioning](https://semver.org/). Release notes are also on the [Releases](https://github.com/SorcererAres/CC-Usage-Band/releases) page.

## 2.0.2 (2026-10-04)

License and wording cleanup; features are the same as 2.0.1.

- **Copyright**: `LICENSE` adds `Copyright (c) 2026 SorcererAres`; the existing copyright notice and the MIT terms are unchanged.
- **Wording**: the README, the marketplace description and the repository description now credit SorcererAres only.

## 2.0.1 (2026-10-04)

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

## 2.0.0 (2026-10-04)

On the desktop, Claude now draws the text, so it matches the app's font.

- **Claude's own font**: text such as `5h`, `29%`, `3h41m` and `412K/1M` is no longer drawn inside the SVG; Claude draws it, in the app's Anthropic Sans and its text color, following light and dark mode. Text inside the SVG could not use the app's bundled font and showed in the system font, SF Pro.
- **Only the graphics stay SVG**: bars, dots, icons and separators are unchanged, and the shine still runs in step.
- **A mid-tone warning color for text**: app text takes a single color, so the warning red is set to a lightness that reads on both the light and the dark band (about 3.7:1).
- **Accessibility**: the first graphic of each group carries that group's description (e.g. "5-hour limit 29% used") for screen readers.
- Claude now sets the text size and weight; figures may shift by a pixel or two as they change.
- Version 2.0.0, since the desktop band is drawn in a new way.
- **Docs**: the README previews are re-rendered for the new drawing, with the desktop text set in Anthropic Sans.

## 1.9.0 (2026-10-04)

The palette now follows Claude's brand colors.

- **New default colors**: the 5h limit in blue `#6a9bcc`, the 7d limit in a deeper blue `#4f7aa6`, the context window in Claude orange `#d97757` and the cache hit rate in olive `#788c5d`. The warning color is a deeper red, `#b8433b`, set well apart from the orange.
- **Neutral figures**: numbers and labels stay a neutral warm dark gray (a warm light gray in dark mode) and take the warning color only past a threshold. In the terminal they use the terminal's own foreground color.
- **Color only on the graphics**: bars, dots and icons are slightly deepened in light mode and lifted in dark mode so they read on both; the tracks under the bars and dots are a shared warm gray.
- **Easier to read**: secondary text such as the countdowns and `/1M` is darker in light mode, raising its contrast from 3.28 to 4.6. Graphics stay at 3:1 or more and text at 4.5:1 or more in both modes.
- The color options in `/config` default to the new palette; set them there to bring the old colors back.
- **Docs**: the README screenshots are replaced with previews of the band rendered in the new palette, in place of the earlier app screenshots, and are marked as rendered previews rather than app screenshots.

## Earlier versions

- **1.8.0**: a shorter band on the desktop, about 41px tall instead of about 51px.
- **1.7.0**: the session cost is gone (before the first reply a subscription looked like a pay-as-you-go account and showed a cost it would never be charged). When the context window is the only group on the desktop, its name `Context` shows on the left.
- **1.6.0**: the session cost in the terminal too (removed in 1.7.0).
- **1.5.0**: the context dot matrix steps through whole-percent sizes (2×10, 2×20, 2×25, 2×50); a lone group sits centered; pay-as-you-go accounts saw the session cost (removed in 1.7.0).
- **1.4.0**: the desktop context dot matrix stretches with the window.
- **1.3.0**: the desktop limit bars stretch with the window.
- **1.2.0**: the desktop band spreads across the full width and wraps when the window is narrow.
- **1.1.0 / 1.0.7**: fixes the band wrapping in CJK terminals, the terminal animation redrawing nonstop, stale readings after a limit resets and a possible `NaN%` cache hit rate; thresholds and colors are configurable in `/config`.
