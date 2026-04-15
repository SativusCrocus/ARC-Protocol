/* ARC Certified — one-line embed.
 * Usage:
 *   <script src="https://arc-protocol-six.vercel.app/arc-certified.js"
 *           data-agent="your-alias" async></script>
 *
 * Renders an inline badge that links to the ARC dashboard and (best-effort)
 * shows the live certified-agent count fetched from the public API.
 */
(function () {
  var ORIGIN = "https://arc-protocol-six.vercel.app";
  var script = document.currentScript;
  if (!script) return;
  var agent = (script.getAttribute("data-agent") || "agent").toString().trim();
  var theme = (script.getAttribute("data-theme") || "dark").toString();
  var badgeUrl = ORIGIN + "/arc-certified-badge.svg?agent=" + encodeURIComponent(agent);
  var dashUrl = ORIGIN + "/badge?agent=" + encodeURIComponent(agent);

  var wrap = document.createElement("a");
  wrap.href = dashUrl;
  wrap.target = "_blank";
  wrap.rel = "noopener noreferrer";
  wrap.style.cssText =
    "display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:10px;" +
    "border:1px solid " + (theme === "light" ? "#e5e7eb" : "rgba(247,147,26,.45)") + ";" +
    "background:" + (theme === "light" ? "#ffffff" : "#000000") + ";" +
    "color:" + (theme === "light" ? "#111" : "#fff") + ";" +
    "font:600 12px/1 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto;text-decoration:none;" +
    "box-shadow:0 0 0 2px rgba(247,147,26,.06)";

  var img = document.createElement("img");
  img.src = badgeUrl;
  img.alt = "ARC Certified — " + agent;
  img.height = 28;
  img.style.cssText = "height:28px;display:block";

  var label = document.createElement("span");
  label.textContent = "ARC Certified · " + agent;
  label.style.cssText = "color:" + (theme === "light" ? "#0f172a" : "#F7931A");

  var count = document.createElement("span");
  count.textContent = "·";
  count.style.cssText =
    "font-weight:500;color:" + (theme === "light" ? "#475569" : "rgba(255,255,255,.45)");

  wrap.appendChild(img);
  wrap.appendChild(label);
  wrap.appendChild(count);

  // Insert in place of the <script> tag.
  if (script.parentNode) script.parentNode.insertBefore(wrap, script);

  // Best-effort live agent count (CORS-friendly endpoint).
  try {
    fetch(ORIGIN + "/api/arc/records", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (records) {
        if (!Array.isArray(records)) return;
        var aliases = {};
        for (var i = 0; i < records.length; i++) {
          var a = records[i] && records[i].record && records[i].record.agent
            ? (records[i].record.agent.alias || records[i].record.agent.pubkey || "")
            : "";
          if (a) aliases[a.toLowerCase()] = 1;
        }
        var n = Object.keys(aliases).length;
        if (n > 0) {
          count.textContent = "· " + n + " agents on chain";
        }
      })
      .catch(function () {});
  } catch (e) {}
})();
