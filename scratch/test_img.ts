async function test() {
  const prompt = 'educational diagram water cycle labeled with Evaporation, Condensation, Precipitation, science textbook diagram high quality white background';
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=500&nologo=true`;
  const res = await fetch(url);
  console.log('pollinations diagram image status:', res.status, res.headers.get('content-type'));
  if (res.ok) {
    const buf = Buffer.from(await res.arrayBuffer());
    console.log('image buffer size:', buf.length);
  }
}

test().catch(console.error);
