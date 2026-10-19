import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { visibleProjects } from "../src/catalog";
import { parseApprovalReply, parseWechatCommand } from "../src/commands";
import { writeWechatStateFile } from "../src/file-store";
import { selectBrowseRow } from "../src/navigate";
import { toInbound } from "../src/protocol/channel";
import type { WeixinAccount, WeixinMessage } from "../src/protocol/types";
import { allowWechatPush } from "../src/push-policy";
import { createWechatRuntime, type WechatHost } from "../src/runtime";
import { normalizeWechatState } from "../src/state";

const account: WeixinAccount = {
  accountId: "bot@im.bot",
  token: "secret-token",
  baseUrl: "https://ilink.test",
  userId: "wx-user",
};

describe("wechat channel product rules", () => {
  it("drops unknown state and never treats a token as public status", () => {
    const state = normalizeWechatState({
      ownerUserId: "user-1",
      account,
      syncBuf: "cursor",
      binding: {
        teamId: "team",
        projectId: "project",
        chatId: "chat",
      },
      pushScope: "same-project",
      leaked: "nope",
    });
    expect(state.account?.token).toBe("secret-token");
    expect("leaked" in state).toBe(false);
    const runtime = createWechatRuntime({
      host: fakeHost(),
      readState: async () => state,
      writeState: async () => {},
    });
    runtime.replaceState(state);
    expect(JSON.stringify(runtime.status())).not.toContain("secret-token");
    expect(runtime.status().binding?.chatId).toBe("chat");
  });

  it("keeps local projects visible and hides other teams' cloud projects", () => {
    const visible = visibleProjects(
      [
        { id: "local", teamId: "owner", name: "Local", origin: "local" },
        { id: "mine", teamId: "team-a", name: "Mine", origin: "cloud" },
        { id: "other", teamId: "team-b", name: "Other", origin: "cloud" },
      ],
      "team-a"
    );
    expect(visible.map((project) => project.id)).toEqual(["local", "mine"]);
  });

  it("parses slash commands without treating prose as a command", () => {
    expect(parseWechatCommand("/list up")).toEqual({ type: "list-up" });
    expect(parseWechatCommand("/new 修复登录")).toEqual({
      type: "new",
      title: "修复登录",
    });
    expect(parseWechatCommand("/model 2 等级 高")).toEqual({
      type: "model-pick",
      index: 2,
      level: "高",
    });
    expect(parseWechatCommand("你好")).toEqual({
      type: "prompt",
      text: "你好",
    });
    expect(parseApprovalReply("不允许")).toBe("deny");
    expect(parseApprovalReply("可以")).toBe("allow");
    expect(parseApprovalReply("看看这个")).toBeNull();
  });

  it("binds a numbered chat without using another team's project", () => {
    const selected = selectBrowseRow(
      {
        level: "chats",
        teamId: "team-a",
        projectId: "project",
        page: 0,
        at: 0,
      },
      {
        teams: [{ id: "team-a", name: "A" }],
        projects: [
          {
            id: "project",
            teamId: "team-a",
            name: "P",
            origin: "cloud",
          },
        ],
        chats: [{ id: "chat-1", projectId: "project", title: "One" }],
        models: [],
        currentModelId: null,
      },
      "1",
      null,
      10
    );
    expect(selected.rebound).toBe(true);
    expect(selected.binding).toEqual({
      teamId: "team-a",
      projectId: "project",
      chatId: "chat-1",
    });
  });

  it("refuses a push from another member or another team", () => {
    const binding = {
      teamId: "team-a",
      projectId: "project",
      chatId: "chat",
    };
    expect(
      allowWechatPush(
        "same-project",
        binding,
        {
          teamId: "team-a",
          projectId: "project",
          chatId: "other",
          createdBy: "user",
        },
        "user"
      )
    ).toBe(true);
    expect(
      allowWechatPush(
        "bound-chat",
        binding,
        {
          teamId: "team-a",
          projectId: "project",
          chatId: "other",
          createdBy: "user",
        },
        "user"
      )
    ).toBe(false);
    expect(
      allowWechatPush(
        "same-project",
        binding,
        {
          teamId: "team-b",
          projectId: "project",
          chatId: "chat",
          createdBy: "user",
        },
        "user"
      )
    ).toBe(false);
    expect(
      allowWechatPush(
        "same-project",
        binding,
        {
          teamId: "team-a",
          projectId: "project",
          chatId: "chat",
          createdBy: "someone-else",
        },
        "user"
      )
    ).toBe(false);
  });

  it("ignores the bot's own echo and keeps a voice transcript", () => {
    const echo: WeixinMessage = {
      message_type: 2,
      from_user_id: "wx-user",
      item_list: [{ type: 1, text_item: { text: "echo" } }],
    };
    expect(toInbound(account, echo)).toBeUndefined();
    const voice: WeixinMessage = {
      message_type: 1,
      from_user_id: "wx-user",
      item_list: [{ type: 3, voice_item: { text: "你好" } }],
    };
    expect(toInbound(account, voice)?.text).toBe("你好");
  });

  it("writes the state file so only the owner can read it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wechat-state-"));
    const path = join(dir, "state.json");
    await writeWechatStateFile(path, normalizeWechatState({ account }));
    const mode = (await stat(path)).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(await readFile(path, "utf8")).toContain("secret-token");
    await rm(dir, { recursive: true });
  });

  it("sends a bound chat turn and returns the reply", async () => {
    const prompts: string[] = [];
    const host = fakeHost();
    host.submitTurn = async (input) => {
      prompts.push(input.text);
      return { reply: "回复" };
    };
    let body = "";
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url, init) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({ ret: 0, message_id: "m1" }), {
        status: 200,
      });
    }) as typeof fetch;
    try {
      const runtime = createWechatRuntime({
        host,
        readState: async () => normalizeWechatState(null),
        writeState: async () => {},
      });
      runtime.replaceState(
        normalizeWechatState({
          ownerUserId: "user",
          account,
          binding: {
            teamId: "team-a",
            projectId: "project",
            chatId: "chat",
          },
        })
      );
      await runtime.handleText("wx-user", "你好");
      expect(prompts).toEqual(["你好"]);
      expect(body).toContain("回复");
    } finally {
      globalThis.fetch = original;
    }
  });
});

function fakeHost(): WechatHost {
  return {
    ownerUserId: async () => "user",
    locale: async () => "zh",
    catalog: async () => ({
      teams: [{ id: "team-a", name: "A" }],
      projects: [
        { id: "project", teamId: "team-a", name: "P", origin: "cloud" },
      ],
      chats: [{ id: "chat", projectId: "project", title: "Chat" }],
      models: [{ id: "openai/gpt", name: "GPT" }],
      currentModelId: "openai/gpt",
    }),
    createChat: async () => "chat-new",
    submitTurn: async () => ({ reply: "" }),
    cancelActive: async () => {},
    setModel: async () => {},
    answerPermission: async () => "accepted",
    answerForm: async () => "accepted",
    saveInbound: async () => "wechat-inbox/file.png",
  };
}

afterEach(() => {
  /* fetch is restored by the test that stubs it */
});
