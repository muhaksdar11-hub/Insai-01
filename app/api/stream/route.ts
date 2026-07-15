import { getQueueManager, QueueMessage } from '@/lib/redis/queue';
import { logger } from '@/lib/utils/logger';
import { metricsEngine } from '@/lib/observability/metrics-engine';

export const dynamic = 'force-dynamic';

const globalAny = globalThis as any;
if (typeof globalAny.__streamCount === 'undefined') {
  globalAny.__streamCount = 0;
}

export async function GET(req: Request) {
  let interval: NodeJS.Timeout | undefined;
  let handleMessage: ((msg: QueueMessage) => Promise<void>) | undefined;
  let isClosed = false;
  globalAny.__streamCount++;
  metricsEngine.updateStreamConnections(globalAny.__streamCount);

  const cleanup = () => {
    if (isClosed) return; // Prevent double cleanup
    isClosed = true;
    if (interval) clearInterval(interval);
    if (handleMessage) {
       getQueueManager().unsubscribe('events', handleMessage).catch(() => {});
    }
    globalAny.__streamCount = Math.max(0, globalAny.__streamCount - 1);
    metricsEngine.updateStreamConnections(globalAny.__streamCount);
  };

  const stream = new ReadableStream({
    start(controller) {
      const enqueueSafe = (data: string) => {
        if (!isClosed) {
          try {
            controller.enqueue(new TextEncoder().encode(data));
          } catch (e) {
            cleanup();
          }
        }
      };
      
      enqueueSafe(`data: {"status": "connected"}\n\n`);
      
      handleMessage = async (msg: QueueMessage) => {
        if (isClosed) return;
        enqueueSafe(`data: ${JSON.stringify(msg)}\n\n`);
      };

      getQueueManager().subscribe('events', handleMessage).catch(e => {
         logger.error(`Stream redis subscribe error: ${e.message}`);
      });

      // Keepalive ping
      interval = setInterval(() => {
         if (isClosed) {
             clearInterval(interval);
             return;
         }
         enqueueSafe(`data: ${JSON.stringify({ ping: Date.now() })}\n\n`);
      }, 15000);
      
      req.signal.addEventListener('abort', () => {
        cleanup();
      });
    },
    cancel() {
      cleanup();
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
