/* ══════════════════════════════════════════════════════════════════════════
   Rovyl - changelog

   There are no release notes in this repository. The page asks `/api/releases`
   - the Pages Function next to it, which caches GitHub's answer at Cloudflare's
   edge - and renders whatever comes back, so publishing a GitHub release
   publishes the changelog entry. Nothing here is written by hand.

   Opened without that function (`npx serve website`, or the file straight off
   disk) it falls back to api.github.com, which does answer anonymous callers
   but rate-limits them per IP - which is the whole reason the deployed site
   goes through the function instead.
   ══════════════════════════════════════════════════════════════════════════ */

(() => {
  const REPO = 'arshit09/rovyl';
  const FEED = '/api/releases';
  const FALLBACK = `https://api.github.com/repos/${REPO}/releases?per_page=100`;

  const log = document.getElementById('log');
  const rail = document.getElementById('rail');
  if (!log) return;

  /* ── Markdown ───────────────────────────────────────────────────────────
     Only the subset the release notes actually use: a heading, paragraphs,
     bullets, bold, inline code, links and a rule. Everything is escaped before
     a single tag is introduced, because this text arrives over the network. */

  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  const anchor = (href, text) => `<a href="${href}" rel="noopener">${text}</a>`;

  function inline(src) {
    // Code and links are built first and parked behind a placeholder, so the
    // bare-URL pass cannot find a URL that is already inside an `href`.
    const held = [];
    const hold = (html) => `\u0000${held.push(html) - 1}\u0000`;

    return esc(src)
      .replace(/`([^`]+)`/g, (m, code) => hold(`<code>${code}</code>`))
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) => hold(anchor(href, inline(text))))
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, lead, url) =>
        lead + hold(anchor(url, url.replace(/^https?:\/\//, ''))))
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\u0000(\d+)\u0000/g, (m, i) => held[i]);
  }

  function markdown(md) {
    const out = [];
    let items = null;
    const closeList = () => {
      if (items) out.push(`<ul>${items.join('')}</ul>`);
      items = null;
    };

    for (const raw of md.split('\n')) {
      const line = raw.trim();
      if (!line) { closeList(); continue; }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        closeList();
        // A release note's own top heading sits under the version, which is the
        // page's h2 - so `###` lands on h3 however deep the source went.
        const level = Math.min(Math.max(heading[1].length, 3), 4);
        out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) { closeList(); out.push('<hr>'); continue; }

      const bullet = line.match(/^[*+-]\s+(.*)$/);
      if (bullet) { (items ||= []).push(`<li>${inline(bullet[1])}</li>`); continue; }

      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }

    closeList();
    return out.join('');
  }

  /* ── The parts of a release note that belong to GitHub, not here ─────────
     Every note opens with its date and closes with install instructions that
     point at the asset list under a GitHub release ("download the .exe
     below"). The page prints the date itself and offers its own download
     button, so both ends come off. */

  const DATE_LINE = /^[A-Z][a-z]+ \d{1,2}, \d{4}$/;
  const INSTALL_LINE = /^(-{3,}|#{1,6}\s*install\b.*|\*\*install[:*].*)$/i;

  function trim(body) {
    const lines = (body || '').replace(/\r\n/g, '\n').split('\n');
    if (lines.length && DATE_LINE.test(lines[0].trim())) lines.shift();
    const cut = lines.findIndex((l) => INSTALL_LINE.test(l.trim()));
    return (cut === -1 ? lines : lines.slice(0, cut)).join('\n').trim();
  }

  const compareUrl = (body) =>
    ((body || '').match(/https:\/\/github\.com\/[^\s)]+\/compare\/[^\s)]+/) || [])[0] || '';

  /* ── Rendering ──────────────────────────────────────────────────────────── */

  const fmtDate = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric' });

  const fmtSize = (bytes) =>
    bytes ? `${(bytes / 1024 / 1024).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB` : '';

  function card(rel, isLatest) {
    const version = (rel.tag_name || rel.name || '').replace(/^v/, '');
    const id = `v${version}`;
    const when = rel.published_at ? new Date(rel.published_at) : null;
    const installer = (rel.assets || []).find((a) => /\.exe$/i.test(a.name || ''));
    const notes = trim(rel.body);
    const compare = compareUrl(rel.body);

    const badges = [
      isLatest ? '<span class="badge is-latest">Latest</span>' : '',
      rel.prerelease ? '<span class="badge">Pre-release</span>' : '',
    ].join('');

    const body = notes
      ? markdown(notes)
      : '<p class="empty">No notes were published with this release.</p>';

    const links = [
      installer
        ? `<a class="btn" href="${encodeURI(installer.browser_download_url)}">`
          + '<svg class="ico" aria-hidden="true"><use href="#i-download"/></svg>'
          + `Download ${esc(version)} <em>${fmtSize(installer.size)}</em></a>`
        : '',
      rel.html_url ? `<a href="${encodeURI(rel.html_url)}" rel="noopener">On GitHub</a>` : '',
      compare ? `<a href="${encodeURI(compare)}" rel="noopener">Compare with the release before it</a>` : '',
    ].join('');

    return `<article class="rel" id="${esc(id)}">
      <header class="rel-head">
        <h2><a href="#${encodeURIComponent(id)}">${esc(version)}</a></h2>
        ${when ? `<time datetime="${when.toISOString()}">${fmtDate.format(when)}</time>` : ''}
        ${badges}
      </header>
      <div class="rel-body">${body}</div>
      <footer class="rel-links">${links}</footer>
    </article>`;
  }

  function render(releases) {
    // GitHub calls the newest stable release "latest"; a pre-release never is.
    const latest = releases.find((r) => !r.prerelease);

    log.innerHTML = releases.map((r) => card(r, r === latest)).join('');
    log.setAttribute('aria-busy', 'false');

    rail.innerHTML = releases
      .map((r) => {
        const v = (r.tag_name || r.name || '').replace(/^v/, '');
        return `<a href="#${encodeURIComponent(`v${v}`)}">${esc(v)}</a>`;
      })
      .join('');

    // The hash was resolved against an empty page, so honour it now.
    if (location.hash.length > 1) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) target.scrollIntoView();
    }
  }

  function fail() {
    log.setAttribute('aria-busy', 'false');
    log.innerHTML = '<p class="state">The releases could not be loaded just now. They are all on '
      + `<a href="https://github.com/${REPO}/releases" rel="noopener">GitHub</a>.</p>`;
  }

  async function load(url) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    const data = await res.json();
    // The function hands back `{ releases }`; GitHub hands back the bare array.
    const releases = Array.isArray(data) ? data : data.releases;
    if (!Array.isArray(releases) || !releases.length) throw new Error('no releases');
    return releases.filter((r) => !r.draft);
  }

  load(FEED)
    .catch(() => load(FALLBACK))
    .then(render)
    .catch(fail);
})();
