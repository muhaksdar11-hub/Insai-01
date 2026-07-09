import { getQueueManager, QueueMessage } from '@/lib/redis/queue';

export const dynamic = 'force-dynamic';

export async function GET() {
  let interval: NodeJS.Timeout;
  let handleMessage: (msg: QueueMessage) => Promise<void>;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: {"status": "connected"}\n\n`));

      handleMessage = async (msg: QueueMessage) => {
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(msg)}\n\n`));
        } catch (e) {
          // ignore stream close errors
        }
      };

      getQueueManager().subscribe('events', handleMessage);

      // Keepalive ping
      interval = setInterval(() => {
        try {
          const pingMsg = JSON.stringify({ ping: Date.now() });
          controller.enqueue(new TextEncoder().encode(`data: ${pingMsg}\n\n`));
        } catch (e) {
          // ignore stream close errors
        }
      }, 15000);
    },
    cancel() {
      clearInterval(interval);
      if (handleMessage) {
        getQueueManager().unsubscribe('events', handleMessage);
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
