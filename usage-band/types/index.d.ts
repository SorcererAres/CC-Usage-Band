// 一个额度窗口：kind 如 five_hour、seven_day，percentUsed 是已用的百分比，resetsAt 是重置时间（ISO 8601）
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
// 一次用量读数：上下文窗口的占用，和各个额度窗口
export type Measure = {
  context: { tokens?: number; window: number; percent?: number }
  rateLimits: Limit[]
}
// 上一轮对话的 token 用量，用来算缓存命中率
export type TurnTokens = { input: number; output: number; cacheRead: number; cacheWrite: number }
// 终端图标样式
export type Style = 'nerd' | 'unicode' | 'ascii'

// 模组保存在会话里的状态，各个键与 hooks/register.tsx 里的 atom 一一对应
declare module 'claude-code' {
  interface PluginState {
    'usage-band': {
      // 最近一次用量读数
      measure: Measure | null
      // 上一轮的 token 用量
      turn: TurnTokens | null
      // 计算倒计时用的时刻（毫秒），只在显示内容会变时才更新
      now: number
      // 终端扫光的帧计数
      phase: number
      // 终端图标样式
      style: Style
    }
  }
}
