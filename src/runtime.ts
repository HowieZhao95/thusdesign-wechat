import { randomUUID } from "node:crypto";
import type { WechatCatalog, WechatModelRow } from "./catalog";
import { shortId } from "./catalog";
import { parseApprovalReply, parseWechatCommand } from "./commands";
import { type WechatLocale, wechatCopy, wechatLocale } from "./copy";
import {
  browseFor,
  chatTitle,
  moveBrowseUp,
  projectName,
  renderBrowse,
  selectBrowseRow,
  teamName,
} from "./navigate";
import {
  ChannelMonitor,
  downloadItemMedia,
  type InboundMessage,
  login,
  sendFile,
  sendImage,
  sendText,
  sendVideo,
  THUSDESIGN_BOT_AGENT,
  UploadMediaType,
  uploadMedia,
} from "./protocol/index";
import {
  emptyWechatState,
  normalizeWechatState,
  type WechatChannelState,
  type WechatPushScope,
} from "./state";
import type { WechatPublicStatus } from "./status";

export type WechatPending =
  | {
      kind: "permission";
      interactionId: string;
      projectId: string;
      chatId: string;
      allowOptionId: string;
      denyOptionId: string;
      toolName: string;
    }
  | {
      kind: "form";
      interactionId: string;
      projectId: string;
      chatId: string;
      message: string;
    };

export type WechatHost = {
  ownerUserId(): Promise<string | null>;
  locale(): Promise<string | null>;
  catalog(input: {
    teamId: string | null;
    projectId: string | null;
    chatId: string | null;
  }): Promise<WechatCatalog>;
  createChat(projectId: string, title?: string): Promise<string>;
  submitTurn(input: {
    projectId: string;
    chatId: string;
    canvasId?: string;
    text: string;
    requestId: string;
    modelSelector?: string;
    thinkingLevel?: string;
  }): Promise<{ reply: string }>;
  cancelActive(projectId: string, chatId: string): Promise<void>;
  setModel(projectId: string, chatId: string, selector: string): Promise<void>;
  answerPermission(input: {
    interactionId: string;
    projectId: string;
    chatId: string;
    optionId: string;
  }): Promise<"accepted" | "settled">;
  answerForm(input: {
    interactionId: string;
    projectId: string;
    chatId: string;
    text: string;
  }): Promise<"accepted" | "settled">;
  saveInbound(input: {
    projectId: string;
    chatId: string;
    name: string;
    bytes: Uint8Array;
  }): Promise<string>;
};

export type WechatRuntime = {
  status(): WechatPublicStatus;
  replaceState(state: WechatChannelState): void;
  state(): WechatChannelState;
  setPushScope(scope: WechatPushScope): void;
  present(pending: WechatPending): Promise<void>;
  handleText(
    peerId: string,
    text: string,
    contextToken?: string
  ): Promise<void>;
  startMonitor(): void;
  stop(): Promise<void>;
  connect(signal: AbortSignal): Promise<void>;
  submitVerify(code: string): void;
  sendAttachment(input: {
    filename: string;
    bytes: Uint8Array;
    kind: "image" | "file" | "video" | "voice";
  }): Promise<void>;
};

