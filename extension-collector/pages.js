// 在各平台页面里运行的读取函数。每个函数都只读已经渲染出来的文字，不调平台接口、不点按钮、不填任何东西。
// 它们会被 chrome.scripting.executeScript 原样注入页面，所以每个函数必须自包含，不能引用外面的变量。

// 把列表滚到底，让懒加载的条目出来
export async function scrollAll(rounds) {
  for (let i = 0; i < (rounds || 6); i++) {
    const sc = [...document.querySelectorAll('div')].filter((d) => d.scrollHeight > d.clientHeight + 200 && getComputedStyle(d).overflowY !== 'visible').sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (sc) sc.scrollTop = sc.scrollHeight;
    window.scrollBy(0, 3000);
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));
  }
  return true;
}

export function loggedOut() {
  const t = (document.body.innerText || '').slice(0, 4000);
  return /login|passport|signin/i.test(location.pathname + location.hostname) || /扫码登录|验证码登录|登录后|请先登录|立即登录|使用账号登录|微信扫一扫，选择公众平台账号登录/.test(t);
}

// 抖音 作品管理：页面上的时间是电脑本地时区
export function douyinList() {
  const wan = (s) => (s && s.endsWith('万') ? Math.round(parseFloat(s) * 10000) : s ? +s : null);
  const t = document.body.innerText.replace(/[ \t]+/g, ' ').replace(/\n+/g, ' | ');
  const re = /([^|]+?) \| (?:编辑作品 \| )?设置权限 \| 作品置顶 \| 删除作品 \| (\d{4})年(\d{2})月(\d{2})日 (\d{2}):(\d{2}) \| ([^|]+?) \| 播放 \| ([\d.万]+) \| 点赞 \| ([\d.万]+) \| 评论 \| ([\d.万]+) \| 分享 \| ([\d.万]+)(?: \| 收藏 \| ([\d.万]+))?/g;
  const items = [];
  let m;
  while ((m = re.exec(t))) items.push({ title: m[1].trim(), publishedAt: new Date(+m[2], +m[3] - 1, +m[4], +m[5], +m[6]).toISOString(), state: m[7].trim(), views: wan(m[8]), likes: wan(m[9]), comments: wan(m[10]), shares: wan(m[11]), favorites: m[12] ? wan(m[12]) : null });
  return { items };
}

// 抖音 首页：只认明确写着“粉丝”的数字；写的是别的（比如“粉丝指数”）就不取
export function douyinHome() {
  const m = document.body.innerText.match(/\n\s*粉丝\s*\n\s*([\d.万]+)/);
  const wan = (s) => (s.endsWith('万') ? Math.round(parseFloat(s) * 10000) : +s);
  const who = document.body.innerText.match(/抖音号[:：]\s*(\S+)/);
  return { account: who ? who[1] : '', followers: m ? wan(m[1]) : null };
}

// 小红书 首页：“828 粉丝数”
export function xhsHome() {
  const m = document.body.innerText.match(/([\d.万]+)\s*\n\s*粉丝数/);
  const wan = (s) => (s.endsWith('万') ? Math.round(parseFloat(s) * 10000) : +s);
  const who = document.body.innerText.match(/小红书账号[:：]\s*(\S+)/);
  return { account: who ? who[1] : '', followers: m ? wan(m[1]) : null };
}

// 小红书 笔记管理：标题 | 北京时间 | 观看 | 评论 | 点赞 | 收藏 | 分享
export function xhsList() {
  const t = document.body.innerText.replace(/[ \t]+/g, ' ').replace(/\n+/g, ' | ');
  const re = /([^|]+?) \| (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+)/g;
  const items = [];
  let m;
  while ((m = re.exec(t))) items.push({ title: m[1].trim(), publishedAt: `${m[2]}T${m[3]}:00+08:00`, views: +m[4], comments: +m[5], likes: +m[6], favorites: +m[7], shares: +m[8] });
  return { items };
}

// B站 图文管理：列表在 opus/management 这个内嵌页里，所有帧都会跑这个函数，只有它返回条目
export function biliList() {
  if (!/opus\/management/.test(location.href)) return null;
  const lines = document.body.innerText.split(/\n+/).map((s) => s.trim()).filter((s) => s && s.length <= 60);
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/);
    if (!m || i < 1) continue;
    const v = lines[i + 1];
    items.push({ title: lines[i - 1], publishedAt: `${m[1]}T${m[2]}:00+08:00`, views: /^\d+$/.test(v || '') ? +v : null });
  }
  return { items };
}

