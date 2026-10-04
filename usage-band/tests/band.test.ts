import { expect, mock, test } from 'claude-code/testing'

import {
  bar,
  columns,
  ctxPercent,
  desktopSvg,
  describe,
  detectStyle,
  fit,
  fmtLeft,
  fmtTokens,
  hitRate,
  layout,
  limitNow,
  parseColor,
  parsePercent,
  themeFrom,
  DEFAULT_THEME,
  to256,
  width,
} from '../hooks/register'
import type { Measure } from '../types'

const BAND = {
  component: 'AbovePrompt',
  // The mount fills scroll and view; the band reads none of them
  props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 140 } as never,
} as const

test('formats tokens, countdowns and hit rate', async () => {
  expect(fmtTokens(950)).toBe('950')
  expect(fmtTokens(15_600)).toBe('15.6K')
  expect(fmtTokens(100_000)).toBe('100K')
  expect(fmtTokens(1_000_000)).toBe('1M')
  expect(fmtLeft((2 * 60 + 40) * 60_000)).toBe('2h40m')
  expect(fmtLeft((31 * 60) * 60_000)).toBe('1d7h')
  expect(hitRate({ input: 50, output: 10, cacheRead: 900, cacheWrite: 50 })).toBe(90)
  expect(hitRate({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })).toBe(null)
  // 字段缺失算出 NaN 时不显示，而不是画出 NaN%
  expect(hitRate({ input: 50, output: 10, cacheRead: Number.NaN, cacheWrite: 50 })).toBe(null)
  expect(hitRate({ input: Number.NaN, output: 10, cacheRead: 900, cacheWrite: 50 })).toBe(null)
})

test('band shows limits, context and the last turn on terminal and desktop', async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.complete', () => ({ text: '' }))

  await $.session.measure({
    context: { tokens: 100_000, window: 1_000_000, percent: 10 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 20 },
      { kind: 'seven_day', percentUsed: 58 },
    ],
    changed: ['context', 'rateLimits'],
  })
  await $.turn.complete({
    answer: 'ok',
    durationMs: 1000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: {
      model: 'claude-opus-5-5',
      input_tokens: 50,
      output_tokens: 3_000,
      cache_read_input_tokens: 900,
      cache_creation_input_tokens: 50,
    },
  })

  const desk = await $.ui.mount({ plugin: 'usage-band', surface: 'desktop', ...BAND })
  // One SVG for the band, drawn as an image (a framed SVG blinks on every redraw), with hairlines
  // between the four groups
  const svg = await desk.find({ type: 'Svg' })
  expect(svg?.props.alt).toBe('5-hour limit 20% used, 7-day limit 58% used, context 100K of 1M, cache hit 90%')
  expect(svg?.props.isInteractive).toBeFalsy()
  expect(String(svg?.props.source)).toContain('<animate')
  expect(String(svg?.props.source).match(/class="sep"/g)?.length).toBe(3)
  expect(await desk.find({ type: 'Text' })).toBeUndefined()
  await desk.unmount()

  for (const surface of ['terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-band', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /^20%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^58%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '/1M' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '90%' })).toBeDefined()
    await ui.unmount()
  }
})

test('layout steps down to fit narrow terminals', async () => {
  const m = {
    context: { tokens: 130_000, window: 1_000_000, percent: 13 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 20, resetsAt: new Date(160 * 60_000).toISOString() },
      { kind: 'seven_day', percentUsed: 58, resetsAt: new Date(31 * 3_600_000).toISOString() },
    ],
  }
  const t = { input: 1_200, output: 3_000, cacheRead: 1_400_000, cacheWrite: 12_000 }
  expect(width(layout(m, t, 0, 0))).toBeLessThan(80)
  const look = { style: 'unicode', colors: 'true' } as const
  const full = columns(layout(m, t, 0, 2, 0, look))
  const noBars = columns(layout(m, t, 0, 1, 0, look))
  // 放得下就用最详细的；先去掉进度条，再去掉倒计时
  expect(fit(m, t, 0, full, 0, look).detail).toBe(2)
  expect(fit(m, t, 0, full - 1, 0, look).detail).toBe(1)
  expect(fit(m, t, 0, noBars - 1, 0, look).detail).toBe(0)
  for (const cols of [full, noBars, noBars - 1]) {
    const { spans, detail } = fit(m, t, 0, cols, 0, look)
    if (detail > 0) expect(columns(spans)).toBeLessThanOrEqual(cols)
  }
})

