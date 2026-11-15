import PhotoSwipeLightbox from "/vendor/photoswipe/photoswipe-lightbox.esm.min.js";

const link = document.createElement("link");
link.rel = "stylesheet";
link.href = "/vendor/photoswipe/photoswipe.css";
document.head.append(link);

const lightbox = new PhotoSwipeLightbox({
  gallery: ".grid",
  children: "a.tile",
  pswpModule: () => import("/vendor/photoswipe/photoswipe.esm.min.js"),
  bgOpacity: 0.96,
  showHideAnimationType: "zoom",
});

lightbox.on("uiRegister", () => {
  lightbox.pswp.ui.registerElement({
    name: "custom-caption",
    appendTo: "root",
    onInit: (el, pswp) => {
      pswp.on("change", () => {
        const text = pswp.currSlide?.data.element?.dataset.caption ?? "";
        el.textContent = text;
        el.hidden = !text;
      });
    },
  });
});

lightbox.init();
