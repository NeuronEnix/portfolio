const NOINDEX_HEADERS = {
  "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
  "cache-control": "no-store",
};

const DISALLOW_ROBOTS = "User-agent: *\nDisallow: /\n";

export default {
  async fetch(request, env) {
    const isTest = env.ENVIRONMENT === "test";
    const url = new URL(request.url);

    if (isTest && url.pathname === "/robots.txt") {
      return new Response(DISALLOW_ROBOTS, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          ...NOINDEX_HEADERS,
        },
      });
    }

    if (isTest && url.pathname === "/sitemap.xml") {
      return new Response("Not Found", {
        status: 404,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          ...NOINDEX_HEADERS,
        },
      });
    }

    const response = await env.ASSETS.fetch(request);

    if (!isTest) return response;

    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(NOINDEX_HEADERS)) headers.set(k, v);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
