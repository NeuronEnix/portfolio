// Footer year
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Reveal-on-scroll
const revealTargets = document.querySelectorAll(
  ".section, .skill-card, .work-card, .contact-card, .edu-card"
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
    { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
  );
  revealTargets.forEach((el) => io.observe(el));
} else {
  revealTargets.forEach((el) => el.classList.add("in"));
}

// Copy-to-clipboard
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

document.querySelectorAll(".contact-copy, .social-pop-copy").forEach((btn) => {
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = btn.dataset.copy;
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (!ok) return;
    const orig = btn.textContent;
    btn.classList.add("copied");
    btn.textContent = "Copied";
    btn.blur();
    clearTimeout(btn._copyResetTimer);
    btn._copyResetTimer = setTimeout(() => {
      btn.classList.remove("copied");
      btn.textContent = orig;
    }, 1500);
  });
});

// ── Shared social popup: slides under whichever icon is hovered ────────
(() => {
  const socials = Array.from(document.querySelectorAll(".social"));
  const pop = document.getElementById("socialPop");
  if (!pop || socials.length === 0) return;

  const popText = pop.querySelector(".social-pop-text");
  const popCopy = pop.querySelector(".social-pop-copy");
  const popLink = pop.querySelector(".social-pop-link");

  let hideTimer = null;
  let activeSocial = null;

  const showPopFor = (social) => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    activeSocial = social;
    const x = social.offsetLeft;
    pop.style.setProperty("--pop-x", `${x}px`);
    popText.textContent = social.dataset.popText || "";
    popCopy.dataset.copy = social.dataset.popCopy || "";
    popCopy.setAttribute("aria-label", `Copy ${social.dataset.popText || ""}`);
    const socialLink = social.querySelector(".social-btn");
    if (popLink && socialLink) {
      popLink.href = socialLink.href;
      popLink.setAttribute("aria-label", socialLink.getAttribute("aria-label") || "");
    }
    // Reset any lingering "Copied" state from the previous icon
    popCopy.classList.remove("copied");
    if (popCopy.textContent !== "Copy") popCopy.textContent = "Copy";
    pop.classList.add("is-show");
    socials.forEach((s) => s.classList.toggle("is-active", s === social));
    startFarAwayTracking();
  };

  const scheduleHide = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      pop.classList.remove("is-show");
      socials.forEach((s) => s.classList.remove("is-active"));
      activeSocial = null;
      hideTimer = null;
      stopFarAwayTracking();
    }, 1000);
  };

  const hideNow = () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    pop.classList.remove("is-show");
    socials.forEach((s) => s.classList.remove("is-active"));
    activeSocial = null;
    stopFarAwayTracking();
  };

  // ── Far-away cursor tracking ─────────────────────────────────────────
  // Once the popup is visible, watch global mouse position. If the cursor
  // drifts more than FAR_THRESHOLD px from the icons + popup area, close
  // immediately instead of waiting for the 1s mouseleave timer.
  const FAR_THRESHOLD = 140;
  let trackerHandler = null;
  let trackerLastX = 0;
  let trackerLastY = 0;
  let trackerScheduled = false;

  const checkFarAway = () => {
    trackerScheduled = false;
    if (!pop.classList.contains("is-show")) {
      stopFarAwayTracking();
      return;
    }
    const firstRect = socials[0].getBoundingClientRect();
    const lastRect = socials[socials.length - 1].getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();

    const left = Math.min(firstRect.left, popRect.left);
    const right = Math.max(lastRect.right, popRect.right);
    const top = Math.min(firstRect.top, popRect.top);
    const bottom = Math.max(firstRect.bottom, popRect.bottom);

    const dx = Math.max(left - trackerLastX, 0, trackerLastX - right);
    const dy = Math.max(top - trackerLastY, 0, trackerLastY - bottom);
    const dist = Math.hypot(dx, dy);

    if (dist > FAR_THRESHOLD) hideNow();
  };

  const startFarAwayTracking = () => {
    if (trackerHandler) return;
    trackerHandler = (e) => {
      trackerLastX = e.clientX;
      trackerLastY = e.clientY;
      if (trackerScheduled) return;
      trackerScheduled = true;
      requestAnimationFrame(checkFarAway);
    };
    document.addEventListener("mousemove", trackerHandler);
  };

  const stopFarAwayTracking = () => {
    if (!trackerHandler) return;
    document.removeEventListener("mousemove", trackerHandler);
    trackerHandler = null;
    trackerScheduled = false;
  };

  socials.forEach((social) => {
    social.addEventListener("mouseenter", () => showPopFor(social));
    social.addEventListener("mouseleave", scheduleHide);
    const btn = social.querySelector(".social-btn");
    if (btn) {
      btn.addEventListener("focus", () => showPopFor(social));
      btn.addEventListener("blur", scheduleHide);
      // After clicking the icon (mailto/tel/new tab), release the
      // highlight + hide the popup. The link still navigates normally
      // because we don't preventDefault.
      btn.addEventListener("click", () => {
        // setTimeout 0 so this runs after the browser's default
        // focus-on-click step
        setTimeout(() => {
          btn.blur();
          hideNow();
        }, 0);
      });
    }
  });

  // Keep the popup open while the cursor is on it
  pop.addEventListener("mouseenter", () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  });
  pop.addEventListener("mouseleave", scheduleHide);

  // Click on the popup link → hide popup right away (same UX as clicking the icon)
  if (popLink) {
    popLink.addEventListener("click", () => {
      setTimeout(() => {
        popLink.blur();
        hideNow();
      }, 0);
    });
  }

  // Reposition on resize (icon offsets can shift)
  window.addEventListener("resize", () => {
    if (activeSocial) {
      pop.style.setProperty("--pop-x", `${activeSocial.offsetLeft}px`);
    }
  });
})();
