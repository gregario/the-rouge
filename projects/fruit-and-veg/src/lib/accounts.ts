export type AccountStatus =
  | 'none'
  | 'pending_verification'
  | 'verified'
  | 'loading'
  | 'error'

export interface AccountState {
  status: AccountStatus
  email: string | null
  displayName: string | null
  error: string | null
}

export async function createAccount(
  email: string,
  displayName: string,
  guardianConfirmed: boolean
): Promise<{ accountId: string; status: string } | { error: string }> {
  const res = await fetch('/api/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, displayName, guardianConfirmed }),
  })
  return res.json()
}

export async function signIn(
  email: string
): Promise<{ message: string } | { error: string }> {
  const res = await fetch('/api/accounts/sign-in', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  return res.json()
}

export async function getProgress(): Promise<Record<string, unknown> | null> {
  const res = await fetch('/api/progress')
  if (!res.ok) return null
  return res.json()
}

export async function syncProgress(
  progress: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const res = await fetch('/api/progress', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(progress),
  })
  if (!res.ok) return null
  return res.json()
}

export async function deleteAccount(): Promise<{ deleted: boolean }> {
  const res = await fetch('/api/accounts', { method: 'DELETE' })
  return res.json()
}
