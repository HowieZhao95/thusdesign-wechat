export type WechatTeamRow = { id: string; name: string };
export type WechatProjectRow = {
  id: string;
  teamId: string;
  name: string;
  origin: "local" | "cloud";
};
export type WechatChatRow = { id: string; projectId: string; title: string };
export type WechatModelRow = {
  id: string;
  name: string;
  levels?: readonly string[];
};

export type WechatCatalog = {
  teams: readonly WechatTeamRow[];
  projects: readonly WechatProjectRow[];
  chats: readonly WechatChatRow[];
  models: readonly WechatModelRow[];
  currentModelId: string | null;
};

/**
 * Cloud rows belong to one team. Local-origin rows stay visible in every
 * workspace, matching `projectStore.list`.
 */
export function visibleProjects(
  projects: readonly WechatProjectRow[],
  teamId: string
): WechatProjectRow[] {
  return projects.filter(
    (project) => project.origin === "local" || project.teamId === teamId
  );
}

export const WECHAT_PAGE_SIZE = 10;

export function pageSlice<T>(items: readonly T[], page: number): T[] {
  const start = Math.max(0, page) * WECHAT_PAGE_SIZE;
  return items.slice(start, start + WECHAT_PAGE_SIZE);
}

export function shortId(id: string): string {
  return id.slice(0, 6);
}
