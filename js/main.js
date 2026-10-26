/* ==========================================================================
   LOVESICK WEDDINGS — main.js
   Vanilla JS, no dependencies.
   Modules: Header · Hero 3D camera · Cover-flow · Floating gallery ·
            Tilt cards · Lightbox · Portfolio filters · Cursor label · Forms
   No scroll-triggered animations (per client brief).
   ========================================================================== */

/* ---------- CONFIG ------------------------------------------------------- */
/* Paste the GHL Inbound Webhook URL here (Automation → Workflow →
   Trigger: "Inbound Webhook"). Leave empty to run the form in demo mode. */
const CONFIG = {
  ghlWebhookUrl: "",
  thankYouRedirect: "" // optional, e.g. "thank-you.html"
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

/* ---------- HEADER ------------------------------------------------------- */
function initHeader() {
  const header = $(".site-header");
  const toggle = $(".nav__toggle");
  if (!header) return;

  // Over-hero header becomes solid once you leave the top (state toggle only)
  if (header.classList.contains("site-header--over-hero")) {
    const update = () => header.classList.toggle("is-solid", window.scrollY > 40);
    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  if (toggle) {
    const menu = $(".mobile-menu");
    const setMenu = (open) => {
      document.body.classList.toggle("nav-open", open);
      document.body.classList.toggle("no-scroll", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      menu?.setAttribute("aria-hidden", String(!open));
    };
    toggle.addEventListener("click", () => setMenu(!document.body.classList.contains("nav-open")));
    $$(".mobile-menu a").forEach(a => a.addEventListener("click", () => setMenu(false)));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
    window.addEventListener("resize", () => { if (window.innerWidth >= 1000) setMenu(false); });
  }

  $$("[data-year]").forEach(el => (el.textContent = new Date().getFullYear()));
}

/* ---------- HERO: 3D CAMERA ---------------------------------------------- */
function initHeroCamera() {
  const stage = $(".camera-stage");
  const rig = $(".camera-rig");
  const shutter = $(".shutter");
  if (!stage || !rig) return;

  if (shutter) {
    const blades = $(".shutter__blades", shutter);
    const done = () => shutter.classList.add("is-done");
    blades ? blades.addEventListener("animationend", done) : done();
    setTimeout(done, 2400); // safety net
  }

  // Viewfinder readout — timecode ticks like a camera
  const tc = $("[data-timecode]");
  if (tc) {
    const start = performance.now();
    const pad = n => String(n).padStart(2, "0");
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      const f = Math.floor((t % 1) * 25);
      tc.textContent = `${pad(Math.floor(t / 60))}:${pad(Math.floor(t % 60))}:${pad(f)}`;
      requestAnimationFrame(tick);
    };
    if (!reduceMotion) tick();
  }

  if (reduceMotion) return;

  const hero = stage.closest(".hero") || stage;
  let pointerActive = false;
  let raf;

  // Idle "handheld" drift when the pointer isn't steering the camera
  const idle = (time) => {
    if (!pointerActive) {
      const t = time / 1000;
      rig.style.setProperty("--ry", `${-14 + Math.sin(t * 0.35) * 7}deg`);
      rig.style.setProperty("--rx", `${6 + Math.cos(t * 0.28) * 3}deg`);
    }
    raf = requestAnimationFrame(idle);
  };
  raf = requestAnimationFrame(idle);

  if (!canHover) return;
  hero.addEventListener("pointermove", (e) => {
    pointerActive = true;
    rig.classList.add("is-live");
    const r = hero.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    rig.style.setProperty("--ry", `${-10 + px * 30}deg`);
    rig.style.setProperty("--rx", `${4 - py * 16}deg`);
  });
  hero.addEventListener("pointerleave", () => {
    pointerActive = false;
    rig.classList.remove("is-live");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else raf = requestAnimationFrame(idle);
  });
}

/* ---------- COVER-FLOW --------------------------------------------------- */
class CoverFlow {
  constructor(root) {
    this.root = root;
    this.stage = $(".coverflow__stage", root);
    this.items = $$(".coverflow__item", root);
    this.count = $(".coverflow__count", root);
    this.dotsWrap = $(".coverflow__dots", root);
    this.index = Math.min(Number(root.dataset.start || 0), this.items.length - 1);
    this.autoplay = root.dataset.autoplay !== "false" && !reduceMotion;
    this.timer = null;
    if (!this.items.length) return;
    this.buildDots();
    this.bind();
    this.render();
    this.play();
  }
  buildDots() {
    if (!this.dotsWrap) return;
    this.dots = this.items.map((_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", `Show photo ${i + 1}`);
      b.addEventListener("click", () => this.go(i));
      this.dotsWrap.appendChild(b);
      return b;
    });
  }
  bind() {
    $(".coverflow__prev", this.root)?.addEventListener("click", () => this.go(this.index - 1));
    $(".coverflow__next", this.root)?.addEventListener("click", () => this.go(this.index + 1));

    this.items.forEach((item, i) => {
      item.addEventListener("click", () => {
        if (this.dragMoved) return;
        if (i === this.index) Lightbox.openFrom(item);
        else this.go(i);
      });
    });

    this.root.setAttribute("tabindex", "0");
    this.root.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); this.go(this.index - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); this.go(this.index + 1); }
      if (e.key === "Enter") Lightbox.openFrom(this.items[this.index]);
    });

    // Drag / swipe
    let startX = 0, dx = 0, dragging = false;
    this.stage.addEventListener("pointerdown", (e) => {
      dragging = true; this.dragMoved = false; startX = e.clientX; dx = 0;
      this.stage.classList.add("is-dragging");
      this.stop();
    });
    window.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dx = e.clientX - startX;
      if (Math.abs(dx) > 6) this.dragMoved = true;
      this.render(dx / 220);
    });
    window.addEventListener("pointerup", () => {
      if (!dragging) return;
      dragging = false;
      this.stage.classList.remove("is-dragging");
      const steps = Math.round(-dx / 160);
      steps ? this.go(this.index + steps) : this.render();
      setTimeout(() => (this.dragMoved = false), 50);
      this.play();
    });

    this.root.addEventListener("mouseenter", () => this.stop());
    this.root.addEventListener("mouseleave", () => this.play());
    this.root.addEventListener("focusin", () => this.stop());
  }
  go(i) {
    const n = this.items.length;
    this.index = (i + n) % n;
    this.render();
  }
  render(drag = 0) {
    const wide = window.innerWidth > 760;
    const spacing = wide ? 0.62 : 0.5; // fraction of card width
    this.items.forEach((item, i) => {
      let o = i - this.index;
      const n = this.items.length;
      if (o > n / 2) o -= n;           // loop around
      if (o < -n / 2) o += n;
      o += drag;
      const abs = Math.abs(o);
      const w = item.offsetWidth;
      const x = o * w * spacing + Math.sign(o) * Math.min(abs, 1) * w * 0.18;
      const z = -abs * 160;
      const ry = Math.max(-1, Math.min(1, o)) * -48;
      const scale = abs < 0.5 ? 1 : 0.92;
      item.style.transform = `translate(-50%, -50%) translateX(${x}px) translateZ(${z}px) rotateY(${ry}deg) scale(${scale})`;
      item.style.zIndex = String(100 - Math.round(abs * 10));
      item.style.opacity = abs > 3.2 ? "0" : String(1 - abs * 0.12);
      item.style.filter = abs < 0.5 ? "none" : `brightness(${1 - Math.min(abs, 3) * 0.12})`;
      item.classList.toggle("is-active", Math.round(o) === 0);
      item.setAttribute("aria-hidden", Math.round(o) === 0 ? "false" : "true");
    });
    if (this.count) this.count.textContent = `${String(this.index + 1).padStart(2, "0")} / ${String(this.items.length).padStart(2, "0")}`;
    this.dots?.forEach((d, i) => d.classList.toggle("is-active", i === this.index));
  }
  play() {
    if (!this.autoplay) return;
    this.stop();
    this.timer = setInterval(() => this.go(this.index + 1), 4200);
  }
  stop() { clearInterval(this.timer); }
}
function initCoverflows() {
  const flows = $$("[data-coverflow]").map(el => new CoverFlow(el));
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => flows.forEach(f => f.render()), 120); });
}

