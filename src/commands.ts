const SLASH =
  /^\/(new|list|switch|model|current|cancel|help|more)(?::|\s+)?(.*)$/i;

export type WechatCommand =
  | { type: "help" }
  | { type: "current" }
  | { type: "cancel" }
  | { type: "new"; title?: string }
  | { type: "list" }
  | { type: "list-up" }
  | { type: "page-next" }
  | { type: "select"; raw: string }
  | { type: "model" }
  | { type: "model-pick"; index?: number; level?: string }
  | { type: "prompt"; text: string };

export function parseWechatCommand(input: string): WechatCommand {
  const text = input.trim();
  if (text === "查看其余" || text.toLowerCase() === "more") {
    return { type: "page-next" };
  }
  const match = SLASH.exec(text);
  if (!match) {
    return { type: "prompt", text };
  }
  const name = match[1]?.toLowerCase();
  const rest = match[2]?.trim() ?? "";
  switch (name) {
    case "help":
      return { type: "help" };
    case "current":
      return { type: "current" };
    case "cancel":
      return { type: "cancel" };
    case "more":
      return { type: "page-next" };
    case "new":
      return { type: "new", ...(rest ? { title: rest } : {}) };
    case "list":
      return rest === "up" || rest === "all"
        ? { type: "list-up" }
        : { type: "list" };
    case "switch":
      return { type: "select", raw: rest };
    case "model":
      return parseModel(rest);
    default:
      return { type: "prompt", text };
  }
}

function parseModel(rest: string): WechatCommand {
  if (!rest) {
    return { type: "model" };
  }
  const level = /(?:等级|level)\s+(\S+)/i.exec(rest);
  const withoutLevel = rest.replace(/(?:等级|level)\s+\S+/i, "").trim();
  const index = /^\d+$/.test(withoutLevel)
    ? Number.parseInt(withoutLevel, 10)
    : undefined;
  return {
    type: "model-pick",
    ...(index ? { index } : {}),
    ...(level?.[1] ? { level: level[1] } : {}),
  };
}

const ALLOW = new Set([
  "允许",
  "同意",
  "可以",
  "好",
  "行",
  "yes",
  "y",
  "allow",
  "ok",
  "okay",
]);
const DENY = new Set([
  "拒绝",
  "不允许",
  "不行",
  "不要",
  "否",
  "no",
  "n",
  "deny",
  "reject",
  "cancel",
  "取消",
]);

export function parseApprovalReply(reply: string): "allow" | "deny" | null {
  const text = reply.trim().toLowerCase();
  if (!text) {
    return null;
  }
  const word = text.split(/\s+/)[0] ?? "";
  if (DENY.has(word) || DENY.has(text)) {
    return "deny";
  }
  if (ALLOW.has(word) || ALLOW.has(text)) {
    return "allow";
  }
  return null;
}
