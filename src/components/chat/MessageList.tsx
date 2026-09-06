import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/types/chat'

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  if (messages.length === 0) {
    return null
  }
  return (
    <div className="conversation-messages">
      {messages.map((m) => (
        <div
          key={m.id}
          className={cn(
            'conversation-message whitespace-pre-wrap',
            m.role === 'user'
              ? 'conversation-message--user'
              : 'conversation-message--assistant',
          )}
        >
          {m.role === 'agent' && <span className="sr-only">Assistant: </span>}
          {m.content}
        </div>
      ))}
    </div>
  )
}
