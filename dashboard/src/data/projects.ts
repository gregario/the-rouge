import type {
  ProjectSummary,
  ProjectDetail,
  Milestone,
  SeedingProgress,
  CostInfo,
  ConfidencePoint,
  Escalation,
} from '@/lib/types'

// ─── Helpers ─────────────────────────────────────────────────────────

const cost = (
  total: number,
  cap: number,
  tokens: number,
  deploys: number,
  other: number,
  updated: string,
): CostInfo => ({
  totalSpend: total,
  budgetCap: cap,
  breakdown: { llmTokens: tokens, deploys, other },
  lastUpdated: updated,
})

// ─── 1. Soundscape — seeding (3/8 disciplines done) ─────────────────

const soundscapeSeeding: SeedingProgress = {
  disciplines: [
    { discipline: 'brainstorming', status: 'complete', startedAt: '2026-04-01T09:00:00Z', completedAt: '2026-04-01T09:42:00Z' },
    { discipline: 'competition', status: 'complete', startedAt: '2026-04-01T09:43:00Z', completedAt: '2026-04-01T10:15:00Z' },
    { discipline: 'taste', status: 'complete', startedAt: '2026-04-01T10:16:00Z', completedAt: '2026-04-01T10:48:00Z' },
    { discipline: 'spec', status: 'in-progress', startedAt: '2026-04-01T10:50:00Z' },
    { discipline: 'infrastructure', status: 'pending' },
    { discipline: 'design', status: 'pending' },
    { discipline: 'legal-privacy', status: 'pending' },
    { discipline: 'marketing', status: 'pending' },
  ],
  currentDiscipline: 'spec',
  completedCount: 3,
  totalCount: 8,
}

// ─── 2. Epoch Timer — story-building (milestone 2/4) ────────────────

