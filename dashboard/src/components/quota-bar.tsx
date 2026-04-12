import { Progress, ProgressLabel } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface QuotaBarProps {
  used: number
  limit: number
  label?: string
}

export function QuotaBar({ used, limit, label }: QuotaBarProps) {
  const pct = limit > 0 ? (used / limit) * 100 : 0
  const colorClass =
    pct > 80
      ? '[&_[data-slot=progress-indicator]]:bg-red-500'
      : pct >= 50
        ? '[&_[data-slot=progress-indicator]]:bg-amber-500'
        : '[&_[data-slot=progress-indicator]]:bg-green-500'

  return (
    <div data-testid="quota-bar">
      <div className="mb-1 flex items-center justify-between">
        {label && <span className="text-sm font-medium">{label}</span>}
        <span className="ml-auto text-sm tabular-nums text-muted-foreground" data-testid="quota-count">
          {used} / {limit}
        </span>
      </div>
      <Progress value={pct} className={cn(colorClass)}>
        <ProgressLabel className="sr-only">{label ?? 'Quota'}</ProgressLabel>
      </Progress>
    </div>
  )
}
