(function () {
  // history stack: array of {entry} per wrap
  const histMap = new WeakMap();
  function hist(wrap) {
    if (!histMap.has(wrap)) histMap.set(wrap, []);
    return histMap.get(wrap);
  }

  // current entry per wrap (for saving before navigate)
  const curMap = new WeakMap();

  function handleAudio(e) {
    const btn = e.target.closest(".dslot-audio-btn");
    if (!btn) return;
    const url = btn.dataset.audio;
    if (!url) return;
    const audio = new Audio(url);
    audio.play().catch(() => {});
    btn.classList.add("dslot-audio-playing");
    btn.textContent = "▶ playing";
    audio.onended = () => {
      btn.classList.remove("dslot-audio-playing");
      btn.textContent = "▶ play";
    };
  }

  async function handleTagClick(e) {
    // On iOS, target can be a text node — walk up manually
    let el = e.target;
    let tag = null;
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains("dslot-tag") && el.dataset && el.dataset.word) {
        tag = el;
        break;
      }
      el = el.parentElement;
    }
    if (!tag) return;
    const word = tag.dataset.word;
    if (!word) return;
    const wrap = tag.closest(".dslot-wrap");
    if (!wrap) return;

    // Push current entry to history before navigating
    const cur = curMap.get(wrap);
    if (cur) hist(wrap).push(cur);

    await loadAndRender(wrap, word);
  }

  function handleBack(e) {
    const btn = e.target.closest(".dslot-back-btn");
    if (!btn) return;
    const wrap = btn.closest(".dslot-wrap");
    if (!wrap) return;
    const h = hist(wrap);
    if (!h.length) return;
    const prev = h.pop();
    render(wrap, prev);
  }

  async function loadAndRender(wrap, word) {
    wrap.style.opacity = "0.5";
    wrap.style.transition = "opacity 0.2s";
    try {
      const res = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
        { headers: { "Accept": "application/json" } }
      );
      if (!res.ok) {
        hist(wrap).pop();
        showNotFound(wrap, word);
        return;
      }
      let data;
      try { data = await res.json(); } catch(je) {
        hist(wrap).pop();
        showNotFound(wrap, word);
        return;
      }
      if (!Array.isArray(data) || !data.length) {
        hist(wrap).pop();
        showNotFound(wrap, word);
        return;
      }
      render(wrap, data[0]);
    } catch(e) {
      hist(wrap).pop();
      // Show network error specifically
      showNotFound(wrap, word);
    }
  }

  function showNotFound(wrap, word) {
    // Remove existing toast if any
    const existing = wrap.querySelector(".dslot-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "dslot-toast";
    toast.innerHTML = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="5.5"/><line x1="7" y1="4.5" x2="7" y2="7.5"/><circle cx="7" cy="9.5" r=".6" fill="currentColor" stroke="none"/></svg> No definition found for <strong>${_esc(word)}</strong>`;
    wrap.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add("dslot-toast-in"));
    });

    // Remove after 3s
    setTimeout(() => {
      toast.classList.remove("dslot-toast-in");
      toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    }, 3000);

    wrap.style.opacity = "1";
  }

  function render(wrap, entry) {
    curMap.set(wrap, entry);
    const h = hist(wrap);
    const prevWord = h.length ? (h[h.length - 1].word || "") : "";

    const wordText = entry.word || "";
    const phonetic = entry.phonetic || entry.phonetics?.find(p => p.text)?.text || "";
    const audioUrl = entry.phonetics?.find(p => p.audio)?.audio || "";
    const meanings = entry.meanings || [];

    let defsHtml = "";
    let defCount = 0;
    for (const m of meanings) {
      for (const d of m.definitions || []) {
        if (defCount >= 3) break;
        const ex = d.example ? `<div class="dslot-example">"${_esc(d.example)}"</div>` : "";
        defsHtml += `<div class="dslot-def-row">
          <span class="dslot-def-num">${defCount + 1}</span>
          <div><span class="dslot-pos">${_esc(m.partOfSpeech)}</span>
          <span class="dslot-def-text">${_esc(d.definition)}</span>${ex}</div>
        </div>`;
        defCount++;
      }
      if (defCount >= 3) break;
    }

    const syns = [...new Set(meanings.flatMap(m => [...(m.synonyms||[]),...(m.definitions||[]).flatMap(d=>d.synonyms||[])]))].slice(0,8);
    const ants = [...new Set(meanings.flatMap(m => [...(m.antonyms||[]),...(m.definitions||[]).flatMap(d=>d.antonyms||[])]))].slice(0,8);

    const synTags = syns.length
      ? syns.map((s,i)=>`<span class="dslot-tag" data-word="${_esc(s)}" title="Look up" style="animation-delay:${0.3+i*0.06}s">${_esc(s)}</span>`).join("")
      : `<span class="dslot-tag-empty">—</span>`;
    const antTags = ants.length
      ? ants.map((a,i)=>`<span class="dslot-tag" data-word="${_esc(a)}" title="Look up" style="animation-delay:${0.3+i*0.06}s">${_esc(a)}</span>`).join("")
      : `<span class="dslot-tag-empty">—</span>`;

    const origin = entry.origin
      ? `<div class="dslot-section"><div class="dslot-section-label">Origin</div><p class="dslot-etymology">${_esc(entry.origin)}</p></div>` : "";
    const audioBtn = audioUrl
      ? `<button class="dslot-audio-btn" data-audio="${_esc(audioUrl)}">▶ play</button>` : "";
    const backBtn = (prevWord && prevWord.toLowerCase() !== wordText.toLowerCase())
      ? `<button class="dslot-back-btn">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2L4 6l4 4"/></svg>
          ${_esc(prevWord)}
        </button>` : "";

    const html = `
      <div class="dslot-word-row">
        ${backBtn}
        <span class="dslot-word">${_esc(wordText)}</span>
        ${phonetic ? `<span class="dslot-phonetic">${_esc(phonetic)}</span>` : ""}
        ${audioBtn}
      </div>
      <div class="dslot-divider"></div>
      <div class="dslot-section">
        <div class="dslot-section-label">Definitions</div>
        <div class="dslot-defs">${defsHtml}</div>
      </div>
      <div class="dslot-section">
        <div class="dslot-grid">
          <div class="dslot-tags-box">
            <div class="dslot-section-label" style="margin-bottom:6px">Synonyms</div>
            <div class="dslot-tags">${synTags}</div>
          </div>
          <div class="dslot-tags-box">
            <div class="dslot-section-label" style="margin-bottom:6px">Antonyms</div>
            <div class="dslot-tags">${antTags}</div>
          </div>
        </div>
      </div>
      ${origin}`;

    wrap.style.opacity = "0";
    wrap.style.transform = "translateY(6px)";
    wrap.style.transition = "opacity 0.2s, transform 0.2s";

    setTimeout(() => {
      const header = wrap.querySelector(".dslot-header");
      wrap.innerHTML = "";
      if (header) wrap.appendChild(header);
      wrap.insertAdjacentHTML("beforeend", html);
      wrap.style.transition = "opacity 0.25s, transform 0.25s";
      wrap.style.opacity = "1";
      wrap.style.transform = "translateY(0)";
    }, 200);
  }

  // Save initial entry on first load — fetch full data so back works properly
  function initWrap(wrap) {
    if (wrap.dataset.histInit) return;
    wrap.dataset.histInit = "1";
    const wordEl = wrap.querySelector(".dslot-word");
    if (!wordEl) return;
    const word = wordEl.textContent.trim();
    if (!word) return;
    // Fetch and cache the full entry for the initial word
    fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { headers: { "Accept": "application/json" } }
    ).then(r => r.ok ? r.json() : null)
     .then(data => {
       if (Array.isArray(data) && data.length) {
         curMap.set(wrap, data[0]);
       } else {
         curMap.set(wrap, { word, meanings: [], phonetics: [] });
       }
     })
     .catch(() => {
       curMap.set(wrap, { word, meanings: [], phonetics: [] });
     });
  }

  document.addEventListener("click", function (e) {
    handleAudio(e);
    handleTagClick(e);
    handleBack(e);
  });

  const obs = new MutationObserver(() => {
    document.querySelectorAll(".dslot-wrap").forEach(initWrap);
  });
  obs.observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll(".dslot-wrap").forEach(initWrap);

  function _esc(s) {
    return String(s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
})();
