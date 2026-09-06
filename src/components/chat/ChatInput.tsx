import { useState, type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  disabled?: boolean
  onSend: (text: string) => void
}

export function ChatInput({ disabled, onSend }: Props) {
  const [value, setValue] = useState('')

  const submit = () => {
    const text = value.trim()
    if (!text || disabled) return
    onSend(text)
    setValue('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="composer-shell">
      <div className="composer">
        <Textarea
          className="min-h-12 max-h-36 resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
          placeholder="输入你的研究需求…"
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <Button size="icon" onClick={submit} disabled={disabled || !value.trim()} aria-label="Send message">
          <Send aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
