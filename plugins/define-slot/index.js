let template = "";
let showMode = "keyword";
let maxDefinitions = 3;

export const slot = {
  id: "define-slot",
  name: "Dictionary",
  description: "Shows word definitions, pronunciation, synonyms and etymology above search results",
  position: "above-results",

  settingsSchema: [
    {
      key: "showMode",
      label: "When to show",
      type: "select",
      options: ["keyword", "always"],
      description: "Keyword: only when query contains 'define', 'meaning of', 'what is', etc. Always: for every single-word search.",
    },
    {
      key: "maxDefinitions",
      label: "Max definitions",
      type: "select",
      options: ["1", "2", "3", "5"],
      description: "How many definitions to show per word.",
    },
  ],

  init(ctx) {
    template = ctx.template;
  },

  configure(settings) {
    showMode = settings?.showMode === "always" ? "always" : "keyword";
    const n = parseInt(settings?.maxDefinitions ?? "3", 10);
    maxDefinitions = Number.isFinite(n) ? n : 3;
  },

  trigger(query) {
    const q = query.trim();
    if (q.length < 2) return false;
    if (showMode === "always") {
      // Only trigger for single words in "always" mode
      return /^\w+$/.test(q);
    }
    // Keyword mode: trigger on define/meaning patterns
    return /\b(define|definition|meaning of|what does|what is|synonym|antonym|pronounce|pronunciation|etymology|origin of)\b/i.test(q);
  },

  async execute(query, context) {
    try {
      // Extract the actual word from the query
      const word = _extractWord(query);
      if (!word) return { html: "" };

      const res = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
        { headers: { "Accept": "application/json" } }
      );

      if (!res.ok) return { html: "" };

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return { html: "" };

      const entry = data[0];
      const wordText = entry.word || word;

      // Phonetic
      const phonetic = entry.phonetic ||
        entry.phonetics?.find(p => p.text)?.text || "";

      // Audio URL
      const audioUrl = entry.phonetics?.find(p => p.audio)?.audio || "";

      // Collect all meanings grouped by part of speech
      const meanings = entry.meanings || [];

      // Build definitions list
      let defsHtml = "";
      let defCount = 0;

      for (const meaning of meanings) {
        if (defCount >= maxDefinitions) break;
        const pos = meaning.partOfSpeech || "";
        const defs = meaning.definitions || [];

        for (const def of defs) {
          if (defCount >= maxDefinitions) break;
          const example = def.example
            ? `<div class="dslot-example">"${_esc(def.example)}"</div>`
            : "";
          defsHtml += `
            <div class="dslot-def-row">
              <span class="dslot-def-num">${defCount + 1}</span>
              <div>
                <span class="dslot-pos">${_esc(pos)}</span>
                <span class="dslot-def-text">${_esc(def.definition)}</span>
                ${example}
              </div>
            </div>`;
          defCount++;
        }
      }

      if (defCount === 0) return { html: "" };

      // Synonyms & antonyms (collect across all meanings)
      const synonyms = [...new Set(
        meanings.flatMap(m => m.synonyms || [])
          .concat(meanings.flatMap(m => m.definitions?.flatMap(d => d.synonyms || []) || []))
      )].slice(0, 6);

      const antonyms = [...new Set(
        meanings.flatMap(m => m.antonyms || [])
          .concat(meanings.flatMap(m => m.definitions?.flatMap(d => d.antonyms || []) || []))
      )].slice(0, 6);

      const synHtml = synonyms.length
        ? synonyms.map((s,i) => `<span class="dslot-tag" data-word="${_esc(s)}" style="cursor:pointer" title="Look up">${_esc(s)}</span>`).join("")
        : '<span class="dslot-tag-empty">—</span>';

      const antHtml = antonyms.length
        ? antonyms.map((a,i) => `<span class="dslot-tag" data-word="${_esc(a)}" style="cursor:pointer" title="Look up">${_esc(a)}</span>`).join("")
        : '<span class="dslot-tag-empty">—</span>';

      // Etymology
      const etymHtml = entry.origin
        ? `<div class="dslot-section">
            <div class="dslot-section-label">Origin</div>
            <p class="dslot-etymology">${_esc(entry.origin)}</p>
           </div>`
        : "";

      // Audio button
      const audioHtml = audioUrl
        ? `<button class="dslot-audio-btn" data-audio="${_esc(audioUrl)}" title="Play pronunciation">▶ play</button>`
        : "";

      const html = template
        .replace("{{word}}", _esc(wordText))
        .replace("{{phonetic}}", phonetic ? _esc(phonetic) : "")
        .replace("{{audio_btn}}", audioHtml)
        .replace("{{definitions}}", defsHtml)
        .replace("{{synonyms}}", synHtml)
        .replace("{{antonyms}}", antHtml)
        .replace("{{etymology}}", etymHtml);

      return { html };
    } catch (err) {
      return { html: "" };
    }
  },
};

export default { slot };

function _extractWord(query) {
  // Strip trigger words and get the actual word
  let q = query
    .replace(/\b(define|definition of|meaning of|what does|what is|synonym for|antonym of|pronounce|pronunciation of|etymology of|origin of)\b/gi, "")
    .replace(/\b(mean|means|stand for|stands for)\b/gi, "")
    .trim()
    .replace(/[^a-zA-Z\s'-]/g, "")
    .trim();

  // Take first word if multiple
  const words = q.split(/\s+/).filter(Boolean);
  return words[0] || null;
}

function _esc(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
