import { expect, mock, test } from 'claude-code/testing'

import {
  BAR,
  DEFAULT_STRETCH,
  DEFAULT_THEME,
  DOT_STEPS,
  PX_PER_COL,
  SEP_SVG,
  bar,
  columns,
  ctxPercent,
  desktopGroups,
  detectStyle,
  fit,
  fitStretch,
  fmtLeft,
  fmtTokens,
  hitRate,
  layout,
  lighten,
  limitNow,
  needsSep,
  parseColor,
  parsePercent,
  shineBegin,
  themeFrom,
  to256,
  warnText,
  width,
} from '../hooks/register'
import type { DeskGroup } from '../hooks/register'
import type { Measure } from '../types'

// 桌面端一组里的图形（SVG 源码拼在一起）与文字
const svgsOf = (g?: DeskGroup) => (g?.items ?? []).flatMap(it => (it.kind === 'svg' ? [it.svg] : [])).join('')
const spansOf = (g?: DeskGroup) => (g?.items ?? []).flatMap(it => (it.kind === 'text' ? it.spans : []))
const wordsOf = (g?: DeskGroup) => spansOf(g).map(s => s.text)
const groupOf = (gs: DeskGroup[], key: string) => gs.find(g => g.key === key)

// 点阵图里点亮的点数（裁剪路径里的圆），与图里所有的圆（点亮的点在裁剪路径里又画了一遍）
const litDots = (svg: string) => (svg.match(/<clipPath id="c">(.*?)<\/clipPath>/)?.[1]?.match(/<circle/g) ?? []).length
const allCircles = (svg: string) => (svg.match(/<circle [^>]*r="1.6"/g) ?? []).length

// 颜色的粗略亮度（RGB 三个分量之和），只用来比较明暗
const brightness = (hex = '#000000') => [1, 3, 5].reduce((n, i) => n + parseInt(hex.slice(i, i + 2), 16), 0)

// 挂载这一行用的参数
const BAND = {
  component: 'AbovePrompt',
  // 挂载时会补上 scroll 和 view；这一行两者都不读取
  props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 140 } as never,
} as const

test('formats tokens, countdowns and hit rate', async () => {
  expect(fmtTokens(950)).toBe('950')
  expect(fmtTokens(15_600)).toBe('15.6K')
  expect(fmtTokens(100_000)).toBe('100K')
  expect(fmtTokens(1_000_000)).toBe('1M')
  expect(fmtLeft((2 * 60 + 40) * 60_000)).toBe('2h40m')
  expect(fmtLeft(31 * 60 * 60_000)).toBe('1d7h')
  expect(hitRate({ input: 50, output: 10, cacheRead: 900, cacheWrite: 50 })).toBe(90)
  expect(hitRate({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })).toBe(null)
  // 字段缺失算出 NaN 时不显示，而不是画出 NaN%
  expect(hitRate({ input: 50, output: 10, cacheRead: Number.NaN, cacheWrite: 50 })).toBe(null)
  expect(hitRate({ input: Number.NaN, output: 10, cacheRead: 900, cacheWrite: 50 })).toBe(null)
})

test('band shows limits, context and the last turn on terminal and desktop', async ($, on) => {
  mock.clock(on)
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
  // 文字交给 Claude 绘制（Text 元素），自动用上界面字体；图形是图片（不用会在重绘时闪烁的交互式 SVG）
  for (const text of ['5h', '20%', '7d', '58%', '100K', '/1M', '90%']) {
    expect(await desk.find({ type: 'Text', text })).toBeDefined()
  }
  const svgs = await desk.findAll({ type: 'Svg' })
  // 两条进度条、上下文图形、缓存图标，加上组间三条分隔线
  expect(svgs.length).toBe(7)
  expect(svgs.filter(s => s.props.source === SEP_SVG).length).toBe(3)
  for (const s of svgs) expect(s.props.isInteractive).toBeFalsy()
  expect(svgs.some(s => String(s.props.source).includes('<animate'))).toBe(true)
  // 图形里不再有文字
  expect(svgs.some(s => String(s.props.source).includes('<text'))).toBe(false)
  // 每组的第一张图带上这一组的说明
  expect(svgs.map(s => s.props.alt).filter(Boolean)).toEqual([
    '5-hour limit 20% used',
    '7-day limit 58% used',
    'context 100K of 1M',
    'cache hit 90%',
  ])
  const row = await desk.find({ type: 'Box' })
  expect(row?.props.justifyContent).toBe('space-between')
  expect(row?.props.flexWrap).toBe('wrap')
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
  const RED = DEFAULT_THEME.warn
  const colorOf = (m: Measure | null, t: Parameters<typeof layout>[1], text: string) =>
    layout(m, t, 0, 0).find(s => s.text === text)?.color
  const lim = (pct: number): Measure => ({
    context: { tokens: 1, window: 100, percent: 1 },
    rateLimits: [{ kind: 'five_hour', percentUsed: pct }],
  })
  expect(colorOf(lim(80), null, '80%')).toBe(RED)
  expect(colorOf(lim(79), null, '79%')).not.toBe(RED)
  const ctx = (percent: number): Measure => ({
    context: { tokens: percent * 1_000, window: 100_000, percent },
    rateLimits: [],
  })
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
  expect(layout(m, null, 0, 0).find(s => s.text === '850K')?.color).toBe(DEFAULT_THEME.warn)
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
  const five = desktopGroups(m, null, at)[0]
  expect(five?.alt).toBe('5-hour limit 0% used')
  // 桌面端同样没有倒计时，也没有它前面的刻度线
  expect(wordsOf(five)).toEqual(['5h', '0%'])
  expect(svgsOf(five)).not.toContain('class="rule"')
})

