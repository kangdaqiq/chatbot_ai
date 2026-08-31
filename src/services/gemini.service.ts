import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { config } from '../config';
import { QuizQuestion, ChatMessageHistory } from '../models/types';
import { GroqService } from './groq.service';

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private modelName: string;
  private groq: GroqService;

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.geminiApiKey || 'DUMMY_KEY_FOR_DEV');
    this.modelName = config.defaultModel || 'gemini-flash-lite-latest';
    this.groq = new GroqService();
  }

  public getGroqService(): GroqService {
    return this.groq;
  }

  private getCandidateModels(): string[] {
    const primary = this.modelName;
    const candidates = [primary, 'gemini-flash-lite-latest', 'gemini-2.0-flash-lite-001', 'gemini-flash-latest'];
    return Array.from(new Set(candidates));
  }

  /**
   * Mengekstrak tag evaluasi [XP_EVAL:{"score":X,"reason":"..."}] dari respons AI
   */
  public static parseInteractionEvaluation(rawResponse: string): { text: string; xpEarned: number; reason: string } {
    let text = rawResponse;
    let xpEarned = 0;
    let reason = '';

    const match = rawResponse.match(/\[XP_EVAL:\s*(\{.*?\})\]/i);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (typeof parsed.score === 'number') {
          xpEarned = Math.max(0, Math.min(25, Math.round(parsed.score)));
        }
        if (typeof parsed.reason === 'string') {
          reason = parsed.reason;
        }
      } catch {
        const scoreMatch = match[1].match(/"score"\s*:\s*(\d+)/);
        if (scoreMatch) xpEarned = Math.min(25, parseInt(scoreMatch[1], 10));
        const reasonMatch = match[1].match(/"reason"\s*:\s*"([^"]+)"/);
        if (reasonMatch) reason = reasonMatch[1];
      }
      text = text.replace(match[0], '').trim();
    }

    return { text, xpEarned, reason };
  }

  /**
   * Menjelaskan materi pembelajaran ke siswa di WhatsApp dengan Metode Sokratik & Scaffolding
   */
  async explainConcept(subjectName: string, studentQuery: string, materialContext?: string, history?: ChatMessageHistory[]): Promise<string> {
    const systemInstruction = `
Kamu adalah "AI Tutor Bot", seorang guru/tutor pribadi cerdas, ramah, komunikatif, dan sangat bijaksana dalam mendidik siswa pada mata pelajaran ${subjectName}.

PRINSIP UTAMA PEMBELAJARAN (MENGEDEPANKAN PROSES BERPIKIR & METODE SOKRATIK):
1. JANGAN PERNAH MEMBERIKAN JAWABAN JADI / SOLUSI INSTAN jika siswa menanyakan soal, tugas, hitungan matematika/sains, atau terjemahan!
2. Fokus utamamu adalah MEMANDU PROSES BERPIKIR KRITIS dan MEMANCING SISWA MENEMUKAN JAWABAN SENDIRI:
   - Identifikasi konsep kunci dan titik kesulitan siswa.
   - Berikan petunjuk (clue) atau analogi sederhana dari kehidupan sehari-hari, lalu pandu mereka melangkah satu demi satu.
   - Jika siswa meminta jawaban langsung: Tolak dengan santun dan dorong mereka bahwa mencoba bernalar sendiri jauh lebih berharga.
3. AKHIRI SELALU dengan 1 PERTANYAAN PANCINGAN yang jelas dan menantang nalar siswa untuk mencoba melangkah sendiri.
4. Interaksi Lanjutan Berdasarkan Riwayat Chat:
   - Jika siswa mencoba menjawab dan BENAR: Berikan apresiasi tulus atas usahanya bernalar, lalu bimbing ke kesimpulan/langkah selanjutnya.
   - Jika siswa SALAH atau BINGUNG: Bedah letak keliru logikanya dengan ramah tanpa menyalahkan, dan berikan petunjuk yang lebih terarah.

ATURAN FORMAT & PENULISAN:
1. Gunakan bahasa Indonesia yang ramah, santun, mendidik, dan komunikatif.
2. JANGAN SELALU MENGULANG SALAM ("Halo!", "Halo teman-teman", "Halo! Wah...", dsb.) di setiap respons jika percakapan sedang berjalan! Langsung respon dan bimbing inti pertanyaan siswa secara luwes dan alami layaknya sedang mengobrol.
3. Gunakan format Markdown khas WhatsApp (*bold* untuk kata/istilah kunci, _italic_, dan emoji edukatif 💡, ✏️, 🌟 secukupnya).
4. Buat penjelasan yang ringkas dan terstruktur (maksimal 2-3 paragraf) agar siswa fokus membaca dan terdorong menjawab pertanyaan pemantiknya.
5. ATURAN PENULISAN RUMUS/MATEMATIKA: WhatsApp TIDAK MENDUKUNG format LaTeX (seperti \\frac, \\times, atau tanda $). Selalu tulis rumus dengan teks biasa (misal: Luas = Panjang × Lebar).
FITUR DIAGRAM & VISUALISASI EDUKATIF (OPSIONAL / JIKA DIPERLUKAN):
Jika materi yang kamu jelaskan adalah siklus (siklus air/awan, fotosintesis, rantai makanan, metamorfosis), tahapan proses sains/sejarah/informatika, bangun ruang/geometri, grafik fungsi, atau jika siswa meminta gambar/diagram, sertakan tag visual berikut sebelum tag [XP_EVAL:...]:
- Flowchart Siklus / Proses Sains:
[DIAGRAM:flowchart]
graph TD
  A["☀️ 1. Evaporasi (Penguapan)"] --> B["☁️ 2. Kondensasi (Pembentukan Awan)"]
  B --> C["🌧️ 3. Presipitasi (Hujan)"]
  C --> D["🌊 4. Infiltrasi (Air Kembali ke Laut)"]
  D --> A
[/DIAGRAM]
- Geometri Segitiga Siku-siku:
[DIAGRAM:geometry]
shape: triangle
a: Alas (a)
b: Tinggi (b)
c: Sisi Miring (c)
[/DIAGRAM]
- Geometri Lingkaran:
[DIAGRAM:geometry]
shape: circle
r: Jari-jari (r)
[/DIAGRAM]
- Geometri Kubus:
[DIAGRAM:geometry]
shape: cube
s: Panjang Rusuk (s)
[/DIAGRAM]
- Diagram Venn:
[DIAGRAM:venn]
setA: Himpunan A
setB: Himpunan B
intersection: Irisan A ∩ B
[/DIAGRAM]
FITUR LATIHAN SUARA / LISTENING / PRONUNCIATION (OPSIONAL):
Jika sedang latihan listening, percakapan bahasa Inggris (speaking), pelafalan ayat/tajwid, atau dikte suara:
Tuliskan kalimat yang HANYA PERLU DIDENGARKAN/DIUCAPKAN di dalam tanda kutip jelas seperti:
🎵 "First, boil two cups of water in a small pan, and then add a spoonful of sugar."
Atau gunakan tag:
[SPEECH:en] First, boil two cups of water in a small pan, and then add a spoonful of sugar. [/SPEECH]
(Sistem audio bot akan otomatis men-generate Voice Note khusus untuk kalimat target tersebut tanpa membaca basa-basi teks lainnya).

EVALUASI PROSES & DAYA NALAR KRITIS SISWA (SISTEM POIN PROSES BELAJAR):
Sistem ini sangat mengedepankan proses belajar dan daya nalar kritis siswa dibanding sekadar kuis instan.
Di baris PALING AKHIR responsmu, kamu WAJIB menyertakan tag evaluasi dengan format:
[XP_EVAL:{"score":0-25,"reason":"Alasan singkat 2-4 kata"}]

Pedoman Penilaian Analisis AI:
- score 0 (Hanya Main-main / Spam / Basa-basi kosong): Siswa mengirim spam, kata kasar, ketikan asal ("wkwk", "p", "halo"), atau tidak menunjukkan proses belajar.
- score 5 - 8 (Rasa Ingin Tahu Edukatif): Siswa menanyakan materi/konsep pelajaran secara serius untuk dipelajari.
- score 12 - 18 (Penalaran Aktif & Usaha Mandiri): Siswa berusaha menjawab pertanyaan pancingan guru, mencoba menerapkan rumus, menganalisis hubungan konsep, atau mencoba mencari solusi sendiri.
- score 20 - 25 (Berpikir Kritis Tingkat Tinggi / HOTS & Analisis Mendalam): Siswa menunjukkan kemampuan berpikir kritis, argumen logis yang matang, menghubungkan konsep lintas topik, atau berhasil memecahkan soal kompleks secara analitis.
`;

    let historyContext = '';
    if (history && history.length > 0) {
      const recentTurns = history.slice(-6);
      historyContext = '--- RIWAYAT PERCAKAPAN SEBELUMNYA ---\n' +
        recentTurns.map((h) => `${h.role === 'user' ? 'Siswa' : 'AI Tutor'}: ${h.parts}`).join('\n') +
        '\n------------------------------------\n\n';
    }

    let userPrompt = `${historyContext}Pertanyaan Siswa Terbaru: "${studentQuery}"`;
    if (materialContext) {
      userPrompt = `${historyContext}Gunakan materi rujukan berikut untuk membimbing siswa:\n--- MATERI ---\n${materialContext}\n-------------\n\nPertanyaan Siswa Terbaru: "${studentQuery}"`;
    }

    const models = this.getCandidateModels();
    let lastError: any = null;

    for (const modelId of models) {
      try {
        const model = this.genAI.getGenerativeModel({
          model: modelId,
          systemInstruction: systemInstruction,
        });

        const result = await model.generateContent(userPrompt);
        const response = await result.response;
        const text = response.text();
        if (text) return GroqService.formatMathForWhatsApp(text);
      } catch (error: any) {
        lastError = error;
        // Continue to try next candidate model
      }
    }

    console.error('Error generating explanation from Gemini (All models tried):', lastError?.message || lastError);

    // Fallback Cerdas 1: Groq Cloud AI (Llama 3.3 / Qwen)
    if (this.groq.isAvailable()) {
      try {
        const groqReply = await this.groq.explainConcept(subjectName, studentQuery, materialContext, history);
        if (groqReply) {
          console.log('⚡ [AI ENGINE] Berhasil dijawab menggunakan Groq AI!');
          return groqReply;
        }
      } catch (e) {
        console.error('Groq explain error:', e);
      }
    }

    // Fallback 2: Jawaban Cerdas Offline
    return this.getOfflineFallbackExplanation(subjectName, studentQuery);
  }

  /**
   * Menjelaskan dan membimbing soal/materi dari Gambar (Foto) yang dikirim siswa di WhatsApp
   */
  async explainImageConcept(subjectName: string, imageBase64: string, mimeType: string = 'image/jpeg', studentCaption?: string): Promise<string> {
    const systemInstruction = `
Kamu adalah "AI Tutor Bot", seorang guru/tutor pribadi cerdas dan ramah dalam pelajaran ${subjectName}.
Siswa mengirimkan foto/gambar tugas atau soal pelajaran.

PRINSIP UTAMA:
1. JANGAN LANGSUNG MEMBERIKAN JAWABAN JADI / KUNCI JAWABAN (misal langsung mengatakan "Jawabannya B" atau memberikan hasil akhir).
2. Bantu siswa membaca dan membedah soal pada gambar:
   - Sebutkan apa yang diketahui dan apa yang ditanyakan dalam soal foto tersebut.
   - Berikan petunjuk (clue), konsep, atau rumus kunci untuk mengerjakannya.
3. AKHIRI DENGAN 1 PERTANYAAN PEMANTIK agar siswa mencoba menghitung atau menyelesaikan langkah pertamanya.
4. Gunakan bahasa Indonesia yang ramah, sopan, berformat Markdown WhatsApp (*bold*, _italic_, emoji), dan tanpa LaTeX mentah.

EVALUASI KUALITAS & KESUNGGUHAN BELAJAR SISWA:
Sertakan tag evaluasi di baris paling akhir responsmu:
[XP_EVAL:{"score":5-10,"reason":"Membahas soal tugas dari foto"}]
`;

    const imagePart = {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType,
      },
    };

    const promptText = studentCaption && studentCaption.trim().length > 0
      ? `Siswa mengirim gambar ini dengan pertanyaan: "${studentCaption}". Tolong bimbing siswa memahami cara menyelesaikannya tanpa langsung memberi jawaban akhir.`
      : 'Tolong analisa foto soal/materi ini, jelaskan konsep dasarnya, dan berikan pertanyaan pancingan agar siswa mencoba menyelesaikannya secara mandiri.';

    const models = this.getCandidateModels();
    let lastError: any = null;

    for (const modelId of models) {
      try {
        const model = this.genAI.getGenerativeModel({
          model: modelId,
          systemInstruction: systemInstruction,
        });

        const result = await model.generateContent([promptText, imagePart]);
        const response = await result.response;
        const text = response.text();
        if (text) return text;
      } catch (error: any) {
        lastError = error;
      }
    }

    console.error('Error generating image explanation from Gemini:', lastError?.message || lastError);
    return `📸 *AI TUTOR (ANALISIS FOTO)*\n\n` +
      `Maaf, AI Tutor mendeteksi foto yang kamu kirim, namun terjadi kendala saat memproses gambar tersebut.\n\n` +
      `_Tips: Pastikan foto terlihat jelas, tidak buram, dan teks/soal dapat terbaca dengan baik._`;
  }

  /**
   * Menjelaskan dan membimbing pertanyaan dari Voice Note (Audio) yang dikirim siswa di WhatsApp
   */
  async explainAudioConcept(subjectName: string, audioBase64: string, mimeType: string = 'audio/ogg', history?: ChatMessageHistory[]): Promise<string> {
    const systemInstruction = `
Kamu adalah "AI Tutor Bot", seorang guru/tutor pribadi yang ramah, komunikatif, dan sabar dalam mendidik siswa pada mata pelajaran ${subjectName}.
Siswa mengirimkan Voice Note / rekaman suara pertanyaan atau tugas sekolah.

PRINSIP UTAMA:
1. Dengarkan rekaman suara tersebut dengan teliti.
2. JANGAN LANGSUNG MEMBERIKAN JAWABAN AKHIR secara instan.
3. Bimbing pemikiran siswa: Jelaskan konsep dasarnya, berikan petunjuk (clue) yang jelas, dan akhiri dengan pertanyaan pemancing agar siswa menjawab langkah lanjutannya.
4. Gunakan bahasa Indonesia yang ramah, santun, memotivasi, dan berformat Markdown WhatsApp.

EVALUASI KUALITAS & KESUNGGUHAN BELAJAR SISWA:
Sertakan tag evaluasi di baris paling akhir responsmu:
[XP_EVAL:{"score":5-10,"reason":"Tanya jawab aktif via voice note"}]
`;

    // Pastikan mimeType bersih (misal audio/ogg; codecs=opus -> audio/ogg)
    let cleanMime = mimeType.split(';')[0].trim();
    if (!cleanMime || cleanMime === 'audio/ptt') {
      cleanMime = 'audio/ogg';
    }

    const audioPart = {
      inlineData: {
        data: audioBase64,
        mimeType: cleanMime,
      },
    };

    let historyContext = '';
    if (history && history.length > 0) {
      const recentTurns = history.slice(-4);
      historyContext = '--- RIWAYAT PERCAKAPAN SEBELUMNYA ---\n' +
        recentTurns.map((h) => `${h.role === 'user' ? 'Siswa' : 'AI Tutor'}: ${h.parts}`).join('\n') +
        '\n------------------------------------\n\n';
    }

    const promptText = `${historyContext}Siswa mengirimkan rekaman suara pertanyaan/pembelajaran ini. Tolong dengarkan dan berikan penjelasan jawaban terbaikmu:`;

    const models = this.getCandidateModels();
    let lastError: any = null;

    for (const modelId of models) {
      try {
        const model = this.genAI.getGenerativeModel({
          model: modelId,
          systemInstruction: systemInstruction,
        });

        const result = await model.generateContent([promptText, audioPart]);
        const response = await result.response;
        const text = response.text();
        if (text) return text;
      } catch (error: any) {
        lastError = error;
      }
    }

    // Fallback Groq Whisper Transcribe + Groq Explain
    if (this.groq.isAvailable()) {
      try {
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const transcribedText = await this.groq.transcribeAudio(audioBuffer);
        if (transcribedText) {
          console.log(`🎙️ [GROQ WHISPER] Transkripsi Voice Note: "${transcribedText}"`);
          const groqExplanation = await this.groq.explainConcept(subjectName, transcribedText, undefined, history);
          if (groqExplanation) {
            return `🎙️ *[Transkripsi Suara Siswa: "${transcribedText}"]*\n\n` + groqExplanation;
          }
        }
      } catch (err) {
        console.error('Groq audio fallback error:', err);
      }
    }

    console.error('Error generating audio explanation from Gemini:', lastError?.message || lastError);
    return `🎙️ *AI TUTOR (PESAN SUARA)*\n\n` +
      `AI Tutor telah menerima rekaman suaramu. Namun saat ini audio tersebut kurang jelas atau terjadi kendala pemrosesan suara.\n\n` +
      `_Tips: Bicaralah lebih dekat ke mikrofon dengan suara yang jelas dan minim kebisingan._`;
  }

  /**
   * Menggenerasi soal kuis interaktif berformat JSON terstruktur
   */
  async generateQuizQuestions(subjectName: string, topic: string, count: number = 3): Promise<QuizQuestion[]> {
    const prompt = `Buatkan ${count} soal kuis interaktif berbasis penalaran analitis dan berpikir kritis (HOTS / Higher Order Thinking Skills) untuk mata pelajaran ${subjectName} dengan topik "${topic}".
Pedoman Pembuatan Soal:
1. HINDARI soal hafalan dasar, definisi teks pendek, atau teori dangkal.
2. Gunakan studi kasus nyata, pemecahan masalah (problem solving), atau analisis konsep yang menantang daya nalar siswa.
3. Pastikan setiap soal memiliki 4 pilihan jawaban yang logis dan mengecoh (A, B, C, D), 1 jawaban benar, serta pembahasan konseptual yang mendidik.`;

    const models = this.getCandidateModels();

    for (const modelId of models) {
      try {
        const model = this.genAI.getGenerativeModel({
          model: modelId,
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: SchemaType.ARRAY,
              description: 'Daftar soal kuis',
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  id: { type: SchemaType.INTEGER },
                  questionText: { type: SchemaType.STRING },
                  options: {
                    type: SchemaType.OBJECT,
                    properties: {
                      A: { type: SchemaType.STRING },
                      B: { type: SchemaType.STRING },
                      C: { type: SchemaType.STRING },
                      D: { type: SchemaType.STRING },
                    },
                    required: ['A', 'B', 'C', 'D'],
                  },
                  correctOption: { type: SchemaType.STRING },
                  explanation: { type: SchemaType.STRING },
                },
                required: ['id', 'questionText', 'options', 'correctOption', 'explanation'],
              },
            },
          },
        });

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        if (responseText) {
          return JSON.parse(responseText) as QuizQuestion[];
        }
      } catch (error) {
        // Continue to try next candidate model
      }
    }

    // Fallback Groq Quiz Generator
    if (this.groq.isAvailable()) {
      try {
        const groqQuestions = await this.groq.generateQuizQuestions(subjectName, topic, count);
        if (groqQuestions && groqQuestions.length > 0) {
          console.log('⚡ [QUIZ ENGINE] Berhasil generate kuis via Groq AI!');
          return groqQuestions;
        }
      } catch (e) {
        console.error('Groq quiz generation error:', e);
      }
    }

    // Return fallback static questions if API failed
    return this.getOfflineFallbackQuiz(subjectName);
  }

  /**
   * Fallback Penjelasan Offline saat API Key belum valid atau kuota 429
   */
  private getOfflineFallbackExplanation(subjectName: string, query: string): string {
    let text = `💡 *AI TUTOR (${subjectName.toUpperCase()}) - PANDUAN BELAJAR*\n\n`;
    text += `Halo! Terkait pertanyaanmu tentang: *"${query}"*\n\n`;
    text += `Mari kita pahami langkah demi langkah:\n`;
    text += `1. *Konsep Inti*: Identifikasi terlebih dahulu konsep/rumus penting dari materi ${subjectName} ini.\n`;
    text += `2. *Petunjuk (Clue)*: Coba uraikan apa saja informasi yang telah kamu ketahui dari pertanyaan/soal tersebut.\n\n`;
    text += `👉 *Pertanyaan Pancingan*: Menurutmu, apa langkah awal yang perlu kita lakukan untuk memecahkan persoalan ini? Coba tuliskan analisismu ya! ✏️\n\n`;
    text += `⚠️ _Catatan Sistem: Pastikan API Key AI di .env sudah terisi untuk respon bimbingan penuh._`;
    return text;
  }

  /**
   * Fallback Kuis Offline saat API Key belum valid
   */
  private getOfflineFallbackQuiz(subjectName: string): QuizQuestion[] {
    return [
      {
        id: 1,
        questionText: `[OFFLINE KUIS] Apakah fondasi utama dalam mempelajari ${subjectName}?`,
        options: {
          A: 'Menghafal tanpa paham',
          B: 'Memahami konsep dasar dan berlatih',
          C: 'Menghindari latihan soal',
          D: 'Hanya membaca buku sekali',
        },
        correctOption: 'B',
        explanation: 'Memahami konsep dasar dan rajin berlatih adalah kunci utama menguasai semua pelajaran.',
      },
      {
        id: 2,
        questionText: `[OFFLINE KUIS] Manakah langkah terbaik saat mengalami kesulitan belajar?`,
        options: {
          A: 'Bertanya kepada Tutor / AI Guru',
          B: 'Menyerah',
          C: 'Membiarkan tidak paham',
          D: 'Menutup buku',
        },
        correctOption: 'A',
        explanation: 'Bertanya kepada Tutor/AI atau guru membantu memperjelas bagian materi yang belum dipahami.',
      },
    ];
  }
}