const epochTimerMilestones: Milestone[] = [
  {
    id: 'ms-et-1',
    title: 'Project scaffold',
    description: 'Next.js app with auth, DB schema, and CI pipeline',
    status: 'promoted',
    startedAt: '2026-03-25T08:00:00Z',
    completedAt: '2026-03-26T14:30:00Z',
    stories: [
      { id: 'st-et-1a', title: 'Scaffold Next.js with Tailwind and shadcn', status: 'done', acceptanceCriteria: ['next dev runs without errors', 'Tailwind classes render correctly', 'shadcn Button component imports successfully'], startedAt: '2026-03-25T08:00:00Z', completedAt: '2026-03-25T09:20:00Z' },
      { id: 'st-et-1b', title: 'Supabase auth with email magic link', status: 'done', acceptanceCriteria: ['User can sign up with email', 'Magic link arrives within 30s', 'Session persists across refresh'], startedAt: '2026-03-25T09:30:00Z', completedAt: '2026-03-25T14:10:00Z' },
      { id: 'st-et-1c', title: 'CI pipeline with GitHub Actions', status: 'done', acceptanceCriteria: ['Lint + type-check + test on every PR', 'Deploys to Cloudflare Pages on merge to main'], startedAt: '2026-03-26T08:00:00Z', completedAt: '2026-03-26T14:30:00Z' },
    ],
  },
  {
    id: 'ms-et-2',
    title: 'Core timer engine',
    description: 'Pomodoro timer with configurable work/break intervals and session history',
    status: 'in-progress',
    startedAt: '2026-03-28T09:00:00Z',
    stories: [
      { id: 'st-et-2a', title: 'Timer state machine with work/break/long-break cycles', status: 'done', acceptanceCriteria: ['Timer counts down from configured duration', 'Automatic transition between work and break', 'Long break triggers after N work cycles'], startedAt: '2026-03-28T09:00:00Z', completedAt: '2026-03-28T16:45:00Z' },
      { id: 'st-et-2b', title: 'Persistent session history in Supabase', status: 'done', acceptanceCriteria: ['Each completed session saved with start/end timestamps', 'Session list query returns last 30 days', 'Interrupted sessions marked as incomplete'], startedAt: '2026-03-29T08:00:00Z', completedAt: '2026-03-30T11:20:00Z' },
      { id: 'st-et-2c', title: 'Audio notifications for state transitions', status: 'done', acceptanceCriteria: ['Chime plays when work period ends', 'Different sound for break ending', 'User can mute notifications'], startedAt: '2026-03-30T13:00:00Z', completedAt: '2026-03-31T10:00:00Z' },
      { id: 'st-et-2d', title: 'Keyboard shortcuts for timer control', status: 'in-progress', acceptanceCriteria: ['Space toggles start/pause', 'Escape resets current session', 'Shortcuts shown in tooltip on hover'], startedAt: '2026-04-02T08:00:00Z' },
      { id: 'st-et-2e', title: 'Responsive timer display with progress ring', status: 'pending', acceptanceCriteria: ['SVG ring animates countdown', 'Works on mobile viewport (375px)', 'Respects prefers-reduced-motion'] },
    ],
  },
  {
    id: 'ms-et-3',
    title: 'Focus analytics dashboard',
    description: 'Weekly/monthly charts showing focus time trends and streaks',
    status: 'pending',
    stories: [
      { id: 'st-et-3a', title: 'Weekly focus time bar chart', status: 'pending', acceptanceCriteria: ['Recharts bar chart with 7-day view', 'Tooltip shows exact hours:minutes', 'Empty days show zero bar'] },
      { id: 'st-et-3b', title: 'Focus streak tracker', status: 'pending', acceptanceCriteria: ['Current streak count displayed prominently', 'Streak breaks on zero-session day', 'Personal best streak highlighted'] },
    ],
  },
  {
    id: 'ms-et-4',
    title: 'Settings and customization',
    description: 'User preferences for timer durations, themes, and notification sounds',
    status: 'pending',
    stories: [
      { id: 'st-et-4a', title: 'Configurable timer durations', status: 'pending', acceptanceCriteria: ['Sliders for work, break, long break durations', 'Presets for common configurations (25/5, 50/10)', 'Settings persist per user'] },
      { id: 'st-et-4b', title: 'Dark/light theme toggle', status: 'pending', acceptanceCriteria: ['Toggle in settings and header', 'Respects system preference by default', 'Theme persists across sessions'] },
    ],
  },
]

const epochTimerConfidence: ConfidencePoint[] = [
  { timestamp: '2026-03-25T12:00:00Z', value: 0.55 },
  { timestamp: '2026-03-26T12:00:00Z', value: 0.62 },
  { timestamp: '2026-03-28T12:00:00Z', value: 0.65 },
  { timestamp: '2026-03-29T12:00:00Z', value: 0.70 },
  { timestamp: '2026-03-30T12:00:00Z', value: 0.73 },
  { timestamp: '2026-03-31T12:00:00Z', value: 0.76 },
  { timestamp: '2026-04-02T12:00:00Z', value: 0.78 },
]

// ─── 3. Recipe Oracle — escalation (stuck on deploy) ─────────────────

