# thusdesign-wechat

ThusDesign 的微信远程通道。手机微信发来的消息进入桌面 Agent，回复再回到微信。不需要公网 IP。

协议层来自 [xcisxc29/dsh-wechat](https://github.com/xcisxc29/dsh-wechat)（MIT），钉在 commit `d9a113d6b31175c54cb7abe71da4573754333519`。这里只保留腾讯 iLink 的登录、长轮询、收发和媒体加解密。上游的 DeepSeek Harness 宿主和会话路由器没有引进。

## 包含什么

- `src/protocol`：扫码登录、长轮询、文本和媒体收发
- 绑定、斜杠命令、推送范围：团队 → 项目 → 当前用户自己的会话
- 状态文件只保存在本机，token 不进入公开状态

## 许可

MIT。协议文件的版权归 dsh-wechat 贡献者，见 [LICENSE](LICENSE) 和 [NOTICE.md](NOTICE.md)。
