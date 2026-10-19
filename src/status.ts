import type { WechatBinding, WechatPushScope } from "./state";

export type WechatConnectionPhase =
  | "disconnected"
  | "qr"
  | "scanned"
  | "connected"
  | "stale";

/** Safe for renderer and Web. Tokens and cursors never appear here. */
export type WechatPublicStatus = {
  phase: WechatConnectionPhase;
  accountId: string | null;
  qrPayload: string | null;
  qrDataUrl: string | null;
  pushScope: WechatPushScope;
  binding: WechatBinding | null;
  desktopOnline: boolean;
  lastErrorCode: string | null;
};

export function disconnectedWechatStatus(): WechatPublicStatus {
  return {
    phase: "disconnected",
    accountId: null,
    qrPayload: null,
    qrDataUrl: null,
    pushScope: "bound-chat",
    binding: null,
    desktopOnline: false,
    lastErrorCode: null,
  };
}