/* ---------- FLOATING 3D GALLERY ----------------------------------------- */
function initFloatGallery() {
  $$(".float-gallery").forEach(g => {
    const scene = $(".float-gallery__scene", g);
    if (!scene || reduceMotion || !canHover) return;
    g.addEventListener("pointermove", (e) => {
      const r = g.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      scene.style.setProperty("--fy", `${px * 14}deg`);
      scene.style.setProperty("--fx", `${-py * 10}deg`);
    });
    g.addEventListener("pointerleave", () => {
      scene.style.setProperty("--fy", "0deg");
      scene.style.setProperty("--fx", "0deg");
    });
  });
}

/* ---------- TILT CARDS -------------------------------------------------- */
function initTilt() {
  if (reduceMotion || !canHover) return;
  $$("[data-tilt]").forEach(card => {
    const max = Number(card.dataset.tilt || 6);
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateY(${px * max}deg) rotateX(${-py * max}deg) translateY(-6px)`;
    });
    card.addEventListener("pointerleave", () => (card.style.transform = ""));
  });
}

/* ---------- LIGHTBOX ---------------------------------------------------- */
const Lightbox = {
  el: null, img: null, cap: null, list: [], i: 0, lastFocus: null,
  init() {
    this.el = $(".lightbox");
    if (!this.el) return;
    this.img = $(".lightbox__img", this.el);
    this.cap = $(".lightbox__cap", this.el);
    $(".lightbox__close", this.el).addEventListener("click", () => this.close());
    $(".lightbox__prev", this.el).addEventListener("click", () => this.step(-1));
    $(".lightbox__next", this.el).addEventListener("click", () => this.step(1));
    this.el.addEventListener("click", (e) => { if (e.target === this.el) this.close(); });
    document.addEventListener("keydown", (e) => {
      if (!this.el.classList.contains("is-open")) return;
      if (e.key === "Escape") this.close();
      if (e.key === "ArrowLeft") this.step(-1);
      if (e.key === "ArrowRight") this.step(1);
    });
    // Generic triggers (not cover-flow, which opens itself)
    $$("[data-lightbox]").forEach(t => {
      if (t.closest("[data-coverflow]")) return;
      t.addEventListener("click", (e) => { e.preventDefault(); this.openFrom(t); });
      if (t.tagName !== "A" && t.tagName !== "BUTTON") {
        t.setAttribute("tabindex", "0");
        t.setAttribute("role", "button");
        t.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.openFrom(t); } });
      }
    });
  },
  openFrom(trigger) {
    if (!this.el || !trigger) return;
    const group = trigger.dataset.lightbox || "default";
    this.list = $$(`[data-lightbox="${group}"]`).filter(n => !n.classList.contains("is-hidden"));
    this.i = Math.max(0, this.list.indexOf(trigger));
    this.lastFocus = document.activeElement;
    this.show();
    this.el.classList.add("is-open");
    this.el.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    $(".lightbox__close", this.el).focus();
  },
  show() {
    const t = this.list[this.i];
    const src = t.dataset.src || $("img", t)?.src;
    const alt = $("img", t)?.alt || "";
    this.img.style.opacity = "0";
    this.img.onload = () => (this.img.style.opacity = "1");
    this.img.src = src;
    this.img.alt = alt;
    this.cap.textContent = t.dataset.caption || "";
  },
  step(d) {
    if (!this.list.length) return;
    this.i = (this.i + d + this.list.length) % this.list.length;
    this.show();
  },
  close() {
    this.el.classList.remove("is-open");
    this.el.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
    this.lastFocus?.focus?.();
  }
};

/* ---------- PORTFOLIO FILTERS ------------------------------------------ */
function initFilters() {
  const btns = $$(".filter-btn");
  const tiles = $$(".tile[data-cat]");
  if (!btns.length) return;
  btns.forEach(btn => btn.addEventListener("click", () => {
    const cat = btn.dataset.filter;
    btns.forEach(b => { b.classList.toggle("is-active", b === btn); b.setAttribute("aria-pressed", String(b === btn)); });
    tiles.forEach(t => {
      const show = cat === "all" || t.dataset.cat === cat;
      if (show) {
        t.classList.remove("is-hidden");
        t.animate?.([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: reduceMotion ? 0 : 500, easing: "cubic-bezier(.22,1,.36,1)" });
      } else {
        t.classList.add("is-hidden");
      }
    });
  }));
}

/* ---------- CURSOR LABEL ("View") -------------------------------------- */
function initCursorLabel() {
  if (!canHover || reduceMotion) return;
  const label = document.createElement("div");
  label.className = "cursor-label";
  label.setAttribute("aria-hidden", "true");
  document.body.appendChild(label);
  let x = 0, y = 0, cx = 0, cy = 0;
  const loop = () => {
    cx += (x - cx) * 0.2; cy += (y - cy) * 0.2;
    label.style.left = cx + "px"; label.style.top = cy + "px";
    requestAnimationFrame(loop);
  };
  loop();
  window.addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; }, { passive: true });
  $$("[data-cursor]").forEach(el => {
    el.addEventListener("mouseenter", () => { label.textContent = el.dataset.cursor; label.classList.add("is-on"); });
    el.addEventListener("mouseleave", () => label.classList.remove("is-on"));
  });
}

/* ---------- FORMS (GHL opt-in) ----------------------------------------- */
function initForms() {
  const utm = {};
  const params = new URLSearchParams(location.search);
  ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"].forEach(k => {
    if (params.get(k)) utm[k] = params.get(k);
  });

  $$("form[data-ghl]").forEach(form => {
    // No past dates for the wedding date
    $$('input[type="date"]', form).forEach(d => (d.min = new Date().toISOString().split("T")[0]));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!validate(form)) return;
      if ($(".hp input", form)?.value) return; // honeypot = bot

      const btn = $('button[type="submit"]', form);
      const label = btn.innerHTML;
      btn.setAttribute("aria-busy", "true");
      btn.innerHTML = "Sending…";

      const data = Object.fromEntries(new FormData(form).entries());
      delete data.website; // honeypot
      // Multi-select chips → comma list
      $$("[data-multi]", form).forEach(group => {
        const name = group.dataset.multi;
        data[name] = $$("input:checked", group).map(i => i.value).join(", ");
      });
      const payload = {
        ...data,
        ...utm,
        form_name: form.dataset.ghl,
        sms_email_consent: !!$('input[name="consent"]', form)?.checked,
        marketing_opt_in: !!$('input[name="marketing_opt_in"]', form)?.checked,
        source_page: location.pathname,
        submitted_at: new Date().toISOString()
      };

      try {
        if (CONFIG.ghlWebhookUrl) {
          const res = await fetch(CONFIG.ghlWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (!res.ok) throw new Error("Network response was not ok");
        } else {
          console.info("[Lovesick] Demo mode — add CONFIG.ghlWebhookUrl. Payload:", payload);
          await new Promise(r => setTimeout(r, 700));
        }
        if (CONFIG.thankYouRedirect) { location.href = CONFIG.thankYouRedirect; return; }
        form.classList.add("is-sent");
        const success = form.nextElementSibling;
        if (success?.classList.contains("form-success")) {
          const nameSlot = $("[data-name]", success);
          if (nameSlot) nameSlot.textContent = (data.first_name || "").trim() || "lovebirds";
          success.setAttribute("tabindex", "-1");
          success.focus();
        }
      } catch (err) {
        console.error(err);
        btn.innerHTML = label;
        alert("Sorry — something went wrong sending your enquiry. Please try again or email us directly.");
      } finally {
        btn.removeAttribute("aria-busy");
        if (!form.classList.contains("is-sent")) btn.innerHTML = label;
      }
    });

    // Clear errors as people fix fields
    form.addEventListener("input", (e) => {
      const wrap = e.target.closest(".field, .check");
      if (wrap?.classList.contains("has-error")) {
        wrap.classList.remove("has-error");
        const msg = $(".field__error", wrap); if (msg) msg.textContent = "";
      }
    });
  });

  function validate(form) {
    let ok = true, first = null;
    $$("[required]", form).forEach(input => {
      const wrap = input.closest(".field, .check");
      let msg = "";
      if (input.type === "checkbox" && !input.checked) msg = "Please tick to continue.";
      else if (!input.value.trim()) msg = "This field is required.";
      else if (input.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value)) msg = "Please enter a valid email.";
      else if (input.type === "tel" && input.value.replace(/\D/g, "").length < 8) msg = "Please enter a valid phone number.";
      if (msg) {
        ok = false; first = first || input;
        wrap?.classList.add("has-error");
        const err = wrap && $(".field__error", wrap);
        if (err) err.textContent = msg;
      }
    });
    first?.focus();
    return ok;
  }
}

/* ---------- BOOT -------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  initHeader();
  initHeroCamera();
  Lightbox.init();
  initCoverflows();
  initFloatGallery();
  initTilt();
  initFilters();
  initCursorLabel();
  initForms();
});
