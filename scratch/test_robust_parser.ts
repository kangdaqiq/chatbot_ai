const rawFromAI = `Agar kamu bisa membayangkan bagaimana rantai kehidupan itu saling terhubung erat, yuk kita perhatikan diagram alur rantai makanan sederhana di bawah ini:

[DIAGRAM:{"type":"flowchart","data":{"code":"graph TD
A[\"🌱 Produsen (Rumput/Tumbuhan)\"] --> B[\"🦗 Konsumen I (Belalang)\"]
B --> C[\"🐸 Konsumen II (Katak)\"]
C --> D[\"🐍 Konsumen III (Ular)\"]
D --> E[\"🦅 Pengurai / Konsumen Puncak\"]}}DIAGRAM]

Nah, berdasarkan alur rantai kehidupan di atas...`;

function parseDiagramTag(text: string) {
  let cleanText = text;
  let diagramReq: any = null;

  // Match anything between [DIAGRAM: ... ] or [DIAGRAM: ... }}DIAGRAM]
  const match = text.match(/\[DIAGRAM:\s*([\s\S]*?)(?:\]|\}DIAGRAM\]|\}\})/i);
  if (match) {
    let jsonStr = match[1].trim();
    if (!jsonStr.endsWith('}')) {
      // Fix missing closing braces if cut off
      const openCount = (jsonStr.match(/\{/g) || []).length;
      const closeCount = (jsonStr.match(/\}/g) || []).length;
      for (let i = 0; i < openCount - closeCount; i++) {
        jsonStr += '}';
      }
    }

    try {
      diagramReq = JSON.parse(jsonStr);
    } catch {
      // If JSON.parse fails due to raw unescaped newlines inside code string
      try {
        // Extract type
        const typeMatch = jsonStr.match(/"type"\s*:\s*"([^"]+)"/i);
        const type = typeMatch ? typeMatch[1] : 'flowchart';

        // Extract code or shape
        const codeMatch = jsonStr.match(/"code"\s*:\s*"([\s\S]*?)"(?:\s*\}|$)/i);
        const code = codeMatch ? codeMatch[1].replace(/\\"/g, '"') : '';

        diagramReq = {
          type,
          data: { code: code || jsonStr }
        };
      } catch (e2) {
        console.error('Fallback parse error:', e2);
      }
    }

    cleanText = text.replace(/\[DIAGRAM:[\s\S]*?(?:\]|\}DIAGRAM\])/gi, '').trim();
  }

  return { cleanText, diagramReq };
}

const result = parseDiagramTag(rawFromAI);
console.log('Parsed diagramReq:', result.diagramReq);
console.log('Clean text:', result.cleanText);
