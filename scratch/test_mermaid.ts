async function test() {
  const mermaidCode = `graph TD
A[Evaporasi Air Laut] --> B[Kondensasi Awan]
B --> C[Presipitasi Hujan]
C --> A`;

  // 1. Test mermaid.ink
  const b64 = Buffer.from(mermaidCode).toString('base64');
  const url1 = `https://mermaid.ink/img/${b64}`;
  const res1 = await fetch(url1);
  console.log('mermaid.ink status:', res1.status, res1.headers.get('content-type'));

  // 2. Test quickchart mermaid
  const url2 = `https://quickchart.io/graphviz?graph=${encodeURIComponent('digraph G { "Evaporasi Air" -> "Kondensasi Awan" -> "Presipitasi Hujan" -> "Evaporasi Air" }')}`;
  const res2 = await fetch(url2);
  console.log('quickchart graphviz status:', res2.status, res2.headers.get('content-type'));

  // 3. Test quickchart chart with flowchart or pollinations
  const url3 = `https://quickchart.io/qr?text=test`;
  const res3 = await fetch(url3);
  console.log('quickchart qr status:', res3.status);
}

test().catch(console.error);