// 公众号 首页：总用户数，和“近期发表”里每篇的阅读数。时间是“今天”“星期一”这种，所以按标题对
export function wechatHome() {
  const t = document.body.innerText.replace(/[ \t]+/g, ' ').replace(/\n+/g, ' | ');
  const f = t.match(/总用户数 \| ([\d,]+)/);
  const items = [];
  const re = /已发表 \| ([^|]+?) \| (\d+) \| (\d+) \| (\d+) \| (\d+)/g;
  let m;
  while ((m = re.exec(t))) items.push({ title: m[1].trim(), views: +m[2], likes: +m[3], shares: +m[4], comments: +m[5] });
  // 公众号后台页面上没有固定的账号编号，把页面开头一段文字交回去，由调用方看里面有没有账号名
  return { head: t.slice(0, 400), followers: f ? +f[1].replace(/,/g, '') : null, items };
}

// X 个人主页：边滚边记每条帖子的编号和读数（列表是虚拟滚动的，滚过去的条目会被移除）
export async function xProfile() {
  await new Promise((r) => setTimeout(r, 3000));
  const seen = new Map();
  const pick = (lab, word) => { const m = lab.match(new RegExp('(\\d[\\d,.]*)\\s*(?:次)?' + word)); return m ? +m[1].replace(/[,.]/g, '') : null; };
  // 等第一批帖子出来再开始（最多 15 秒）
  for (let i = 0; i < 15 && !document.querySelector('article'); i++) await new Promise((r) => setTimeout(r, 1000));
  // 列表是虚拟滚动的：一次只滚大半屏，滚太快会跳过还没渲染出来的帖子。滚到底（连续 3 次滚不动）或 60 次为止
  let stuck = 0, lastY = -1;
  for (let i = 0; i < 60 && stuck < 3; i++) {
    document.querySelectorAll('article').forEach((a) => {
      const link = [...a.querySelectorAll('a[href*="/status/"]')].map((x) => x.getAttribute('href')).find((h) => /\/status\/\d+$/.test(h)) || '';
      const g = a.querySelector('[role=group]');
      const lab = g ? g.getAttribute('aria-label') || '' : '';
      const time = a.querySelector('time');
      if (link && !seen.has(link)) seen.set(link, { statusId: link.split('/').pop(), publishedAt: time ? time.dateTime : null, views: pick(lab, '观看') ?? pick(lab, 'views?'), likes: pick(lab, '喜欢') ?? pick(lab, 'likes?'), comments: pick(lab, '回复') ?? pick(lab, 'repl'), shares: pick(lab, '转帖') ?? pick(lab, 'reposts?'), favorites: pick(lab, '书签') ?? pick(lab, 'bookmarks?') });
    });
    window.scrollBy(0, Math.max(400, Math.round(window.innerHeight * 0.7)));
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 500));
    stuck = Math.abs(window.scrollY - lastY) < 5 ? stuck + 1 : 0;
    lastY = window.scrollY;
  }
  const fol = [...document.querySelectorAll('a[href$="/verified_followers"],a[href$="/followers"]')].map((a) => a.innerText.replace(/\s+/g, ' ')).join(' ');
  const fm = fol.match(/([\d,.]+)\s*(万)?\s*(?:关注者|Followers)/i);
  return { followers: fm ? Math.round(parseFloat(fm[1].replace(/,/g, '')) * (fm[2] ? 10000 : 1)) : null, items: [...seen.values()] };
}

// 公众号登录页上的二维码，画成 PNG 交回去（同源图片，画布不会被污染）。只读，不点不填
export function wechatQr() {
  const i = document.querySelector('img.login__type__container__scan__qrcode');
  if (!i || !i.complete || !i.naturalWidth) return { qr: '' };
  const c = document.createElement('canvas'); c.width = i.naturalWidth + 48; c.height = i.naturalHeight + 48;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(i, 24, 24);
  return { qr: c.toDataURL('image/png') };
}
