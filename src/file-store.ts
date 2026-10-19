import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { normalizeWechatState, type WechatChannelState } from "./state";

export async function readWechatStateFile(
  path: string
): Promise<WechatChannelState> {
  try {
    const raw = await readFile(path, "utf8");
    return normalizeWechatState(JSON.parse(raw) as unknown);
  } catch {
    return normalizeWechatState(null);
  }
}

/** Atomic replace. Mode 0600 so the bot token is not group-readable. */
export async function writeWechatStateFile(
  path: string,
  state: WechatChannelState
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state), { mode: 0o600 });
  await rename(tmp, path);
}
