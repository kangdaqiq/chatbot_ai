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

  // 2. Cek format [DIAGRAM: ... }}DIAGRAM] atau [DIAGRAM: ... ] yang membungkus JSON sampai akhir sebelum teks berikutnya / [XP_EVAL:
  const legacyMatch = text.match(/\[DIAGRAM:([\s\S]*?)(?:\}\}DIAGRAM\]|\}\}\]|(?:\n\n|\n(?=[A-Z0-9*#])|\[XP_EVAL))/i);
  if (legacyMatch) {
    const rawInner = legacyMatch[1].trim();
    // Cari kode mermaid graph TD / graph LR di dalamnya
    const graphMatch = rawInner.match(/graph\s+(?:TD|LR|TB|BT)[\s\S]*/i);
    if (graphMatch) {
      // Bersihkan closing JSON formatting jika ada
      let code = graphMatch[0].replace(/"\s*\}*\s*DIAGRAM\s*\]*$/i, '').replace(/\\"/g, '"').trim();
      diagramReq = {
        type: 'flowchart',
        data: { code }
      };
    }
    cleanText = text.replace(/\[DIAGRAM:[\s\S]*?(?:\}\}DIAGRAM\]|\}\}\]|(?:\n\n|\n(?=[A-Z0-9*#])|\[XP_EVAL))/gi, '').trim();
  }

  return { cleanText, diagramReq };
}

const testMsg = `Agar kamu bisa membayangkan bagaimana rantai kehidupan itu saling terhubung erat, yuk kita perhatikan diagram alur rantai makanan sederhana di bawah ini:

[DIAGRAM:{"type":"flowchart","data":{"code":"graph TD
A[\"🌱 Produsen (Rumput/Tumbuhan)\"] --> B[\"🦗 Konsumen I (Belalang)\"]
B --> C[\"🐸 Konsumen II (Katak)\"]
C --> D[\"🐍 Konsumen III (Ular)\"]
D --> E[\"🦅 Pengurai / Konsumen Puncak\"]}}DIAGRAM]

Nah, berdasarkan alur rantai kehidupan di atas...`;

const res = parseDiagramTag(testMsg);
console.log('Result diagramReq:\n', res.diagramReq);
console.log('Result clean text:\n', res.cleanText);