test('the bar highlight moves left to right and keeps the bar width', async () => {
  const at = (f: number) => bar(50, 8, '#5cc4d6', f)
  // 8 格的 50% 填 4 格；第 7 帧时扫光已经移到这 4 格之外，用作没有扫光的对照
  const plain = at(7).map(s => brightness(s.color))
  // 扫光每一帧向右移一格
  const glowAt = (f: number) => {
    const lift = at(f).map((s, i) => brightness(s.color) - plain[i]!)
    return lift.indexOf(Math.max(...lift))
  }
  expect(glowAt(0)).toBe(0)
  expect(glowAt(2)).toBe(2)
  expect(glowAt(3)).toBe(3)
  // 渐变：没有扫光时进度条从左到右变亮
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
  const glowAt = (pct: number, f: number) => {
    const plain = bar(pct, 8, '#5cc4d6', 12).map(s => brightness(s.color))
    const lift = bar(pct, 8, '#5cc4d6', f).map((s, i) => brightness(s.color) - plain[i]!)
    return lift.indexOf(Math.max(...lift))
  }
  for (const f of [0, 1, 2, 3, 13, 15]) expect(glowAt(50, f)).toBe(glowAt(90, f))
})

test('desktop context is a 2×10 dot matrix, top row first', async () => {
  const svgFor = (pct: number) => {
    const m: Measure = { context: { tokens: pct * 10_000, window: 1_000_000, percent: pct }, rateLimits: [] }
    return svgsOf(groupOf(desktopGroups(m, null, 0), 'ctx'))
  }
  expect(allCircles(svgFor(35))).toBe(20 + 7)
  expect(litDots(svgFor(35))).toBe(7)
  expect(litDots(svgFor(0))).toBe(0)
  expect(litDots(svgFor(100))).toBe(20)
  // 60%：填满整个上排，下排再亮两个点
  const rows = (svgFor(60).match(/<clipPath id="c">(.*?)<\/clipPath>/)?.[1] ?? '').match(/cy="[\d.]+"/g) ?? []
  expect(rows.filter(r => r === 'cy="6.6"').length).toBe(10)
  expect(rows.filter(r => r === 'cy="13.4"').length).toBe(2)
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
  const gs = desktopGroups({ context: { tokens: 1, window: 10, percent: 10 }, rateLimits: [] }, null, 0)
  for (const svg of [svgsOf(groupOf(gs, 'ctx')), SEP_SVG]) {
    expect(svg).toContain('color-scheme:light dark')
    expect(svg).toContain('prefers-color-scheme:dark')
  }
})

