async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      'accept-language': 'he,en-US;q=0.9,en;q=0.8'
    }
  });
  return await res.text();
}

function probe(label, html) {
  const checks = [
    /datetime="([^"]+)"/i,
    /"datePublished":"([^"]+)"/i,
    /"date_created":"([^"]+)"/i,
    /<!--date generated - ([^ ]+)-->/i,
    /"uploadDate":"([^"]+)"/i
  ];
  for (const re of checks) {
    const m = html.match(re);
    if (m) return { label, value: m[1] };
  }
  return { label, value: null };
}

const urls = [
  ['theverge', 'https://www.theverge.com/tech'],
  ['calcalist', 'https://www.calcalist.co.il/calcalistech'],
  ['ynet', 'https://www.ynet.co.il/news']
];

(async () => {
  for (const [label, url] of urls) {
    const html = await fetchText(url);
    console.log(JSON.stringify(probe(label, html)));
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