const recipeOracleMilestones: Milestone[] = [
  {
    id: 'ms-ro-1',
    title: 'MCP server scaffold',
    description: 'TypeScript MCP server with tool registration and Supabase connection',
    status: 'promoted',
    startedAt: '2026-03-20T08:00:00Z',
    completedAt: '2026-03-21T17:00:00Z',
    stories: [
      { id: 'st-ro-1a', title: 'MCP SDK setup with tool registration', status: 'done', acceptanceCriteria: ['Server starts and responds to initialize', 'Tools listed in tools/list response'], startedAt: '2026-03-20T08:00:00Z', completedAt: '2026-03-20T14:00:00Z' },
      { id: 'st-ro-1b', title: 'Supabase client with recipe schema', status: 'done', acceptanceCriteria: ['Recipe table with name, ingredients, instructions, tags', 'Full-text search index on name and ingredients'], startedAt: '2026-03-20T14:30:00Z', completedAt: '2026-03-21T17:00:00Z' },
    ],
  },
  {
    id: 'ms-ro-2',
    title: 'Core recipe tools',
    description: 'Search, recommend, and substitution tools',
    status: 'in-progress',
    startedAt: '2026-03-22T08:00:00Z',
    stories: [
      { id: 'st-ro-2a', title: 'search-recipes tool with dietary filters', status: 'done', acceptanceCriteria: ['Searches by ingredient, cuisine, and dietary restriction', 'Returns top 10 matches with relevance score', 'Handles empty results gracefully'], startedAt: '2026-03-22T08:00:00Z', completedAt: '2026-03-23T12:00:00Z' },
      { id: 'st-ro-2b', title: 'recommend-recipe tool based on pantry contents', status: 'done', acceptanceCriteria: ['Accepts list of available ingredients', 'Scores recipes by ingredient coverage', 'Suggests missing ingredients for near-matches'], startedAt: '2026-03-23T13:00:00Z', completedAt: '2026-03-25T10:00:00Z' },
      { id: 'st-ro-2c', title: 'ingredient-substitute tool', status: 'in-progress', acceptanceCriteria: ['Maps common ingredient substitutions', 'Considers dietary restrictions in suggestions', 'Returns ratio adjustments'], startedAt: '2026-03-28T09:00:00Z' },
    ],
  },
  {
    id: 'ms-ro-3',
    title: 'Cloudflare Workers deployment',
    description: 'Deploy MCP server to Cloudflare Workers with D1 database',
    status: 'failed',
    startedAt: '2026-03-30T08:00:00Z',
    stories: [
      { id: 'st-ro-3a', title: 'Wrangler config with D1 binding', status: 'done', acceptanceCriteria: ['wrangler.toml with correct D1 binding', 'Local dev works with wrangler dev'], startedAt: '2026-03-30T08:00:00Z', completedAt: '2026-03-30T14:00:00Z' },
      { id: 'st-ro-3b', title: 'Staging deploy to Workers', status: 'failed', acceptanceCriteria: ['wrangler deploy succeeds to staging', 'Health check endpoint returns 200'], startedAt: '2026-03-30T14:30:00Z', failureReason: 'Wrangler build timeout — bundle exceeds 1MB compressed limit after 3 retry attempts' },
    ],
  },
]

const recipeOracleEscalations: Escalation[] = [
  {
    id: 'esc-ro-1',
    tier: 1,
    reason: 'Staging deploy failed — Wrangler build timeout after 3 retries. Bundle size 1.4MB compressed, exceeds 1MB Workers limit. Likely caused by Supabase client bundling unused modules.',
    state: 'escalation',
    createdAt: '2026-03-30T16:20:00Z',
  },
]

const recipeOracleConfidence: ConfidencePoint[] = [
  { timestamp: '2026-03-20T12:00:00Z', value: 0.60 },
  { timestamp: '2026-03-21T12:00:00Z', value: 0.68 },
  { timestamp: '2026-03-23T12:00:00Z', value: 0.72 },
  { timestamp: '2026-03-25T12:00:00Z', value: 0.75 },
  { timestamp: '2026-03-28T12:00:00Z', value: 0.73 },
  { timestamp: '2026-03-30T12:00:00Z', value: 0.65 },
  { timestamp: '2026-03-30T18:00:00Z', value: 0.52 },
]

// ─── 4. Fleet Dash — final-review ────────────────────────────────────

