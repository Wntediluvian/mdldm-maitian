// 微信通知：经本机微信网关（weclaw）的统一入口 wx-notify 发到作者微信。
// 配置 config.wechat = { "notify": "<wx-notify.mjs 的绝对路径>", "from": "发布工作台" }；不配就整块不生效，照旧走飞书。
// wx-notify 的退出码：0 已发；2 没发出去（网关排队或暂存合并，作者下次在微信里开口时补发）；3 网关没在跑；1 出错。
// 这里只发一次、不重试；没发出去时由调用方决定要不要走别的渠道。
import { execFile } from 'node:child_process';

export function sendWechat(text, cfg, { quiet = false, file = '', project = '' } = {}) {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const head = lines.shift() || '工作台';
  const args = [cfg.notify, '--from', cfg.from || '发布工作台', head];
  if (project || cfg.project) args.push('--project', project || cfg.project);
  if (file) args.push('--file', file);   // 图片（如登录二维码）：wx-notify 立即发，不暂存合并
  if (lines.length) args.push(lines.join('\n'));
  return new Promise((resolve) => {
    execFile(process.execPath, args, { timeout: 45000, windowsHide: true }, (err, stdout) => {
      const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      const line = String(stdout || '').trim().split('\n').pop() || '';
      if (!quiet) console.log(`[微信] 退出码 ${code} ${line}`);
      resolve({ sent: code === 0, queued: code === 2, down: code === 3, code, line });
    });
  });
}
