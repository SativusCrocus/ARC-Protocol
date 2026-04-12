const AGENT_COLORS: Record<string, { color: string; glow: string; label: string }> = {};

const palette = [
  { color: "#F7931A", glow: "rgba(247,147,26,0.4)", label: "Agent A" },
  { color: "#00F0FF", glow: "rgba(0,240,255,0.4)", label: "Agent B" },
  { color: "#22c55e", glow: "rgba(34,197,94,0.4)", label: "Agent C" },
  { color: "#a855f7", glow: "rgba(168,85,247,0.4)", label: "Agent D" },
  { color: "#f43f5e", glow: "rgba(244,63,94,0.4)", label: "Agent E" },
  { color: "#eab308", glow: "rgba(234,179,8,0.4)", label: "Agent F" },
];

export function getAgentColor(pubkey: string, alias?: string) {
  if (AGENT_COLORS[pubkey]) return AGENT_COLORS[pubkey];

  const idx = Object.keys(AGENT_COLORS).length % palette.length;
  const entry = {
    ...palette[idx],
    label: alias || palette[idx].label,
  };
  AGENT_COLORS[pubkey] = entry;
  return entry;
}