const fleetDashMilestones: Milestone[] = [
  {
    id: 'ms-fd-1',
    title: 'Data layer and auth',
    description: 'Supabase schema for vehicles, drivers, and routes with RLS policies',
    status: 'promoted',
    startedAt: '2026-03-15T08:00:00Z',
    completedAt: '2026-03-17T18:00:00Z',
    stories: [
      { id: 'st-fd-1a', title: 'Vehicle and driver schema with RLS', status: 'done', acceptanceCriteria: ['Tables for vehicles, drivers, routes, assignments', 'RLS policies scoped to org_id', 'Seed data for demo org'], startedAt: '2026-03-15T08:00:00Z', completedAt: '2026-03-16T12:00:00Z' },
      { id: 'st-fd-1b', title: 'Auth with org-scoped sessions', status: 'done', acceptanceCriteria: ['Supabase auth with email/password', 'Custom claims include org_id', 'Middleware redirects unauthenticated users'], startedAt: '2026-03-16T13:00:00Z', completedAt: '2026-03-17T18:00:00Z' },
    ],
  },
  {
    id: 'ms-fd-2',
    title: 'Fleet overview dashboard',
    description: 'Real-time vehicle status grid with map integration',
    status: 'promoted',
    startedAt: '2026-03-18T08:00:00Z',
    completedAt: '2026-03-22T16:00:00Z',
    stories: [
      { id: 'st-fd-2a', title: 'Vehicle status card grid', status: 'done', acceptanceCriteria: ['Cards show vehicle name, status, driver, last location', 'Color-coded status badges (active/idle/maintenance)', 'Grid responsive from 1-4 columns'], startedAt: '2026-03-18T08:00:00Z', completedAt: '2026-03-19T15:00:00Z' },
      { id: 'st-fd-2b', title: 'Route assignment table with drag-drop', status: 'done', acceptanceCriteria: ['DataTable with sortable columns', 'Drag to reassign driver to vehicle', 'Optimistic update with rollback on error'], startedAt: '2026-03-20T08:00:00Z', completedAt: '2026-03-22T16:00:00Z' },
    ],
  },
  {
    id: 'ms-fd-3',
    title: 'Reporting and exports',
    description: 'Utilization reports with CSV export and scheduled email delivery',
    status: 'promoted',
    startedAt: '2026-03-24T08:00:00Z',
    completedAt: '2026-03-28T17:00:00Z',
    stories: [
      { id: 'st-fd-3a', title: 'Vehicle utilization report', status: 'done', acceptanceCriteria: ['Weekly/monthly utilization percentage per vehicle', 'Recharts line chart with drill-down', 'Date range picker for custom periods'], startedAt: '2026-03-24T08:00:00Z', completedAt: '2026-03-26T12:00:00Z' },
      { id: 'st-fd-3b', title: 'CSV export for all reports', status: 'done', acceptanceCriteria: ['Download button on each report', 'CSV includes all visible columns', 'Filename includes date range'], startedAt: '2026-03-26T13:00:00Z', completedAt: '2026-03-28T17:00:00Z' },
    ],
  },
]

const fleetDashConfidence: ConfidencePoint[] = [
  { timestamp: '2026-03-15T12:00:00Z', value: 0.50 },
  { timestamp: '2026-03-17T12:00:00Z', value: 0.60 },
  { timestamp: '2026-03-19T12:00:00Z', value: 0.70 },
  { timestamp: '2026-03-22T12:00:00Z', value: 0.78 },
  { timestamp: '2026-03-26T12:00:00Z', value: 0.85 },
  { timestamp: '2026-03-28T12:00:00Z', value: 0.89 },
  { timestamp: '2026-04-01T12:00:00Z', value: 0.91 },
]

// ─── 5. Color Quiz — complete ────────────────────────────────────────

