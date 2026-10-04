import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Limit, Measure, Style, TurnTokens } from '../types'

const measure = atom({ plugin: 'usage-band', key: 'measure' } as const, null)
const turn = atom({ plugin: 'usage-band', key: 'turn' } as const, null)
const now = atom({ plugin: 'usage-band', key: 'now' } as const, 0)
const phase = atom({ plugin: 'usage-band', key: 'phase' } as const, 0)
const style = atom({ plugin: 'usage-band', key: 'style' } as const, 'unicode')

// One hue per metric; the warning color takes over only when a metric is in trouble.
// 默认配色取自 Claude 的品牌色：额度用蓝（7d 稍深）、上下文用 Claude 橙、缓存用橄榄绿，
// 警示用更深的红，与橙色拉开距离。数字与标签保持中性，只有图形带颜色
// 颜色与阈值：默认值如下，可在 /config 里按插件的 userConfig 字段逐项改
export type Theme = {
  hue: { five: string; seven: string; ctx: string; cache: string }
  warn: string
  // 额度与上下文达到该百分比变成警示色；缓存命中率低于该百分比变成警示色
  limitWarn: number
  contextWarn: number
  cacheWarn: number
}
export const DEFAULT_THEME: Theme = {
  hue: { five: '#6a9bcc', seven: '#4f7aa6', ctx: '#d97757', cache: '#788c5d' },
  warn: '#b8433b',
  limitWarn: 80,
  contextWarn: 80,
  cacheWarn: 50,
}
// 终端进度条的底轨：暖灰
const TRACK = '#57534c'

// 把 #rgb / #rrggbb 规整成小写 #rrggbb；不合法时用默认值，免得一个手误让整行颜色算错
export const parseColor = (v: unknown, fallback: string): string => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  if (/^#[0-9a-f]{6}$/.test(s)) return s
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${[...s.slice(1)].map(c => c + c).join('')}`
  return fallback
}

// 阈值限制在 0–100；空值、非数字时用默认值
export const parsePercent = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback
}

// 从插件选项（plugin.json 的 userConfig）得到这次加载用的配色与阈值
export const themeFrom = (o: PluginOptions = {}): Theme => {
  const d = DEFAULT_THEME
  return {
    hue: {
      five: parseColor(o.colorFiveHour, d.hue.five),
      seven: parseColor(o.colorSevenDay, d.hue.seven),
      ctx: parseColor(o.colorContext, d.hue.ctx),
      cache: parseColor(o.colorCache, d.hue.cache),
    },
    warn: parseColor(o.colorWarn, d.warn),
    limitWarn: parsePercent(o.limitWarn, d.limitWarn),
    contextWarn: parsePercent(o.contextWarn, d.contextWarn),
    cacheWarn: parsePercent(o.cacheWarn, d.cacheWarn),
  }
}
const FRAME_MS = 200
const PREVIEW = 'usage-band-preview'

export const GLYPHS: Record<Style, { ctx: string; hit: string; fill: string; track: string }> = {
  nerd: { ctx: '\u{F0328} ', hit: '\u{F04FE} ', fill: '■', track: '■' },
  unicode: { ctx: '≡ ', hit: '● ', fill: '■', track: '■' },
  ascii: { ctx: 'ctx ', hit: 'hit ', fill: '#', track: '-' },
}

// Terminals known to ship Nerd Font symbols without the user installing a font
const NERD_BUILTIN = new Set(['ghostty'])

export const detectStyle = (setting: string, termProgram: string | undefined): Style => {
  if (setting === 'nerd' || setting === 'unicode' || setting === 'ascii') return setting
  return NERD_BUILTIN.has((termProgram ?? '').toLowerCase()) ? 'nerd' : 'unicode'
}

export const fmtTokens = (n: number): string => {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${+(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`
  return String(n)
}

