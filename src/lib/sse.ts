/**
 * Incremental parser for maestro's /chat/stream.
 *
 * maestro answers with sse-starlette's EventSourceResponse, so the wire format is
 * standard SSE: frames separated by a blank line, each carrying an `event:` name
 * and a `data:` payload. sse-starlette also emits `: ping` comment lines to keep
 * the connection alive through proxies — those are not events and must be dropped,
 * or Render's idle timeout handling looks like a protocol error.
 *
 * Written as a stateful parser rather than a split() because chunk boundaries fall
 * wherever the network decides, frequently mid-frame.
 */

export type SseFrame = { event: string; data: string };

export function createSseParser() {
  let buffer = '';

  return function push(chunk: string): SseFrame[] {
    buffer += chunk;
    const frames: SseFrame[] = [];

    // Frames end on a blank line. Anything after the last one is a partial frame
    // and stays in the buffer for the next chunk.
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      let event = 'message';
      const data: string[] = [];

      for (const line of raw.split('\n')) {
        if (line.startsWith(':')) continue; // keep-alive comment
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trim());
      }

      if (data.length > 0) frames.push({ event, data: data.join('\n') });
      boundary = buffer.indexOf('\n\n');
    }

    return frames;
  };
}