test('a redraw that changes nothing visible is not written', async () => {
  const at = Date.parse('2026-10-03T12:00:00Z')
  const m: Measure = {
    context: { tokens: 100_000, window: 1_000_000, percent: 10 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 20, resetsAt: new Date(at + 3 * 3_600_000 + 30 * 60_000).toISOString() },
    ],
  }
  const shown = (mm: Measure, when: number) => JSON.stringify(desktopGroups(mm, null, when))
  // 剩 3h30m 和再少 20 秒时都显示 3h30m；100,040 个 token 仍显示 100K
  expect(shown(m, at)).toBe(shown(m, at + 20_000))
  expect(shown(m, at)).toBe(shown({ ...m, context: { ...m.context, tokens: 100_040 } }, at))
  // 读数真的变了才算变
  expect(shown(m, at)).not.toBe(shown({ ...m, context: { ...m.context, tokens: 180_000 } }, at))
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
  const theme = themeFrom({
    limitWarn: 60,
    contextWarn: 30,
    cacheWarn: 95,
    colorWarn: '#ff0000',
    colorSevenDay: '#00ff00',
  })
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
  // 没超过阈值的数字不着色（用终端前景色），只有图形带颜色
  expect(colorOf('59%')).toBeUndefined()
  expect(colorOf('300K')).toBe('#ff0000')
  expect(colorOf('94%')).toBe('#ff0000')
  // 默认阈值下同样的读数都不报警
  const plain = (text: string) => layout(m, t, 0, 0).find(s => s.text === text)?.color
  expect(plain('60%')).toBeUndefined()
  expect(plain('94%')).toBeUndefined()
  // 桌面端同样使用配置：进度条带着各自的颜色，超过阈值的读数用警示色，其余文字不着色
  const gs = desktopGroups(m, t, 0, theme)
  expect(svgsOf(groupOf(gs, '5h'))).toContain(`--gl:${lighten('#ff0000', -0.12)}`)
  expect(svgsOf(groupOf(gs, '7d'))).toContain(`--gl:${lighten('#00ff00', -0.12)}`)
  expect(spansOf(groupOf(gs, '5h')).find(sp => sp.text === '60%')?.color).toBe(warnText('#ff0000'))
  expect(spansOf(groupOf(gs, '7d')).find(sp => sp.text === '59%')?.color).toBeUndefined()
})

test(
  'the band reads its colors and thresholds from the plugin options',
  { options: { limitWarn: 50, colorWarn: '#ff0000', colorContext: '#0000ff' } },
  async ($, on) => {
    mock.clock(on)
    on('session.measure', ($, e) => ({ changed: e.changed }))
    await $.session.measure({
      context: { tokens: 100_000, window: 1_000_000, percent: 10 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 55 }],
      changed: ['context', 'rateLimits'],
    })
    const ui = await $.ui.mount({ plugin: 'usage-band', surface: 'terminal', ...BAND })
    expect((await ui.find({ type: 'Text', text: '55%' }))?.props.color).toBe('#ff0000')
    // 上下文的图标带配置的颜色，数字不着色
    expect((await ui.find({ type: 'Text', text: '≡ ' }))?.props.color).toBe('#0000ff')
    expect((await ui.find({ type: 'Text', text: '100K' }))?.props.color).toBeUndefined()
    await ui.unmount()
    const desk = await $.ui.mount({ plugin: 'usage-band', surface: 'desktop', ...BAND })
    expect(String((await desk.find({ type: 'Svg' }))?.props.source)).toContain(`--gl:${lighten('#ff0000', -0.12)}`)
    expect((await desk.find({ type: 'Text', text: '55%' }))?.props.color).toBe(warnText('#ff0000'))
    await desk.unmount()
  },
)

test('desktop graphics start every shine at the same phase of one clock', async () => {
  expect(shineBegin(0)).toBe('-0.00s')
  expect(shineBegin(2_600 * 1000 + 1_300)).toBe('-1.30s')
  const m: Measure = {
    context: { tokens: 400_000, window: 1_000_000, percent: 40 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 30 },
      { kind: 'seven_day', percentUsed: 60 },
    ],
  }
  const gs = desktopGroups(m, null, 0, undefined, undefined, '-1.30s')
  const svg = gs.map(svgsOf).join('')
  // 两条进度条和上下文点阵，三处扫光同一个起点
  expect([...svg.matchAll(/begin="([^"]+)"/g)].map(x => x[1])).toEqual(['-1.30s', '-1.30s', '-1.30s'])
  // 每张图都是完整的 SVG 文档，带自己的样式（深色模式）和渐变定义
  for (const g of gs) {
    for (const it of g.items) {
      if (it.kind !== 'svg') continue
      expect(it.svg.startsWith('<svg')).toBe(true)
      expect(it.svg).toContain('prefers-color-scheme:dark')
    }
  }
  // 比较用的版本里没有残留占位符
  expect(JSON.stringify(desktopGroups(m, null, 0))).not.toContain('shine-begin')
})