const colorQuizMilestones: Milestone[] = [
  {
    id: 'ms-cq-1',
    title: 'Game engine',
    description: 'Color matching game logic with progressive difficulty',
    status: 'promoted',
    startedAt: '2026-03-18T08:00:00Z',
    completedAt: '2026-03-22T15:00:00Z',
    stories: [
      { id: 'st-cq-1a', title: 'Color swatch matching gameplay', status: 'done', acceptanceCriteria: ['Show target color, 4 options to match', 'Correct answer triggers celebration animation', 'Wrong answer shows correct answer before continuing'], startedAt: '2026-03-18T08:00:00Z', completedAt: '2026-03-19T16:00:00Z' },
      { id: 'st-cq-1b', title: 'Progressive difficulty levels', status: 'done', acceptanceCriteria: ['Easy: primary colors only', 'Medium: secondary + tertiary', 'Hard: subtle shade differences'], startedAt: '2026-03-20T08:00:00Z', completedAt: '2026-03-22T15:00:00Z' },
    ],
  },
  {
    id: 'ms-cq-2',
    title: 'Polish and ship',
    description: 'Animations, sound effects, and Cloudflare Pages deployment',
    status: 'promoted',
    startedAt: '2026-03-24T08:00:00Z',
    completedAt: '2026-03-28T14:00:00Z',
    stories: [
      { id: 'st-cq-2a', title: 'Confetti animation on correct answers', status: 'done', acceptanceCriteria: ['Canvas-based confetti burst', 'Respects prefers-reduced-motion', 'Different intensity per streak length'], startedAt: '2026-03-24T08:00:00Z', completedAt: '2026-03-25T12:00:00Z' },
      { id: 'st-cq-2b', title: 'Deploy to Cloudflare Pages', status: 'done', acceptanceCriteria: ['Production build passes', 'Custom domain configured', 'Lighthouse score > 90 on all metrics'], startedAt: '2026-03-26T08:00:00Z', completedAt: '2026-03-28T14:00:00Z' },
    ],
  },
]

const colorQuizConfidence: ConfidencePoint[] = [
  { timestamp: '2026-03-18T12:00:00Z', value: 0.55 },
  { timestamp: '2026-03-20T12:00:00Z', value: 0.68 },
  { timestamp: '2026-03-22T12:00:00Z', value: 0.80 },
  { timestamp: '2026-03-25T12:00:00Z', value: 0.88 },
  { timestamp: '2026-03-28T12:00:00Z', value: 0.95 },
]

// ─── 6. Weather API — ready (specced, parked) ────────────────────────

const weatherApiMilestones: Milestone[] = [
  {
    id: 'ms-wa-1',
    title: 'API client and caching',
    description: 'OpenWeatherMap client with Redis caching layer',
    status: 'pending',
    stories: [
      { id: 'st-wa-1a', title: 'OpenWeatherMap API client', status: 'pending', acceptanceCriteria: ['Typed client for current weather and forecast endpoints', 'Rate limiting at 60 req/min', 'Graceful degradation on API errors'] },
      { id: 'st-wa-1b', title: 'Redis cache with TTL strategy', status: 'pending', acceptanceCriteria: ['Current weather cached for 10 minutes', 'Forecast cached for 1 hour', 'Cache bypass for force-refresh'] },
    ],
  },
  {
    id: 'ms-wa-2',
    title: 'REST API endpoints',
    description: 'Public REST API with API key auth and OpenAPI docs',
    status: 'pending',
    stories: [
      { id: 'st-wa-2a', title: 'GET /weather/:city endpoint', status: 'pending', acceptanceCriteria: ['Returns current conditions with temp, humidity, wind', 'Supports both city name and coordinates', 'Returns 404 for unknown locations'] },
      { id: 'st-wa-2b', title: 'API key authentication middleware', status: 'pending', acceptanceCriteria: ['X-API-Key header validation', 'Rate limiting per API key', 'Usage tracking per key'] },
    ],
  },
  {
    id: 'ms-wa-3',
    title: 'Monitoring and alerts',
    description: 'Uptime monitoring and severe weather alert forwarding',
    status: 'pending',
    stories: [
      { id: 'st-wa-3a', title: 'Health check and uptime endpoint', status: 'pending', acceptanceCriteria: ['GET /health returns upstream API status', 'Includes cache hit rate metric', 'Returns 503 when upstream is down'] },
    ],
  },
]

// ─── Summaries ───────────────────────────────────────────────────────

