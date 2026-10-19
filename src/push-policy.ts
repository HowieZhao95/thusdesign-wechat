import type { WechatBinding, WechatPushScope } from "./state";

export type WechatPushSource = {
  teamId: string;
  projectId: string;
  chatId: string;
  createdBy: string;
};

/** Bound chat by default. Same project only for the same chat owner. Never another team. */
export function allowWechatPush(
  scope: WechatPushScope,
  binding: WechatBinding | null,
  source: WechatPushSource,
  ownerUserId: string | null
): boolean {
  if (!(binding && ownerUserId) || source.createdBy !== ownerUserId) {
    return false;
  }
  if (source.teamId !== binding.teamId) {
    return false;
  }
  if (source.projectId !== binding.projectId) {
    return false;
  }
  if (scope === "bound-chat" && source.chatId !== binding.chatId) {
    return false;
  }
  return true;
}
