/**
 * POST /api/feasibility — assess whether Rouge can take on a proposed
 * change.
 *
 * Phase 10 of the grand unified reconciliation. The `rouge feasibility`
 * CLI command runs `src/launcher/feasibility.js`'s `assess()` against
 * a proposal description. This route surfaces the same capability via
 * HTTP so the dashboard (or any HTTP client on the loopback interface)
 * can pre-flight a build before kicking off the loop.
 *
 * The actual UI for feasibility is dogfood-driven follow-up. This
 * route is the API foundation; once the dashboard team knows what
 * UX the affordance needs, the React component is a small addition.
 *
 * Request body:
 *   {
 *     "title": "Add Stripe checkout flow",
 *     "description": "..." (optional)
 *   }
 *
 * Response 200:
 *   {
 *     "verdict": "proceed" | "proceed-with-caveats" | "escalate" | "defer",
 *     "reasoning": "...",
 *     "checks": [{ name, status, detail }],
 *     "missing": [string]
 *   }
 *
 * Response 400 on missing/malformed body. Response 500 on assess() error.
 *
 * Localhost-guarded — the launcher's feasibility.js reads
 * rouge-vision.json and runs subprocess probes for tool installation;
 * we don't expose that to the open internet.
 */
import { NextResponse } from 'next/server'
import { assertLoopback } from '@/lib/localhost-guard'
import { sanitizedErrorResponse } from '@/lib/error-response'

export const dynamic = 'force-dynamic'

interface FeasibilityProposal {
  title: string
  description?: string
}

interface FeasibilityCheck {
  name: string
  status: string
  detail: string
}

interface FeasibilityResult {
  verdict: 'proceed' | 'proceed-with-caveats' | 'escalate' | 'defer'
  reasoning: string
  checks: FeasibilityCheck[]
  missing: string[]
}

interface FeasibilityModule {
  assess(proposal: FeasibilityProposal): FeasibilityResult
}

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await assertLoopback()
  if (guard) return guard

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'invalid JSON body' },
      { status: 400 },
    )
  }

  const proposal = body as Partial<FeasibilityProposal>
  if (!proposal || typeof proposal.title !== 'string' || proposal.title.trim() === '') {
    return NextResponse.json(
      { error: 'proposal.title (string) is required' },
      { status: 400 },
    )
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const feasibility = require('../../../../../src/launcher/feasibility.js') as FeasibilityModule
    const result = feasibility.assess({
      title: proposal.title,
      description: proposal.description,
    })
    return NextResponse.json(result)
  } catch (err) {
    return sanitizedErrorResponse(err, 'feasibility.assess failed')
  }
}
