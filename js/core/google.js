/* =====================================================
   GOOGLE PLACES LOADER GLOBAL
===================================================== */

window.carregarGooglePlaces = function () {
  return new Promise((resolve, reject) => {
    if (window.google?.maps?.places) {
      resolve();
      return;
    }

    const apiKey =
      window.EASYLOC_GOOGLE_MAPS_KEY ||
      window.GOOGLE_MAPS_KEY ||
      localStorage.getItem("GOOGLE_MAPS_KEY") ||
      document.querySelector('meta[name="google-maps-key"]')?.content ||
      "";

    if (!apiKey || apiKey === "SUA_API_KEY" || apiKey.includes("sua_chave")) {
      reject(new Error("Chave do Google Maps nao configurada."));
      return;
    }

    if (document.getElementById("google-maps-script")) {
      let tentativas = 0;

      const check = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(check);
          resolve();
          return;
        }

        tentativas += 1;
        if (tentativas > 100) {
          clearInterval(check);
          reject(new Error("Google Places nao carregou dentro do tempo esperado."));
        }
      }, 100);

      return;
    }

    const params = new URLSearchParams({
      key: apiKey,
      libraries: "places",
      language: "pt-BR",
      region: "BR"
    });

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (window.google?.maps?.places) {
        resolve();
      } else {
        reject(new Error("Google Maps carregou, mas Places nao ficou disponivel."));
      }
    };

    script.onerror = () => reject(new Error("Erro ao carregar Google Maps."));

    document.head.appendChild(script);
  });
};
