/**
 * GET /api/releases - what the changelog page reads.
 *
 * A Cloudflare Pages Function: the file's path is its route, so this answers
 * `/api/releases` on the deployed site with no configuration anywhere.
 *
 * The page could call api.github.com directly, and does when this function is
 * not there (see `changelog.js`). It goes through here on the deployed site for
 * one reason: GitHub rate-limits anonymous callers at 60 requests an hour per
 * IP, and behind a shared address that is one office's worth of visitors. One
 * copy cached at Cloudflare's edge serves everyone instead, so GitHub sees a
 * handful of requests an hour however busy the page gets.
 *
 * It also drops the three quarters of GitHub's payload the page never reads
 * (uploader accounts, reaction counts, tarball URLs, blockmaps).
 */

const REPO = 'arshit09/rovyl';

/** Seconds Cloudflare holds GitHub's answer. A release goes live within this. */
const EDGE_TTL = 600;

/** Seconds a visitor's own browser reuses ours. */
const BROWSER_TTL = 300;

export async function onRequestGet() {
  let upstream;
  try {
    upstream = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, {
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        // GitHub refuses API calls that do not identify themselves.
        'user-agent': 'rovyl-website',
      },
      // The cache that makes this function worth having.
      cf: { cacheTtl: EDGE_TTL, cacheEverything: true },
    });
  } catch {
    return error(502, 'github unreachable');
  }

  if (!upstream.ok) return error(502, `github ${upstream.status}`);

  let releases;
  try {
    releases = await upstream.json();
  } catch {
    return error(502, 'github sent something that is not json');
  }

  if (!Array.isArray(releases)) return error(502, 'github sent something unexpected');

  const slim = releases
    .filter((release) => !release.draft)
    .map((release) => ({
      tag_name: release.tag_name,
      name: release.name,
      body: release.body || '',
      published_at: release.published_at,
      html_url: release.html_url,
      prerelease: Boolean(release.prerelease),
      // The installer, and nothing else: `latest.yml` and the blockmaps are the
      // updater's business.
      assets: (release.assets || [])
        .filter((asset) => /\.exe$/i.test(asset.name || ''))
        .map((asset) => ({
          name: asset.name,
          browser_download_url: asset.browser_download_url,
          size: asset.size,
        })),
    }));

  return json({ releases: slim }, 200, {
    'cache-control': `public, max-age=${BROWSER_TTL}, stale-while-revalidate=${EDGE_TTL}`,
  });
}

function error(status, message) {
  // Never cached: a GitHub hiccup must not stick to the page for ten minutes.
  return json({ error: message }, status, { 'cache-control': 'no-store' });
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}
