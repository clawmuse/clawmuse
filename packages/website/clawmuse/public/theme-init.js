try {
  document.documentElement.dataset.theme =
    localStorage.getItem("clawmuse-theme") === "light" ? "light" : "dark";
} catch {
  document.documentElement.dataset.theme = "dark";
}
