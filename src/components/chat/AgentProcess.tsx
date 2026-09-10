import { ChevronDown } from 'lucide-react'

import { activityDisplayName, activityLabel, processSummary } from '@/components/a2ui/presentation'
import type { AgentActivity, TaskStatus } from '@/types/chat'

interface AgentProcessProps {
  activities: AgentActivity[]
  taskStatus: TaskStatus
  status: string
}

export function AgentProcess({ activities, taskStatus, status }: AgentProcessProps) {
  if (activities.length === 0 && taskStatus === 'COMPLETED') return null
  const summary = processSummary(taskStatus, activities)

  return (
    <details className="genui-process">
      <summary>
        <span className="genui-process__state" data-state={taskStatus.toLowerCase()} aria-hidden="true" />
        <span>{summary}</span>
        <span className="genui-process__hint">查看过程</span>
        <ChevronDown className="genui-process__chevron" aria-hidden="true" />
      </summary>
      <div className="genui-process__details">
        {status && <p className="genui-process__current">{status}</p>}
        <ol aria-label="研究过程详情">
          {activities.map((item) => (
            <li key={item.id}>
              <span>{activityDisplayName(item.actor)}</span>
              <span>{activityLabel(item.activity)}</span>
              {item.detail && <small>{item.detail}</small>}
            </li>
          ))}
        </ol>
      </div>
    </details>
  )
}
