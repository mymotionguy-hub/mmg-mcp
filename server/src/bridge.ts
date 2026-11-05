// Client side of the bridge: talks HTTP to the MMG MCP panel running inside the app.

export type AppId = 'ae' | 'ppro';

export const APPS: Record<AppId, { label: string; port: number }> = {
  ae: { label: 'After Effects', port: Number(process.env.MMG_AE_PORT) || 47821 },
  ppro: { label: 'Premiere Pro', port: Number(process.env.MMG_PPRO_PORT) || 47822 },
};

/** An error with a plain-words message meant to be shown to the user as is. */
export class BridgeError extends Error {
  constructor(message: string, public kind: 'unreachable' | 'timeout' | 'host' = 'host') {
    super(message);
  }
}

function notReachable(app: AppId): string {
  const { label } = APPS[app];
  return `Can't reach ${label}. Make sure ${label} is open and the MMG MCP panel is open in it (Window > Extensions > MMG MCP).`;
}

async function request(app: AppId, path: string, body: unknown, timeoutMs: number): Promise<any> {
  const { label, port } = APPS[app];
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e: any) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new BridgeError(
        `${label} didn't answer within ${Math.round(timeoutMs / 1000)}s. It may be busy (rendering, loading) or showing a dialog box. Check the app, then try again.`,
        'timeout',
      );
    }
    throw new BridgeError(notReachable(app), 'unreachable');
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new BridgeError(`${label} sent back something unexpected: ${text.slice(0, 200)}`);
  }
}

/** Run a host (ExtendScript) function in the app and return its data. Throws BridgeError. */
export async function callHost(app: AppId, fn: string, args: object = {}, timeoutMs = 60_000): Promise<any> {
  const reply = await request(app, '/call', { fn, args }, timeoutMs);
  if (!reply || reply.ok !== true) {
    const err = reply?.error ?? {};
    const where = err.kind === 'script' && err.line ? ` (script line ${err.line} in ${fn})` : '';
    throw new BridgeError(`${APPS[app].label}: ${err.message ?? 'unknown error'}${where}`);
  }
  return reply.data;
}

/** Quick check that the panel is up. Returns null if the app/panel can't be reached. */
export async function ping(app: AppId, timeoutMs = 1500): Promise<any | null> {
  try {
    return await request(app, '/ping', undefined, timeoutMs);
  } catch {
    return null;
  }
}