export const fmtLeft = (ms: number): string => {
  const mins = Math.max(0, Math.round(ms / 60_000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}d${h}h`
  if (h > 0) return `${h}h${m}m`
  return `${m}m`
}

export const hitRate = (t: TurnTokens): number | null => {
  const total = t.input + t.cacheRead + t.cacheWrite
  // 总量为 0 或有字段缺失（NaN）时都不显示，避免出现 NaN%
  if (!(total > 0) || !Number.isFinite(t.cacheRead)) return null
  return Math.round((t.cacheRead / total) * 100)
}

// 某个额度窗口此刻该显示的读数。重置时间已过而会话里还没有新的响应时，旧读数已经失效：
// 新窗口要等下一次请求才开始计，所以按 0% 显示，也不再显示停在 0m 的倒计时
export const limitNow = (l: Limit, at: number): { pct: number; left: string } => {
  const ms = l.resetsAt ? Date.parse(l.resetsAt) - at : NaN
  if (ms <= 0) return { pct: 0, left: '' }
  return { pct: Math.round(l.percentUsed), left: Number.isFinite(ms) ? fmtLeft(ms) : '' }
}

// 上下文占比；宿主没给 percent 时用 tokens / window 兜底，否则上下文永远不会变红
export const ctxPercent = (c: Measure['context']): number =>
  c.percent ?? (c.window > 0 ? ((c.tokens ?? 0) / c.window) * 100 : 0)

// Blend a #rrggbb color toward white (t > 0) or black (t < 0) by |t|
export const lighten = (hex: string, t: number): string => {
  const n = parseInt(hex.slice(1), 16)
  const target = t >= 0 ? 255 : 0
  const ch = (v: number) => Math.round(v + (target - v) * Math.abs(t)).toString(16).padStart(2, '0')
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`
}

// Nearest xterm-256 color, to preview how a 256-color terminal shows the band
export const to256 = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16)
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const
  const levels = [0, 95, 135, 175, 215, 255]
  const nearest = (v: number) => levels.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a))
  const cube = rgb.map(nearest)
  const avg = (rgb[0] + rgb[1] + rgb[2]) / 3
  const g = Math.min(238, Math.max(8, 8 + Math.round((avg - 8) / 10) * 10))
  const dist = (c: readonly number[]) => c.reduce((s, v, i) => s + (v - rgb[i]!) ** 2, 0)
  const pick = dist(cube) <= dist([g, g, g]) ? cube : [g, g, g]
  return `#${pick.map(v => v.toString(16).padStart(2, '0')).join('')}`
}

export type Span = { text: string; color?: string; dim?: boolean }
export type Look = { style: Style; colors: 'true' | '256' }

const SEP: Span = { text: '  ' }

export const width = (spans: Span[]) => spans.reduce((n, s) => n + [...s.text].length, 0)

// 东亚「宽度不确定」（Ambiguous）字符：这一行用到的 · ≡ ■ ●，以及 Nerd Font 图标所在的私用区。
// 在 CJK 区域设置或开启了「Ambiguous characters are double-width」的终端里，它们占两列。
// 终端的实际设置读不到，估宽时一律按两列算：宁可早一步降级，也不让这一行溢出折行
const AMBIGUOUS: readonly (readonly [number, number])[] = [
  [0x00b7, 0x00b7],
  [0x2190, 0x26ff],
  [0xe000, 0xf8ff],
  [0xf0000, 0x10fffd],
]
const cellsOf = (ch: string) => {
  const cp = ch.codePointAt(0) ?? 0
  return AMBIGUOUS.some(([lo, hi]) => cp >= lo && cp <= hi) ? 2 : 1
}

// 这一行在终端里最多占多少列（宽度不确定的字符按两列计）
export const columns = (spans: Span[]) =>
  spans.reduce((n, s) => n + [...s.text].reduce((w, c) => w + cellsOf(c), 0), 0)

// A bar whose filled part runs from a deep shade of its color to a bright one,
// with a soft highlight sweeping left to right on top
export const bar = (pct: number, cells: number, color: string, frame: number, s: Style = 'unicode'): Span[] => {
  const g = GLYPHS[s]
  const filled = Math.max(pct > 0 ? 1 : 0, Math.min(cells, Math.round((pct / 100) * cells)))
  // Same period for every bar, so all highlights travel in step
  const pos = frame % (cells + 5)
  const spans: Span[] = []
  for (let i = 0; i < filled; i++) {
    const shade = filled === 1 ? 0 : -0.15 + (0.35 * i) / (filled - 1)
    const glow = i === pos ? 0.55 : i === pos - 1 || i === pos + 1 ? 0.25 : 0
    spans.push({ text: g.fill, color: lighten(lighten(color, shade), glow) })
  }
  if (cells > filled) spans.push({ text: g.track.repeat(cells - filled), color: TRACK })
  return spans
}

