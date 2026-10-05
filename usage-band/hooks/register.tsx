// usage-band：在输入框上方显示 5h / 7d 额度、上下文窗口和缓存命中率。
// 整个模组只有这一个文件：前面是配色、读数的格式化、终端与桌面端的排版，
// 最后的 register 把它们接到引擎的事件上。
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Limit, Measure, Style, TurnTokens } from '../types'

// 模组保存在会话里的状态，类型契约见 ../types/index.d.ts
const measure = atom({ plugin: 'usage-band', key: 'measure' } as const, null)
const turn = atom({ plugin: 'usage-band', key: 'turn' } as const, null)
const now = atom({ plugin: 'usage-band', key: 'now' } as const, 0)
const phase = atom({ plugin: 'usage-band', key: 'phase' } as const, 0)
const style = atom({ plugin: 'usage-band', key: 'style' } as const, 'unicode')

// ---- 配色与阈值

// 每项指标一种颜色；只有指标需要注意时才换成警示色。
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

// ---- 终端图标

// 三套图标与进度条字符：Nerd Font、普通 Unicode、纯 ASCII
export const GLYPHS: Record<Style, { ctx: string; hit: string; fill: string; track: string }> = {
  nerd: { ctx: '\u{F0328} ', hit: '\u{F04FE} ', fill: '■', track: '■' },
  unicode: { ctx: '≡ ', hit: '● ', fill: '■', track: '■' },
  ascii: { ctx: 'ctx ', hit: 'hit ', fill: '#', track: '-' },
}

// 自带 Nerd Font 符号、不用用户另装字体的终端
const NERD_BUILTIN = new Set(['ghostty'])

// 图标样式：手动设置优先；auto 时只有自带 Nerd Font 的终端用 nerd，其余用 unicode
export const detectStyle = (setting: string, termProgram: string | undefined): Style => {
  if (setting === 'nerd' || setting === 'unicode' || setting === 'ascii') return setting
  return NERD_BUILTIN.has((termProgram ?? '').toLowerCase()) ? 'nerd' : 'unicode'
}

// ---- 读数

