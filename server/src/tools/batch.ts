import { z } from 'zod';
import { AppId, callHost } from '../bridge.js';
import { jsonResult, ToolDef } from './types.js';

/** A batch tool for one app: validates every step on the server, then runs them all in one host call. */
export function makeBatch(app: AppId, name: string, hostFn: string, tools: ToolDef[], intro: string): ToolDef {
  const byName = new Map(tools.filter((t) => t.app === app && t.hostFn && !t.run).map((t) => [t.name, t]));
  const allowed = [...byName.keys()].join(', ');
  return {
    name,
    description: `${intro} Each step is {tool, args} with the same args as that tool. Stops at the first failing step and reports it; earlier steps stay applied. Allowed tools: ${allowed}.`,
    input: {
      steps: z
        .array(z.object({ tool: z.string(), args: z.record(z.string(), z.any()).optional() }))
        .min(1)
        .max(200),
    },
    run: async ({ steps }) => {
      const prepared = (steps as { tool: string; args?: object }[]).map((s, i) => {
        const t = byName.get(s.tool);
        if (!t) throw new Error(`Step ${i + 1}: "${s.tool}" can't be used in a batch. Allowed: ${allowed}.`);
        const parsed = z.object(t.input).safeParse(s.args ?? {});
        if (!parsed.success) throw new Error(`Step ${i + 1} (${s.tool}): ${z.prettifyError(parsed.error)}`);
        return { fn: t.hostFn, args: parsed.data };
      });
      const data = await callHost(app, hostFn, { steps: prepared }, 300_000);
      if (data?.error) return { isError: true, content: [{ type: 'text', text: JSON.stringify(data) }] };
      return jsonResult(data);
    },
  };
}