export function createWechatRuntime(options: {
  host: WechatHost;
  readState: () => Promise<WechatChannelState>;
  writeState: (state: WechatChannelState) => Promise<void>;
  now?: () => number;
  onState?: (state: WechatChannelState) => void;
}): WechatRuntime {
  let state = emptyWechatState();
  let phase: WechatPublicStatus["phase"] = "disconnected";
  let qrPayload: string | null = null;
  let lastErrorCode: string | null = null;
  let pending: WechatPending | null = null;
  let monitor: ChannelMonitor | null = null;
  let monitorAbort: AbortController | null = null;
  let verifyWait: ((code: string) => void) | null = null;
  const now = options.now ?? Date.now;

  function localeOf(value: string | null): WechatLocale {
    return wechatLocale(value);
  }

  async function persist() {
    await options.writeState(state);
    options.onState?.(state);
  }

  async function say(text: string) {
    const account = state.account;
    const peer = account?.userId;
    if (!(account && peer && text.trim())) {
      return;
    }
    await sendText({
      account,
      to: peer,
      text,
      ...(state.contextToken ? { contextToken: state.contextToken } : {}),
    });
  }

  function publicStatus(): WechatPublicStatus {
    return {
      phase: state.account && phase === "disconnected" ? "connected" : phase,
      accountId: state.account?.accountId ?? null,
      qrPayload,
      qrDataUrl: null,
      pushScope: state.pushScope,
      binding: state.binding,
      desktopOnline: true,
      lastErrorCode,
    };
  }

  async function ensureOwner(): Promise<boolean> {
    const owner = await options.host.ownerUserId();
    if (!owner) {
      state = { ...state, binding: null, ownerUserId: null };
      phase = "disconnected";
      await persist();
      return false;
    }
    if (state.ownerUserId && state.ownerUserId !== owner) {
      state = { ...state, binding: null, ownerUserId: owner, browse: null };
      phase = "disconnected";
      await persist();
      const copy = wechatCopy(localeOf(await options.host.locale()));
      await say(copy.ownerChanged);
      return false;
    }
    if (!state.ownerUserId) {
      state = { ...state, ownerUserId: owner };
      await persist();
    }
    return true;
  }

  async function handleCommand(text: string) {
    const copy = wechatCopy(localeOf(await options.host.locale()));
    const command = parseWechatCommand(text);
    if (pending?.kind === "permission") {
      const decision = parseApprovalReply(text);
      if (decision && command.type === "prompt") {
        const optionId =
          decision === "allow" ? pending.allowOptionId : pending.denyOptionId;
        const current = pending;
        pending = null;
        await options.host.answerPermission({
          interactionId: current.interactionId,
          projectId: current.projectId,
          chatId: current.chatId,
          optionId,
        });
        return;
      }
    }
    if (pending?.kind === "form" && command.type === "prompt") {
      const current = pending;
      pending = null;
      await options.host.answerForm({
        interactionId: current.interactionId,
        projectId: current.projectId,
        chatId: current.chatId,
        text,
      });
      return;
    }
    const browse = browseFor(state, now());
    const catalog = await options.host.catalog({
      teamId: browse.teamId,
      projectId: browse.projectId,
      chatId: state.binding?.chatId ?? null,
    });
    if (command.type === "help") {
      await say(copy.help);
      return;
    }
    if (command.type === "current") {
      if (!state.binding) {
        await say(copy.needBinding);
        return;
      }
      await say(
        copy.current(
          teamName(catalog.teams, state.binding.teamId),
          projectName(catalog.projects, state.binding.projectId),
          chatTitle(catalog.chats, state.binding.chatId)
        )
      );
      return;
    }
    if (command.type === "cancel") {
      if (!state.binding) {
        await say(copy.needBinding);
        return;
      }
      await options.host.cancelActive(
        state.binding.projectId,
        state.binding.chatId
      );
      await say(copy.cancelled);
      return;
    }
    if (command.type === "new") {
      const projectId = browse.projectId ?? state.binding?.projectId;
      const teamId = browse.teamId ?? state.binding?.teamId;
      if (!(projectId && teamId)) {
        await say(copy.needBinding);
        return;
      }
      const chatId = await options.host.createChat(projectId, command.title);
      state = {
        ...state,
        binding: { teamId, projectId, chatId },
      };
      await persist();
      await say(copy.created(command.title ?? shortId(chatId)));
      return;
    }
    if (command.type === "list-up") {
      const next = moveBrowseUp(browse, now());
      state = { ...state, browse: next };
      await persist();
      await say(formatScreen(next, catalog, copy));
      return;
    }
    if (command.type === "list" || command.type === "page-next") {
      const next =
        command.type === "page-next"
          ? { ...browse, page: browse.page + 1, at: now() }
          : { ...browse, page: 0, at: now() };
      state = { ...state, browse: next };
      await persist();
      await say(formatScreen(next, catalog, copy));
      return;
    }
    if (command.type === "select") {
      const selected = selectBrowseRow(
        browse,
        catalog,
        command.raw,
        state.binding,
        now()
      );
      state = {
        ...state,
        browse: selected.browse,
        binding: selected.binding,
      };
      await persist();
      if (selected.rebound && selected.binding) {
        await say(
          copy.switched(chatTitle(catalog.chats, selected.binding.chatId))
        );
        return;
      }
      await say(formatScreen(selected.browse, catalog, copy));
      return;
    }
    if (command.type === "model" || command.type === "model-pick") {
      await handleModel(command, catalog, copy);
      return;
    }
    if (!state.binding) {
      const selected = selectBrowseRow(
        browse,
        catalog,
        text.trim(),
        state.binding,
        now()
      );
      if (selected.browse !== browse || selected.rebound) {
        state = {
          ...state,
          browse: selected.browse,
          binding: selected.binding,
        };
        await persist();
        await say(
          selected.rebound && selected.binding
            ? copy.switched(chatTitle(catalog.chats, selected.binding.chatId))
            : formatScreen(selected.browse, catalog, copy)
        );
        return;
      }
      await say(copy.needBinding);
      return;
    }
    try {
      const result = await options.host.submitTurn({
        projectId: state.binding.projectId,
        chatId: state.binding.chatId,
        ...(state.binding.canvasId ? { canvasId: state.binding.canvasId } : {}),
        text: command.text,
        requestId: randomUUID(),
        ...(catalog.currentModelId
          ? { modelSelector: catalog.currentModelId }
          : {}),
        ...(state.thinkingLevel ? { thinkingLevel: state.thinkingLevel } : {}),
      });
      if (result.reply.trim()) {
        await say(result.reply);
      }
    } catch {
      lastErrorCode = "sourceUnavailable";
      await say(copy.unavailable);
    }
  }

  async function handleModel(
    command: Extract<WechatCommand, { type: "model" | "model-pick" }>,
    catalog: WechatCatalog,
    copy: ReturnType<typeof wechatCopy>
  ) {
    if (!state.binding) {
      await say(copy.needBinding);
      return;
    }
    if (command.type === "model") {
      const lines = catalog.models.map(
        (model, index) =>
          `${index + 1}. ${model.name}${model.id === catalog.currentModelId ? " *" : ""}`
      );
      const current =
        catalog.models.find((model) => model.id === catalog.currentModelId)
          ?.name ??
        catalog.currentModelId ??
        "—";
      await say(`${copy.model(current)}\n${lines.join("\n")}`.trim());
      return;
    }
    const picked = command.index
      ? catalog.models[command.index - 1]
      : undefined;
    if (picked) {
      await options.host.setModel(
        state.binding.projectId,
        state.binding.chatId,
        picked.id
      );
    }
    if (command.level) {
      state = { ...state, thinkingLevel: command.level };
      await persist();
    }
    const name = picked?.name ?? catalog.currentModelId ?? command.level ?? "";
    await say(copy.modelSet(name));
  }

  return {
    status: publicStatus,
    state: () => state,
    replaceState(next) {
      state = normalizeWechatState(next, now());
      phase = state.account ? "connected" : "disconnected";
    },
    setPushScope(scope) {
      state = { ...state, pushScope: scope };
      void persist();
    },
    async present(next) {
      pending = next;
      const copy = wechatCopy(localeOf(await options.host.locale()));
      await say(
        next.kind === "permission"
          ? copy.approval(next.toolName)
          : copy.question(next.message)
      );
    },
    async handleText(peerId, text, contextToken) {
      if (state.account?.userId && peerId !== state.account.userId) {
        return;
      }
      if (contextToken) {
        state = { ...state, contextToken };
      }
      if (!(await ensureOwner())) {
        return;
      }
      await handleCommand(text);
    },
    startMonitor() {
      const account = state.account;
      if (!account || monitor) {
        return;
      }
      phase = "connected";
      monitorAbort = new AbortController();
      monitor = new ChannelMonitor({
        account,
        botAgent: THUSDESIGN_BOT_AGENT,
        initialSyncBuf: state.syncBuf,
        onSyncBuf: (buf) => {
          state = { ...state, syncBuf: buf };
          return persist();
        },
        onMessage: (message) => onInbound(message),
        onStop: (reason) => {
          if (reason === "stale-token") {
            phase = "stale";
            lastErrorCode = "stale-token";
          }
        },
      });
      void monitor.run(monitorAbort.signal);
    },
    async stop() {
      monitorAbort?.abort();
      await monitor?.notifyStop();
      monitor = null;
      monitorAbort = null;
      phase = state.account ? "connected" : "disconnected";
    },
    async connect(signal) {
      phase = "qr";
      qrPayload = null;
      const existing = state.account?.token ? [state.account.token] : [];
      const generator = login({ existingTokens: existing }, signal);
      let step = await generator.next();
      while (!step.done) {
        const event = step.value;
        if (event.kind === "qr") {
          phase = "qr";
          qrPayload = event.qrUrl;
        } else if (event.kind === "scanned") {
          phase = "scanned";
        } else if (event.kind === "verifycode-required") {
          const code = await new Promise<string>((resolve) => {
            verifyWait = resolve;
          });
          step = await generator.next(code);
          continue;
        } else if (event.kind === "confirmed") {
          state = {
            ...state,
            account: event.account,
            ownerUserId: await options.host.ownerUserId(),
          };
          phase = "connected";
          qrPayload = null;
          await persist();
          this.startMonitor();
          const copy = wechatCopy(localeOf(await options.host.locale()));
          await say(copy.connected);
        } else if (event.kind === "failed") {
          phase = "disconnected";
          lastErrorCode = "login-failed";
        } else if (event.kind === "already-bound") {
          phase = state.account ? "connected" : "disconnected";
        }
        step = await generator.next();
      }
    },
    submitVerify(code) {
      verifyWait?.(code);
      verifyWait = null;
    },
    async sendAttachment(input) {
      const account = state.account;
      const peer = account?.userId;
      if (!(account && peer)) {
        throw new Error("wechat-disconnected");
      }
      const common = {
        account,
        to: peer,
        ...(state.contextToken ? { contextToken: state.contextToken } : {}),
      };
      const mediaType =
        input.kind === "image"
          ? UploadMediaType.IMAGE
          : input.kind === "video"
            ? UploadMediaType.VIDEO
            : input.kind === "voice"
              ? UploadMediaType.VOICE
              : UploadMediaType.FILE;
      const uploaded = await uploadMedia({
        account,
        toUserId: peer,
        data: Buffer.from(input.bytes),
        fileName: input.filename,
        mediaType,
      });
      if (input.kind === "image") {
        await sendImage({ ...common, uploaded });
        return;
      }
      if (input.kind === "video") {
        await sendVideo({ ...common, uploaded });
        return;
      }
      await sendFile({ ...common, uploaded });
    },
  };

  async function onInbound(message: InboundMessage) {
    const saved = await saveMedia(message);
    const text = [message.text, ...saved].filter(Boolean).join("\n");
    if (!text) {
      return;
    }
    await runtimeHandle(message.peerId, text, message.contextToken);
  }

  async function saveMedia(message: InboundMessage): Promise<string[]> {
    if (!(state.binding && message.media?.length)) {
      return [];
    }
    const lines: string[] = [];
    for (const item of message.media) {
      const downloaded = await downloadItemMedia({ item }).catch(() => {});
      if (!downloaded) {
        if (item.voice_item?.text) {
          lines.push(item.voice_item.text);
        }
        continue;
      }
      const relativePath = await options.host.saveInbound({
        projectId: state.binding.projectId,
        chatId: state.binding.chatId,
        name: downloaded.fileName,
        bytes: downloaded.data,
      });
      lines.push(relativePath);
    }
    return lines;
  }

  async function runtimeHandle(
    peerId: string,
    text: string,
    contextToken?: string
  ) {
    await handleTextBound(peerId, text, contextToken);
  }

  async function handleTextBound(
    peerId: string,
    text: string,
    contextToken?: string
  ) {
    if (contextToken) {
      state = { ...state, contextToken };
    }
    if (state.account?.userId && peerId !== state.account.userId) {
      return;
    }
    if (!(await ensureOwner())) {
      return;
    }
    await handleCommand(text);
  }
}

type WechatCommand = ReturnType<typeof parseWechatCommand>;

function formatScreen(
  browse: ReturnType<typeof browseFor>,
  catalog: WechatCatalog,
  copy: ReturnType<typeof wechatCopy>
): string {
  const screen = renderBrowse(browse, catalog);
  if (screen.rows.length === 0) {
    return copy.empty;
  }
  const lines = screen.rows.map(
    (row) => `${row.n}. ${row.label} ${shortId(row.id)}`
  );
  lines.push(screen.hasMore ? copy.more : copy.end);
  return lines.join("\n");
}

export function modelLabel(
  models: readonly WechatModelRow[],
  id: string | null
) {
  return models.find((model) => model.id === id)?.name ?? id ?? "";
}