test('ambiguous-width glyphs are budgeted two columns, so a CJK terminal never wraps the band', async () => {
  // ■ 在 CJK 终端里可能占两列：8 格进度条按 16 列估算
  expect(width(bar(50, 8, '#5cc4d6', 0))).toBe(8)
  expect(columns(bar(50, 8, '#5cc4d6', 0))).toBe(16)
  expect(columns([{ text: '5h 20%' }])).toBe(6)
  expect(columns([{ text: '≡ ● ·' }])).toBe(8)
  // Nerd Font 图标在私用区，同样按两列算
  expect(columns([{ text: '\u{F0328}' }])).toBe(2)
})

test('a limit, the context or the cache turns red past its threshold', async () => {
  const RED = '#e5685f'
  const colorOf = (m: Measure | null, t: Parameters<typeof layout>[1], text: string) =>
    layout(m, t, 0, 0).find(s => s.text === text)?.color
  const lim = (pct: number): Measure => ({
    context: { tokens: 1, window: 100, percent: 1 },
    rateLimits: [{ kind: 'five_hour', percentUsed: pct }],
  })
  expect(colorOf(lim(80), null, '80%')).toBe(RED)
  expect(colorOf(lim(79), null, '79%')).not.toBe(RED)
  const ctx = (percent: number): Measure => ({ context: { tokens: percent * 1_000, window: 100_000, percent }, rateLimits: [] })
  expect(colorOf(ctx(80), null, '80K')).toBe(RED)
  expect(colorOf(ctx(79), null, '79K')).not.toBe(RED)
  const turn = (cacheRead: number) => ({ input: 100 - cacheRead, output: 0, cacheRead, cacheWrite: 0 })
  expect(colorOf(null, turn(49), '49%')).toBe(RED)
  expect(colorOf(null, turn(50), '50%')).not.toBe(RED)
})

test('context without a percent falls back to tokens over the window', async () => {
  expect(ctxPercent({ tokens: 850_000, window: 1_000_000 })).toBe(85)
  expect(ctxPercent({ window: 1_000_000 })).toBe(0)
  expect(ctxPercent({ tokens: 10, window: 0 })).toBe(0)
  expect(ctxPercent({ tokens: 850_000, window: 1_000_000, percent: 12 })).toBe(12)
  const m: Measure = { context: { tokens: 850_000, window: 1_000_000 }, rateLimits: [] }
  expect(layout(m, null, 0, 0).find(s => s.text === '850K')?.color).toBe('#e5685f')
})

test('a window past its reset shows 0% with no countdown until the next reading', async () => {
  const at = Date.parse('2026-10-04T12:00:00Z')
  const l = { kind: 'five_hour', percentUsed: 92, resetsAt: new Date(at - 60_000).toISOString() }
  expect(limitNow(l, at)).toEqual({ pct: 0, left: '' })
  expect(limitNow({ ...l, resetsAt: new Date(at + 90 * 60_000).toISOString() }, at)).toEqual({ pct: 92, left: '1h30m' })
  // 没有或无法解析的重置时间：照常显示读数，不画倒计时
  expect(limitNow({ kind: 'five_hour', percentUsed: 40 }, at)).toEqual({ pct: 40, left: '' })
  expect(limitNow({ ...l, resetsAt: 'not a date' }, at)).toEqual({ pct: 92, left: '' })

  const m: Measure = { context: { tokens: 1, window: 100, percent: 1 }, rateLimits: [l] }
  const spans = layout(m, null, at, 1)
  expect(spans.some(s => s.text === '0%')).toBe(true)
  expect(spans.some(s => s.text.includes('·'))).toBe(false)
  expect(describe(m, null, at)).toContain('5-hour limit 0% used')
  expect(desktopSvg(m, null, at).svg).not.toContain('class="rule"')
})

test('the bar highlight moves left to right and keeps the bar width', async () => {
  const at = (f: number) => bar(50, 8, '#5cc4d6', f)
  const lum = (hex = '#000000') => [1, 3, 5].reduce((n, i) => n + parseInt(hex.slice(i, i + 2), 16), 0)
  // 50% of 8 cells fills 4; frames 4..12 put the glow past the fill, so frame 7 has none
  const plain = at(7).map(s => lum(s.color))
  // The glow sits one cell further right each frame
  const glowAt = (f: number) => {
    const lift = at(f).map((s, i) => lum(s.color) - plain[i]!)
    return lift.indexOf(Math.max(...lift))
  }
  expect(glowAt(0)).toBe(0)
  expect(glowAt(2)).toBe(2)
  expect(glowAt(3)).toBe(3)
  // Gradient: without a glow the bar brightens left to right
  expect(plain[0]! < plain[3]!).toBe(true)
  for (const f of [0, 3, 7, 20]) expect(width(at(f))).toBe(8)
})

