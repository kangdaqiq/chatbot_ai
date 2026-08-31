function extractSpeechText(rawText: string): { speechText: string; lang: 'en' | 'id'; cleanText: string } {
  let cleanText = rawText;
  let speechText = '';
  let lang: 'en' | 'id' = 'id';

  // 1. Cek jika AI menyertakan tag eksplisit [SPEECH:en] ... [/SPEECH] atau [SPEECH] ... [/SPEECH]
  const speechMatch = rawText.match(/\[SPEECH(?::([a-z]+))?\]([\s\S]*?)\[\/SPEECH\]/i);
  if (speechMatch) {
    lang = (speechMatch[1] || 'id').toLowerCase() as 'en' | 'id';
    speechText = speechMatch[2].trim();
    cleanText = rawText.replace(speechMatch[0], '').trim();
    return { speechText, lang, cleanText };
  }

  // 2. Jika ada kutipan audio/listening khusus seperti 🎵 "..." atau "..."
  const quoteMatch = rawText.match(/(?:🎵|🎧|🔊|🎙️|🗣️)?\s*["“]([A-Za-z0-9\s,.'!?-]{10,200})["”]/);
  if (quoteMatch) {
    speechText = quoteMatch[1].trim();
    // Deteksi jika kutipan adalah kalimat bahasa Inggris
    lang = /[a-zA-Z\s]{10,}/.test(speechText) && /\b(the|is|are|in|on|at|and|to|first|then|water|cups)\b/i.test(speechText) ? 'en' : 'id';
    return { speechText, lang, cleanText };
  }

  // 3. Fallback: Ambil hanya paragraf inti/pertanyaan, buang basa-basi pembuka & penutup
  const paragraphs = rawText
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 10 && !p.startsWith('Wah,') && !p.startsWith('Halo') && !p.startsWith('Coba tuliskan') && !p.startsWith('+'));

  speechText = paragraphs[0] || rawText;
  lang = /\b(the|is|are|you|how|what|why|english)\b/i.test(speechText) ? 'en' : 'id';

  return { speechText, lang, cleanText };
}

const sampleFromUser = `Wah, ide latihan yang luar biasa hebat! 🎧✨ Praktik listening langsung dengan cara menuliskan apa yang kamu dengar (dictation) adalah salah satu cara paling ampuh untuk melatih ketajaman telinga dan pemahaman bahasa Inggrismu.

Karena kita sedang belajar secara teks di sini, aku akan membayangkan diriku sebagai rekaman audio yang membacakan sebuah kalimat pendek tentang instruksi sederhana. Tugasmu adalah mendengarkan dengan seksama lalu ketik ulang apa yang kamu tangkap, ya! ✏️

Siap? Ini dia kalimat audionya (anggap aku sedang membacakannya untukmu):
🎵 "First, boil two cups of water in a small pan, and then add a spoonful of sugar."

Coba tuliskan kembali kalimat yang baru saja kamu "dengar" dengan bahasamu sendiri! 📝

+15 XP Belajar Aktif (Semangat latihan listening)`;

const res = extractSpeechText(sampleFromUser);
console.log('Extracted speech text:', res.speechText);
console.log('Language detected:', res.lang);
