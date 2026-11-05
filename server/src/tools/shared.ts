import { APPS, AppId, callHost, ping } from '../bridge.js';
import { jsonResult, ToolDef } from './types.js';

async function appStatus(app: AppId) {
  const { label, port } = APPS[app];
  const p = await ping(app);
  if (!p) {
    return {
      connected: false,
      note: `${label} is closed, or the MMG MCP panel isn't open in it (Window > Extensions > MMG MCP).`,
    };
  }
  try {
    const info = await callHost(app, 'common_status', {}, 10_000);
    return { connected: true, port, panelVersion: p.panelVersion, ...info };
  } catch (e: any) {
    return { connected: true, port, panelVersion: p.panelVersion, error: e.message };
  }
}

export const sharedTools: ToolDef[] = [
  {
    name: 'status',
    description:
      'Check which editing apps are connected (After Effects, Premiere Pro), their versions and the open project. Call this first, and whenever another tool says it cannot reach an app.',
    input: {},
    run: async () => {
      const [afterEffects, premiere] = await Promise.all([appStatus('ae'), appStatus('ppro')]);
      return jsonResult({ afterEffects, premiere });
    },
  },
];