// token 数的短写法：950、15.6K、100K、1M
export const fmtTokens = (n: number): string => {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${+(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`
  return String(n)
}

// 距重置还有多久：42m、3h14m、5d3h
export const fmtLeft = (ms: number): string => {
  const mins = Math.max(0, Math.round(ms / 60_000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}d${h}h`
  if (h > 0) return `${h}h${m}m`
  return `${m}m`
}

// 缓存命中率：上一轮的缓存读取量占全部输入（未缓存 + 缓存读取 + 缓存写入）的百分比
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

// ---- 颜色运算

// 把 #rrggbb 颜色按 |t| 的比例混向白色（t > 0）或黑色（t < 0）
export const lighten = (hex: string, t: number): string => {
  const n = parseInt(hex.slice(1), 16)
  const target = t >= 0 ? 255 : 0
  const ch = (v: number) => Math.round(v + (target - v) * Math.abs(t)).toString(16).padStart(2, '0')
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`
}

// 最接近的 xterm 256 色，用来预览这一行在 256 色终端里的样子
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

// ---- 终端：一行字符

// 终端动画每帧的间隔（毫秒）
const FRAME_MS = 200

// 一段文字：color 缺省时用终端前景色；dim 为次要文字（倒计时、/1M）
export type Span = { text: string; color?: string; dim?: boolean }
// 这一行用哪套图标、按哪种色深来画
export type Look = { style: Style; colors: 'true' | '256' }

// 组与组之间的间隔
const SEP: Span = { text: '  ' }

// 这一行有多少个字符
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

// 进度条：已填充的部分从深到浅渐变，上面叠一道从左向右移动的柔和扫光
export const bar = (pct: number, cells: number, color: string, frame: number, s: Style = 'unicode'): Span[] => {
  const g = GLYPHS[s]
  const filled = Math.max(pct > 0 ? 1 : 0, Math.min(cells, Math.round((pct / 100) * cells)))
  // 所有进度条用同一个周期，扫光同步移动
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

// detail 2：进度条加倒计时；1：去掉进度条；0：只剩数字
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

// ---- 桌面端

// 文字交给 Claude 自己画（Text 元素），自动用上界面的 Anthropic Sans 和正文颜色；
// 图形（进度条、点阵、图标、分隔线）仍是 SVG 图片。SVG 以图片形式插入，拿不到应用加载的网页字体，
// 所以文字不能放在 SVG 里。图片原地重绘，不会像交互式（框架内）SVG 那样每次重绘都闪一下。

// 每张图形图片高 D.h；纵向位置都相对中线 MID。gap 是组与组之间的最小间距（估宽用），
// inner 是组内文字与图形的间距估计（对应外层 columnGap 1 列，约 8px）
const D = { h: 20, gap: 30, inner: 8, barW: 76, barH: 6 }
const MID = D.h / 2
// 图标、点阵按大写字母高度（约 10px）居中排布
const CAP = { top: MID - 5, h: 10 }

// 估宽用的字宽（em，按 13px 的界面字体估算，Anthropic Sans 与 SF Pro 相差不大）。
// 只用于分配伸缩宽度，误差由外层 space-between 的间距吸收
const ADVANCE: Record<string, number> = {
  h: 0.58,
  d: 0.6,
  m: 0.9,
  K: 0.64,
  M: 0.84,
  '%': 0.84,
  '/': 0.36,
  '.': 0.27,
  ' ': 0.26,
}
const FONT_PX = 13
const textW = (v: string) =>
  [...v].reduce((w, c) => w + (c >= '0' && c <= '9' ? 0.62 : (ADVANCE[c] ?? 0.6)), 0) * FONT_PX

// 扫光动画的起点占位符：去重比较、测试里换成 0s，真正绘制时换成按时钟对齐的相位
const BEGIN = '{{shine-begin}}'
export const SHINE_MS = 2600

// 图形的颜色：浅色模式略压暗、深色模式略调亮，两种底色上都看得清。元素用 class="gf"（填充）或 "gs"（描边）取 --g
const paint = (color: string) => `style="--gl:${lighten(color, -0.12)};--gd:${lighten(color, 0.12)}"`

// 图片的配色方案取自应用；同时声明浅色和深色两种方案，图片才会跟随应用并保持透明
// （方案与应用不一致的框架，背后会垫上一层不透明的画布）。
const SVG_HEAD =
  `<style>` +
  `:root{color-scheme:light dark;background:transparent}` +
  // 底轨统一用品牌暖灰；图形色经 --g 在两种模式间切换
  `.track{fill:#b0aea5;fill-opacity:.35}` +
  `.g{--g:var(--gl)}.gf{fill:var(--g)}.gs{stroke:var(--g)}.rule{fill:#000;fill-opacity:.1}.sep{fill:#000;fill-opacity:.2}` +
  `@media (prefers-color-scheme:dark){.track{fill-opacity:.22}.g{--g:var(--gd)}.rule{fill:#fff;fill-opacity:.13}.sep{fill:#fff;fill-opacity:.22}}` +
  `</style>` +
  `<defs><linearGradient id="shine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/>` +
  `<stop offset=".5" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`

// 把图形包成一张完整的 SVG 图片
const wrap = (width: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${D.h}" viewBox="0 0 ${width} ${D.h}" style="color-scheme:light dark;background:transparent">${SVG_HEAD}${body}</svg>`

// 文字的警示色。Text 只能给一个颜色、不能按深浅模式各给一套，所以把警示色调到中间亮度
// （相对亮度约 0.19），在浅色和深色底上对比度都约 3.7，两边都看得清
export const warnText = (warn: string): string => {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255)
  }
  let lo = -1
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (lum(lighten(warn, mid)) < 0.19) lo = mid
    else hi = mid
  }
  return lighten(warn, (lo + hi) / 2)
}

// 一段文字：color 缺省时用 Claude 的正文颜色；dim 为次要文字（倒计时、/1M）
export type DeskSpan = { text: string; color?: string; dim?: boolean }
// 组内的一项：一段或几段紧挨着的文字，或一张图形
export type DeskItem = { kind: 'text'; spans: DeskSpan[] } | { kind: 'svg'; svg: string; width: number }
// 一组：key 区分 5h / 7d / label / ctx / hit；width 是估计宽度（px），只用于分配伸缩宽度
export type DeskGroup = { key: string; alt: string; width: number; items: DeskItem[] }

const txt = (...spans: DeskSpan[]): DeskItem => ({ kind: 'text', spans })
const pic = (width: number, body: string): DeskItem => ({ kind: 'svg', svg: wrap(width, body), width })
const itemW = (it: DeskItem) => (it.kind === 'svg' ? it.width : it.spans.reduce((w, s) => w + textW(s.text), 0))
const group = (key: string, alt: string, items: DeskItem[]): DeskGroup => ({
  key,
  alt,
  items,
  width: Math.ceil(items.reduce((w, it) => w + itemW(it), 0) + D.inner * Math.max(0, items.length - 1)),
})

// 5h ▬▬▬▬▬▬──── 69% │ 1h31m：标签、进度条、读数，再是重置倒计时
const limitGroup = (
  key: string,
  label: string,
  l: Limit,
  hue: string,
  at: number,
  theme: Theme,
  barW: number,
): DeskGroup => {
  const { pct, left } = limitNow(l, at)
  const warn = pct >= theme.limitWarn ? theme.warn : undefined
  const color = warn ?? hue
  const y = (D.h - D.barH) / 2
  const r = D.barH / 2
  const fillW = Math.max(pct > 0 ? D.barH : 0, Math.min(barW, (barW * pct) / 100))
  const bar = pic(
    barW,
    `<defs><clipPath id="c">${`<rect x="0" y="${y}" width="${fillW}" height="${D.barH}" rx="${r}"/>`}</clipPath></defs>` +
      `<rect x="0" y="${y}" width="${barW}" height="${D.barH}" rx="${r}" class="track"/>` +
      `<rect x="0" y="${y}" width="${fillW}" height="${D.barH}" rx="${r}" class="g gf" ${paint(color)}/>` +
      // 扫光走完整条进度条、只在已填充处可见；所有扫光共用同一个时钟，任何时刻都在同一位置
      `<g clip-path="url(#c)"><rect y="${y}" width="18" height="${D.barH}" fill="url(#shine)">` +
      `<animate attributeName="x" values="-18;${barW};${barW}" keyTimes="0;0.62;1" dur="2.6s" begin="${BEGIN}" repeatCount="indefinite"/></rect></g>`,
  )
  const tc = warn && warnText(warn)
  const items = [txt({ text: label, color: tc }), bar, txt({ text: `${pct}%`, color: tc })]
  if (left) {
    const rule = pic(1, `<rect x="0" y="${CAP.top}" width="1" height="${CAP.h}" class="rule"/>`)
    items.push(rule, txt({ text: left, dim: true }))
  }
  return group(key, `${key === '5h' ? '5-hour' : '7-day'} limit ${pct}% used`, items)
}

// 三层叠放的薄片：上下文窗口
const layersIcon = () =>
  `<g fill="none" class="gs" stroke-width="1.2" stroke-linejoin="round">` +
  `<path d="M5 0.6 L9.4 2.8 L5 5 L0.6 2.8 Z" class="gf" fill-opacity="0.25"/>` +
  `<path d="M0.6 5.2 L5 7.4 L9.4 5.2"/><path d="M0.6 7.2 L5 9.4 L9.4 7.2"/></g>`

// 靶心：提示词有多少命中了缓存
const targetIcon = () =>
  `<g fill="none" class="gs" stroke-width="1.2">` +
  `<circle cx="5" cy="5" r="4.4"/><circle cx="5" cy="5" r="2.1"/><circle cx="5" cy="5" r="0.7" class="gf"/></g>`

// 图标画在边长 CAP.h 的方格里，描边的外沿也算在内
const ICON = CAP.h
const icon = (draw: () => string, color: string, x = 0) =>
  `<g transform="translate(${x} ${CAP.top})" class="g" ${paint(color)}>${draw()}</g>`

// 只剩上下文一组时，左侧显示它的名称：和右侧的点阵同属一个模块，上下文超过阈值时一起变成警示色
export const CTX_LABEL = 'Context'

// 上下文画成两行点阵（默认 2×10，每个点代表窗口的 1/20）：先从左到右填满上排，再填下排，
// 点亮的点上叠着同一道扫光。
// 桌面端变宽时列数分档增加（点的大小和间距不变），每个点代表的比例相应变小
// 两排的位置让点的外沿正好贴齐 CAP 区域的上下边：CAP.top + r 与 CAP.top + CAP.h - r
const DOTS = { cols: 10, pitch: 5, r: 1.6, rows: [CAP.top + 1.6, CAP.top + CAP.h - 1.6] }
const ctxGroup = (hue: string, tokens: number, window: number, pct: number, cols: number, warn?: string): DeskGroup => {
  const color = warn ?? hue
  const lit = Math.min(cols * 2, Math.round((pct / 100) * cols * 2))
  const mx = ICON + 6
  const matrixW = cols * DOTS.pitch
  const dot = (i: number) =>
    `<circle cx="${mx + DOTS.pitch / 2 + (i % cols) * DOTS.pitch}" cy="${DOTS.rows[Math.floor(i / cols)]}" r="${DOTS.r}"/>`
  const on = Array.from({ length: lit }, (_, i) => dot(i)).join('')
  const off = Array.from({ length: cols * 2 - lit }, (_, i) => dot(lit + i)).join('')
  // 图标和点阵画在同一张图里
  const graphic = pic(
    mx + matrixW,
    icon(layersIcon, color) +
      `<defs><clipPath id="c">${on}</clipPath></defs>` +
      `<g class="track">${off}</g>` +
      `<g class="g gf" ${paint(color)}>${on}</g>` +
      `<g clip-path="url(#c)"><rect y="${MID - 7}" width="18" height="14" fill="url(#shine)">` +
      `<animate attributeName="x" values="${mx - 18};${mx + matrixW};${mx + matrixW}" keyTimes="0;0.62;1" dur="2.6s" begin="${BEGIN}" repeatCount="indefinite"/></rect></g>`,
  )
  const num = fmtTokens(tokens)
  const suffix = `/${fmtTokens(window)}`
  // 读数和 /窗口大小 紧挨在一起，是同一项里的两段文字
  return group('ctx', `context ${num} of ${fmtTokens(window)}`, [
    graphic,
    txt({ text: num, color: warn && warnText(warn) }, { text: suffix, dim: true }),
  ])
}

// 桌面端可伸缩部分的尺寸：额度进度条长度（px）与上下文点阵列数
export type Stretch = { barW: number; dotCols: number }
export const DEFAULT_STRETCH: Stretch = { barW: D.barW, dotCols: DOTS.cols }

// 桌面端这一行的所有分组，按显示顺序。begin 是扫光起点：比较与测试用 0s，绘制时用按时钟对齐的相位
export const desktopGroups = (
  m: Measure | null,
  t: TurnTokens | null,
  at: number,
  theme: Theme = DEFAULT_THEME,
  stretch: Stretch = DEFAULT_STRETCH,
  begin = '0s',
): DeskGroup[] => {
  const groups: DeskGroup[] = []
  const five = m?.rateLimits.find(l => l.kind === 'five_hour')
  const seven = m?.rateLimits.find(l => l.kind === 'seven_day')
  if (five) groups.push(limitGroup('5h', '5h', five, theme.hue.five, at, theme, stretch.barW))
  if (seven) groups.push(limitGroup('7d', '7d', seven, theme.hue.seven, at, theme, stretch.barW))
  const hit = t ? hitRate(t) : null
  if (m) {
    const pct = ctxPercent(m.context)
    const warn = pct >= theme.contextWarn ? theme.warn : undefined
    // 没有额度、也还没有缓存命中率时（非订阅账号，或会话第一次回复之前）只剩上下文一组：左侧补上它的名称
    if (!five && !seven && hit === null) {
      groups.push(group('label', CTX_LABEL, [txt({ text: CTX_LABEL, color: warn && warnText(warn) })]))
    }
    groups.push(ctxGroup(theme.hue.ctx, m.context.tokens ?? 0, m.context.window, pct, stretch.dotCols, warn))
  }
  if (hit !== null) {
    const warn = hit < theme.cacheWarn ? theme.warn : undefined
    groups.push(
      group('hit', `cache hit ${hit}%`, [
        pic(ICON, icon(targetIcon, warn ?? theme.hue.cache)),
        txt({ text: `${hit}%`, color: warn && warnText(warn) }),
      ]),
    )
  }
  return groups.map(g => ({
    ...g,
    items: g.items.map(it => (it.kind === 'svg' ? { ...it, svg: it.svg.split(BEGIN).join(begin) } : it)),
  }))
}

// 图形图片的高度（绘制时用）
export const DESK_H = D.h

// 组与组之间的分隔线（名称和点阵是同一个模块，中间不画）
export const SEP_SVG = wrap(1, `<rect x="0" y="${MID - 8}" width="1" height="16" class="sep"/>`)
export const needsSep = (groups: DeskGroup[], i: number) => i > 0 && groups[i - 1]?.key !== 'label'

// 每张图片的 SMIL 时钟从图片载入时起算。把扫光的起点设成「此刻在周期里的相位」取负，
// 同一次绘制载入的图片就都对齐到同一个时钟上，拆成多张图后扫光依旧同步
export const shineBegin = (now: number) => `-${((((now % SHINE_MS) + SHINE_MS) % SHINE_MS) / 1000).toFixed(2)}s`

// 桌面端一列约合多少 CSS 像素。宿主只上报列数：实测这一行 95 列、宽约 768px，约 8.1px/列，取 8 偏保守
export const PX_PER_COL = 8
// 伸缩部分的上下限（进度条长度 px）；估算误差留出的余量。文字改由宿主绘制后字宽只能估算，余量放宽到 48px，
// 剩下的空隙由外层 space-between 吸收，不会挤到换行
export const BAR = { min: 40, max: 360, slack: 48 }
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
  const groups = desktopGroups(m, t, at, theme, { barW: 0, dotCols: 0 })
  const stretchy = groups.filter(g => g.key === '5h' || g.key === '7d' || g.key === 'ctx').length
  if (stretchy === 0) return DEFAULT_STRETCH
  // 外层 Box 左右各留 1 列内边距
  const room = (bodyColumns - 2) * PX_PER_COL - BAR.slack
  const used = groups.reduce((w, g) => w + g.width, 0) + (groups.length - 1) * D.gap
  const share = (room - used) / stretchy
  return {
    barW: Math.round(Math.min(BAR.max, Math.max(BAR.min, share))),
    dotCols: [...DOT_STEPS].reverse().find(c => c * DOTS.pitch <= share) ?? DOT_STEPS[0],
  }
}

// ---- 状态写入

// 绘制读取的值每写入一次，桌面端就重绘这一行，外框随之闪一下。所以读数只在会改变显示内容时
// 才写入：新的 token 数取整后还是同一个数字，或者时钟走了一格而所有倒计时都没变，就什么也不写。
// 比较时要用这次加载的配色与阈值：自定义阈值下跨过阈值只改颜色，用默认值比较会漏掉这次变化
const shown = (m: Measure | null, t: TurnTokens | null, at: number, theme: Theme) =>
  JSON.stringify(desktopGroups(m, t, at, theme))

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

// ---- 预览命令与欢迎提示

const PREVIEW = 'usage-band-preview'

// 会话里还没有读数时，预览用这组示例数据
const SAMPLE_MEASURE: Measure = {
  context: { tokens: 176_000, window: 1_000_000, percent: 18 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 42 },
    { kind: 'seven_day', percentUsed: 43 },
  ],
}
const SAMPLE_TURN: TurnTokens = { input: 900, output: 2_000, cacheRead: 170_000, cacheWrite: 1_000 }

