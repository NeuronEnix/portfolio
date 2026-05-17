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
