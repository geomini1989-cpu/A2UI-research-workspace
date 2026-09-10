import { AsyncLocalStorage } from 'node:async_hooks'

export interface Usage { calls: number; promptTokens: number; completionTokens: number }
export interface RunContext { ownerId: string; signal: AbortSignal; mode: 'single' | 'multi'; usage: Usage }
export const runContext = new AsyncLocalStorage<RunContext>()
export const ownerId = () => runContext.getStore()?.ownerId ?? 'local'
export const newUsage = (): Usage => ({ calls: 0, promptTokens: 0, completionTokens: 0 })
export function requestSignal(timeout: number): AbortSignal {
  const signal = runContext.getStore()?.signal
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
}
export function recordUsage(usage: Partial<Usage>) {
  const target = runContext.getStore()?.usage
  if (!target) return
  target.calls += usage.calls ?? 0
  target.promptTokens += usage.promptTokens ?? 0
  target.completionTokens += usage.completionTokens ?? 0
}
