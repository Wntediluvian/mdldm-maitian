// 接收“工作台采集”插件交来的读数：各平台后台列表页上每篇的阅读和互动、各平台粉丝数。
// POST /api/collect  { token, profile, at, results: [{ platform, followers, items: [...], error }] }
//   item: { title, publishedAt（ISO，带时区）, statusId（X 的帖子编号）, views, likes, comments, shares, favorites }
// 怎么对上已登记的文章：X 按帖子编号对链接；公众号按标题；其余平台按“发布于 YYYY-MM-DD HH:MM”（北京时间，精确到分）。
// 对不上的条目（短帖、还没登记的文章）不入库，只在返回里计数。口令是 config.web.collectToken，和网页口令分开。
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { db, saveMetric, log, setMeta } from './db.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

db.exec('CREATE TABLE IF NOT EXISTS followers (day TEXT, platform TEXT, total INTEGER, gain INTEGER, loss INTEGER, source TEXT, collected_at TEXT, PRIMARY KEY (day, platform));');
const bj = (t) => new Date(new Date(t).getTime() + 8 * 3600e3).toISOString();
const norm = (s) => String(s || '').replace(/\s+/g, '');
const num = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);

function findEpisode(platform, it) {
  if (platform === 'x' && it.statusId) {
    const r = db.prepare("SELECT episode_id FROM tasks WHERE platform='x' AND url LIKE ?").get(`%/status/${String(it.statusId).replace(/\D/g, '')}`);
    if (r) return r.episode_id;
  }
  if (it.publishedAt && !isNaN(Date.parse(it.publishedAt))) {
    const stamp = bj(it.publishedAt).slice(0, 16).replace('T', ' ');
    const r = db.prepare('SELECT episode_id FROM tasks WHERE platform=? AND detail=?').get(platform, `发布于 ${stamp}`);
    if (r) return r.episode_id;
    // 登记的发布时间可能差一小时（早先人工换算时区时没算夏令时）。X 以外的平台：前后 65 分钟内只有一篇时认它，
    // 并把登记的时间改成页面上的真实时间，下次就能精确对上。X 靠帖子编号，不走这条。
    if (platform !== 'x') {
      const t0 = Date.parse(it.publishedAt);
      const near = db.prepare("SELECT episode_id id, detail FROM tasks WHERE platform=? AND detail LIKE '发布于 ____-__-__ __:__'").all(platform)
        .map((x) => ({ id: x.id, diff: Math.abs(Date.parse(x.detail.slice(4).replace(' ', 'T') + ':00+08:00') - t0) }))
        .filter((x) => x.diff <= 65 * 60e3);
      if (near.length === 1) {
        db.prepare('UPDATE tasks SET detail=? WHERE episode_id=? AND platform=?').run(`发布于 ${stamp}`, near[0].id, platform);
        return near[0].id;
      }
    }
  }
  if (it.title) {
    const want = norm(it.title);
    for (const r of db.prepare('SELECT t.episode_id id, e.name name FROM tasks t JOIN episodes e ON e.id=t.episode_id WHERE t.platform=?').all(platform)) if (norm(r.name) === want) return r.id;
  }
  return null;
}

export function ingest(payload) {
  const day = bj(payload.at || Date.now()).slice(0, 10);
  const out = { day, platforms: {} };
  for (const r of payload.results || []) {
    const p = r.platform, o = (out.platforms[p] = { matched: 0, unmatched: 0, followers: null, error: r.error || '' });
    // 每个平台最近一次的结果，给大屏右上角的“采集”灯用
    const last = (x) => setMeta(`collect:${p}:last`, JSON.stringify({ at: new Date().toISOString(), ...x }));
    if (r.error) { setMeta(`collect:${p}:error`, `${day} ${r.error}`); last({ error: r.error }); continue; }
    const fans = num(r.followers);
    if (fans != null) {
      db.prepare('INSERT INTO followers (day, platform, total, gain, loss, source, collected_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(day, platform) DO UPDATE SET total=excluded.total, source=excluded.source, collected_at=excluded.collected_at')
        .run(day, p, fans, null, null, 'collector', new Date().toISOString());
      o.followers = fans;
    }
    for (const it of r.items || []) {
      const id = findEpisode(p, it);
      if (!id) { o.unmatched++; continue; }
      saveMetric(day, id, p, { views: num(it.views), likes: num(it.likes), comments: num(it.comments), favorites: num(it.favorites), shares: num(it.shares), extra: { source: 'collector', profile: payload.profile || '' } });
      o.matched++;
    }
    setMeta(`collect:${p}`, new Date().toISOString());
    last({ matched: o.matched, items: (r.items || []).length });
  }
  if ((payload.results || []).some((r) => !r.error)) setMeta('metricsDay', day);
  const line = `${payload.profile || '?'} ${payload.build || ''} ${(payload.results || []).length ? JSON.stringify(out.platforms) : '开始采集'}`;
  console.log(`[采集] ${new Date().toISOString().slice(0, 19)} ${line}`.slice(0, 900));
  log('', '', 'collect', line.slice(0, 1500));
  return out;
}

// GET /api/collect/build?token=…：磁盘上采集插件的编号。插件拿它和自己正在跑的比，不一样就自己重新加载
export function handleBuild(u, res, send, token, tokenEq) {
  if (!token || !tokenEq(String(u.searchParams.get('token') || ''), token)) return send(res, 401, { error: '采集口令不对' });
  let build = '';
  try { build = (fs.readFileSync(path.join(ROOT, 'extension-collector', 'background.js'), 'utf8').match(/const BUILD = '([^']+)'/) || [])[1] || ''; } catch {}
  return send(res, 200, { build });
}

export async function handleCollect(req, res, send, token, tokenEq) {
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > 2e6) return send(res, 413, { error: '太大' }); }
  let payload;
  try { payload = JSON.parse(raw); } catch { return send(res, 400, { error: '不是 JSON' }); }
  if (!token || !tokenEq(String(payload.token || ''), token)) return send(res, 401, { error: '采集口令不对' });
  try { return send(res, 200, ingest(payload)); } catch (e) { return send(res, 500, { error: e.message }); }
}
