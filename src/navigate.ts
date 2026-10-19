import {
  pageSlice,
  shortId,
  visibleProjects,
  WECHAT_PAGE_SIZE,
  type WechatCatalog,
  type WechatChatRow,
  type WechatProjectRow,
  type WechatTeamRow,
} from "./catalog";
import type {
  WechatBinding,
  WechatBrowse,
  WechatChannelState,
} from "./state";

export type WechatScreenRow = { n: number; id: string; label: string };

export function browseFor(
  state: WechatChannelState,
  now: number
): WechatBrowse {
  if (state.browse && now - state.browse.at < 30 * 60 * 1000) {
    return state.browse;
  }
  if (state.binding) {
    return {
      level: "chats",
      teamId: state.binding.teamId,
      projectId: state.binding.projectId,
      page: 0,
      at: now,
    };
  }
  return { level: "teams", teamId: null, projectId: null, page: 0, at: now };
}

export function moveBrowseUp(browse: WechatBrowse, now: number): WechatBrowse {
  if (browse.level === "chats") {
    return {
      level: "projects",
      teamId: browse.teamId,
      projectId: null,
      page: 0,
      at: now,
    };
  }
  return { level: "teams", teamId: null, projectId: null, page: 0, at: now };
}

function rowsFor(
  browse: WechatBrowse,
  catalog: WechatCatalog
): WechatScreenRow[] {
  const start = browse.page * WECHAT_PAGE_SIZE;
  if (browse.level === "teams") {
    return pageSlice(catalog.teams, browse.page).map((item, index) => ({
      n: start + index + 1,
      id: item.id,
      label: item.name,
    }));
  }
  if (browse.level === "projects") {
    return pageSlice(
      visibleProjects(catalog.projects, browse.teamId ?? ""),
      browse.page
    ).map((item, index) => ({
      n: start + index + 1,
      id: item.id,
      label: item.name,
    }));
  }
  return pageSlice(
    catalog.chats.filter((chat) => chat.projectId === browse.projectId),
    browse.page
  ).map((item, index) => ({
    n: start + index + 1,
    id: item.id,
    label: item.title,
  }));
}

export function renderBrowse(
  browse: WechatBrowse,
  catalog: WechatCatalog
): { rows: WechatScreenRow[]; hasMore: boolean } {
  const rows = rowsFor(browse, catalog);
  const total =
    browse.level === "teams"
      ? catalog.teams.length
      : browse.level === "projects"
        ? visibleProjects(catalog.projects, browse.teamId ?? "").length
        : catalog.chats.filter((chat) => chat.projectId === browse.projectId)
            .length;
  return {
    rows,
    hasMore: (browse.page + 1) * WECHAT_PAGE_SIZE < total,
  };
}

export function selectBrowseRow(
  browse: WechatBrowse,
  catalog: WechatCatalog,
  raw: string,
  binding: WechatBinding | null,
  now: number
): { browse: WechatBrowse; binding: WechatBinding | null; rebound: boolean } {
  const screen = renderBrowse(browse, catalog);
  const query = raw.trim();
  const byNumber = /^\d+$/.test(query)
    ? screen.rows.find((row) => row.n === Number.parseInt(query, 10))
    : undefined;
  const byId = screen.rows.find(
    (row) =>
      row.id === query || shortId(row.id) === query || row.label === query
  );
  const row = byNumber ?? byId;
  if (!row) {
    return { browse, binding, rebound: false };
  }
  if (browse.level === "teams") {
    return {
      browse: {
        level: "projects",
        teamId: row.id,
        projectId: null,
        page: 0,
        at: now,
      },
      binding,
      rebound: false,
    };
  }
  if (browse.level === "projects") {
    const project = catalog.projects.find((item) => item.id === row.id);
    return {
      browse: {
        level: "chats",
        teamId: project?.teamId ?? browse.teamId,
        projectId: row.id,
        page: 0,
        at: now,
      },
      binding,
      rebound: false,
    };
  }
  const chat = catalog.chats.find((item) => item.id === row.id);
  if (!(chat && browse.teamId && browse.projectId)) {
    return { browse, binding, rebound: false };
  }
  const project = catalog.projects.find((item) => item.id === browse.projectId);
  const next: WechatBinding = {
    teamId: project?.teamId ?? browse.teamId,
    projectId: chat.projectId,
    chatId: chat.id,
    ...(binding?.canvasId && binding.chatId === chat.id
      ? { canvasId: binding.canvasId }
      : {}),
  };
  return { browse: { ...browse, at: now }, binding: next, rebound: true };
}

export function teamName(teams: readonly WechatTeamRow[], id: string): string {
  return teams.find((team) => team.id === id)?.name ?? id;
}

export function projectName(
  projects: readonly WechatProjectRow[],
  id: string
): string {
  return projects.find((project) => project.id === id)?.name ?? id;
}

export function chatTitle(chats: readonly WechatChatRow[], id: string): string {
  return chats.find((chat) => chat.id === id)?.title ?? id;
}
