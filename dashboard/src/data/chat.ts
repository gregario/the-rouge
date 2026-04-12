import type { ChatMessage } from '@/lib/types'

/**
 * Seeding conversation for the Soundscape project.
 * Covers brainstorming, competition review, and taste disciplines.
 * Demonstrates progressive disclosure: questions are clear, reasoning is the "homework".
 */
export const soundscapeSeedingChat: ChatMessage[] = [
  // ── Brainstorming discipline ──────────────────────────────────────
  {
    id: 'chat-ss-01',
    role: 'rouge',
    type: 'transition',
    discipline: 'brainstorming',
    content: 'Starting brainstorming discipline for Soundscape.',
    timestamp: '2026-04-01T09:00:00Z',
  },
  {
    id: 'chat-ss-02',
    role: 'rouge',
    type: 'question',
    discipline: 'brainstorming',
    content: 'What problem are you actually solving? "Ambient sounds" is a feature, not a product. Is this about focus, relaxation, sleep, or something else entirely?',
    reasoning: 'The backlog entry says "ambient sound generator" which is dangerously generic. There are 200+ ambient sound apps. The interesting question is the context of use — focus sounds compete with lo-fi YouTube, sleep sounds compete with Calm/Headspace, relaxation is a therapy play. Each demands a radically different product.',
    options: [
      { label: 'A', text: 'Deep focus — replacing lo-fi playlists for knowledge workers' },
      { label: 'B', text: 'Sleep — competing with Calm and white noise machines' },
      { label: 'C', text: 'Creative atmosphere — soundscapes for writers, artists, game designers' },
      { label: 'D', text: 'Something else' },
    ],
    timestamp: '2026-04-01T09:01:00Z',
  },
  {
    id: 'chat-ss-03',
    role: 'human',
    type: 'answer',
    discipline: 'brainstorming',
    content: 'A — deep focus. I want this to replace the lo-fi girl YouTube tab. Programmable soundscapes that adapt, not just static playlists.',
    timestamp: '2026-04-01T09:05:00Z',
  },
  {
    id: 'chat-ss-04',
    role: 'rouge',
    type: 'question',
    discipline: 'brainstorming',
    content: 'What makes a soundscape "programmable"? Walk me through how a user would configure their ideal focus environment. Are we talking sliders, presets, AI-generated mixes, or time-based rules?',
    reasoning: 'The word "programmable" is doing a lot of work. Sliders (like Noisli) are the obvious version but low moat. Presets are simpler but commoditized. AI-generated mixes based on time-of-day or calendar density would be genuinely novel. Time-based rules ("rain during deep work, cafe sounds during meetings") create a product that learns your rhythm. Need to understand the ambition level.',
    timestamp: '2026-04-01T09:08:00Z',
  },
  {
    id: 'chat-ss-05',
    role: 'human',
    type: 'answer',
    discipline: 'brainstorming',
    content: 'Layers with sliders as the baseline. But the real magic would be scenes — save a combination as "morning deep work" or "afternoon coding" and switch between them. Maybe auto-switch based on time eventually.',
    timestamp: '2026-04-01T09:14:00Z',
  },
  {
    id: 'chat-ss-06',
    role: 'rouge',
    type: 'question',
    discipline: 'brainstorming',
    content: 'Scenes are a solid wedge. Last question for brainstorming: is this a standalone web app or does it integrate with something? The focus use case begs for a browser extension, a Raycast plugin, or a Slack status integration.',
    reasoning: 'Standalone web apps for ambient sound are a solved, crowded problem. The moat in "focus soundscapes" is likely in the integration layer — knowing when you are in focus mode and automatically adjusting. A browser extension that detects full-screen coding or writing apps and auto-starts a scene would be genuinely sticky. Worth exploring even if V1 is just a web app.',
    options: [
      { label: 'A', text: 'Standalone web app — keep it simple for V1' },
      { label: 'B', text: 'Web app + browser extension for auto-trigger' },
      { label: 'C', text: 'Web app + API that other tools can call' },
    ],
    timestamp: '2026-04-01T09:18:00Z',
  },
  {
    id: 'chat-ss-07',
    role: 'human',
    type: 'answer',
    discipline: 'brainstorming',
    content: 'A for V1. The extension idea is brilliant though — add it to the backlog for V2. Keep the architecture extensible.',
    timestamp: '2026-04-01T09:22:00Z',
  },

  // ── Competition discipline ────────────────────────────────────────
  {
    id: 'chat-ss-08',
    role: 'rouge',
    type: 'transition',
    discipline: 'competition',
    content: 'Brainstorming complete. Starting competition review.',
    timestamp: '2026-04-01T09:43:00Z',
  },
  {
    id: 'chat-ss-09',
    role: 'rouge',
    type: 'question',
    discipline: 'competition',
    content: 'I found 6 direct competitors: Noisli, myNoise, A Soft Murmur, Coffitivity, Brain.fm, and Focus@Will. The gap analysis shows two underserved areas: (1) saveable scene presets with instant switching, and (2) high-quality audio that does not loop obviously. Most competitors use short loops that become noticeable after 20 minutes. Does either of these resonate as your primary differentiation angle?',
    reasoning: 'Noisli is closest to the vision (sliders + mixing) but has no scene concept and uses 30-second loops. myNoise has exceptional audio quality but terrible UX. Brain.fm uses AI-generated audio but requires a subscription and is opaque about what it actually does. The "scenes + quality audio" combination is genuinely unoccupied. The non-obvious-loop problem is technically harder but creates real loyalty — users who notice loops never come back.',
    options: [
      { label: 'A', text: 'Scenes — the UX differentiation (faster to build)' },
      { label: 'B', text: 'Audio quality — long-form non-looping soundscapes (harder, stickier)' },
      { label: 'C', text: 'Both — scenes for V1 UX, invest in audio quality for retention' },
    ],
    timestamp: '2026-04-01T09:48:00Z',
  },
  {
    id: 'chat-ss-10',
    role: 'human',
    type: 'answer',
    discipline: 'competition',
    content: 'C. Scenes for the launch hook, audio quality for retention. Can we use AI-generated audio to avoid the loop problem?',
    timestamp: '2026-04-01T09:55:00Z',
  },
  {
    id: 'chat-ss-11',
    role: 'rouge',
    type: 'summary',
    discipline: 'competition',
    content: 'Competition review complete. Key findings: 6 competitors mapped. Primary gap: scene-based UX + non-looping audio. Differentiation strategy: scenes for acquisition, audio quality for retention. AI-generated audio flagged as V2 exploration — requires cost modelling for real-time generation. Proceeding to taste gate.',
    timestamp: '2026-04-01T10:15:00Z',
  },

  // ── Taste discipline ──────────────────────────────────────────────
  {
    id: 'chat-ss-12',
    role: 'rouge',
    type: 'transition',
    discipline: 'taste',
    content: 'Starting product taste discipline.',
    timestamp: '2026-04-01T10:16:00Z',
  },
  {
    id: 'chat-ss-13',
    role: 'rouge',
    type: 'question',
    discipline: 'taste',
    content: 'Taste challenge: this is a free-tier-heavy market. Noisli charges $10/month and has mediocre reviews about the price. Coffitivity is free forever. What is the business model? If it is ad-supported, the "focus" positioning is undermined. If it is subscription, you are fighting Noisli on price. If it is one-time purchase, you need a reason for ongoing development.',
    reasoning: 'The product vision is strong but the business model is the weakest link. Focus apps that charge subscriptions have high churn because users feel "I can just use YouTube." The one-time purchase model worked for iA Writer in the writing space. A freemium model (3 free scenes, unlimited for $5 one-time) could work if the free tier is genuinely useful but leaves you wanting more. Need to stress-test this before speccing.',
    options: [
      { label: 'A', text: 'Freemium — 3 scenes free, unlimited scenes for $5 one-time' },
      { label: 'B', text: 'Free with premium sound packs ($2-3 each)' },
      { label: 'C', text: 'Fully free, monetize the browser extension later' },
      { label: 'D', text: 'Subscription ($3/month) with generous free tier' },
    ],
    timestamp: '2026-04-01T10:20:00Z',
  },
  {
    id: 'chat-ss-14',
    role: 'human',
    type: 'answer',
    discipline: 'taste',
    content: 'B. Free core with premium sound packs. The base sounds are good enough to hook people, premium packs are for audiophiles who notice the loops. Aligns with the quality differentiation.',
    timestamp: '2026-04-01T10:28:00Z',
  },
  {
    id: 'chat-ss-15',
    role: 'rouge',
    type: 'summary',
    discipline: 'taste',
    content: 'Taste gate passed. Product approved for spec phase. Summary: Soundscape is a focus-first ambient sound mixer with saveable scenes and premium sound packs. V1 scope: web app with 6 base sound layers, scene save/switch, and 2 premium packs. Business model: free core + paid sound packs ($2-3). Differentiation: scene UX for acquisition, non-looping audio for retention. V2 backlog: browser extension with auto-trigger, AI-generated audio exploration.',
    timestamp: '2026-04-01T10:48:00Z',
  },
]
