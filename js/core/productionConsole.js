(function () {
  const host = window.location.hostname;
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "";

  const params = new URLSearchParams(window.location.search);
  const debugEnabled =
    params.get("debug") === "1" ||
    localStorage.getItem("easyloc_debug") === "1";

  if (isLocal || debugEnabled) return;

  ["log", "debug", "info"].forEach((method) => {
    console[method] = function () {};
  });
})();
