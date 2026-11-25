import "server-only";

import { EventEmitter } from "node:events";

type Change = {
  topic: "session" | "orders" | "alerts" | "checkout" | "trivia";
  tableId?: string;
};

const state = globalThis as typeof globalThis & { restaurantEvents?: EventEmitter };
const events = state.restaurantEvents ?? new EventEmitter();
events.setMaxListeners(0);
state.restaurantEvents = events;

export function publish(restaurantId: string, change: Change) {
  events.emit(restaurantId, change);
}

export function eventStream(request: Request, restaurantId: string, tableId?: string) {
  const encoder = new TextEncoder();
  let cancelStream = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;

      const send = (frame: string) => {
        if (closed) return;
        if ((controller.desiredSize ?? 0) <= 0) {
          dispose();
          return;
        }
        controller.enqueue(encoder.encode(frame));
      };

      const onChange = (change: Change) => {
        if (tableId && change.tableId && tableId !== change.tableId) return;
        send(`event: change\ndata: ${JSON.stringify({ topic: change.topic })}\n\n`);
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        events.off(restaurantId, onChange);
        request.signal.removeEventListener("abort", dispose);
        return true;
      };

      function dispose() {
        if (cleanup()) controller.close();
      }
      cancelStream = cleanup;

      events.on(restaurantId, onChange);
      request.signal.addEventListener("abort", dispose, { once: true });
      if (request.signal.aborted) {
        dispose();
        return;
      }
      send('retry: 3000\nevent: sync\ndata: {}\n\n');
      heartbeat = setInterval(() => send('event: sync\ndata: {}\n\n'), 15_000);
    },
    cancel() {
      cancelStream();
    },
  }, { highWaterMark: 16 });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
