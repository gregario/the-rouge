import { SetupWizard } from '@/components/setup/setup-wizard'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Set up Rouge',
  description: 'One-time setup for The Rouge — prerequisites, integrations, and first project.',
}

export default function SetupPage() {
  return <SetupWizard />
}
