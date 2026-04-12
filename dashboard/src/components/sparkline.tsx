import { cn } from '@/lib/utils'

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  className?: string
}

function getTrend(data: number[]): 'up' | 'down' | 'flat' {
  if (data.length < 2) return 'flat'
  const first = data[0]
  const last = data[data.length - 1]
  const diff = last - first
  if (diff > 0.05) return 'up'
  if (diff < -0.05) return 'down'
  return 'flat'
}

const trendColors = {
  up: 'stroke-green-500',
  down: 'stroke-red-500',
  flat: 'stroke-gray-400',
}

export function Sparkline({
  data,
  width = 80,
  height = 24,
  className,
}: SparklineProps) {
  if (data.length === 0) return null

  const padding = 2
  const innerWidth = width - padding * 2
  const innerHeight = height - padding * 2

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data
    .map((value, i) => {
      const x = padding + (i / Math.max(data.length - 1, 1)) * innerWidth
      const y = padding + innerHeight - ((value - min) / range) * innerHeight
      return `${x},${y}`
    })
    .join(' ')

  const trend = getTrend(data)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('inline-block', className)}
      role="img"
      aria-label={`Sparkline trending ${trend}`}
    >
      <polyline
        points={points}
        fill="none"
        className={trendColors[trend]}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