// detail 2: bars + countdowns; 1: no bars; 0: bare numbers
export const layout = (
  m: Measure | null,
  t: TurnTokens | null,
  at: number,
  detail: 0 | 1 | 2,
  frame = 0,
  look: Look = { style: 'unicode', colors: 'true' },
  theme: Theme = DEFAULT_THEME,
): Span[] => {
  const g = GLYPHS[look.style]
  const groups: Span[][] = []

  const limit = (label: string, l: Limit | undefined, hue: string) => {
    if (!l) return
    const { pct, left } = limitNow(l, at)
    // 标签与数字用终端前景色，超过阈值才变成警示色；进度条带各自的颜色
    const warn = pct >= theme.limitWarn ? theme.warn : undefined
    const out: Span[] = [{ text: `${label} `, color: warn }]
    if (detail === 2) out.push(...bar(pct, 8, warn ?? hue, frame, look.style), { text: ' ' })
    out.push({ text: `${pct}%`, color: warn })
    if (detail >= 1 && left) out.push({ text: ` · ${left}`, dim: true })
    groups.push(out)
  }
  limit('5h', m?.rateLimits.find(l => l.kind === 'five_hour'), theme.hue.five)
  limit('7d', m?.rateLimits.find(l => l.kind === 'seven_day'), theme.hue.seven)

  if (m) {
    const pct = ctxPercent(m.context)
    const warn = pct >= theme.contextWarn ? theme.warn : undefined
    groups.push([
      { text: g.ctx, color: warn ?? theme.hue.ctx },
      { text: fmtTokens(m.context.tokens ?? 0), color: warn },
      { text: `/${fmtTokens(m.context.window)}`, dim: true },
    ])
  }

  const hit = t ? hitRate(t) : null
  if (hit !== null) {
    const warn = hit < theme.cacheWarn ? theme.warn : undefined
    groups.push([
      { text: g.hit, color: warn ?? theme.hue.cache },
      { text: `${hit}%`, color: warn },
    ])
  }

  const spans = groups.flatMap((grp, i) => (i === 0 ? grp : [SEP, ...grp]))
  return look.colors === '256' ? spans.map(s => (s.color ? { ...s, color: to256(s.color) } : s)) : spans
}

// 从最详细的样式往下试，取第一个放得下的；连 detail 0 都放不下时也只能用它
export const fit = (
  m: Measure | null,
  t: TurnTokens | null,
  at: number,
  cols: number,
  frame: number,
  look: Look,
  theme: Theme = DEFAULT_THEME,
) => {
  for (const detail of [2, 1] as const) {
    const spans = layout(m, t, at, detail, frame, look, theme)
    if (columns(spans) <= cols) return { spans, detail }
  }
  return { spans: layout(m, t, at, 0, frame, look, theme), detail: 0 as const }
}

// 终端这一行有没有正在扫光的进度条：只有 detail 2 才画进度条，扫光也只落在已填充的格子上
const hasShine = (m: Measure | null, at: number, detail: 0 | 1 | 2) =>
  detail === 2 &&
  (m?.rateLimits ?? []).some(l => (l.kind === 'five_hour' || l.kind === 'seven_day') && limitNow(l, at).pct > 0)


// ---- Desktop: the band is one SVG drawn as a plain image. The SMIL shine runs in an image too,
// and an image redraws in place, where an interactive (framed) SVG reloads its frame and blinks
// the whole band on every redraw.

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// 每张分组图片高 D.h。纵向位置都相对中线 MID 来写，调高度只改 D.h：
// 原来是 30px，内容上下各空约 9.5px，叠上宿主底框的内边距显得偏松，现在压到 20px
const D = { h: 20, gap: 30, inner: 7, sm: 13, md: 13, base: 13, barW: 76, barH: 6 }
const MID = D.h / 2
// CAP: the band the figures' cap height occupies (Inter 13px on baseline BASE);
// icons, dots and the inner rule are sized to it so the row reads one height
const CAP = { top: MID - 5.25, h: 10 }
const BASE = MID + 4.5
// Advance widths in em for Inter with tabular figures (SF Pro, the fallback, runs within a few %).
// Each text also sets textLength to this width, so a font that runs wider or narrower only
// changes letter spacing and never pushes into the next element.
const ADVANCE: Record<string, number> = { h: 0.58, d: 0.6, m: 0.9, K: 0.64, M: 0.84, '%': 0.84, '/': 0.36, '.': 0.27, ' ': 0.26 }
// Extra space between letters, in px; textLength spreads it evenly across each string
const TRACKING = 0.2
const textW = (v: string, size: number) =>
  [...v].reduce((w, c) => w + (c >= '0' && c <= '9' ? 0.62 : (ADVANCE[c] ?? 0.6)), 0) * size +
  TRACKING * Math.max(0, [...v].length - 1)

const pinW = (v: string, size: number) => `textLength="${textW(v, size).toFixed(1)}" lengthAdjust="spacing"`
// 数字与标签：平时是中性的暖深灰（深色模式下暖浅灰）；超过阈值时用警示色，深色模式下调亮
const ink = (warn: string | undefined, x: number, y: number, v: string, size: number) =>
  warn
    ? `<text x="${x}" y="${y}" font-size="${size}" ${pinW(v, size)} class="ink" style="--l:${warn};--d:${lighten(warn, 0.35)}">${esc(v)}</text>`
    : `<text x="${x}" y="${y}" font-size="${size}" ${pinW(v, size)} class="num">${esc(v)}</text>`
// 图形（进度条、点阵、图标）的颜色：浅色模式略压暗、深色模式略调亮，两种底色上都看得清。
// 元素用 class="gf"（填充）或 "gs"（描边）取 --g
const paint = (color: string) => `style="--gl:${lighten(color, -0.12)};--gd:${lighten(color, 0.12)}"`
const mute = (x: number, y: number, v: string, size: number) =>
  `<text x="${x}" y="${y}" font-size="${size}" ${pinW(v, size)} class="mute">${esc(v)}</text>`

