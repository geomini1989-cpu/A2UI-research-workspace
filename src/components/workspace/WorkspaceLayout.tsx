import { RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { ThemeToggle } from './ThemeToggle'

export function WorkspaceLayout() {
  const clear = useWorkspaceStore((s) => s.clear)
  const isGenerating = useWorkspaceStore((s) => s.isGenerating)

  return (
    <div className="conversation-host flex h-screen flex-col bg-background">
      <header className="host-header">
        <div className="host-header__inner">
          <div className="flex min-w-0 items-baseline gap-2">
            <h1>研究工作台</h1>
            <span>A2UI · Generative UI</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={clear}
            disabled={isGenerating}
            aria-label="清空对话"
            title="清空对话"
          >
            <RotateCcw aria-hidden="true" />
          </Button>
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <ChatPanel />
      </main>
    </div>
  )
}
