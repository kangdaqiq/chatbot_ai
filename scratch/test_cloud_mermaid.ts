async function test() {
  const mermaidCode = `graph TD
  A["☀️ 1. Evaporasi (Penguapan Air)"] --> B["☁️ 2. Kondensasi (Uap Air Jadi Awan)"]
  B --> C["🌧️ 3. Koalesensi (Awan Mendung Menebal)"]
  C --> D["⛈️ 4. Presipitasi (Hujan Turun)"]
  D --> E["🌊 5. Infiltrasi (Air Kembali ke Laut)"]
  E --> A`;

  const b64 = Buffer.from(mermaidCode.trim()).toString('base64');
  const url = `https://mermaid.ink/img/${b64}?bgColor=white`;
  const res = await fetch(url);
  console.log('cloud mermaid status:', res.status, res.headers.get('content-type'));
  if (res.ok) {
    const buf = Buffer.from(await res.arrayBuffer());
    console.log('cloud mermaid buffer length:', buf.length);
  }
}

test().catch(console.error);
