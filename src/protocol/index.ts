/**
 * iLink client only. Session routing and DSH host state stay out of this entry.
 */
export {
  APP_CLIENT_VERSION,
  APP_ID,
  BACKOFF_DELAY_MS,
  CDN_BASE_URL,
  CHANNEL_VERSION,
  DEFAULT_API_TIMEOUT_MS,
  DEFAULT_BOT_AGENT,
  DEFAULT_BOT_TYPE,
  DEFAULT_LOGIN_TIMEOUT_MS,
  DEFAULT_LONG_POLL_TIMEOUT_MS,
  DEFAULT_QR_POLL_TIMEOUT_MS,
  FIXED_BASE_URL,
  MAX_CONSECUTIVE_FAILURES,
  MAX_LONG_POLL_BACKOFF_MS,
  MAX_QR_REFRESH,
  RETRY_DELAY_MS,
  SESSION_PAUSE_MS,
  STALE_TOKEN_ERRCODE,
} from "./constants";
export {
  ChannelMonitor,
  conversationKey,
  extractText,
  mediaItems,
  sendText,
  toInbound,
  type InboundMessage,
  type MonitorStopReason,
} from "./channel";
export { aesKeyToBase64, decryptAesEcb, encryptAesEcb } from "./crypto";
export { ApiHttpError, apiCall, assertSendAccepted, parseWireJson } from "./http";
export { fetchQRCode, login, pollQRStatus, type LoginEvent } from "./login";
export {
  downloadItemMedia,
  isMediaItem,
  sendFile,
  sendImage,
  sendVideo,
  uploadMedia,
} from "./media";
export { UploadMediaType } from "./types";
export { silkToWav } from "./silk";
export type { MessageItem, WeixinAccount, WeixinMessage } from "./types";

export const THUSDESIGN_BOT_AGENT = "thusdesign-wechat/0.1";
