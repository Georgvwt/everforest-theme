let template = "";
let maxComments = 2;
let filterNsfw = true;
let minScore = 1;
let restrictSubreddit = "";
let showMode = "always"; // "always" | "keyword"

export const slot = {
  id: "reddit-slot",
  name: "Reddit",
  description: "Shows the top Reddit post and top comments above search results",
  position: "above-results",

  settingsSchema: [
    {
      key: "showMode",
      label: "When to show",
      type: "select",
      options: ["always", "keyword"],
      description: "Always: shows for every search. Keyword: only when query contains 'reddit'.",
    },
    {
      key: "maxComments",
      label: "Number of comments",
      type: "select",
      options: ["1", "2", "3", "4"],
      description: "How many top comments to show side by side.",
    },
    {
      key: "filterNsfw",
      label: "Hide 18+ posts",
      type: "toggle",
      description: "Skip posts marked as NSFW.",
    },
    {
      key: "minScore",
      label: "Minimum post score",
      type: "select",
      options: ["1", "10", "100", "500", "1000"],
      description: "Only show posts with at least this many upvotes.",
    },
    {
      key: "restrictSubreddit",
      label: "Search only in subreddit",
      type: "text",
      placeholder: "e.g. AskReddit  (leave empty for all of Reddit)",
      description: "If set, searches only within this subreddit.",
    },
  ],

  init(ctx) {
    template = ctx.template;
  },

  configure(settings) {
    showMode = settings?.showMode === "keyword" ? "keyword" : "always";

    const n = parseInt(settings?.maxComments ?? "2", 10);
    maxComments = Number.isFinite(n) ? Math.max(1, Math.min(4, n)) : 2;

    filterNsfw = settings?.filterNsfw !== false && settings?.filterNsfw !== "false";

    const ms = parseInt(settings?.minScore ?? "1", 10);
    minScore = Number.isFinite(ms) ? ms : 1;

    restrictSubreddit = (settings?.restrictSubreddit ?? "").trim().replace(/^r\//, "");
  },

  trigger(query) {
    const q = query.trim();
    if (q.length < 3) return false;
    // Don't trigger on weather queries
    if (/\b(weather|forecast|погода|метео|temperature|humidity|wind|rain|snow)\b/i.test(q)) return false;
    if (showMode === "keyword") {
      return /\breddit\b/i.test(q);
    }
    return true;
  },

  async execute(query, context) {
    try {
      // Strip "reddit" keyword from the actual search query
      const cleanQuery = query.replace(/\breddit\b/gi, "").trim();
      const searchQuery = cleanQuery.length > 1 ? cleanQuery : query.trim();
      const encoded = encodeURIComponent(searchQuery);

      let searchUrl;
      if (restrictSubreddit) {
        searchUrl = `https://www.reddit.com/r/${encodeURIComponent(restrictSubreddit)}/search.json?q=${encoded}&sort=relevance&limit=10&type=link&restrict_sr=1`;
      } else {
        searchUrl = `https://www.reddit.com/search.json?q=${encoded}&sort=relevance&limit=10&type=link`;
      }

      const searchRes = await fetch(searchUrl, {
        headers: { "User-Agent": "degoog-reddit-slot/1.0" },
      });

      if (!searchRes.ok) return { html: "" };

      const searchData = await searchRes.json();
      const posts = searchData?.data?.children;
      if (!posts || posts.length === 0) return { html: "" };

      const filtered = posts.filter((p) => {
        if (filterNsfw && p.data.over_18) return false;
        if (p.data.score < minScore) return false;
        return true;
      });

      if (filtered.length === 0) return { html: "" };

      const stopWords = new Set([
        "a","an","the","is","are","was","were","be","been","being",
        "have","has","had","do","does","did","will","would","could",
        "should","may","might","shall","can","need","dare","ought",
        "what","how","why","when","where","who","which","that","this",
        "i","you","he","she","we","they","it","me","him","her","us",
        "them","my","your","his","its","our","their","and","or","but",
        "if","in","on","at","to","for","of","with","by","from","about",
        "per","day","daily","each","every","normal","much","many","some",
      ]);

      const queryWords = searchQuery
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w));

      const scored = filtered.map((p) => {
        const title = p.data.title.toLowerCase();
        const selftext = (p.data.selftext || "").toLowerCase().slice(0, 300);
        const combined = title + " " + selftext;
        let score = 0;
        for (const word of queryWords) {
          if (combined.includes(word)) score += title.includes(word) ? 2 : 1;
        }
        score += Math.min(p.data.num_comments / 5000, 0.5);
        return { data: p.data, score };
      });

      scored.sort((a, b) => b.score - a.score);
      const post = scored[0].data;

      const commentsUrl = `https://www.reddit.com/r/${post.subreddit}/comments/${post.id}.json?limit=15&depth=1&sort=top`;
      const commentsRes = await fetch(commentsUrl, {
        headers: { "User-Agent": "degoog-reddit-slot/1.0" },
      });

      let comments = [];
      if (commentsRes.ok) {
        const commentsData = await commentsRes.json();
        const rawComments = commentsData?.[1]?.data?.children || [];
        comments = rawComments
          .filter(
            (c) =>
              c.kind === "t1" &&
              c.data.body &&
              c.data.body !== "[deleted]" &&
              c.data.body !== "[removed]" &&
              !c.data.stickied &&
              c.data.score > 0
          )
          .sort((a, b) => b.data.score - a.data.score)
          .slice(0, maxComments)
          .map((c) => ({
            author: c.data.author,
            body: c.data.body.length > 180 ? c.data.body.slice(0, 177) + "…" : c.data.body,
            score: c.data.score,
            url: `https://reddit.com${c.data.permalink}`,
          }));
      }

      const postTitle = post.title.length > 100 ? post.title.slice(0, 97) + "…" : post.title;
      const postUrl = `https://reddit.com${post.permalink}`;
      const subreddit = post.subreddit_name_prefixed;
      const postScore = post.score >= 1000 ? (post.score / 1000).toFixed(1) + "k" : post.score;
      const numComments = post.num_comments >= 1000 ? (post.num_comments / 1000).toFixed(1) + "k" : post.num_comments;

      const commentCards = comments.map((c) => {
        const scoreStr = c.score >= 1000 ? (c.score / 1000).toFixed(1) + "k" : c.score;
        return `
          <a class="rslot-comment" href="${c.url}" target="_blank" rel="noopener noreferrer">
            <div class="rslot-comment-header">
              <span class="rslot-comment-author">u/${escapeHtml(c.author)}</span>
              <span class="rslot-comment-score">▲ ${scoreStr}</span>
            </div>
            <p class="rslot-comment-body">${escapeHtml(c.body)}</p>
          </a>`;
      }).join("");

      // 1 or 2 → two columns max; 3 or 4 → two rows of two
      const gridCols = comments.length === 1 ? "1fr" : "1fr 1fr";

      const html = template
        .replace("{{subreddit}}", escapeHtml(subreddit))
        .replace("{{post_title}}", escapeHtml(postTitle))
        .replace("{{post_url}}", postUrl)
        .replace("{{post_score}}", postScore)
        .replace("{{post_comments}}", numComments)
        .replace("{{post_subreddit}}", escapeHtml(subreddit))
        .replace("{{comment_cards}}", commentCards)
        .replace("{{grid_cols}}", gridCols);

      return { html };
    } catch (err) {
      return { html: "" };
    }
  },
};

export default { slot };

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
