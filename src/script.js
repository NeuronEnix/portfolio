/* ═══════════════════════════════════════════════════════════════════
   kaushikrb.com — "live telemetry console"
   Vanilla JS animation engine. No deps. Degrades gracefully.
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  "use strict";

  // Always open at the top on a fresh load (deep-link #hashes still work).
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = window.matchMedia("(pointer: fine)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ── Footer year ─────────────────────────────────────────────────── */
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ── Boot sequence ───────────────────────────────────────────────── */
  (() => {
    const boot = $("#boot");
    if (!boot) return;
    const log = $("#bootLog", boot);
    const done = () => {
      boot.classList.add("boot-out");
      document.body.classList.add("booted");
      setTimeout(() => boot.remove(), 700);
    };
    if (reduce || !log) {
      done();
      return;
    }
    const lines = [
      "$ ssh kaushik@prod.ap-south-1",
      "  authenticating signing key (kid rotation)… ok",
      "  connecting to gateway fleet… 4 regions online",
      "  warming redis · clickhouse · postgres… ready",
      "  throughput  ▁▂▃▅▇  ~700,000 req/min",
      "  status: ALL SYSTEMS NOMINAL",
      "$ launch portfolio --profile kaushik-r-bangera",
    ];
    let i = 0;
    const tick = () => {
      if (i < lines.length) {
        log.textContent += (i ? "\n" : "") + lines[i];
        i++;
        setTimeout(tick, 95 + Math.random() * 90);
      } else {
        setTimeout(done, 280);
      }
    };
    // Safety: never trap the user behind the overlay
    const failsafe = setTimeout(done, 2600);
    boot.addEventListener("click", () => {
      clearTimeout(failsafe);
      done();
    });
    tick();
  })();

  /* ── Live clock + jittering p99 in the status bar ────────────────── */
  (() => {
    const clock = $("#hudClock");
    const p99 = $("#hudP99");
    if (!clock && !p99) return;
    const pad = (n) => String(n).padStart(2, "0");
    const update = () => {
      if (clock) {
        const d = new Date();
        clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      }
      if (p99 && !reduce) p99.textContent = String(42 + Math.floor(Math.random() * 11));
    };
    update();
    setInterval(update, 1000);
  })();

  /* ── Live throughput counter (the headline "alive" number) ───────── */
  (() => {
    const el = $("#throughput");
    if (!el) return;
    const RATE = 700000 / 60; // ~11,667 req/sec
    let count = Math.floor(RATE * 3); // seed so it starts non-zero
    const fmt = (n) => Math.floor(n).toLocaleString("en-US");
    el.textContent = fmt(count);
    if (reduce) return;
    let last = performance.now();
    const loop = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      count += RATE * dt;
      el.textContent = fmt(count);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  })();

  /* ── Sparkline canvases (animated random-walk telemetry) ─────────── */
  function sparkline(canvas, opts = {}) {
    const ctx = canvas.getContext("2d");
    const color = opts.color || "#22D3EE";
    const N = opts.points || 48;
    const data = Array.from({ length: N }, () => 0.4 + Math.random() * 0.2);
    let dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, r.width * dpr);
      canvas.height = Math.max(1, r.height * dpr);
    }
    function draw() {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const step = w / (N - 1);
      // area fill
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let i = 0; i < N; i++) ctx.lineTo(i * step, h - data[i] * h);
      ctx.lineTo(w, h);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, color + "33");
      g.addColorStop(1, color + "00");
      ctx.fillStyle = g;
      ctx.fill();
      // line
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = i * step, y = h - data[i] * h;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4 * dpr;
      ctx.lineJoin = "round";
      ctx.stroke();
      // head dot
      ctx.beginPath();
      ctx.arc(w, h - data[N - 1] * h, 2.4 * dpr, 0, 7);
      ctx.fillStyle = color;
      ctx.fill();
    }
    resize();
    draw();
    window.addEventListener("resize", () => { resize(); draw(); });
    if (reduce) return;
    let acc = 0, last = performance.now();
    const tick = (now) => {
      acc += now - last;
      last = now;
      if (acc > 480) {
        acc = 0;
        data.shift();
        let next = data[data.length - 1] + (Math.random() - 0.5) * 0.28;
        data.push(clamp(next, 0.12, 0.92));
        draw();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  $$(".spark").forEach((c) => sparkline(c, { color: c.dataset.color || "#22D3EE" }));

  /* ── Background node network (the distributed-system canvas) ──────── */
  (() => {
    const canvas = $("#net");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let nodes = [], packets = [], W = 0, H = 0, dpr = 1, frame = 0, raf = 0;
    const mouse = { x: -9999, y: -9999 };

    const targetCount = () => {
      if (innerWidth < 720) return 36;
      const base = Math.round((innerWidth * innerHeight) / 17000);
      return clamp(base, 40, 104);
    };
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }
    function build() {
      const n = targetCount();
      nodes = Array.from({ length: n }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.5 + 0.9,
      }));
    }
    const MAXD = 132;
    function spawnPacket() {
      if (nodes.length < 2) return;
      const a = (Math.random() * nodes.length) | 0;
      let b = (Math.random() * nodes.length) | 0;
      if (b === a) b = (b + 1) % nodes.length;
      // only if reasonably close, so the packet visually rides an edge
      const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
      if (d > MAXD * 1.7) return;
      packets.push({ a, b, t: 0, sp: 0.012 + Math.random() * 0.02 });
    }
    function draw() {
      frame++;
      ctx.clearRect(0, 0, W, H);
      for (const a of nodes) {
        a.x += a.vx; a.y += a.vy;
        if (a.x < -20) a.x = W + 20; else if (a.x > W + 20) a.x = -20;
        if (a.y < -20) a.y = H + 20; else if (a.y > H + 20) a.y = -20;
        const dx = a.x - mouse.x, dy = a.y - mouse.y, md = Math.hypot(dx, dy);
        if (md < 150 && md > 0.1) { const f = ((150 - md) / 150) * 1.1; a.x += (dx / md) * f; a.y += (dy / md) * f; }
      }
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.abs(dx) + Math.abs(dy) > MAXD * 1.5 ? 999 : Math.hypot(dx, dy);
          if (d < MAXD) {
            ctx.strokeStyle = `rgba(99,102,241,${(1 - d / MAXD) * 0.2})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const a of nodes) {
        const near = Math.hypot(a.x - mouse.x, a.y - mouse.y) < 150;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r + (near ? 0.8 : 0), 0, 7);
        ctx.fillStyle = near ? "rgba(34,211,238,0.95)" : "rgba(129,140,248,0.45)";
        ctx.fill();
      }
      // packets riding edges
      if (frame % 26 === 0) spawnPacket();
      packets = packets.filter((p) => p.t < 1);
      for (const p of packets) {
        p.t += p.sp;
        const a = nodes[p.a], b = nodes[p.b];
        if (!a || !b) { p.t = 1; continue; }
        const x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t;
        ctx.beginPath(); ctx.arc(x, y, 2.1, 0, 7);
        ctx.fillStyle = "rgba(52,211,153,0.95)"; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 5.5, 0, 7);
        ctx.fillStyle = "rgba(52,211,153,0.12)"; ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    }
    resize();
    window.addEventListener("resize", () => { cancelAnimationFrame(raf); resize(); if (!reduce) raf = requestAnimationFrame(draw); else drawStatic(); });
    if (fine) window.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
    function drawStatic() {
      // one calm frame for reduced-motion users
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < MAXD) { ctx.strokeStyle = `rgba(99,102,241,${(1 - d / MAXD) * 0.18})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
      }
      for (const a of nodes) { ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 7); ctx.fillStyle = "rgba(129,140,248,0.4)"; ctx.fill(); }
    }
    if (reduce) drawStatic(); else raf = requestAnimationFrame(draw);
  })();

  /* ── Magnetic pull on key elements (no custom cursor) ────────────── */
  (() => {
    if (!fine || reduce) return;
    $$(".magnetic").forEach((el) => {
      const strength = parseFloat(el.dataset.mag || "0.22");
      const max = parseFloat(el.dataset.magMax || "11"); // clamp travel so it never overlaps neighbours
      el.addEventListener("mouseenter", () => {
        el.style.transition = "transform 0.16s ease-out, background 0.3s var(--ease), box-shadow 0.4s var(--ease)";
      });
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const dx = clamp((e.clientX - (r.left + r.width / 2)) * strength, -max, max);
        const dy = clamp((e.clientY - (r.top + r.height / 2)) * strength, -max, max);
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      });
      el.addEventListener("mouseleave", () => {
        // ease back to rest slowly instead of snapping
        el.style.transition = "transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), background 0.3s var(--ease), box-shadow 0.4s var(--ease)";
        el.style.transform = "";
      });
    });
  })();

  /* ── "Show more points" toggles (animated height + pinned button) ── */
  $$(".work-more").forEach((btn) => {
    const list = document.getElementById(btn.getAttribute("aria-controls"));
    if (!list) return;
    const extra = $$(".wb-extra", list).length;
    const txt = $(".work-more-txt", btn);
    let busy = false;

    btn.addEventListener("click", () => {
      if (busy) return;
      const willOpen = !list.classList.contains("show-all");
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      if (txt) txt.textContent = willOpen ? "Show fewer points" : `Show ${extra} more points`;

      if (reduce) { list.classList.toggle("show-all", willOpen); return; }

      const beforeTop = btn.getBoundingClientRect().top;
      const startH = list.offsetHeight;
      // Measure the target height in the final state…
      if (willOpen) list.classList.add("show-all");
      else list.classList.remove("show-all");
      const endH = list.offsetHeight;
      // …but keep the extras visible while collapsing so they clip away smoothly.
      if (!willOpen) list.classList.add("show-all");

      busy = true;
      const html = document.documentElement;
      const prevSB = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto"; // pin scroll without the smooth easing fighting us

      list.style.overflow = "hidden";
      list.style.height = startH + "px";
      void list.offsetHeight; // reflow
      list.style.transition = "height 0.42s cubic-bezier(0.2, 0.8, 0.2, 1)";
      list.style.height = endH + "px";

      // On collapse, hold the button at the same on-screen position as before the click.
      if (!willOpen) {
        const t0 = performance.now();
        const pin = (now) => {
          const diff = btn.getBoundingClientRect().top - beforeTop;
          if (Math.abs(diff) >= 0.5) window.scrollBy(0, diff);
          if (now - t0 < 520) requestAnimationFrame(pin);
        };
        requestAnimationFrame(pin);
      }

      const done = () => {
        list.removeEventListener("transitionend", done);
        clearTimeout(fail);
        list.style.transition = "";
        list.style.height = "";
        list.style.overflow = "";
        if (!willOpen) list.classList.remove("show-all"); // now actually hide them
        html.style.scrollBehavior = prevSB;
        busy = false;
      };
      list.addEventListener("transitionend", done);
      const fail = setTimeout(done, 700);
    });
  });

  /* ── Text scramble (decode-in) ───────────────────────────────────── */
  function scramble(el, opts = {}) {
    const final = el.dataset.text || el.textContent;
    const glyphs = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&/<>_$";
    if (reduce) { el.textContent = final; return; }
    let frame = 0;
    const dur = opts.dur || 26;
    const queue = final.split("").map((ch, i) => ({ ch, start: Math.floor(i * 1.4), end: Math.floor(i * 1.4) + 8 + Math.floor(Math.random() * 8) }));
    const run = () => {
      let out = "", done = 0;
      for (const q of queue) {
        if (frame >= q.end) { out += q.ch; done++; }
        else if (frame >= q.start) out += `<span class="scr">${glyphs[(Math.random() * glyphs.length) | 0]}</span>`;
        else out += "";
      }
      el.innerHTML = out;
      if (done < queue.length) { frame++; requestAnimationFrame(run); }
      else el.textContent = final;
    };
    run();
  }

  /* ── Count-up numbers ────────────────────────────────────────────── */
  function countUp(el) {
    if (el.dataset.counted) return;
    el.dataset.counted = "1";
    const raw = el.dataset.to != null ? el.dataset.to : (el.textContent.match(/[\d.]+/) || ["0"])[0];
    const to = parseFloat(raw);
    const decimals = (raw.split(".")[1] || "").length;
    const prefix = el.dataset.prefix || "";
    const suffix = el.dataset.suffix || "";
    if (reduce || !isFinite(to)) { el.textContent = prefix + raw + suffix; return; }
    const dur = 1100, t0 = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const p = clamp((now - t0) / dur, 0, 1);
      const v = (to * ease(p)).toFixed(decimals);
      el.textContent = prefix + v + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ── Reveal on scroll (+ stagger), scramble & count triggers ─────── */
  (() => {
    const targets = $$(".reveal, .section, .skill-card, .work-card, .contact-card, .edu-card, .blog-card, .ai-card, .module");
    targets.forEach((el) => el.classList.add("reveal"));
    // stagger children within grids
    $$(".skill-grid, .ai-grid, .blog-grid, .contact-grid").forEach((grid) => {
      Array.from(grid.children).forEach((c, i) => c.style.setProperty("--rd", `${i * 35}ms`));
    });

    const fire = (el) => {
      el.classList.add("in");
      $$("[data-scramble]", el).forEach((s) => scramble(s));
      $$(".count", el).forEach((c) => countUp(c));
      if (el.matches("[data-scramble]")) scramble(el);
      if (el.matches(".count")) countUp(el);
    };

    if (!("IntersectionObserver" in window)) { targets.forEach(fire); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { fire(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.04, rootMargin: "0px 0px 8% 0px" });
    targets.forEach((el) => io.observe(el));

    // Hero pieces are above the fold — decode immediately
    $$(".hero [data-scramble]").forEach((s) => scramble(s, { dur: 30 }));
    $$(".hero .count").forEach((c) => countUp(c));
  })();

  /* ── Scroll progress bar ─────────────────────────────────────────── */
  (() => {
    const bar = $("#scrollBar");
    if (!bar) return;
    let ticking = false;
    const upd = () => {
      const st = window.scrollY;
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? clamp(st / max, 0, 1) : 0})`;
      ticking = false;
    };
    upd();
    window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
  })();

  /* ── Section dot-rail: highlight the active section ──────────────── */
  (() => {
    const rail = $("#rail");
    if (!rail) return;
    const links = $$("a", rail);
    const map = new Map();
    links.forEach((l) => { const id = l.getAttribute("href").slice(1); const sec = document.getElementById(id); if (sec) map.set(sec, l); });
    if (!map.size) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          links.forEach((l) => l.classList.remove("active"));
          const l = map.get(e.target); if (l) l.classList.add("active");
        }
      });
    }, { threshold: 0.01, rootMargin: "-45% 0px -45% 0px" });
    map.forEach((_, sec) => io.observe(sec));
  })();

  /* ── Subtle 3D tilt on cards ─────────────────────────────────────── */
  (() => {
    if (!fine || reduce) return;
    $$(".tilt").forEach((el) => {
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(800px) rotateY(${px * 7}deg) rotateX(${-py * 7}deg)`;
      });
      el.addEventListener("mouseleave", () => { el.style.transform = ""; });
    });
  })();

  /* ── Copy-to-clipboard ───────────────────────────────────────────── */
  const copyToClipboard = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch { ok = false; }
      ta.remove(); return ok;
    }
  };
  $$(".contact-copy, .social-pop-copy").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      const text = btn.dataset.copy; if (!text) return;
      if (!(await copyToClipboard(text))) return;
      const orig = btn.textContent;
      btn.classList.add("copied"); btn.textContent = "Copied"; btn.blur();
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { btn.classList.remove("copied"); btn.textContent = orig; }, 1500);
    });
  });

  /* ── Shared social popup (slides under the hovered icon) ─────────── */
  (() => {
    const socials = $$(".social");
    const pop = $("#socialPop");
    if (!pop || !socials.length) return;
    const popText = $(".social-pop-text", pop);
    const popCopy = $(".social-pop-copy", pop);
    const popLink = $(".social-pop-link", pop);
    let hideTimer = null, active = null, tracker = null, schd = false, lx = 0, ly = 0;

    const show = (s) => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      active = s;
      pop.style.setProperty("--pop-x", `${s.offsetLeft}px`);
      popText.textContent = s.dataset.popText || "";
      popCopy.dataset.copy = s.dataset.popCopy || "";
      popCopy.setAttribute("aria-label", `Copy ${s.dataset.popText || ""}`);
      const link = $(".social-btn", s);
      if (popLink && link) { popLink.href = link.href; popLink.setAttribute("aria-label", link.getAttribute("aria-label") || ""); }
      popCopy.classList.remove("copied"); if (popCopy.textContent !== "Copy") popCopy.textContent = "Copy";
      pop.classList.add("is-show");
      socials.forEach((x) => x.classList.toggle("is-active", x === s));
      startTrack();
    };
    const scheduleHide = () => { if (hideTimer) clearTimeout(hideTimer); hideTimer = setTimeout(hideNow, 1000); };
    const hideNow = () => {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      pop.classList.remove("is-show");
      socials.forEach((x) => x.classList.remove("is-active"));
      active = null; stopTrack();
    };
    const check = () => {
      schd = false;
      if (!pop.classList.contains("is-show")) { stopTrack(); return; }
      const f = socials[0].getBoundingClientRect();
      const l = socials[socials.length - 1].getBoundingClientRect();
      const p = pop.getBoundingClientRect();
      const left = Math.min(f.left, p.left), right = Math.max(l.right, p.right);
      const top = Math.min(f.top, p.top), bottom = Math.max(f.bottom, p.bottom);
      const dx = Math.max(left - lx, 0, lx - right), dy = Math.max(top - ly, 0, ly - bottom);
      if (Math.hypot(dx, dy) > 140) hideNow();
    };
    const startTrack = () => {
      if (tracker) return;
      tracker = (e) => { lx = e.clientX; ly = e.clientY; if (schd) return; schd = true; requestAnimationFrame(check); };
      document.addEventListener("mousemove", tracker);
    };
    const stopTrack = () => { if (!tracker) return; document.removeEventListener("mousemove", tracker); tracker = null; schd = false; };

    socials.forEach((s) => {
      s.addEventListener("mouseenter", () => show(s));
      s.addEventListener("mouseleave", scheduleHide);
      const btn = $(".social-btn", s);
      if (btn) {
        btn.addEventListener("focus", () => show(s));
        btn.addEventListener("blur", scheduleHide);
        btn.addEventListener("click", () => setTimeout(() => { btn.blur(); hideNow(); }, 0));
      }
    });
    pop.addEventListener("mouseenter", () => { if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } });
    pop.addEventListener("mouseleave", scheduleHide);
    if (popLink) popLink.addEventListener("click", () => setTimeout(() => { popLink.blur(); hideNow(); }, 0));
    window.addEventListener("resize", () => { if (active) pop.style.setProperty("--pop-x", `${active.offsetLeft}px`); });
  })();
})();