test('desktop bars and the context dots stretch with the band width, within bounds', async () => {
  const m: Measure = {
    context: { tokens: 192_000, window: 1_000_000, percent: 19 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 3 },
      { kind: 'seven_day', percentUsed: 1 },
    ],
  }
  const t = { input: 0, output: 0, cacheRead: 100, cacheWrite: 0 }
  const at = (cols: number) => fitStretch(m, t, 0, DEFAULT_THEME, cols)
  // 越宽进度条越长、点阵列数越多，且有上下限
  expect(at(95).barW).toBeGreaterThan(76)
  expect(at(120).barW).toBeGreaterThan(at(95).barW)
  // 列数分档：更宽时不减少，跨档后增加
  expect(at(120).dotCols).toBeGreaterThanOrEqual(at(95).dotCols)
  expect(at(200).dotCols).toBeGreaterThan(at(60).dotCols)
  expect(at(400)).toEqual({ barW: BAR.max, dotCols: 50 })
  expect(at(40)).toEqual({ barW: BAR.min, dotCols: 10 })
  // 点阵列数只取整刻度的几档
  for (const cols of [40, 60, 80, 95, 120, 160, 400]) expect(DOT_STEPS).toContain(at(cols).dotCols)
  // 没有上报宽度时保持默认尺寸
  expect(at(0)).toEqual(DEFAULT_STRETCH)
  // 没有额度数据（非订阅账号）时，点阵独占剩余宽度
  const ctxOnly = fitStretch({ ...m, rateLimits: [] }, t, 0, DEFAULT_THEME, 95)
  expect(ctxOnly.dotCols).toBeGreaterThan(at(95).dotCols)
  // 伸缩后整行（含组间距）不超过这一行的估算宽度，不会被挤到换行
  for (const cols of [60, 95, 120, 160]) {
    const groups = desktopGroups(m, t, 0, DEFAULT_THEME, at(cols))
    const total = groups.reduce((n, g) => n + g.width, 0) + (groups.length - 1) * 30
    if (at(cols).barW > BAR.min) expect(total).toBeLessThanOrEqual((cols - 2) * PX_PER_COL)
  }
  // 进度条的底轨就是这个长度
  const svg = svgsOf(groupOf(desktopGroups(m, t, 0, DEFAULT_THEME, { barW: 200, dotCols: 10 }), '5h'))
  expect(svg).toMatch(/width="200" height="6"[^>]*class="track"/)
})

test('a wider dot matrix keeps two rows and the same fill ratio', async () => {
  const m: Measure = { context: { tokens: 500_000, window: 1_000_000, percent: 50 }, rateLimits: [] }
  const ctx = (dotCols: number) =>
    svgsOf(groupOf(desktopGroups(m, null, 0, DEFAULT_THEME, { barW: 76, dotCols }), 'ctx'))
  // 50%：10 列点亮 10 个，30 列点亮 30 个（都是整个上排）
  expect(litDots(ctx(10))).toBe(10)
  expect(litDots(ctx(30))).toBe(30)
  expect(allCircles(ctx(30))).toBe(60 + 30)
  const rows = new Set(ctx(30).match(/cy="[\d.]+"/g))
  expect(rows.size).toBe(2)
})

test('the desktop band sizes its bars from the columns it is given', async ($, on) => {
  mock.clock(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({
    context: { tokens: 100_000, window: 1_000_000, percent: 10 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 50 }],
    changed: ['context', 'rateLimits'],
  })
  const widthAt = async (bodyColumns: number) => {
    const ui = await $.ui.mount({
      plugin: 'usage-band',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: { ...BAND.props, bodyColumns } as never,
    })
    // 第一张图就是 5h 的进度条
    const bar = (await ui.findAll({ type: 'Svg' }))[0]
    await ui.unmount()
    return Number(bar?.props.width)
  }
  expect(await widthAt(60)).toBeGreaterThan(await widthAt(40))
})

test('a lone context group is named on the left, its dots on the right', async ($, on) => {
  mock.clock(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  // 截图里的情形：没有额度、还没有缓存命中率，只剩上下文一组，宽 95 列
  await $.session.measure({
    context: { tokens: 632_000, window: 1_000_000, percent: 63 },
    rateLimits: [],
    cost: { usd: 463 },
    changed: ['context', 'cost'],
  })
  const ui = await $.ui.mount({
    plugin: 'usage-band',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { ...BAND.props, bodyColumns: 95 } as never,
  })
  // 名称在左（中性文字，由 Claude 绘制），点阵在右；不再显示费用
  const label = await ui.find({ type: 'Text', text: 'Context' })
  expect(label).toBeDefined()
  expect(label?.props.color).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '632K' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\$/ })).toBeUndefined()
  expect((await ui.find({ type: 'Box' }))?.props.justifyContent).toBe('space-between')
  // 只有点阵这一张图，名称和点阵之间没有分隔线
  const svgs = await ui.findAll({ type: 'Svg' })
  expect(svgs.length).toBe(1)
  // 点阵 2×50，每点 1%：63% 点亮 63 个
  expect(allCircles(String(svgs[0]?.props.source))).toBe(50 * 2 + 63)
  await ui.unmount()
})

