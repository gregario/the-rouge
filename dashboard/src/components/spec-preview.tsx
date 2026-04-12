import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface SpecPreviewProps {
  completedCount: number
}

export function SpecPreview({ completedCount }: SpecPreviewProps) {
  const hasBrief = completedCount >= 1

  return (
    <div
      className="rounded-lg border border-gray-200 bg-gray-50"
      data-testid="spec-preview"
    >
      <Tabs defaultValue={hasBrief ? 'brainstorming-brief' : 'placeholder'}>
        <div className="border-b border-gray-200 px-4 pt-2">
          <TabsList variant="line">
            {hasBrief ? (
              <>
                <TabsTrigger value="brainstorming-brief">
                  brainstorming-brief
                </TabsTrigger>
                {completedCount >= 2 && (
                  <TabsTrigger value="competition-brief">
                    competition-brief
                  </TabsTrigger>
                )}
                {completedCount >= 3 && (
                  <TabsTrigger value="taste-gate">taste-gate</TabsTrigger>
                )}
              </>
            ) : (
              <TabsTrigger value="placeholder">Specs</TabsTrigger>
            )}
          </TabsList>
        </div>

        {hasBrief ? (
          <>
            <TabsContent value="brainstorming-brief" className="p-4">
              <p className="font-mono text-xs text-muted-foreground">
                # Brainstorming Brief{'\n\n'}
                Focus-first ambient sound mixer with saveable scenes.{'\n'}
                Target: knowledge workers replacing lo-fi YouTube tabs.{'\n'}
                Core concept: layered sounds with scene presets for instant switching.{'\n\n'}
                V2 backlog: browser extension with auto-trigger based on app detection.
              </p>
            </TabsContent>
            {completedCount >= 2 && (
              <TabsContent value="competition-brief" className="p-4">
                <p className="font-mono text-xs text-muted-foreground">
                  # Competition Brief{'\n\n'}
                  6 competitors mapped: Noisli, myNoise, A Soft Murmur, Coffitivity, Brain.fm, Focus@Will.{'\n'}
                  Primary gap: scene-based UX + non-looping audio quality.{'\n'}
                  Differentiation: scenes for acquisition, audio quality for retention.
                </p>
              </TabsContent>
            )}
            {completedCount >= 3 && (
              <TabsContent value="taste-gate" className="p-4">
                <p className="font-mono text-xs text-muted-foreground">
                  # Taste Gate — PASSED{'\n\n'}
                  Business model: free core + paid sound packs ($2-3 each).{'\n'}
                  V1 scope: web app, 6 base layers, scene save/switch, 2 premium packs.{'\n'}
                  AI-generated audio flagged for V2 exploration.
                </p>
              </TabsContent>
            )}
          </>
        ) : (
          <TabsContent value="placeholder" className="p-4">
            <p className="text-sm text-muted-foreground">
              Spec files will appear here as disciplines complete.
            </p>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
