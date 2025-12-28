(() => {
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const revealItems = document.querySelectorAll("[data-reveal]");
  if (prefersReduced) {
    revealItems.forEach((el) => el.classList.add("visible"));
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );

    revealItems.forEach((el) => observer.observe(el));
  }

  const tiltTarget = document.querySelector("[data-tilt]");
  if (!tiltTarget || prefersReduced) return;

  const maxTilt = 5;

  const handleMove = (event) => {
    const rect = tiltTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    const tiltX = (-y * maxTilt).toFixed(2);
    const tiltY = (x * maxTilt).toFixed(2);
    tiltTarget.style.setProperty("--tilt-x", `${tiltX}deg`);
    tiltTarget.style.setProperty("--tilt-y", `${tiltY}deg`);
  };

  const resetTilt = () => {
    tiltTarget.style.setProperty("--tilt-x", "0deg");
    tiltTarget.style.setProperty("--tilt-y", "0deg");
  };

  tiltTarget.addEventListener("pointermove", handleMove);
  tiltTarget.addEventListener("pointerleave", resetTilt);
})();