export const projects: ProjectSummary[] = [
  {
    id: 'proj-soundscape',
    name: 'Soundscape',
    slug: 'soundscape',
    description: 'Ambient sound generator — mix rain, fire, wind, and cafe noise into custom focus soundscapes',
    state: 'seeding',
    providers: ['vercel'],
    stack: { components: ['nextjs', 'tailwind', 'shadcn-ui'], resources: ['supabase', 'cloudflare'], apis: ['supabase-auth-ssr'] },
    health: 50,
    progress: 38,
    confidence: 0.40,
    cost: cost(1.80, 40, 1.60, 0, 0.20, '2026-04-01T10:50:00Z'),
    milestonesTotal: 0,
    milestonesCompleted: 0,
    seedingProgress: soundscapeSeeding,
    createdAt: '2026-04-01T09:00:00Z',
    updatedAt: '2026-04-01T10:50:00Z',
  },
  {
    id: 'proj-epoch-timer',
    name: 'Epoch Timer',
    slug: 'epoch-timer',
    description: 'Focus timer with pomodoro cycles, session history, and weekly analytics',
    state: 'story-building',
    providers: ['cloudflare'],
    stack: { components: ['nextjs', 'tailwind', 'recharts'], resources: ['supabase', 'stripe', 'cloudflare'], apis: ['stripe-checkout', 'supabase-rls'] },
    health: 78,
    progress: 68,
    confidence: 0.78,
    cost: cost(12.50, 50, 9.80, 1.90, 0.80, '2026-04-02T14:00:00Z'),
    milestonesTotal: 4,
    milestonesCompleted: 1,
    currentMilestone: 'Core timer engine',
    storiesInProgress: 1,
    storiesTotal: 5,
    createdAt: '2026-03-25T08:00:00Z',
    updatedAt: '2026-04-02T14:00:00Z',
  },
  {
    id: 'proj-recipe-oracle',
    name: 'Recipe Oracle',
    slug: 'recipe-oracle',
    description: 'Recipe recommendation MCP server — search by ingredients, dietary needs, and pantry contents',
    state: 'escalation',
    providers: ['cloudflare', 'supabase'],
    stack: { components: ['nextjs', 'tailwind', 'shadcn-ui'], resources: ['supabase', 'sentry', 'cloudflare'], apis: ['sentry-error-boundary', 'supabase-rls'] },
    health: 65,
    progress: 50,
    confidence: 0.52,
    cost: cost(18.30, 45, 12.10, 4.50, 1.70, '2026-03-30T16:20:00Z'),
    milestonesTotal: 3,
    milestonesCompleted: 1,
    currentMilestone: 'Cloudflare Workers deployment',
    escalation: {
      tier: 1,
      reason: 'Staging deploy failed — Wrangler build timeout after 3 retries',
    },
    createdAt: '2026-03-20T08:00:00Z',
    updatedAt: '2026-03-30T16:20:00Z',
  },
  {
    id: 'proj-fleet-dash',
    name: 'Fleet Dash',
    slug: 'fleet-dash',
    description: 'Fleet management dashboard — vehicle tracking, route assignment, and utilization reporting',
    state: 'final-review',
    providers: ['vercel', 'supabase'],
    stack: { components: ['nextjs', 'tailwind', 'shadcn-ui', 'recharts'], resources: ['supabase', 'stripe', 'sentry', 'cloudflare'], apis: ['stripe-checkout', 'stripe-webhooks', 'supabase-auth-ssr'] },
    health: 92,
    progress: 85,
    confidence: 0.91,
    cost: cost(34.20, 60, 24.50, 6.80, 2.90, '2026-04-01T12:00:00Z'),
    milestonesTotal: 3,
    milestonesCompleted: 3,
    stagingUrl: 'https://fleet-dash-staging.vercel.app',
    createdAt: '2026-03-15T08:00:00Z',
    updatedAt: '2026-04-01T12:00:00Z',
  },
  {
    id: 'proj-color-quiz',
    name: 'Color Quiz',
    slug: 'color-quiz',
    description: 'Kids color learning game — match swatches with progressive difficulty and celebration animations',
    state: 'complete',
    providers: ['cloudflare'],
    stack: { components: ['nextjs', 'tailwind', 'shadcn-ui'], resources: ['supabase', 'counterscale', 'cloudflare'], apis: ['supabase-auth-ssr'] },
    health: 98,
    progress: 95,
    confidence: 0.95,
    cost: cost(8.20, 30, 5.90, 1.60, 0.70, '2026-03-28T14:00:00Z'),
    milestonesTotal: 2,
    milestonesCompleted: 2,
    productionUrl: 'https://color-quiz.pages.dev',
    createdAt: '2026-03-18T08:00:00Z',
    updatedAt: '2026-03-28T14:00:00Z',
  },
  {
    id: 'proj-weather-api',
    name: 'Weather API',
    slug: 'weather-api',
    description: 'Weather API wrapper — current conditions and forecasts with Redis caching and API key auth',
    state: 'ready',
    providers: ['vercel'],
    stack: { components: ['nextjs', 'tailwind'], resources: ['supabase', 'cloudflare'], apis: ['supabase-rls'] },
    health: 50,
    progress: 25,
    confidence: 0.45,
    cost: cost(0, 35, 0, 0, 0, '2026-03-29T10:00:00Z'),
    milestonesTotal: 3,
    milestonesCompleted: 0,
    createdAt: '2026-03-29T10:00:00Z',
    updatedAt: '2026-03-29T10:00:00Z',
  },
]

