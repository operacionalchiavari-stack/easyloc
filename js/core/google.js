/* =====================================================
   GOOGLE PLACES LOADER GLOBAL
===================================================== */

window.carregarGooglePlaces = function () {

  return new Promise((resolve, reject) => {

    // já carregado
    if (window.google?.maps?.places) {
      resolve();
      return;
    }

    // script já inserido
    if (document.getElementById("google-maps-script")) {

      const check = setInterval(() => {
        if (window.google?.maps?.places) {
          clearInterval(check);
          resolve();
        }
      }, 100);

      return;
    }

    const script = document.createElement("script");
    script.id = "google-maps-script";

    script.src =
      "https://maps.googleapis.com/maps/api/js?key=SUA_API_KEY&libraries=places";

    script.async = true;
    script.defer = true;

    script.onload = () => resolve();
    script.onerror = reject;

    document.head.appendChild(script);

  });

};