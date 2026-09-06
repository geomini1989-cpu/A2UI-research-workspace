import * as React from 'react'
import { X } from 'lucide-react'

interface DetailDrawerProps {
  title: string
  triggerLabel?: string
  description?: string
  children: React.ReactNode
}

/**
 * Native dialog gives keyboard focus trapping, Escape-to-close, and focus
 * restoration without adding another UI dependency. It becomes full-screen on
 * small viewports and a restrained side drawer on larger hosts.
 */
export function DetailDrawer({
  title,
  triggerLabel = '查看详情',
  description,
  children,
}: DetailDrawerProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null)
  const titleId = React.useId()
  const descriptionId = React.useId()

  const open = () => dialogRef.current?.showModal()
  const close = () => dialogRef.current?.close()

  return (
    <>
      <button type="button" className="genui-detail-trigger" onClick={open}>
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        className="genui-drawer"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onClick={(event) => {
          if (event.target === dialogRef.current) close()
        }}
      >
        <div className="genui-drawer__panel">
          <header className="genui-drawer__header">
            <div>
              <h2 id={titleId}>{title}</h2>
              {description && <p id={descriptionId}>{description}</p>}
            </div>
            <button type="button" className="genui-icon-button" onClick={close} aria-label="关闭详情">
              <X aria-hidden="true" />
            </button>
          </header>
          <div className="genui-drawer__content">{children}</div>
        </div>
      </dialog>
    </>
  )
}
