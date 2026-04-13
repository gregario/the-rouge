import { subscribe, unsubscribe } from "@/lib/watcher-singleton";

export const dynamic = "force-dynamic";
// Keep the handler running on Node so fs.watch is available (Edge doesn't
// have filesystem APIs).
export const runtime = "nodejs";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: string) => {
        controller.enqueue(encoder.encode(payload));
      };

      // Initial handshake — mirrors the legacy bridge server's connect event
      // so existing clients that key off type:'connected' keep working.
      send('data: {"type":"connected"}\n\n');

      const id = subscribe(send, () => {
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      // Periodic keepalive — some intermediaries (proxies, load balancers,
      // Safari reconnection logic) close idle SSE streams. An SSE comment
      // line keeps the stream warm without triggering the client's
      // onmessage handler.
      const keepalive = setInterval(() => {
        try {
          send(": keepalive\n\n");
        } catch {
          clearInterval(keepalive);
        }
      }, 30000);

      // Clean up when the client disconnects.
      const abort = () => {
        clearInterval(keepalive);
        unsubscribe(id);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", abort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
