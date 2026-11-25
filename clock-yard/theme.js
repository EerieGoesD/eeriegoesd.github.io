// Runs in <head>, before the first paint, so the saved theme never flashes.
(function () {
  let t = "dark";
  try {
    t = localStorage.getItem("clockyard.theme") === "light" ? "light" : "dark";
  } catch {}
  document.documentElement.setAttribute("data-theme", t);
  const ua = navigator.userAgent;
  // An iPad asks for the desktop site and says "Macintosh"; touch gives it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const apple = ios || /Mac/.test(ua);
  // Android phones and tablets take the same touch layout as the iPhone and
  // iPad ("ios" is that layout's class), plus "android" for what differs.
  if (/Android/i.test(ua)) document.documentElement.classList.add("ios", "android");
  else document.documentElement.classList.add(ios ? "ios" : apple ? "mac" : "win");
})();