// 预览里逐个画出的终端样式
const PROFILES: { name: string; look: Look }[] = [
  { name: 'Ghostty', look: { style: 'nerd', colors: 'true' } },
  { name: 'iTerm2 / Warp / WezTerm / kitty', look: { style: 'unicode', colors: 'true' } },
  { name: 'macOS Terminal (256 colors)', look: { style: 'unicode', colors: '256' } },
  { name: 'ascii fallback', look: { style: 'ascii', colors: '256' } },
]

// 图标样式的手动设置，读取自 USAGE_BAND_ICONS。用环境变量而不是插件选项，
// 这样新装的用户没有任何需要配置的东西。
const ICONS_ENV = 'USAGE_BAND_ICONS'

// 安装后第一次加载时显示的欢迎提示
export const WELCOME =
  'usage-band is on: your 5h and 7d limits, context window and cache hit rate now show above the prompt. ' +
  'The limits fill in after Claude’s first reply.'

// ---- 注册

export const register: Register = (on, options) => {
  // 选项在 /config 里改动时，模组会带着新选项整体重新加载，所以这里读一次即可
  const theme = themeFrom(options)
  let setting = 'auto'
  // 终端靠重绘来播放动画；计时器由第一次绘制启动，所以只用桌面端的会话不会运行它。
  // 重新加载时计时器和这个标记一起丢弃。
  let isAnimating = false
  // 上一次终端绘制里是否有正在扫光的进度条。帧计数只在它为真时推进一格，并由下一次绘制重新置位：
  // 进度条不在屏上（问卷占位、窄屏去掉了进度条、没有额度数据）时帧计数就停下，不再每秒重绘 5 次；
  // 回到屏上的那次绘制会让它继续
  let isShining = false
  // 桌面端上一次画出的分组。显示内容不变时原样复用，图片不会重新载入；
  // 内容一变就整组按新相位重建，所有图片一起重新载入，扫光仍然对齐
  let lastBand = ''
  let lastGroups: DeskGroup[] = []

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
    // 安装后只欢迎一次，让新用户知道输入框上方多出来的是什么
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
    // 只统计主循环；子代理运行时会各自触发 turn.complete
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

    // 桌面端和移动端的动画在 SVG 内部完成，所以不读取帧计数
    if (e.surface === 'desktop' || e.surface === 'mobile') {
      const { Box, Svg, Text } = $.ui.resolve(e)
      const stretch = fitStretch(m, t, at, theme, e.props.bodyColumns)
      // 宽度变了（进度条长度、点阵列数变了）也要整组重建
      const band = `${stretch.barW}|${stretch.dotCols}|${shown(m, t, at, theme)}`
      if (band !== lastBand) {
        lastBand = band
        lastGroups = desktopGroups(m, t, at, theme, stretch, shineBegin(await $.clock.now()))
      }
      const groups = lastGroups
      // 文字由 Claude 绘制：不指定颜色时就是界面的正文颜色，深浅模式自动切换
      const span = (sp: DeskSpan, key: string) => (
        <Text key={key} {...(sp.color ? { color: sp.color } : {})} dimColor={sp.dim === true}>
          {sp.text}
        </Text>
      )
      // 每组的第一张图带上这一组的说明，供读屏软件使用；其余图形是装饰
      const item = (it: DeskItem, key: string, alt: string) =>
        it.kind === 'svg' ? (
          <Svg key={key} source={it.svg} alt={alt} width={it.width} height={DESK_H} />
        ) : it.spans.length === 1 ? (
          span(it.spans[0]!, key)
        ) : (
          <Box key={key} flexDirection="row">
            {it.spans.map((sp, i) => span(sp, `${key}-${i}`))}
          </Box>
        )
      // 两组及以上时组间距平分剩余空间；只有一组时居中，免得整行偏向左边
      return (
        <Box
          flexDirection="row"
          flexWrap="wrap"
          justifyContent={groups.length > 1 ? 'space-between' : 'center'}
          alignItems="center"
          flexGrow={1}
          paddingX={1}
        >
          {groups.flatMap((g, i) => [
            ...(needsSep(groups, i)
              ? [<Svg key={`sep-${g.key}`} source={SEP_SVG} alt="" width={1} height={DESK_H} />]
              : []),
            <Box key={g.key} flexDirection="row" alignItems="center" columnGap={1}>
              {g.items.map((it, j) =>
                item(it, `${g.key}-${j}`, j === g.items.findIndex(x => x.kind === 'svg') ? g.alt : ''),
              )}
            </Box>,
          ])}
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
    // 图标取决于终端的字体；其他界面（vscode）一律用普通字符
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
