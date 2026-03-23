let template = "";
let defaultTarget = "de";

const LANG_NAMES = {
  en:"English", ru:"Russian", uk:"Ukrainian", de:"German",
  fr:"French", es:"Spanish", ja:"Japanese", zh:"Chinese",
  ar:"Arabic", pl:"Polish", it:"Italian", pt:"Portuguese",
  ko:"Korean", tr:"Turkish", nl:"Dutch",
};

export default {
  name: "Translate",
  description: "Translate text using MyMemory API. Usage: !translate <text>",
  trigger: "translate",
  aliases: ["tr", "перевод"],

  naturalLanguagePhrases: [
    "translate to", "how do you say", "what is in", "переведи на",
  ],

  settingsSchema: [
    {
      key: "defaultTarget",
      label: "Default target language",
      type: "select",
      options: ["de","ru","en","uk","fr","es","ja","zh","ar","pl","it","pt","ko","tr","nl"],
      description: "Language to translate to by default.",
    },
  ],

  init(ctx) { template = ctx.template; },

  configure(settings) {
    defaultTarget = settings?.defaultTarget || "de";
  },

  async execute(args) {
    const raw = args.trim();
    if (!raw) return { title: "Translate", html: "<p>Usage: !translate &lt;text&gt;</p>" };

    let text = raw;
    let targetLang = defaultTarget;
    let sourceLang = "autodetect";

    const toMatch = raw.match(/\s+to[:\s]+([a-z]{2})\s*$/i);
    if (toMatch) {
      targetLang = toMatch[1].toLowerCase();
      text = raw.slice(0, raw.length - toMatch[0].length).trim();
    }

    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      if (!res.ok) return { title: "Translate", html: "" };
      const data = await res.json();
      const translated = data?.responseData?.translatedText || "";

      const toName = LANG_NAMES[targetLang] || targetLang.toUpperCase();
      const langsJson = JSON.stringify(LANG_NAMES);

      const html = template
        .replace("{{from_code}}", "autodetect")
        .replace("{{from_name}}", "Auto-detect")
        .replace("{{to_code}}", _esc(targetLang))
        .replace("{{to_name}}", _esc(toName))
        .replace("{{source_text}}", _esc(text))
        .replace("{{translated_text}}", _esc(translated))
        .replace("{{langs_json}}", langsJson);

      return { title: "Translate", html };
    } catch (e) {
      return { title: "Translate", html: "" };
    }
  },
};

function _esc(s) {
  return String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
