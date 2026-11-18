window.dataLayer = window.dataLayer || [];
function gtag() {
  window.dataLayer.push(arguments);
}
window.gtag = gtag;
gtag("js", new Date());
gtag("config", "G-DLXRL4ECV5", {
  allow_google_signals: false,
  allow_ad_personalization_signals: false,
});
function loadGoogleTag() {
  var script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=G-DLXRL4ECV5";
  document.head.appendChild(script);
}
if (document.readyState === "complete") {
  setTimeout(loadGoogleTag, 0);
} else {
  window.addEventListener(
    "load",
    function () {
      setTimeout(loadGoogleTag, 0);
    },
    { once: true },
  );
}
