import { config } from '../config';
import { QuizQuestion, ChatMessageHistory } from '../models/types';

export class GroqService {
  private apiKey: string;
  private primaryModel: string;
  private candidateModels: string[];

  constructor() {
    this.apiKey = config.groqApiKey || '';
    this.primaryModel = 'qwen/qwen3.6-27b';
    this.candidateModels = ['qwen/qwen3.6-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'groq/compound'];
  }

  public isAvailable(): boolean {
    return !!this.apiKey && this.apiKey.startsWith('gsk_');
  }

  /**
   * Membersihkan tag <think>...</think> dari model reasoning
   */
  private cleanThinkingTags(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }

  /**
   * Mengubah rumus LaTeX menjadi teks WhatsApp yang rapi dan mudah dibaca
   */
  public static formatMathForWhatsApp(raw: string): string {
    let text = raw;

    // Ubah pecahan \frac{a}{b} menjadi (a / b)
    text = text.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1 / $2)');
    text = text.replace(/\\frac\s*([0-9a-zA-Z])\s*([0-9a-zA-Z])/g, '($1 / $2)');

    // Ubah simbol perkalian dan operasi
    text = text.replace(/\\times/g, '×');
    text = text.replace(/\\cdot/g, '·');
    text = text.replace(/\\div/g, '÷');
    text = text.replace(/\\pm/g, '±');
    text = text.replace(/\\approx/g, '≈');
    text = text.replace(/\\neq/g, '≠');
    text = text.replace(/\\le(q)?/g, '≤');
    text = text.replace(/\\ge(q)?/g, '≥');
    text = text.replace(/\\sqrt\s*\{([^{}]+)\}/g, '√($1)');
    text = text.replace(/\\sqrt\s*([0-9a-zA-Z])/g, '√$1');

    // Ubah huruf Yunani & simbol umum
    text = text.replace(/\\pi/g, 'π');
    text = text.replace(/\\theta/g, 'θ');
    text = text.replace(/\\alpha/g, 'α');
    text = text.replace(/\\beta/g, 'β');
    text = text.replace(/\\gamma/g, 'γ');
    text = text.replace(/\\Delta/g, 'Δ');
    text = text.replace(/\\infty/g, '∞');

    // Bersihkan tanda dollar $...$ dan $$...$$ LaTeX
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, '$1');
    text = text.replace(/\$([^\$]+)\$/g, '$1');

    // Hapus sisa backslash perintah latex
    text = text.replace(/\\text\s*\{([^{}]+)\}/g, '$1');
    text = text.replace(/\\mathbf\s*\{([^{}]+)\}/g, '*$1*');
    text = text.replace(/\\mathit\s*\{([^{}]+)\}/g, '_$1_');

