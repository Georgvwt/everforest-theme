let showMode = "keyword";
let defaultZoom = 13;

export const slot = {
  id: "osm-slot",
  name: "OpenStreetMap",
  description: "Shows an interactive map for location-related queries",
  position: "above-results",

  settingsSchema: [
    {
      key: "showMode",
      label: "When to show",
      type: "select",
      options: ["always", "keyword"],
      description: "Always: every search. Keyword: only when query contains 'map' or 'where is' etc.",
    },
    {
      key: "defaultZoom",
      label: "Default zoom level",
      type: "select",
      options: ["5", "8", "11", "13", "15"],
      description: "Higher = more zoomed in. 13 is a good default for cities.",
    },
  ],

  configure(settings) {
    showMode = settings?.showMode === "always" ? "always" : "keyword";
    const z = parseInt(settings?.defaultZoom ?? "13", 10);
    defaultZoom = Number.isFinite(z) ? z : 13;
  },

  trigger(query) {
    const q = query.trim().toLowerCase();
    if (q.length < 3) return false;
    if (showMode === "always") return true;
    return /\b(map|maps|where is|where's|locate|location|city|address|street|near|directions?|how far|capital of|coordinates?)\b/i.test(q);
  },

  async execute(query, context) {
    try {
      // Strip map-trigger words for cleaner geocoding
      const cleanQuery = query
        .replace(/\b(map|maps|where is|where's|locate|location|near me|directions?|how far)\b/gi, "")
        .trim();
      const searchQuery = cleanQuery.length > 2 ? cleanQuery : query.trim();

      const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=1&addressdetails=1`;
      const geoRes = await fetch(geoUrl, {
        headers: {
          "User-Agent": "degoog-osm-slot/1.0",
          "Accept-Language": "en",
        },
      });

      if (!geoRes.ok) return { html: "" };

      const geoData = await geoRes.json();
      if (!geoData || geoData.length === 0) return { html: "" };

      const place = geoData[0];
      const lat = parseFloat(place.lat);
      const lon = parseFloat(place.lon);
      const displayName = place.display_name || searchQuery;
      const shortName = place.address
        ? [
            place.address.city || place.address.town || place.address.village || place.address.county,
            place.address.country,
          ]
            .filter(Boolean)
            .join(", ")
        : displayName.split(",").slice(0, 2).join(",");

      const mapId = `osm-map-${Date.now()}`;

      const html = `
<div class="osm-slot-wrap">
  <div class="osm-slot-header">
    <svg class="osm-slot-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="rgba(255,255,255,0.85)"/>
    </svg>
    <span class="osm-slot-title">${_esc(shortName)}</span>
    <a class="osm-slot-open" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}&zoom=${defaultZoom}" target="_blank" rel="noopener noreferrer">Open in OSM ↗</a>
  </div>
  <div class="osm-map-container" id="${mapId}" data-lat="${lat}" data-lon="${lon}" data-zoom="${defaultZoom}" data-name="${_esc(shortName)}"></div>
</div>`;

      return { html };
    } catch (err) {
      return { html: "" };
    }
  },
};

export default { slot };

function _esc(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