// 扫光动画的起点占位符：整张拼图（去重比较、测试）里换成 0s，分组图片里换成按时钟对齐的相位
const BEGIN = '{{shine-begin}}'
export const SHINE_MS = 2600

// stat: type, icons and rules; motion: bars and dots with their shine
type Layers = { stat: string; motion: string }
type Group = { width: number; draw: (x: number) => Layers }

// 5h 60% ▬▬▬▬── 1h49m: the figure first, so the state reads before the bar
// 5h ▬▬▬▬▬▬──── 69% │ 1h31m: label, bar, figure, then when it resets
const limitGroup = (
  id: string,
  label: string,
  l: Limit,
  hue: string,
  at: number,
  theme: Theme,
  barW: number = D.barW,
): Group => {
  const { pct, left } = limitNow(l, at)
  const warn = pct >= theme.limitWarn ? theme.warn : undefined
  const color = warn ?? hue
  const pctText = `${pct}%`
  const labelW = textW(label, D.base) + D.inner
  const pctW = textW(pctText, D.base)
  const width = labelW + barW + D.inner + pctW + (left ? D.inner * 2 + 1 + textW(left, D.sm) : 0)
  const fillW = Math.max(pct > 0 ? D.barH : 0, Math.min(barW, (barW * pct) / 100))
  return {
    width,
    draw: x => {
      const bx = x + labelW
      const y = (D.h - D.barH) / 2
      const r = D.barH / 2
      const px = bx + barW + D.inner
      const motion = [
        `<defs><clipPath id="c-${id}"><rect x="${bx}" y="${y}" width="${fillW}" height="${D.barH}" rx="${r}"/></clipPath></defs>`,
        `<rect x="${bx}" y="${y}" width="${barW}" height="${D.barH}" rx="${r}" class="track"/>`,
        `<rect x="${bx}" y="${y}" width="${fillW}" height="${D.barH}" rx="${r}" class="g gf" ${paint(color)}/>`,
        // The shine crosses the whole bar on one shared clock and shows only over the fill,
        // so both bars' shines sit at the same spot at every moment
        `<g clip-path="url(#c-${id})"><rect y="${y}" width="18" height="${D.barH}" fill="url(#shine)">` +
          `<animate attributeName="x" values="${bx - 18};${bx + barW};${bx + barW}" keyTimes="0;0.62;1" dur="2.6s" begin="${BEGIN}" repeatCount="indefinite"/></rect></g>`,
      ]
      const stat = [ink(warn, x, BASE, label, D.base), ink(warn, px, BASE, pctText, D.base)]
      if (left) {
        const rx = px + pctW + D.inner
        stat.push(`<rect x="${rx}" y="${CAP.top}" width="1" height="${CAP.h}" class="rule"/>`, mute(rx + 1 + D.inner, BASE, left, D.sm))
      }
      return { stat: stat.join(''), motion: motion.join('') }
    },
  }
}

// Three stacked sheets: the context window
const layersIcon = () =>
  `<g fill="none" class="gs" stroke-width="1.2" stroke-linejoin="round">` +
  `<path d="M5 0.6 L9.4 2.8 L5 5 L0.6 2.8 Z" class="gf" fill-opacity="0.25"/>` +
  `<path d="M0.6 5.2 L5 7.4 L9.4 5.2"/><path d="M0.6 7.2 L5 9.4 L9.4 7.2"/></g>`

// A target: how much of the prompt the cache hit
const targetIcon = () =>
  `<g fill="none" class="gs" stroke-width="1.2">` +
  `<circle cx="5" cy="5" r="4.4"/><circle cx="5" cy="5" r="2.1"/><circle cx="5" cy="5" r="0.7" class="gf"/></g>`

// 只剩上下文一组时，左侧显示它的名称：和右侧的点阵同属一个模块，上下文超过阈值时一起变成警示色
export const CTX_LABEL = 'Context'
const labelGroup = (text: string, warn: string | undefined): Group => ({
  width: textW(text, D.base),
  draw: x => ({ stat: ink(warn, x, BASE, text, D.base), motion: '' }),
})

// Icons are drawn in a CAP.h square, outer stroke edge included
const ICON = CAP.h

// icon · NUMBER suffix
const typeGroup = (icon: () => string, hue: string, num: string, suffix: string, warn?: string): Group => {
  const lw = ICON + 6
  const nw = textW(num, D.md)
  const sw = suffix ? textW(suffix, D.sm) + 1 : 0
  return {
    width: lw + nw + sw,
    draw: x => {
      const nx = x + lw
      return {
        stat:
          `<g transform="translate(${x} ${CAP.top})" class="g" ${paint(warn ?? hue)}>${icon()}</g>` +
          ink(warn, nx, BASE, num, D.md) +
          (suffix ? mute(nx + nw + 1, BASE, suffix, D.sm) : ''),
        motion: '',
      }
    },
  }
}

