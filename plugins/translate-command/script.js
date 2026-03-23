(function () {
  async function doTranslate(text, from, to, resultEl, btn) {
    if (!text.trim()) return;
    const arrow = btn.querySelector(".trc-btn-arrow");
    if (arrow) arrow.innerHTML = '<circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="7 7" fill="none"/>';
    btn.classList.add("trc-loading");
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
      const res = await fetch(url);
      const data = await res.json();
      const translated = data?.responseData?.translatedText || "";
      resultEl.classList.remove("trc-result");
      void resultEl.offsetWidth;
      resultEl.value = translated;
      resultEl.classList.add("trc-result");
    } catch(e) {
      resultEl.value = "Translation failed.";
    }
    if (arrow) arrow.innerHTML = '<path d="M6 1v10M1 6l5 5 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
    btn.classList.remove("trc-loading");
  }

  function copyBtn(textarea, btn) {
    if (!textarea || !textarea.value) return;
    navigator.clipboard.writeText(textarea.value).then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6l3 3 5-5"/></svg> Copied!';
      btn.classList.add("trc-copied");
      setTimeout(() => { btn.innerHTML = orig; btn.classList.remove("trc-copied"); }, 1600);
    });
  }

  function init() {
    document.querySelectorAll(".trc-wrap:not([data-trc-init])").forEach(wrap => {
      wrap.setAttribute("data-trc-init", "1");

      const fromDd = wrap.querySelector("#trc-from-dd");
      const toDd   = wrap.querySelector("#trc-to-dd");
      const srcEl  = wrap.querySelector("#trc-source");
      const resEl  = wrap.querySelector("#trc-result");
      const btn    = wrap.querySelector("#trc-translate-btn");

      btn.addEventListener("click", () => {
        doTranslate(srcEl.value, fromDd.dataset.value, toDd.dataset.value, resEl, btn);
      });

      srcEl.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          doTranslate(srcEl.value, fromDd.dataset.value, toDd.dataset.value, resEl, btn);
        }
      });

      wrap.querySelector("#trc-clear").addEventListener("click", () => {
        srcEl.value = "";
        resEl.classList.remove("trc-result");
        resEl.value = "";
      });

      wrap.querySelector("#trc-copy-src").addEventListener("click", function() { copyBtn(srcEl, this); });
      wrap.querySelector("#trc-copy-res").addEventListener("click", function() { copyBtn(resEl, this); });

      wrap.querySelector("#trc-use-source").addEventListener("click", () => {
        const res = resEl.value;
        if (!res) return;
        srcEl.value = res;
        resEl.classList.remove("trc-result");
        resEl.value = "";
        // Set from to current to-lang, reset to to auto-detect
        fromDd.dataset.value = toDd.dataset.value;
        fromDd.querySelector(".trc-dd-label").textContent = toDd.querySelector(".trc-dd-label").textContent;
        toDd.dataset.value = "autodetect";
        // Note: don't swap to-dd to auto since to-dd doesn't have auto option
      });
    });
  }

  const obs = new MutationObserver(init);
  obs.observe(document.body, { childList: true, subtree: true });
  init();
})();
