const urls = ['https://t.me/s/AI_tg_il','https://t.me/s/botai14','https://t.me/s/hackit770'];

function strip(html='') {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

(async () => {
  for (const url of urls) {
    const html = await (await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } })).text();
    const matches = [...html.matchAll(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/gi)]
      .slice(0, 10)
      .map((m) => strip(m[1]));
    console.log('\nURL', url, 'count', matches.length);
    console.log(matches);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