// Context as a 2-row dot matrix (2×10 by default: one dot per 1/20 of the window), filling the top
// row left to right before the bottom one, with the same shine over the lit dots.
// 桌面端变宽时列数随之增加（点的大小和间距不变），每个点代表的比例相应变小
// Rows sit so the dots' outer edges meet the CAP band: CAP.top + r and CAP.top + CAP.h - r
const DOTS = { cols: 10, pitch: 5, r: 1.6, rows: [CAP.top + 1.6, CAP.top + CAP.h - 1.6] }
const ctxGroup = (
  hue: string,
  tokens: number,
  window: number,
  pct: number,
  cols: number = DOTS.cols,
  warn?: string,
): Group => {
  const color = warn ?? hue
  const lit = Math.min(cols * 2, Math.round((pct / 100) * cols * 2))
  const num = fmtTokens(tokens)
  const suffix = `/${fmtTokens(window)}`
  const lw = ICON + 6
  const matrixW = cols * DOTS.pitch
  return {
    width: lw + matrixW + D.inner + textW(num, D.md) + 1 + textW(suffix, D.sm),
    draw: x => {
      const mx = x + lw
      const dot = (i: number) =>
        `<circle cx="${mx + DOTS.pitch / 2 + (i % cols) * DOTS.pitch}" cy="${DOTS.rows[Math.floor(i / cols)]}" r="${DOTS.r}"/>`
      const on = Array.from({ length: lit }, (_, i) => dot(i)).join('')
      const off = Array.from({ length: cols * 2 - lit }, (_, i) => dot(lit + i)).join('')
      const nx = mx + matrixW + D.inner
      return {
        stat:
          `<g transform="translate(${x} ${CAP.top})" class="g" ${paint(color)}>${layersIcon()}</g>` +
          ink(warn, nx, BASE, num, D.md) +
          mute(nx + textW(num, D.md) + 1, BASE, suffix, D.sm),
        motion:
          `<defs><clipPath id="c-ctx">${on}</clipPath></defs>` +
          `<g class="track">${off}</g>` +
          `<g class="g gf" ${paint(color)}>${on}</g>` +
          `<g clip-path="url(#c-ctx)"><rect y="${MID - 7}" width="18" height="14" fill="url(#shine)">` +
          `<animate attributeName="x" values="${mx - 18};${mx + matrixW};${mx + matrixW}" keyTimes="0;0.62;1" dur="2.6s" begin="${BEGIN}" repeatCount="indefinite"/></rect></g>`,
      }
    },
  }
}

// An image takes its color scheme from the app; a frame (should the band ever be framed) whose color scheme differs from the app's
// gets an opaque canvas behind it (white in a dark app). Declaring both schemes lets it follow the
// app and stay transparent.
const SVG_HEAD =
  `<style>` +
  `:root{color-scheme:light dark;background:transparent}` +
  `text{font-family:Inter,"SF Pro Text",system-ui,-apple-system,"Segoe UI",sans-serif;font-weight:500;font-feature-settings:"tnum","cv05"}` +
  // 底轨统一用品牌暖灰；数字暖深灰、次要文字暖灰；图形色经 --g 在两种模式间切换
  `.track{fill:#b0aea5;fill-opacity:.35}` +
  `.g{--g:var(--gl)}.gf{fill:var(--g)}.gs{stroke:var(--g)}` +
  `.num{fill:#3d3c38}.ink{fill:var(--l)}.mute{fill:#6f6c64;font-weight:400}.rule{fill:#000;fill-opacity:.1}.sep{fill:#000;fill-opacity:.2}` +
  `@media (prefers-color-scheme:dark){.track{fill-opacity:.22}.g{--g:var(--gd)}.num{fill:#e8e6dc}.ink{fill:var(--d)}.mute{fill:#a8a59c}.rule{fill:#fff;fill-opacity:.13}.sep{fill:#fff;fill-opacity:.22}}` +
  `</style>` +
  `<defs><linearGradient id="shine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/>` +
  `<stop offset=".5" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`

