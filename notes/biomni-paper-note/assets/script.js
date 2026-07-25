(() => {
  const nav = document.querySelector(".top-nav");
  const links = Array.from(document.querySelectorAll(".top-nav a"));
  const sections = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);
  const backToTop = document.querySelector(".back-to-top");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let activeSectionId = "";

  const keepActiveLinkVisible = (link) => {
    if (!nav) return;

    const safeGap = 18;
    const linkStart = link.offsetLeft;
    const linkEnd = linkStart + link.offsetWidth;
    const visibleStart = nav.scrollLeft;
    const visibleEnd = visibleStart + nav.clientWidth;

    if (linkStart >= visibleStart + safeGap && linkEnd <= visibleEnd - safeGap) {
      return;
    }

    const centeredLeft = linkStart - (nav.clientWidth - link.offsetWidth) / 2;
    nav.scrollTo({
      left: Math.max(0, centeredLeft),
      behavior: prefersReducedMotion.matches ? "auto" : "smooth",
    });
  };

  const setActive = (id) => {
    if (activeSectionId === id) return;
    activeSectionId = id;

    links.forEach((link) => {
      const active = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("active", active);
      if (active) {
        link.setAttribute("aria-current", "location");
        keepActiveLinkVisible(link);
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]) setActive(visible[0].target.id);
    },
    {
      rootMargin: `-${(nav?.offsetHeight || 50) + 18}px 0px -62% 0px`,
      threshold: [0.08, 0.2, 0.45],
    },
  );

  sections.forEach((section) => observer.observe(section));

  links.forEach((link) => {
    link.addEventListener("click", () => {
      const id = link.getAttribute("href").slice(1);
      setActive(id);
    });
  });

  const updateBackToTop = () => {
    backToTop?.classList.toggle("visible", window.scrollY > 700);
  };

  window.addEventListener("scroll", updateBackToTop, { passive: true });
  updateBackToTop();

  backToTop?.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion.matches ? "auto" : "smooth",
    });
  });
})();
