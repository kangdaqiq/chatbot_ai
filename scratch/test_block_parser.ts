function parseDiagramTag(text: string) {
  let cleanText = text;
  let diagramReq: any = null;

  // 1. Cek format blok [DIAGRAM:flowchart] ... [/DIAGRAM] atau [DIAGRAM] ... [/DIAGRAM]
  const blockMatch = text.match(/\[DIAGRAM(?::([a-z]+))?\]([\s\S]*?)\[\/DIAGRAM\]/i);
  if (blockMatch) {
    const type = (blockMatch[1] || 'flowchart').toLowerCase();
    const rawContent = blockMatch[2].trim();
    diagramReq = {
      type,
      data: { code: rawContent }
    };
    cleanText = text.replace(blockMatch[0], '').trim();
    return { cleanText, diagramReq };
  }

  // 2. Cek format JSON [DIAGRAM:{...}] atau [DIAGRAM:...}}DIAGRAM]
  const jsonMatch = text.match(/\[DIAGRAM:\s*([\s\S]*?)(?:\]\s*DIAGRAM\]|\}\}\s*DIAGRAM\]|\])/i);
  if (jsonMatch) {
    const rawInner = jsonMatch[1].trim();
    try {
      diagramReq = JSON.parse(rawInner);
    } catch {
      // Fallback regex extraction jika ada unescaped newlines/quotes
      const typeMatch = rawInner.match(/"type"\s*:\s*"([^"]+)"/i);
      const type = typeMatch ? typeMatch[1] : 'flowchart';
      
      // Ambil kode mermaid jika ada
      const graphMatch = rawInner.match(/(graph\s+(?:TD|LR|TB|BT)[\s\S]*?)(?:"\s*\}|\}\s*\}|$)/i);
      if (graphMatch) {
        diagramReq = {
          type: 'flowchart',
          data: { code: graphMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim() }
        };
      }
    }
    cleanText = text.replace(/\[DIAGRAM:[\s\S]*?(?:\]\s*DIAGRAM\]|\}\}\s*DIAGRAM\]|\])/gi, '').trim();
  }

  return { cleanText, diagramReq };
}

// Test case from user's exact screenshot:
const testMsg = `Agar kamu bisa membayangkan bagaimana rantai kehidupan itu saling terhubung erat, yuk kita perhatikan diagram alur rantai makanan sederhana di bawah ini:

[DIAGRAM:{"type":"flowchart","data":{"code":"graph TD
A[\"🌱 Produsen (Rumput/Tumbuhan)\"] --> B[\"🦗 Konsumen I (Belalang)\"]
B --> C[\"🐸 Konsumen II (Katak)\"]
C --> D[\"🐍 Konsumen III (Ular)\"]
D --> E[\"🦅 Pengurai / Konsumen Puncak\"]}}DIAGRAM]

Nah, berdasarkan alur rantai kehidupan di atas...`;

const res = parseDiagramTag(testMsg);
console.log('Result diagramReq:', res.diagramReq);
console.log('Result clean text:\n', res.cleanText);
