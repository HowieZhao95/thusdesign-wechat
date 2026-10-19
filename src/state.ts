import type { WeixinAccount } from "./protocol/types";

export type WechatPushScope = "bound-chat" | "same-project";

export type WechatBinding = {
  teamId: string;
  projectId: string;
  chatId: string;
  canvasId?: string;
};

export type WechatBrowse = {
  level: "teams" | "projects" | "chats";
  teamId: string | null;
  projectId: string | null;
  page: number;
  at: number;
};

export type WechatChannelState = {
  version: 1;
  ownerUserId: string | null;
  account: WeixinAccount | null;
  syncBuf: string;
  binding: WechatBinding | null;
  contextToken: string | null;
  pushScope: WechatPushScope;
  thinkingLevel: string | null;
  browse: WechatBrowse | null;
};

const PAGE_IDLE_MS = 30 * 60 * 1000;

export function emptyWechatState(): WechatChannelState {
  return {
    version: 1,
    ownerUserId: null,
    account: null,
    syncBuf: "",
    binding: null,
    contextToken: null,
    pushScope: "bound-chat",
    thinkingLevel: null,
    browse: null,
  };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() === value && value.length > 0
    ? value
    : null;
}

function account(value: unknown): WeixinAccount | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const accountId = text(row.accountId);
  const token = text(row.token);
  const baseUrl = text(row.baseUrl);
  if (!(accountId && token && baseUrl)) {
    return null;
  }
  const userId = text(row.userId);
  return {
    accountId,
    token,
    baseUrl,
    ...(userId ? { userId } : {}),
  };
}

function binding(value: unknown): WechatBinding | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const teamId = text(row.teamId);
  const projectId = text(row.projectId);
  const chatId = text(row.chatId);
  if (!(teamId && projectId && chatId)) {
    return null;
  }
  const canvasId = text(row.canvasId);
  return {
    teamId,
    projectId,
    chatId,
    ...(canvasId ? { canvasId } : {}),
  };
}

function browse(value: unknown, now: number): WechatBrowse | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const level = row.level;
  const at = row.at;
  const page = row.page;
  if (
    (level !== "teams" && level !== "projects" && level !== "chats") ||
    typeof at !== "number" ||
    now - at > PAGE_IDLE_MS ||
    typeof page !== "number" ||
    !Number.isInteger(page) ||
    page < 0
  ) {
    return null;
  }
  return {
    level,
    teamId: text(row.teamId),
    projectId: text(row.projectId),
    page,
    at,
  };
}

/** Whitelist restore. Unknown fields are dropped so a restart cannot revive them. */
export function normalizeWechatState(
  value: unknown,
  now = Date.now()
): WechatChannelState {
  const base = emptyWechatState();
  if (!value || typeof value !== "object") {
    return base;
  }
  const row = value as Record<string, unknown>;
  return {
    version: 1,
    ownerUserId: text(row.ownerUserId),
    account: account(row.account),
    syncBuf: typeof row.syncBuf === "string" ? row.syncBuf : "",
    binding: binding(row.binding),
    contextToken: text(row.contextToken),
    pushScope: row.pushScope === "same-project" ? "same-project" : "bound-chat",
    thinkingLevel: text(row.thinkingLevel),
    browse: browse(row.browse, now),
  };
}