test('auto picks Nerd Font icons only in Ghostty; a manual setting wins', async () => {
  expect(detectStyle('auto', 'ghostty')).toBe('nerd')
  expect(detectStyle('auto', 'Apple_Terminal')).toBe('unicode')
  expect(detectStyle('auto', 'WarpTerminal')).toBe('unicode')
  expect(detectStyle('auto', undefined)).toBe('unicode')
  expect(detectStyle('nerd', 'Apple_Terminal')).toBe('nerd')
  expect(detectStyle('ascii', 'ghostty')).toBe('ascii')
})

test('256-color preview snaps colors to the xterm palette', async () => {
  expect(to256('#000000')).toBe('#000000')
  expect(to256('#ffffff')).toBe('#ffffff')
  expect(to256('#5cc4d6')).toBe('#5fd7d7')
})

test('preview command draws every terminal profile', async ($, on) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: '' }))
  const ui = await $.ui.mount({
    plugin: 'usage-band',
    surface: 'terminal',
    component: 'CommandOutput',
    props: { command: 'usage-band-preview', args: '', text: '' },
  } as never)
  expect(await ui.find({ type: 'Text', text: 'Ghostty' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'ascii fallback' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'hit ' })).toBeDefined()
  await ui.unmount()
})

test('bars of different fill keep their highlights in step', async () => {
  const lum = (hex = '#000000') => [1, 3, 5].reduce((n, i) => n + parseInt(hex.slice(i, i + 2), 16), 0)
  const glowAt = (pct: number, f: number) => {
    const plain = bar(pct, 8, '#5cc4d6', 12).map(s => lum(s.color))
    const lift = bar(pct, 8, '#5cc4d6', f).map((s, i) => lum(s.color) - plain[i]!)
    return lift.indexOf(Math.max(...lift))
  }
  for (const f of [0, 1, 2, 3, 13, 15]) expect(glowAt(50, f)).toBe(glowAt(90, f))
})

test('desktop context is a 2×10 dot matrix, top row first', async () => {
  const svgFor = (pct: number) =>
    desktopSvg({ context: { tokens: pct * 10_000, window: 1_000_000, percent: pct }, rateLimits: [] }, null, 0).svg
  const lit = (svg: string) => (svg.match(/<clipPath id="c-ctx">(.*?)<\/clipPath>/)?.[1]?.match(/<circle/g) ?? []).length
  const all = (svg: string) => (svg.match(/<circle [^>]*r="1.6"/g) ?? []).length
  expect(all(svgFor(35))).toBe(20 + 7)
  expect(lit(svgFor(35))).toBe(7)
  expect(lit(svgFor(0))).toBe(0)
  expect(lit(svgFor(100))).toBe(20)
  // 60% fills the whole top row and two dots of the bottom one
  const rows = (svgFor(60).match(/<clipPath id="c-ctx">(.*?)<\/clipPath>/)?.[1] ?? '').match(/cy="[\d.]+"/g) ?? []
  expect(rows.filter(r => r === 'cy="11.35"').length).toBe(10)
  expect(rows.filter(r => r === 'cy="18.15"').length).toBe(2)
})

test('the terminal bar animates once the band is drawn', async ($, on) => {
  const clock = mock.clock(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({
    context: { tokens: 100_000, window: 1_000_000, percent: 10 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 50 }],
    changed: ['context', 'rateLimits'],
  })
  const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
  const firstCell = async () => (await ui.find({ type: 'Text', text: '■' }))?.props.color
  const before = await firstCell()
  await clock.advance(200)
  expect(await firstCell()).not.toBe(before)
  await ui.unmount()
})

test('the terminal frame clock stops while no bar is shining', async ($, on) => {
  const clock = mock.clock(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  // 统计帧计数（phase）被写了多少次
  let frames = 0
  on('state.set', ($, e, next) => {
    if ((e as { key?: string }).key === 'phase') frames++
    return next(e)
  })
  const run = async (rateLimits: Measure['rateLimits']) => {
    await $.session.measure({
      context: { tokens: 100_000, window: 1_000_000, percent: 10 },
      rateLimits,
      changed: ['context', 'rateLimits'],
    })
    const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
    frames = 0
    await clock.advance(2_000)
    await ui.unmount()
    return frames
  }
  // 有进度条在扫光时，2 秒推进约 10 帧
  expect(await run([{ kind: 'five_hour', percentUsed: 50 }])).toBeGreaterThan(5)
  // 没有额度数据（非订阅账号）：这一行没有进度条，帧计数停下
  expect(await run([])).toBeLessThanOrEqual(1)
})

test('the desktop SVG declares both color schemes so a dark app gets no white backdrop', async () => {
  const { svg } = desktopSvg({ context: { tokens: 1, window: 10, percent: 10 }, rateLimits: [] }, null, 0)
  expect(svg).toContain('color-scheme:light dark')
  expect(svg).toContain('prefers-color-scheme:dark')
})


test('a redraw that changes nothing visible is not written', async ($, on) => {
  const at = Date.parse('2026-10-03T12:00:00Z')
  const m: Measure = {
    context: { tokens: 100_000, window: 1_000_000, percent: 10 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 20, resetsAt: new Date(at + 3 * 3_600_000 + 30 * 60_000).toISOString() }],
  }
  // 3h30m and 3h30m less 20 seconds both read 3h30m; 100,040 tokens still reads 100K
  expect(desktopSvg(m, null, at).svg).toBe(desktopSvg(m, null, at + 20_000).svg)
  expect(desktopSvg(m, null, at).svg).toBe(
    desktopSvg({ ...m, context: { ...m.context, tokens: 100_040 } }, null, at).svg,
  )
})

