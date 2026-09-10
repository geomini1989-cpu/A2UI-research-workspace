import { RotateCcw, SlidersHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { ThemeToggle } from './ThemeToggle'

export function WorkspaceLayout() {
  const clear = useWorkspaceStore((s) => s.clear)
  const sendMessage = useWorkspaceStore((s) => s.sendMessage)
  const isGenerating = useWorkspaceStore((s) => s.isGenerating)

  const openCustomResearch = () => {
    void sendMessage('打开 NVIDIA 研究方案，我想自己选择研究方向')
  }

  return (
    <div className="conversation-host flex h-screen flex-col bg-background">
      <header className="host-header">
        <div className="host-header__inner">
          <div className="flex min-w-0 items-baseline gap-2">
            <h1>智研工作台</h1>
            <span>公司研究 · 对比分析 · 自定义研究 · 研究任务</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={openCustomResearch}
              disabled={isGenerating}
              className="gap-1.5"
            >
              <SlidersHorizontal aria-hidden="true" />
              <span>自定义研究</span>
            </Button>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={clear} disabled={isGenerating} aria-label="清空会话（保留研究任务）" title="清空会话（保留研究任务）">
              <RotateCcw aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1"><ChatPanel /></main>
    </div>
  )
}
