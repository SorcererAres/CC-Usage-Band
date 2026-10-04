export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Measure = {
  context: { tokens?: number; window: number; percent?: number }
  rateLimits: Limit[]
  // 本会话累计费用（美元）；宿主没有账目时缺省
  cost?: number
}
export type TurnTokens = { input: number; output: number; cacheRead: number; cacheWrite: number }
export type Style = 'nerd' | 'unicode' | 'ascii'

declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      measure: Measure | null
      turn: TurnTokens | null
      now: number
      phase: number
      style: Style
    }
  }
}
