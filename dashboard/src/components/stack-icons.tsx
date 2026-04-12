'use client'

import type { Provider } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'

type StackService = 'vercel' | 'cloudflare' | 'supabase' | 'stripe' | 'sentry' | 'postgresql' | 'nextjs' | 'posthog'

interface StackIconProps {
  service: StackService
  size?: number
  className?: string
}

function VercelIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 1L15 14H1L8 1Z" />
    </svg>
  )
}

function CloudflareIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M11.3 9.6c.1-.3.1-.6-.1-.8-.2-.2-.4-.3-.7-.3l-6.2.1c-.1 0-.1 0-.2-.1 0 0-.1-.1 0-.2.1-.2.2-.3.4-.3l6.3-.1c1-.1 2.1-.9 2.5-1.9l.5-1.3c0-.1.1-.2 0-.3C13.1 2.5 11.2 1 9 1 7 1 5.3 2.2 4.6 3.9c-.5-.4-1.2-.5-1.8-.3-.6.2-1 .7-1.2 1.3C.7 5.1 0 6 0 7c0 .1 0 .2.1.2 0 1.5 1.2 2.8 2.7 2.8h8.2c.2 0 .3-.1.3-.4z" />
    </svg>
  )
}

function SupabaseIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M9 15.3c-.3.4-.9.1-.9-.4V9.5h5.2c.7 0 1.1.8.6 1.3L9 15.3zM7 .7c.3-.4.9-.1.9.4V6.5H2.7c-.7 0-1.1-.8-.6-1.3L7 .7z" />
    </svg>
  )
}

function StripeIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M7.3 5.7c0-.6.5-.8 1.3-.8.8 0 1.7.2 2.5.7V3.2C10.3 2.9 9.4 2.6 8.6 2.6c-2 0-3.4 1.1-3.4 2.9 0 2.8 3.9 2.4 3.9 3.6 0 .7-.6.9-1.5.9-.9 0-2-.4-2.8-.9v2.4c1 .4 1.9.6 2.8.6 2.1 0 3.5-1 3.5-2.9-.1-3-4-2.5-4-3.5z" />
    </svg>
  )
}

function SentryIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M9.2 2.3c-.4-.7-1.4-.7-1.8 0L5.5 5.8c1.4.8 2.5 2.1 3 3.7H6.8c-.4-1.2-1.3-2.1-2.5-2.6L2.9 9.5c-.2.3 0 .7.4.7h1.4c0 1.9 1.2 3.5 2.9 4.2l.7-1.2c-1.1-.5-1.8-1.5-1.8-2.7H8c.4 0 .6-.4.4-.7L9.2 2.3z" />
    </svg>
  )
}

function PostgresIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 1C5.2 1 3 3.2 3 6v1.5C3 10.5 5.2 13 8 13h.5c0 1-.5 2-2 2h-.3v1H8c2 0 3-1.5 3-3V6c0-2.8-1.3-5-3-5zm0 1.5c1.1 0 2 1.6 2 3.5v3c-.5.3-1.2.5-2 .5s-1.5-.2-2-.5V6c0-1.9.9-3.5 2-3.5zM6.5 7a.75.75 0 100 1.5.75.75 0 000-1.5zm3 0a.75.75 0 100 1.5.75.75 0 000-1.5z" />
    </svg>
  )
}

function NextjsIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 5v6M6 5l5.5 7.5" strokeWidth="1.2" stroke="currentColor" fill="none" strokeLinecap="round" />
      <path d="M10.5 5v3" strokeWidth="1.2" stroke="currentColor" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function PostHogIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M2 3h3l8 8h-3L2 3zm0 5h3l5 5H7L2 8zm0 4h3l2 2H4l-2-2z" />
    </svg>
  )
}

const iconMap: Record<StackService, React.ComponentType<{ size?: number; className?: string }>> = {
  vercel: VercelIcon,
  cloudflare: CloudflareIcon,
  supabase: SupabaseIcon,
  stripe: StripeIcon,
  sentry: SentryIcon,
  postgresql: PostgresIcon,
  nextjs: NextjsIcon,
  posthog: PostHogIcon,
}

const serviceLabels: Record<StackService, string> = {
  vercel: 'Vercel',
  cloudflare: 'Cloudflare',
  supabase: 'Supabase',
  stripe: 'Stripe',
  sentry: 'Sentry',
  postgresql: 'PostgreSQL',
  nextjs: 'Next.js',
  posthog: 'PostHog',
}

export function StackIcon({ service, size = 24, className }: StackIconProps) {
  const Icon = iconMap[service]
  if (!Icon) return null
  return <Icon size={size} className={className} />
}

/** Row of provider icons for project cards — 24x24 with tooltips */
export function ProviderIcons({ providers, className }: { providers: Provider[]; className?: string }) {
  return (
    <TooltipProvider>
      <div className={cn('flex items-center gap-2', className)}>
        {providers.map((p) => (
          <Tooltip key={p}>
            <TooltipTrigger
              className="text-gray-400 transition-colors hover:text-gray-700"
            >
              <StackIcon service={p} size={24} />
            </TooltipTrigger>
            <TooltipContent>{serviceLabels[p]}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}

interface StackSlot {
  label: string
  service: StackService
  configured: boolean
}

/** Full stack status bar showing all possible integrations — 32x32 icons with tooltips */
export function StackBar({
  providers,
  className,
}: {
  providers: Provider[]
  className?: string
}) {
  const providerSet = new Set<string>(providers)

  const slots: StackSlot[] = [
    { label: 'Frontend', service: 'nextjs', configured: true },
    { label: 'Deploy', service: providerSet.has('vercel') ? 'vercel' : 'cloudflare', configured: providerSet.has('vercel') || providerSet.has('cloudflare') },
    { label: 'Database', service: 'supabase', configured: providerSet.has('supabase') },
    { label: 'Auth', service: 'supabase', configured: providerSet.has('supabase') },
    { label: 'Monitoring', service: 'sentry', configured: false },
    { label: 'Payments', service: 'stripe', configured: false },
  ]

  return (
    <TooltipProvider>
      <div className={cn('grid grid-cols-3 gap-3 sm:grid-cols-6', className)}>
        {slots.map((slot) => (
          <Tooltip key={slot.label}>
            <TooltipTrigger
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors',
                slot.configured
                  ? 'border-gray-200 bg-gray-50'
                  : 'border-gray-100 bg-gray-50/50',
              )}
            >
              <div className="relative">
                <StackIcon
                  service={slot.service}
                  size={32}
                  className={cn(
                    slot.configured ? 'text-gray-700' : 'text-gray-300',
                  )}
                />
                {slot.configured && (
                  <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-green-500" />
                )}
              </div>
              <span className={cn(
                'text-[10px] font-medium',
                slot.configured ? 'text-gray-500' : 'text-gray-300',
              )}>
                {slot.label}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {slot.configured ? `${serviceLabels[slot.service]} configured` : 'Not configured'}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  )
}
