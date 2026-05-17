// Footer year
document.getElementById("year").textContent = new Date().getFullYear();

// Nav shadow on scroll
const nav = document.querySelector(".nav");
const onScroll = () => {
  nav.classList.toggle("scrolled", window.scrollY > 8);
};
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

// Reveal-on-scroll for sections
const revealTargets = document.querySelectorAll(
  ".section, .hero-stats .stat, .skill-card, .job, .contact-item"
);
revealTargets.forEach((el) => el.classList.add("reveal"));

// Copy-to-clipboard for contact cards
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
};

document.querySelectorAll(".copy-btn").forEach((btn) => {
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const item = btn.closest(".contact-item");
    const text = item?.dataset.copyText;
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (!ok) return;
    const label = btn.querySelector(".copy-btn-label");
    btn.classList.add("copied");
    if (label) label.textContent = "copied";
    clearTimeout(btn._copyResetTimer);
    btn._copyResetTimer = setTimeout(() => {
      btn.classList.remove("copied");
      if (label) label.textContent = "copy";
    }, 1500);
  });
});

if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  revealTargets.forEach((el) => io.observe(el));
} else {
  revealTargets.forEach((el) => el.classList.add("in"));
}
