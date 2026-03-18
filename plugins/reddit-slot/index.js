const REDDIT_HOST = "reddit.com";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_ENTRIES = 100;

const apiCache = new Map();
const cacheExpiry = new Map();

let maxComments = 2;
let template = "";

const _cacheGet = (key) => {
  const expiresAt = cacheExpiry.get(key);
  if (expiresAt == null || Date.now() > expiresAt) {
    apiCache.delete(key);
    cacheExpiry.delete(key);
    return null;
  }
  return apiCache.get(key) ?? null;
};

const _cacheSet = (key, value) => {
  if (apiCache.size >= CACHE_MAX_ENTRIES) {
    let oldestKey = null;
    let oldestExpiry = Infinity;
    for (const [k, exp] of cacheExpiry) {
      if (exp < oldestExpiry) {
        oldestExpiry = exp;
        oldestKey = k;
      }
    }
    if (oldestKey != null) {
      apiCache.delete(oldestKey);
      cacheExpiry.delete(oldestKey);
    }
  }
  apiCache.set(key, value);
  cacheExpiry.set(key, Date.now() + CACHE_TTL_MS);
};

const _esc = (s) => {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const _formatScore = (n) => {
  if (n == null || !Number.isFinite(n)) return "0";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
};

const _timeAgo = (utc) => {
  if (!utc) return "";
  const diff = Math.floor(Date.now() / 1000) - utc;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const _parseRedditUrls = (results) => {
  if (!Array.isArray(results)) return [];
  const posts = [];
  for (const r of results) {
    const url = r?.url ? String(r.url).trim() : "";
    if (!url) continue;
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      if (!host.endsWith(REDDIT_HOST)) continue;
      // Match /r/sub/comments/id/... pattern
      const m = u.pathname.match(/^\/r\/[^/]+\/comments\/([a-z0-9]+)/i);
      if (m) {
        const postId = m[1];
        if (!posts.find((p) => p.id === postId)) {
          posts.push({ id: postId, url: `https://www.reddit.com${u.pathname}` });
        }
      }
    } catch {
      //
    }
  }
  return posts.slice(0, 1); // only first reddit post
};

const _fetchComments = async (postUrl) => {
  const key = `reddit:${postUrl}`;
  const cached = _cacheGet(key);
  if (cached != null) return cached;

  const apiUrl = postUrl.replace(/\/?$/, ".json") + "?limit=10&sort=top";
  const res = await fetch(apiUrl, {
    headers: {
      "User-Agent": "degoog-reddit-slot/1.0",
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  _cacheSet(key, data);
  return data;
};

const _render = (data) => {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? "");
};

export const slot = {
  id: "reddit-slot",
  name: "Reddit Answers",
  position: "above-results",
  description:
    "When search results include Reddit threads, shows the top comments above results.",

  settingsSchema: [
    {
      key: "maxComments",
      label: "Number of comments to show",
      type: "select",
      options: ["1", "2", "3"],
      description: "How many top comments to display (default: 2).",
    },
  ],

  init(ctx) {
    template = ctx.template;
  },

  configure(settings) {
    const n = parseInt(settings?.maxComments ?? "2", 10);
    maxComments = Number.isFinite(n) ? Math.max(1, Math.min(3, n)) : 2;
  },

  trigger() {
  return true;
  },

  async execute(_query, context) {
    const results = context?.results ?? [];
    const posts = _parseRedditUrls(results);
    if (posts.length === 0) return { title: "", html: "" };

    const { url } = posts[0];
    const data = await _fetchComments(url);
    if (!data || !Array.isArray(data) || data.length < 2) return { title: "", html: "" };

    // data[0] = post info, data[1] = comments
    const postData = data[0]?.data?.children?.[0]?.data;
    const commentsData = data[1]?.data?.children ?? [];

    if (!postData) return { title: "", html: "" };

    const postTitle = _esc(postData.title || "");
    const postUrl = _esc(url);
    const subreddit = _esc(postData.subreddit_name_prefixed || "");
    const postScore = _formatScore(postData.score);
    const postTime = _timeAgo(postData.created_utc);
    const commentCount = _formatScore(postData.num_comments);

    // Get top comments (skip stickied/mod comments)
    const topComments = commentsData
      .filter(
        (c) =>
          c?.kind === "t1" &&
          c?.data?.body &&
          c?.data?.body !== "[deleted]" &&
          c?.data?.body !== "[removed]" &&
          !c?.data?.stickied
      )
      .sort((a, b) => (b?.data?.score ?? 0) - (a?.data?.score ?? 0))
      .slice(0, maxComments);

    if (topComments.length === 0) return { title: "", html: "" };

    const commentCards = topComments.map((c, i) => {
      const body = _esc((c.data.body || "").slice(0, 300));
      const score = _formatScore(c.data.score);
      const author = _esc(c.data.author || "");
      const time = _timeAgo(c.data.created_utc);
      const commentUrl = _esc(`https://www.reddit.com${c.data.permalink || ""}`);
      const truncated = (c.data.body || "").length > 300;

      return (
        `<a href="${commentUrl}" class="reddit-slot-comment" target="_blank" rel="noopener">` +
        `<div class="reddit-slot-comment-meta">` +
        `<span class="reddit-slot-rank">${i + 1} of ${topComments.length}</span>` +
        `<span class="reddit-slot-score">▲ ${score}</span>` +
        `<span class="reddit-slot-author">u/${author}</span>` +
        `<span class="reddit-slot-time">${time}</span>` +
        `</div>` +
        `<p class="reddit-slot-body">${body}${truncated ? "…" : ""}</p>` +
        `</a>`
      );
    });

    const content =
      `<div class="reddit-slot-wrap">` +
      `<div class="reddit-slot-header">` +
      `<a href="${postUrl}" class="reddit-slot-title" target="_blank" rel="noopener">${postTitle}</a>` +
      `<div class="reddit-slot-post-meta">` +
      `<span class="reddit-slot-sub">${subreddit}</span>` +
      `<span class="reddit-slot-dot">·</span>` +
      `<span>▲ ${postScore}</span>` +
      `<span class="reddit-slot-dot">·</span>` +
      `<span>${commentCount} comments</span>` +
      `<span class="reddit-slot-dot">·</span>` +
      `<span>${postTime}</span>` +
      `</div>` +
      `</div>` +
      `<div class="reddit-slot-comments">${commentCards.join("")}</div>` +
      `</div>`;

    return { title: "Reddit", html: _render({ content }) };
  },
};

export default { slot };