test('options parse into a theme; bad values fall back to the defaults', async () => {
  expect(themeFrom({})).toEqual(DEFAULT_THEME)
  expect(parseColor('#ABC', '#000000')).toBe('#aabbcc')
  expect(parseColor(' #FF8800 ', '#000000')).toBe('#ff8800')
  expect(parseColor('red', '#000000')).toBe('#000000')
  expect(parseColor('#12345', '#000000')).toBe('#000000')
  expect(parsePercent(70, 80)).toBe(70)
  expect(parsePercent('65', 80)).toBe(65)
  expect(parsePercent(150, 80)).toBe(100)
  expect(parsePercent(-5, 80)).toBe(0)
  expect(parsePercent('', 80)).toBe(80)
  expect(parsePercent('abc', 80)).toBe(80)
  const theme = themeFrom({ limitWarn: 60, cacheWarn: 90, colorWarn: '#f00', colorFiveHour: '#123456' })
  expect(theme.limitWarn).toBe(60)
  expect(theme.cacheWarn).toBe(90)
  expect(theme.warn).toBe('#ff0000')
  expect(theme.hue.five).toBe('#123456')
  expect(theme.hue.seven).toBe(DEFAULT_THEME.hue.seven)
})

test('custom thresholds and colors decide when and how a metric warns', async () => {
  const theme = themeFrom({ limitWarn: 60, contextWarn: 30, cacheWarn: 95, colorWarn: '#ff0000', colorSevenDay: '#00ff00' })
  const m: Measure = {
    context: { tokens: 300_000, window: 1_000_000, percent: 30 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 60 },
      { kind: 'seven_day', percentUsed: 59 },
    ],
  }
  const t = { input: 60, output: 0, cacheRead: 940, cacheWrite: 0 }
  const colorOf = (text: string) => layout(m, t, 0, 0, 0, undefined, theme).find(s => s.text === text)?.color
  expect(colorOf('60%')).toBe('#ff0000')
  expect(colorOf('59%')).toBe('#00ff00')
  expect(colorOf('300K')).toBe('#ff0000')
  expect(colorOf('94%')).toBe('#ff0000')
  // 默认阈值下同样的读数都不报警
  const plain = (text: string) => layout(m, t, 0, 0).find(s => s.text === text)?.color
  expect(plain('60%')).toBe(DEFAULT_THEME.hue.five)
  expect(plain('94%')).toBe(DEFAULT_THEME.hue.cache)
  // 桌面端同样使用配置：进度条底色带着各自的颜色
  const svg = desktopSvg(m, t, 0, theme).svg
  expect(svg).toContain('--h:#ff0000')
  expect(svg).toContain('--h:#00ff00')
})

test(
  'the band reads its colors and thresholds from the plugin options',
  { options: { limitWarn: 50, colorWarn: '#ff0000', colorContext: '#0000ff' } },
  async ($, on) => {
    on('session.measure', ($, e) => ({ changed: e.changed }))
    await $.session.measure({
      context: { tokens: 100_000, window: 1_000_000, percent: 10 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 55 }],
      changed: ['context', 'rateLimits'],
    })
    const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
    expect((await ui.find({ type: 'Text', text: '55%' }))?.props.color).toBe('#ff0000')
    expect((await ui.find({ type: 'Text', text: '100K' }))?.props.color).toBe('#0000ff')
    await ui.unmount()
    const desk = await $.ui.mount({ plugin: 'usage-band', surface: 'desktop', ...BAND })
    expect(String((await desk.find({ type: 'Svg' }))?.props.source)).toContain('--h:#ff0000')
    await desk.unmount()
  },
)
