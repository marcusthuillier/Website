// ── SCROLL PROGRESS BAR ──
(function () {
  var bar = document.createElement('div');
  bar.id = 'scrollProgress';
  document.body.prepend(bar);
  window.addEventListener('scroll', function () {
    var scrolled = window.scrollY;
    var total = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (total > 0 ? (scrolled / total) * 100 : 0) + '%';
  }, { passive: true });
})();

// ── BACK TO TOP ──
(function () {
  var btn = document.createElement('button');
  btn.id = 'backToTop';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML = '↑';
  document.body.appendChild(btn);
  window.addEventListener('scroll', function () {
    if (window.scrollY > 400) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  }, { passive: true });
  btn.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

// ── COPY EMAIL ──
(function () {
  document.querySelectorAll('a[href^="mailto:"]').forEach(function (link) {
    var email = link.getAttribute('href').replace('mailto:', '');
    var feedback = document.createElement('span');
    feedback.className = 'copy-feedback';
    feedback.textContent = 'Copied!';
    link.insertAdjacentElement('afterend', feedback);
    link.addEventListener('click', function (e) {
      e.preventDefault();
      navigator.clipboard.writeText(email).then(function () {
        feedback.classList.add('show');
        setTimeout(function () { feedback.classList.remove('show'); }, 1800);
      }).catch(function () {
        window.location.href = 'mailto:' + email;
      });
    });
  });
})();

// ── NAV HAMBURGER ──
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');

if (hamburger && navLinks) {
  hamburger.addEventListener('click', function () {
    hamburger.classList.toggle('open');
    navLinks.classList.toggle('open');
  });
  navLinks.querySelectorAll('.nav-link').forEach(function (link) {
    link.addEventListener('click', function () {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
    });
  });
}

// ── CTA DROPDOWN ──
const ctaBtn = document.getElementById('ctaBtn');
const ctaDropdown = document.getElementById('ctaDropdown');

if (ctaBtn && ctaDropdown) {
  ctaBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    ctaDropdown.classList.toggle('open');
  });
  document.addEventListener('click', function () {
    ctaDropdown.classList.remove('open');
  });
}

// ── ANIMATED COUNTERS ──
function animateCounter(el) {
  var raw = el.dataset.target;
  if (!raw) return;

  // Range format: "3–4×" or "25–30"
  if (raw.indexOf('–') !== -1) {
    var parts = raw.split('–');
    var leftPart = parts[0];
    var rightStr = parts[1];
    var rightMatch = rightStr.match(/^([^0-9]*)([0-9]+)(.*)$/);
    if (!rightMatch) return;
    var rPre = rightMatch[1], rNum = parseInt(rightMatch[2], 10), rSuf = rightMatch[3];
    countUp(el, 0, rNum, function(n) { return leftPart + '–' + rPre + n + rSuf; });
    return;
  }

  // Standard format: optional prefix, number, optional suffix
  // Handles: "$33M", "43%", "5M+", "100K+", "6+", "Over $40M", "2"
  var m = raw.match(/^([^0-9]*)([0-9]+)(.*)$/);
  if (!m) return;
  var pre = m[1], num = parseInt(m[2], 10), suf = m[3];
  countUp(el, 0, num, function(n) { return pre + n + suf; });
}

function countUp(el, from, to, formatter) {
  var duration = 1400;
  var start = performance.now();
  function step(now) {
    var elapsed = Math.min(now - start, duration);
    var progress = elapsed / duration;
    var eased = 1 - Math.pow(1 - progress, 3);
    var current = Math.round(from + (to - from) * eased);
    el.textContent = formatter(current);
    if (elapsed < duration) {
      requestAnimationFrame(step);
    } else {
      el.textContent = formatter(to);
    }
  }
  requestAnimationFrame(step);
}

// Stamp data-target from current text at load time
document.querySelectorAll('.mini-metric-value, .stat-number').forEach(function(el) {
  el.dataset.target = el.textContent.trim();
});

var counterObserver = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    if (entry.isIntersecting) {
      animateCounter(entry.target);
      counterObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

document.querySelectorAll('.mini-metric-value, .stat-number').forEach(function(el) {
  counterObserver.observe(el);
});

// ── TIMELINE LOGO FALLBACKS ──
(function () {
  function makeFallback(img) {
    var initials = (img.alt || '').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('');
    var fb = document.createElement('div');
    fb.className = 'timeline-logo timeline-logo--fallback';
    fb.textContent = initials || '?';
    if (img.parentNode) img.parentNode.replaceChild(fb, img);
  }
  document.querySelectorAll('.timeline-logo').forEach(function (img) {
    if (img.complete && img.naturalWidth === 0) makeFallback(img);
    else img.addEventListener('error', function () { makeFallback(img); });
  });
})();

// ── SCROLL ANIMATIONS ──
const observer = new IntersectionObserver(function (entries) {
  entries.forEach(function (entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll('.fade-in, .timeline-item').forEach(function (el) {
  observer.observe(el);
});