const wrap = (width: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${D.h}" viewBox="0 0 ${width} ${D.h}" style="color-scheme:light dark;background:transparent">${SVG_HEAD}${body}</svg>`

export type Part = Layers & { key: string; width: number; alt: string }

// 桌面端可伸缩部分的尺寸：额度进度条长度（px）与上下文点阵列数
export type Stretch = { barW: number; dotCols: number }
export const DEFAULT_STRETCH: Stretch = { barW: D.barW, dotCols: DOTS.cols }

export const desktopParts = (
  m: Measure | null,
  t: TurnTokens | null,
  at: number,
  theme: Theme = DEFAULT_THEME,
  stretch: Stretch = DEFAULT_STRETCH,
): Part[] => {
  const groups: { key: string; g: Group; alt: string }[] = []
  const five = m?.rateLimits.find(l => l.kind === 'five_hour')
  const seven = m?.rateLimits.find(l => l.kind === 'seven_day')
  if (five) {
    const g = limitGroup('5h', '5h', five, theme.hue.five, at, theme, stretch.barW)
    groups.push({ key: '5h', g, alt: `5-hour limit ${limitNow(five, at).pct}% used` })
  }
  if (seven) {
    const g = limitGroup('7d', '7d', seven, theme.hue.seven, at, theme, stretch.barW)
    groups.push({ key: '7d', g, alt: `7-day limit ${limitNow(seven, at).pct}% used` })
  }
  if (m) {
    const pct = ctxPercent(m.context)
    const warn = pct >= theme.contextWarn ? theme.warn : undefined
    // 没有额度、也还没有缓存命中率时（非订阅账号，或会话第一次回复之前）只剩上下文一组：左侧补上它的名称
    if (!five && !seven && !(t && hitRate(t) !== null)) {
      groups.push({ key: 'label', g: labelGroup(CTX_LABEL, warn), alt: CTX_LABEL })
    }
    groups.push({
      key: 'ctx',
      g: ctxGroup(theme.hue.ctx, m.context.tokens ?? 0, m.context.window, pct, stretch.dotCols, warn),
      alt: `context ${fmtTokens(m.context.tokens ?? 0)} of ${fmtTokens(m.context.window)}`,
    })
  }
  const hit = t ? hitRate(t) : null
  if (hit !== null) {
    const g = typeGroup(targetIcon, theme.hue.cache, `${hit}%`, '', hit < theme.cacheWarn ? theme.warn : undefined)
    groups.push({ key: 'hit', g, alt: `cache hit ${hit}%` })
  }
  return groups.map(({ key, g, alt }) => ({ ...g.draw(1), key, alt, width: Math.ceil(g.width + 2) }))
}

// One SVG for the whole band, so every shine runs on the same clock. Groups sit D.gap apart
// with a hairline centred in each gap; the one inside a limit group is shorter and fainter.
export const desktopSvg = (m: Measure | null, t: TurnTokens | null, at: number, theme: Theme = DEFAULT_THEME) => {
  let x = 0
  const body: string[] = []
  desktopParts(m, t, at, theme).forEach((p, i, all) => {
    if (i > 0 && all[i - 1]?.key !== 'label') body.push(`<rect x="${Math.round(x - D.gap / 2)}" y="${MID - 8}" width="1" height="16" class="sep"/>`)
    body.push(`<g transform="translate(${x} 0)">${p.stat}${p.motion}</g>`)
    x += p.width + D.gap
  })
  const width = Math.max(1, Math.ceil(x - D.gap))
  return { svg: wrap(width, body.join('').split(BEGIN).join('0s')), width, height: D.h }
}

// 每张分组图片的 SMIL 时钟从图片载入时起算。把扫光的起点设成「此刻在周期里的相位」取负，
// 同一次绘制载入的图片就都对齐到同一个时钟上，拆成多张图后扫光依旧同步
export const shineBegin = (now: number) => `-${((((now % SHINE_MS) + SHINE_MS) % SHINE_MS) / 1000).toFixed(2)}s`

export type Piece = { key: string; svg: string; width: number; height: number; alt: string }

// 桌面端一列约合多少 CSS 像素。宿主只上报列数：实测这一行 95 列、宽约 768px，约 8.1px/列，取 8 偏保守
export const PX_PER_COL = 8
// 伸缩部分的上下限（进度条长度 px、点阵列数）；估算误差留出的余量（剩下的空隙由外层 space-between 吸收，不会挤到换行）
export const BAR = { min: 40, max: 360, slack: 24 }
// 点阵列数只取这几档，每个点分别代表 5%、2.5%、2%、1%，点亮几个点始终对应整齐的刻度
export const DOT_STEPS = [10, 20, 25, 50] as const

// 进度条和上下文点阵随这一行的宽度伸缩：先按伸缩部分为 0 算出其余内容和组间距占多少，
// 剩下的平分给每条进度条和点阵；点阵取放得下的最大一档列数。没有上报宽度时用默认尺寸
export const fitStretch = (
  m: Measure | null,
  t: TurnTokens | null,
  at: number,
  theme: Theme,
  bodyColumns: number,
): Stretch => {
  if (!(bodyColumns > 0)) return DEFAULT_STRETCH
  const parts = desktopParts(m, t, at, theme, { barW: 0, dotCols: 0 })
  const stretchy = parts.filter(p => p.key === '5h' || p.key === '7d' || p.key === 'ctx').length
  if (stretchy === 0) return DEFAULT_STRETCH
  // 外层 Box 左右各留 1 列内边距
  const room = (bodyColumns - 2) * PX_PER_COL - BAR.slack
  const used = parts.reduce((w, p) => w + p.width, 0) + (parts.length - 1) * D.gap
  const share = (room - used) / stretchy
  return {
    barW: Math.round(Math.min(BAR.max, Math.max(BAR.min, share))),
    dotCols: [...DOT_STEPS].reverse().find(c => c * DOTS.pitch <= share) ?? DOT_STEPS[0],
  }
}

// 水平自适应：每个分组和每条分隔线各是一张图片，由外层弹性布局横向铺满整行，窄时换行
export const desktopPieces = (
  m: Measure | null,
  t: TurnTokens | null,
  at: number,
  theme: Theme = DEFAULT_THEME,
  begin = '0s',
  stretch: Stretch = DEFAULT_STRETCH,
): Piece[] => {
  const pieces: Piece[] = []
  desktopParts(m, t, at, theme, stretch).forEach((p, i, all) => {
    // 名称和点阵是同一个模块，中间不画分隔线
    if (i > 0 && all[i - 1]?.key !== 'label') {
      pieces.push({
        key: `sep-${p.key}`,
        svg: wrap(1, `<rect x="0" y="${MID - 8}" width="1" height="16" class="sep"/>`),
        width: 1,
        height: D.h,
        alt: '',
      })
    }
    const body = `${p.stat}${p.motion}`.split(BEGIN).join(begin)
    pieces.push({ key: p.key, svg: wrap(p.width, body), width: p.width, height: D.h, alt: p.alt })
  })
  return pieces
}

// The desktop app redraws the band, and its frame blinks, on every write a drawing reads. So a
// reading is only written when it changes what the band shows: a new token count that rounds to
// the same figure, or a clock tick that leaves every countdown as it was, writes nothing.
// 比较时要用这次加载的配色与阈值：自定义阈值下跨过阈值只改颜色，用默认值比较会漏掉这次变化
const shown = (m: Measure | null, t: TurnTokens | null, at: number, theme: Theme) => desktopSvg(m, t, at, theme).svg

const tick = async ($: EngineInterface, theme: Theme) => {
  const at = await $.clock.now()
  const [m, t, was] = [await read($, measure), await read($, turn), await read($, now)]
  if (was && shown(m, t, was, theme) === shown(m, t, at, theme)) return
  await update($, now, () => at)
}

const setMeasure = async ($: EngineInterface, next: Measure, theme: Theme) => {
  const [m, t, at] = [await read($, measure), await read($, turn), await read($, now)]
  if (m && shown(m, t, at, theme) === shown(next, t, at, theme)) return
  await update($, measure, () => next)
}

const setTurn = async ($: EngineInterface, next: TurnTokens, theme: Theme) => {
  const [m, t, at] = [await read($, measure), await read($, turn), await read($, now)]
  if (t && shown(m, t, at, theme) === shown(m, next, at, theme)) return
  await update($, turn, () => next)
}

// Shown by the preview when the session has no reading yet
const SAMPLE_MEASURE: Measure = {
  context: { tokens: 176_000, window: 1_000_000, percent: 18 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 42 },
    { kind: 'seven_day', percentUsed: 43 },
  ],
}
const SAMPLE_TURN: TurnTokens = { input: 900, output: 2_000, cacheRead: 170_000, cacheWrite: 1_000 }

