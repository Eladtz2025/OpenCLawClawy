const targets = [
  'https://techcrunch.com/2026/04/24/google-to-invest-up-to-40b-in-anthropic-in-cash-and-compute/',
  'https://www.wired.com/story/apples-next-ceo-needs-to-launch-a-killer-ai-product/',
  'https://techcrunch.com/2026/04/24/nothing-introduces-an-ai-powered-dictation-tool/'
];

(async () => {
  for (const url of targets) {
    const res = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0',
        'accept-language': 'he,en-US;q=0.9,en;q=0.8'
      }
    });
    const html = await res.text();
    const og = (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
      || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i)
      || [])[1] || '';
    const tw = (html.match(/<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i)
      || html.match(/<meta[^>]+content="([^"]+)"[^>]+name="twitter:image"/i)
      || [])[1] || '';
    console.log(JSON.stringify({ url, status: res.status, og, tw }, null, 2));
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
