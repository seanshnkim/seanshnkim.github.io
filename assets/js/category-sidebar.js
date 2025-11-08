// Category sidebar behavior
document.addEventListener('DOMContentLoaded', function () {
  const toggleBtn = document.getElementById('category-toggle-all');
  const detailsList = document.querySelectorAll('.category-sidebar .category-item');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      const anyOpen = Array.from(detailsList).some(d => d.hasAttribute('open'));
      if (anyOpen) {
        detailsList.forEach(d => d.removeAttribute('open'));
        toggleBtn.textContent = 'Expand all';
        toggleBtn.setAttribute('aria-expanded', 'false');
      } else {
        detailsList.forEach(d => d.setAttribute('open', ''));
        toggleBtn.textContent = 'Collapse all';
        toggleBtn.setAttribute('aria-expanded', 'true');
      }
    });
  }

  // Highlight sidebar links that correspond to posts currently visible on the page
  // Requires each post <li> to have data-post-url="/..."
  const postListItems = document.querySelectorAll('.post-list li[data-post-url]');
  const sidebar = document.querySelector('.category-sidebar');
  if (!postListItems.length || !sidebar) return;

  const linkMap = new Map();
  sidebar.querySelectorAll('a[href]').forEach(a => {
    // Normalize href to path only
    const url = new URL(a.href, window.location.origin).pathname.replace(/\/$/, '');
    linkMap.set(url, a);
  });

  function clearActive() {
    sidebar.querySelectorAll('a.active').forEach(a => a.classList.remove('active'));
    sidebar.querySelectorAll('summary.active').forEach(s => s.classList.remove('active'));
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const li = entry.target;
      const href = (li.getAttribute('data-post-url') || '').replace(/\/$/, '');
      if (!href) return;
      clearActive();
      const a = linkMap.get(href) || linkMap.get(href + '/');
      if (a) {
        a.classList.add('active');
        const details = a.closest('details');
        if (details) {
          details.setAttribute('open', '');
          const summary = details.querySelector('summary');
          if (summary) summary.classList.add('active');
        }
      }
    });
  }, { root: null, rootMargin: '0px', threshold: 0.45 });

  postListItems.forEach(li => observer.observe(li));
});
