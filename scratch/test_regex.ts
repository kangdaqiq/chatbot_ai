const text = `Agar kamu bisa membayangkan bagaimana rantai kehidupan itu saling terhubung erat, yuk kita perhatikan diagram alur rantai makanan sederhana di bawah ini:

[DIAGRAM:{"type":"flowchart","data":{"code":"graph TD\\n  A[\\\"🌱 Produsen (Rumput/Tumbuhan)\\\"] --> B[\\\"🦗 Konsumen I (Belalang)\\\"]\\n  B --> C[\\\"🐸 Konsumen II (Katak)\\\"]\\n  C --> D[\\\"🐍 Konsumen III (Ular)\\\"]\\n  D --> E[\\\"🦅 Pengurai / Konsumen Puncak\\\"]"}}]

Nah, berdasarkan alur rantai kehidupan di atas...`;

// Old regex:
const oldMatch = text.match(/\[DIAGRAM:\s*(\{.*?\})\]/i);
console.log('Old regex match:', !!oldMatch);

// DotAll regex:
const newMatch = text.match(/\[DIAGRAM:\s*(\{[\s\S]*?\})\](?:\s*DIAGRAM\])?/i);
console.log('New regex match:', !!newMatch);
if (newMatch) {
  try {
    const json = JSON.parse(newMatch[1]);
    console.log('Parsed successfully:', json.type, json.data.code);
  } catch (e) {
    console.log('Parse error:', e);
  }
}