test('the context name shows only while context is the only group', async () => {
  const ctx: Measure = { context: { tokens: 850_000, window: 1_000_000, percent: 85 }, rateLimits: [] }
  const keys = (mm: Measure, t: Parameters<typeof desktopGroups>[1] = null) => desktopGroups(mm, t, 0).map(g => g.key)
  expect(keys(ctx)).toEqual(['label', 'ctx'])
  // 有了缓存命中率或额度，名称就去掉
  expect(keys(ctx, { input: 10, output: 0, cacheRead: 90, cacheWrite: 0 })).toEqual(['ctx', 'hit'])
  expect(keys({ ...ctx, rateLimits: [{ kind: 'five_hour', percentUsed: 10 }] })).toEqual(['5h', 'ctx'])
  // 上下文超过阈值时名称一起变成警示色
  const gs = desktopGroups(ctx, null, 0)
  expect(spansOf(gs[0])[0]?.color).toBe(warnText(DEFAULT_THEME.warn))
  // 名称和点阵之间不画分隔线
  expect(needsSep(gs, 1)).toBe(false)
  expect(needsSep(desktopGroups(ctx, { input: 10, output: 0, cacheRead: 90, cacheWrite: 0 }, 0), 1)).toBe(true)
})

test('desktop graphics are 20px tall and everything sits inside them', async () => {
  const m: Measure = {
    context: { tokens: 400_000, window: 1_000_000, percent: 40 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 30, resetsAt: new Date(3_600_000).toISOString() }],
  }
  const t = { input: 10, output: 0, cacheRead: 90, cacheWrite: 0 }
  const svgs = desktopGroups(m, t, 0).flatMap(g => g.items.flatMap(it => (it.kind === 'svg' ? [it.svg] : [])))
  for (const svg of [...svgs, SEP_SVG]) {
    expect(svg).toContain('height="20" viewBox="0 0 ')
    // 所有带 y 的元素（进度条、扫光、分隔线、刻度线）都落在 0–20 之内
    for (const [, y, h] of svg.matchAll(/<rect[^>]*?\sy="([\d.]+)"(?:[^>]*?height="([\d.]+)")?/g)) {
      expect(Number(y)).toBeGreaterThanOrEqual(0)
      expect(Number(y) + Number(h ?? 0)).toBeLessThanOrEqual(20)
    }
    for (const [, cy] of svg.matchAll(/cy="([\d.]+)"/g)) {
      expect(Number(cy)).toBeGreaterThan(0)
      expect(Number(cy)).toBeLessThan(20)
    }
  }
})

test("the default palette is Claude's: neutral figures, brand-colored graphics", async () => {
  expect(DEFAULT_THEME.hue).toEqual({ five: '#6a9bcc', seven: '#4f7aa6', ctx: '#d97757', cache: '#788c5d' })
  expect(DEFAULT_THEME.warn).toBe('#b8433b')
  const m: Measure = {
    context: { tokens: 300_000, window: 1_000_000, percent: 30 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 40 }],
  }
  const t = { input: 10, output: 0, cacheRead: 90, cacheWrite: 0 }
  const gs = desktopGroups(m, t, 0)
  // 平时所有文字都不指定颜色，用 Claude 的正文颜色
  expect(gs.flatMap(spansOf).every(sp => sp.color === undefined)).toBe(true)
  // 图形用品牌色，浅色模式略压暗、深色模式略调亮
  const svg = gs.map(svgsOf).join('')
  for (const hue of ['#6a9bcc', '#d97757', '#788c5d']) {
    expect(svg).toContain(`--gl:${lighten(hue, -0.12)};--gd:${lighten(hue, 0.12)}`)
  }
  // 底轨统一暖灰
  expect(svg).toContain('.track{fill:#b0aea5')
  // 超过阈值时文字用警示色
  const hot = desktopGroups({ ...m, rateLimits: [{ kind: 'five_hour', percentUsed: 90 }] }, t, 0)[0]
  expect(spansOf(hot).map(sp => sp.color)).toEqual([warnText('#b8433b'), warnText('#b8433b')])
})

test('the warning text color reads on both a light and a dark band', async () => {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255)
  }
  const contrast = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x! + 0.05) / (y! + 0.05)
  }
  // Text 只能给一个颜色：调到中间亮度，在 Claude 的浅色底框和深色底框上都看得清
  for (const warn of ['#b8433b', '#ff0000', '#550000']) {
    const c = warnText(warn)
    expect(contrast(c, '#f0f0ef')).toBeGreaterThan(3.4)
    expect(contrast(c, '#212121')).toBeGreaterThan(3.4)
  }
})