    return text;
  }

  /**
   * Menjelaskan materi pembelajaran menggunakan Groq AI
   */
  async explainConcept(
    subjectName: string,
    studentQuery: string,
    materialContext?: string,
    history?: ChatMessageHistory[]
  ): Promise<string | null> {
    if (!this.isAvailable()) return null;

    const systemPrompt = `
Kamu adalah "AI Tutor Bot", seorang guru/tutor pribadi cerdas, ramah, komunikatif, dan sangat bijaksana dalam mendidik siswa pada mata pelajaran ${subjectName}.

PRINSIP UTAMA PEMBELAJARAN (METODE SOKRATIK & PANDUAN BERPIKIR):
1. JANGAN LANGSUNG MEMBERIKAN JAWABAN AKHIR / SOLUSI INSTAN jika siswa menanyakan soal, tugas, hitungan matematika/sains, atau terjemahan!
2. Tugas utamamu adalah MEMBANTU SISWA BELAJAR dan MEMANCING MEREKA BERPIKIR MANDIRI:
   - Jika siswa bertanya soal/tugas/latihan: Identifikasi poin penting soal, berikan petunjuk (clue) atau konsep kunci yang relevan, lalu pandu siswa untuk melangkah sendiri.
   - Jika siswa bertanya penjelasan teori/materi: Jelaskan konsep inti dengan analogi sederhana dan contoh konkret di kehidupan nyata.
   - Jika siswa mendesak minta jawaban langsung: Tolak dengan ramah dan semangati bahwa mereka pasti bisa jika mencoba langkah demi langkah.
3. AKHIRI SELALU dengan 1 PERTANYAAN PANCINGAN yang jelas dan ramah untuk mengajak siswa mencoba menjawab langkah berikutnya.
4. Interaksi Lanjutan Berdasarkan Riwayat Chat:
   - Jika siswa mencoba menjawab dan BENAR: Berikan pujian tulus (cth: "Bagus sekali! Tepat!") lalu bimbing ke langkah berikutnya hingga selesai.
   - Jika siswa SALAH atau BINGUNG: Berikan petunjuk yang lebih sederhana dan spesifik secara sabar tanpa menyalahkan.

ATURAN FORMAT & PENULISAN:
1. Gunakan bahasa Indonesia yang ramah, santun, mendidik, dan komunikatif.
2. JANGAN SELALU MENGULANG SALAM ("Halo!", "Halo teman-teman", "Halo! Wah...", dsb.) di setiap respons jika percakapan sedang berjalan! Langsung respon dan bimbing inti pertanyaan siswa secara luwes dan alami layaknya sedang mengobrol.
3. Gunakan format Markdown khas WhatsApp (*bold* untuk kata kunci, _italic_, dan emoji edukatif 💡, ✏️, 🌟 secukupnya).
4. Buat penjelasan yang ringkas dan terstruktur (maksimal 2-3 paragraf) agar siswa fokus membaca dan terdorong menjawab pertanyaan pemantiknya.
5. ATURAN PENULISAN RUMUS/MATEMATIKA: WhatsApp TIDAK MENDUKUNG format LaTeX (seperti \\frac, \\times, atau tanda $). Selalu tulis rumus dengan teks biasa (misal: Luas = Panjang × Lebar).
6. HANYA layani pertanyaan seputar pendidikan dan materi sekolah. Bersikaplah adaptif dan ramah jika siswa menanyakan topik materi pelajaran terkait.

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

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Tambahkan riwayat percakapan
    if (history && history.length > 0) {
      const recentTurns = history.slice(-6);
      recentTurns.forEach((h) => {
        messages.push({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: h.parts,
        });
      });
    }

    let userPrompt = studentQuery;
    if (materialContext) {
      userPrompt = `Gunakan materi rujukan berikut untuk menjawab:\n--- MATERI ---\n${materialContext}\n-------------\n\nPertanyaan Siswa: "${studentQuery}"`;
    }

    messages.push({ role: 'user', content: userPrompt });

    for (const modelId of this.candidateModels) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: modelId,
            messages: messages,
            temperature: 0.7,
            max_tokens: 600,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const rawContent = data.choices[0]?.message?.content || '';
          let cleanText = this.cleanThinkingTags(rawContent);
          cleanText = GroqService.formatMathForWhatsApp(cleanText);
          if (cleanText) {
            return cleanText;
          }
        }
      } catch (err) {
        // Coba model Groq berikutnya
      }
    }

    return null;
  }

  /**
   * Menggenerasi soal kuis otomatis menggunakan Groq AI
   */
  async generateQuizQuestions(subjectName: string, topic: string, count: number = 3): Promise<QuizQuestion[] | null> {
    if (!this.isAvailable()) return null;

    const prompt = `Buatkan ${count} soal kuis interaktif berbasis penalaran analitis dan berpikir kritis (HOTS / Higher Order Thinking Skills) untuk mata pelajaran ${subjectName} dengan topik "${topic}".
Kriteria: Hindari hafalan teori dasar yang dangkal, gunakan problem solving dan studi kasus kontekstual.
Kembalikan HANYA format JSON murni berupa array tanpa teks pembuka atau penutup markdown.
Format JSON:
[
  {
    "id": 1,
    "questionText": "Teks soal pertanyaan",
    "options": {
      "A": "Pilihan A",
      "B": "Pilihan B",
      "C": "Pilihan C",
      "D": "Pilihan D"
    },
    "correctOption": "A",
    "explanation": "Pembahasan jawaban yang benar"
  }
]`;

    for (const modelId of this.candidateModels) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: 'system', content: 'Kamu adalah pembuat soal kuis edukasi. Output HANYA array JSON yang valid.' },
              { role: 'user', content: prompt },
            ],
            temperature: 0.5,
            max_tokens: 1000,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          let rawContent = data.choices[0]?.message?.content || '';
          rawContent = this.cleanThinkingTags(rawContent);
          rawContent = rawContent.replace(/```json/gi, '').replace(/```/g, '').trim();

          const parsed = JSON.parse(rawContent) as QuizQuestion[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch (err) {
        // Coba model berikutnya
      }
    }

    return null;
  }

  /**
   * Transkripsi rekaman suara (Voice Note) siswa menggunakan Groq Whisper
   */
  async transcribeAudio(audioBuffer: Buffer, filename = 'voice_note.ogg'): Promise<string | null> {
    if (!this.isAvailable()) return null;

    try {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/ogg' });
      formData.append('file', blob, filename);
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('language', 'id');

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        return data.text || null;
      }
    } catch (err) {
      console.error('Groq Whisper transcription error:', err);
    }

    return null;
  }
}
