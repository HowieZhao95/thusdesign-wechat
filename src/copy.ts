export type WechatLocale = "zh" | "en";

export function wechatLocale(value: string | null | undefined): WechatLocale {
  return value?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

const COPY = {
  zh: {
    help: "命令：/new /list /list up /switch /model /current /cancel /help。查看其余翻页。",
    connected: "微信已连接。发一条消息给当前会话。",
    needBinding: "还没有绑定会话。用 /list 从团队、项目选到一条会话。",
    cancelled: "已停止当前会话里正在跑的回合。",
    switched: (title: string) => `已切换到「${title}」。`,
    created: (title: string) => `已新建会话「${title}」。`,
    current: (team: string, project: string, chat: string) =>
      `团队 ${team} / 项目 ${project} / 会话 ${chat}`,
    empty: "这一页没有可选项。",
    more: "回复「查看其余」看下一页。",
    end: "已经是最后一页。",
    approval: (tool: string) => `需要你确认：${tool}\n回复 允许 或 拒绝`,
    question: (body: string) => `${body}\n回复编号，或直接回复你的答案`,
    model: (name: string) => `当前模型：${name}`,
    modelSet: (name: string) => `已切换模型：${name}`,
    deniedPush: "这条会话不能推送到微信。",
    stale: "微信登录已失效，请在桌面重新扫码。",
    unavailable: "当前项目暂时不能执行，请稍后再试。",
    ownerChanged: "登录账号已变化，微信通道已停止。",
  },
  en: {
    help: "Commands: /new /list /list up /switch /model /current /cancel /help. Reply more for the next page.",
    connected: "WeChat is connected. Send a message to the bound chat.",
    needBinding:
      "No chat is bound yet. Use /list and pick a team, a project, then a chat.",
    cancelled: "Stopped the turn running in this chat.",
    switched: (title: string) => `Switched to “${title}”.`,
    created: (title: string) => `Started “${title}”.`,
    current: (team: string, project: string, chat: string) =>
      `Team ${team} / Project ${project} / Chat ${chat}`,
    empty: "Nothing on this page.",
    more: "Reply more for the next page.",
    end: "This is the last page.",
    approval: (tool: string) => `Please confirm: ${tool}\nReply allow or deny`,
    question: (body: string) =>
      `${body}\nReply with a number, or type your answer`,
    model: (name: string) => `Current model: ${name}`,
    modelSet: (name: string) => `Model set to ${name}.`,
    deniedPush: "This chat cannot push to WeChat.",
    stale: "WeChat login expired. Scan the code again on the desktop.",
    unavailable: "This project cannot run right now. Try again later.",
    ownerChanged:
      "The signed-in account changed, so the WeChat channel stopped.",
  },
} as const;

export function wechatCopy(locale: WechatLocale) {
  return COPY[locale];
}