const PROFILES: { name: string; look: Look }[] = [
  { name: 'Ghostty', look: { style: 'nerd', colors: 'true' } },
  { name: 'iTerm2 / Warp / WezTerm / kitty', look: { style: 'unicode', colors: 'true' } },
  { name: 'macOS Terminal (256 colors)', look: { style: 'unicode', colors: '256' } },
  { name: 'ascii fallback', look: { style: 'ascii', colors: '256' } },
]

// Icon set override, read from USAGE_BAND_ICONS. It is an environment variable rather than a
// plugin option so a fresh install has nothing to configure.
const ICONS_ENV = 'USAGE_BAND_ICONS'

export const WELCOME =
  'usage-band is on: your 5h and 7d limits, context window and cache hit rate now show above the prompt. ' +
  'The limits fill in after Claude’s first reply.'

export const register: Register = (on, options) => {
  // 选项在 /config 里改动时，模组会带着新选项整体重新加载，所以这里读一次即可
  const theme = themeFrom(options)
  let setting = 'auto'
  // The terminal animates by redrawing; started by its first draw, so a desktop-only session
  // never runs it. A reload drops the timer and this flag together.
  let isAnimating = false
  // 上一次终端绘制里是否有正在扫光的进度条。帧计数只在它为真时推进一格，并由下一次绘制重新置位：
  // 进度条不在屏上（问卷占位、窄屏去掉了进度条、没有额度数据）时帧计数就停下，不再每秒重绘 5 次；
  // 回到屏上的那次绘制会让它继续
  let isShining = false
  // 桌面端上一次画出的分组图片。显示内容不变时原样复用，图片不会重新载入；
  // 内容一变就整组按新相位重建，所有图片一起重新载入，扫光仍然对齐
  let lastBand = ''
  let lastPieces: Piece[] = []

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // 必须写字面量而不能用 ICONS_ENV：引擎靠静态分析列出模组读取的环境变量，传变量会拒绝加载
    setting = ((await $.env.get('USAGE_BAND_ICONS')) ?? 'auto').trim().toLowerCase() || 'auto'
    const term = await $.env.get('TERM_PROGRAM')
    await update($, style, () => detectStyle(setting, term))
    await $.command.register({
      name: PREVIEW,
      description: 'Preview how the usage band looks in different terminals',
    })
    // One welcome after install, so a new user knows what appeared above the prompt
    if ((await $.store.get('welcomed')) !== true) {
      await $.store.set('welcomed', true)
      $.ui.toast(WELCOME, { timeoutMs: 12_000 })
    }
    const usage = await $.session.usage()
    await setMeasure($, { context: usage.context, rateLimits: usage.rateLimits }, theme)
    await tick($, theme)
    $.clock.every(60_000, () => {
      void tick($, theme)
    })
    return result
  })

  on('session.measure', async ($, e, next) => {
    const m: Measure = {
      context: { tokens: e.context.tokens, window: e.context.window, percent: e.context.percent },
      rateLimits: e.rateLimits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })),
    }
    await setMeasure($, m, theme)
    await tick($, theme)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // Main loop only; subagent runs raise their own turn.complete
    if (e.agentId === undefined && e.usage) {
      const u = e.usage
      await setTurn($, {
        input: u.input_tokens,
        output: u.output_tokens,
        cacheRead: u.cache_read_input_tokens,
        cacheWrite: u.cache_creation_input_tokens,
      }, theme)
    }
    return next(e)
  })

  on('command.run', { command: PREVIEW }, async () => ({
    text: `usage-band style preview (${ICONS_ENV}: ${setting})`,
  }))

  on('ui.render', { component: 'CommandOutput', props: { command: PREVIEW } }, async ($, e) => {
    const m = (await read($, measure)) ?? SAMPLE_MEASURE
    const t = (await read($, turn)) ?? SAMPLE_TURN
    const at = await read($, now)
    const current = await read($, style)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text dimColor>
          {ICONS_ENV}: {setting} → using {current}
        </Text>
        {PROFILES.map(p => (
          <Box key={p.name} flexDirection="column" marginTop={1}>
            <Text dimColor>{p.name}</Text>
            <Box flexDirection="row">
              {layout(m, t, at, 2, 3, p.look, theme).map((s, i) => (
                <Text key={`s${i}`} color={s.color} dimColor={s.dim}>
                  {s.text}
                </Text>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const m = await read($, measure)
    const t = await read($, turn)
    const at = await read($, now)
    if (e.props.hasSurvey || (m === null && t === null)) return next(e)

    // Desktop and mobile animate inside the SVG, so they never read the frame counter
    if (e.surface === 'desktop' || e.surface === 'mobile') {
      const { Box, Svg } = $.ui.resolve(e)
      const stretch = fitStretch(m, t, at, theme, e.props.bodyColumns)
      // 宽度变了（进度条长度、点阵列数变了）也要整组重建
      const band = `${stretch.barW}|${stretch.dotCols}|${desktopSvg(m, t, at, theme).svg}`
      if (band !== lastBand) {
        lastBand = band
        lastPieces = desktopPieces(m, t, at, theme, shineBegin(await $.clock.now()), stretch)
      }
      // 两组及以上时组间距平分剩余空间；只有一组时居中，免得整行偏向左边
      const groupCount = lastPieces.filter(p => !p.key.startsWith('sep-')).length
      return (
        <Box
          flexDirection="row"
          flexWrap="wrap"
          justifyContent={groupCount > 1 ? 'space-between' : 'center'}
          alignItems="center"
          flexGrow={1}
          paddingX={1}
        >
          {lastPieces.map(p => (
            <Svg key={p.key} source={p.svg} alt={p.alt} width={p.width} height={p.height} />
          ))}
        </Box>
      )
    }

    if (!isAnimating) {
      isAnimating = true
      $.clock.every(FRAME_MS, () => {
        if (!isShining) return
        isShining = false
        void update($, phase, f => (f ?? 0) + 1)
      })
    }
    const frame = await read($, phase)
    // The terminal font decides icons; other surfaces (vscode) get the plain set
    const s = e.surface === 'terminal' ? await read($, style) : 'unicode'
    const { spans, detail } = fit(m, t, at, e.props.bodyColumns - 2, frame, { style: s, colors: 'true' }, theme)
    isShining = hasShine(m, at, detail)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" flexWrap="wrap" paddingX={1}>
        {spans.map((sp, i) => (
          <Text key={`s${i}`} color={sp.color} dimColor={sp.dim}>
            {sp.text}
          </Text>
        ))}
      </Box>
    )
  })
}