// ─── Detail Records ──────────────────────────────────────────────────

export const projectDetails: Record<string, ProjectDetail> = {
  soundscape: {
    id: 'proj-soundscape',
    name: 'Soundscape',
    slug: 'soundscape',
    description: 'Ambient sound generator — mix rain, fire, wind, and cafe noise into custom focus soundscapes',
    state: 'seeding',
    providers: ['vercel'],
    stack: { components: ['nextjs', 'tailwind', 'shadcn-ui'], resources: ['supabase', 'cloudflare'], apis: ['supabase-auth-ssr'] },
    health: 50,
    progress: 38,
    confidence: 0.40,
    confidenceHistory: [
      { timestamp: '2026-04-01T09:00:00Z', value: 0.20 },
      { timestamp: '2026-04-01T09:42:00Z', value: 0.30 },
      { timestamp: '2026-04-01T10:15:00Z', value: 0.35 },
      { timestamp: '2026-04-01T10:48:00Z', value: 0.40 },
    ],
    cost: cost(1.80, 40, 1.60, 0, 0.20, '2026-04-01T10:50:00Z'),
    milestones: [],
    escalations: [],
    seedingProgress: soundscapeSeeding,
    createdAt: '2026-04-01T09:00:00Z',
    updatedAt: '2026-04-01T10:50:00Z',
  },
  'epoch-timer': {
    id: 'proj-epoch-timer',
    name: 'Epoch Timer',
    slug: 'epoch-timer',
    description: 'Focus timer with pomodoro cycles, session history, and weekly analytics',
    state: 'story-building',
    providers: ['cloudflare'],
    stack: { components: ['nextjs', 'tailwind', 'recharts'], resources: ['supabase', 'stripe', 'cloudflare'], apis: ['stripe-checkout', 'supabase-rls'] },
    health: 78,
    progress: 68,
    confidence: 0.78,
    confidenceHistory: epochTimerConfidence,
    cost: cost(12.50, 50, 9.80, 1.90, 0.80, '2026-04-02T14:00:00Z'),
    milestones: epochTimerMilestones,
    escalations: [],
    repoUrl: 'https://github.com/gregario/epoch-timer',
    createdAt: '2026-03-25T08:00:00Z',
    updatedAt: '2026-04-02T14:00:00Z',
  },
  'recipe-oracle': {
    id: 'proj-recipe-oracle',
    name: 'Recipe Oracle',
    slug: 'recipe-oracle',
    description: 'Recipe recommendation MCP server — search by ingredients, dietary needs, and pantry contents',
    state: 'escalation',
    providers: ['cloudflare', 'supabase'],
    stack: { components: ['nextjs', 'tailwind', 'shadcn-ui'], resources: ['supabase', 'sentry', 'cloudflare'], apis: ['sentry-error-boundary', 'supabase-rls'] },
    health: 65,
    progress: 50,
    confidence: 0.52,
    confidenceHistory: recipeOracleConfidence,
    cost: cost(18.30, 45, 12.10, 4.50, 1.70, '2026-03-30T16:20:00Z'),
    milestones: recipeOracleMilestones,
    escalations: recipeOracleEscalations,
    stagingUrl: 'https://recipe-oracle-staging.gregario.workers.dev',
    repoUrl: 'https://github.com/gregario/recipe-oracle',
    createdAt: '2026-03-20T08:00:00Z',
    updatedAt: '2026-03-30T16:20:00Z',
  },
  'fleet-dash': {
    id: 'proj-fleet-dash',
    name: 'Fleet Dash',
    slug: 'fleet-dash',
    description: 'Fleet management dashboard — vehicle tracking, route assignment, and utilization reporting',
    state: 'final-review',
    providers: ['vercel', 'supabase'],
    stack: { components: ['nextjs', 'tailwind', 'shadcn-ui', 'recharts'], resources: ['supabase', 'stripe', 'sentry', 'cloudflare'], apis: ['stripe-checkout', 'stripe-webhooks', 'supabase-auth-ssr'] },
    health: 92,
    progress: 85,
    confidence: 0.91,
    confidenceHistory: fleetDashConfidence,
    cost: cost(34.20, 60, 24.50, 6.80, 2.90, '2026-04-01T12:00:00Z'),
    milestones: fleetDashMilestones,
    escalations: [],
    stagingUrl: 'https://fleet-dash-staging.vercel.app',
    repoUrl: 'https://github.com/gregario/fleet-dash',
    createdAt: '2026-03-15T08:00:00Z',
    updatedAt: '2026-04-01T12:00:00Z',
  },
  'color-quiz': {
    id: 'proj-color-quiz',
    name: 'Color Quiz',
    slug: 'color-quiz',
    description: 'Kids color learning game — match swatches with progressive difficulty and celebration animations',
    state: 'complete',
    providers: ['cloudflare'],
    stack: { components: ['nextjs', 'tailwind', 'shadcn-ui'], resources: ['supabase', 'counterscale', 'cloudflare'], apis: ['supabase-auth-ssr'] },
    health: 98,
    progress: 95,
    confidence: 0.95,
    confidenceHistory: colorQuizConfidence,
    cost: cost(8.20, 30, 5.90, 1.60, 0.70, '2026-03-28T14:00:00Z'),
    milestones: colorQuizMilestones,
    escalations: [],
    productionUrl: 'https://color-quiz.pages.dev',
    repoUrl: 'https://github.com/gregario/color-quiz',
    createdAt: '2026-03-18T08:00:00Z',
    updatedAt: '2026-03-28T14:00:00Z',
  },
  'weather-api': {
    id: 'proj-weather-api',
    name: 'Weather API',
    slug: 'weather-api',
    description: 'Weather API wrapper — current conditions and forecasts with Redis caching and API key auth',
    state: 'ready',
    providers: ['vercel'],
    stack: { components: ['nextjs', 'tailwind'], resources: ['supabase', 'cloudflare'], apis: ['supabase-rls'] },
    health: 50,
    progress: 25,
    confidence: 0.45,
    confidenceHistory: [
      { timestamp: '2026-03-29T10:00:00Z', value: 0.45 },
    ],
    cost: cost(0, 35, 0, 0, 0, '2026-03-29T10:00:00Z'),
    milestones: weatherApiMilestones,
    escalations: [],
    createdAt: '2026-03-29T10:00:00Z',
    updatedAt: '2026-03-29T10:00:00Z',
  },
}
