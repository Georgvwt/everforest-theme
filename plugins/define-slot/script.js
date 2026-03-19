(function () {
  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".dslot-audio-btn");
    if (!btn) return;
    const url = btn.dataset.audio;
    if (!url) return;
    const audio = new Audio(url);
    audio.play().catch(() => {});
    btn.textContent = "▶ playing";
    audio.onended = () => { btn.textContent = "▶ play"; };
  });
})();
