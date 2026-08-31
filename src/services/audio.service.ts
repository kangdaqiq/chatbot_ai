import * as googleTTS from 'google-tts-api';
import { config } from '../config';

export class AudioService {
  /**
   * Membersihkan format markdown, kode, dan emoji agar pembacaan suara AI terdengar natural
   */
  public static cleanTextForTTS(rawText: string): string {
    let text = rawText;

    // Hapus blok header, garis pemisah, dan format markdown
    text = text.replace(/[*_~`#]/g, '');
    text = text.replace(/─+|━+|-{3,}/g, ' ');
    text = text.replace(/https?:\/\/\S+/g, ''); // Hapus link URL
    text = text.replace(/[🤖📚🎉💡📝⭐🏆🥇🥈🥉🐣📖🚀🧠🌟👑💯🔥⚡🎓📛🏫📱📊🎯🎖️•✔️❌🤍✨🤲😊🎙️]/gu, ''); // Hapus emoji

    // Hapus baris instruksi bot standar di akhir pesan
    text = text.replace(/Ketik (MENU|KUIS|LEADERBOARD|PROFIL).*/gi, '');
    text = text.replace(/_Tips:.*/gi, '');
    text = text.replace(/\(Sambil membayangkan.*?\)/gi, '');

    // Rapikan spasi ganda dan baris kosong
    text = text.replace(/\n+/g, '. ').replace(/\s+/g, ' ').trim();

    // Batasi panjang audio (maksimal 500 karakter pertama agar durasi VN pas ~30-40 detik)
    if (text.length > 500) {
      const sentenceEnd = text.lastIndexOf('.', 500);
      if (sentenceEnd > 200) {
        text = text.substring(0, sentenceEnd + 1);
      } else {
        text = text.substring(0, 500) + '...';
      }
    }

    return text;
  }

  /**
   * Mengekstrak HANYA bagian kalimat/dialog yang perlu diucapkan via Voice Note
   * (Menghilangkan basa-basi pembuka teks, petunjuk mengetik, dan menyaring kutipan target latihan)
   */
  public static extractSpeechText(rawText: string): { speechText: string; lang: 'en' | 'id'; cleanText: string } {
    let cleanText = rawText;
    let speechText = '';
    let lang: 'en' | 'id' = 'id';

    // 1. Tag eksplisit [SPEECH:en] ... [/SPEECH]
    const speechMatch = rawText.match(/\[SPEECH(?::([a-z]+))?\]([\s\S]*?)\[\/SPEECH\]/i);
    if (speechMatch) {
      lang = (speechMatch[1] || 'id').toLowerCase() as 'en' | 'id';
      speechText = speechMatch[2].trim();
      cleanText = rawText.replace(speechMatch[0], '').trim();
      return { speechText, lang, cleanText };
    }

    // 2. Deteksi kutipan target audio (misal: 🎵 "First, boil two cups..." atau "...")
    const quoteMatch = rawText.match(/(?:🎵|🎧|🔊|🎙️|🗣️)?\s*["“]([A-Za-z0-9\s,.'!?-]{10,250})["”]/);
    if (quoteMatch) {
      speechText = quoteMatch[1].trim();
      lang = AudioService.detectLanguage(speechText);
      return { speechText, lang, cleanText };
    }

    // 3. Jika berupa latihan conversation/listening umum, ambil kalimat materi intinya saja
    const paragraphs = rawText
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 10 && !p.startsWith('Wah,') && !p.startsWith('Halo') && !p.startsWith('Coba') && !p.startsWith('+'));

    speechText = paragraphs.find((p) => p.includes('"') || p.includes('🎵') || AudioService.detectLanguage(p) === 'en') || paragraphs[0] || rawText;
    lang = AudioService.detectLanguage(speechText);

    return { speechText, lang, cleanText };
  }

  /**
   * Menggenerasi audio buffer Voice Note (.mp3/.ogg) dari teks Bahasa Indonesia atau English
   * Mendukung: ElevenLabs (Suara Manusia Asli), OpenAI TTS, atau Google TTS Fallback
   */
  public async generateVoiceNoteBuffer(text: string, lang: string = 'id'): Promise<Buffer | null> {
    const cleanText = AudioService.cleanTextForTTS(text);
    if (!cleanText || cleanText.length < 3) return null;

    // 1. OPSI UTAMA: ElevenLabs (Suara Manusia Asli Paling Nyata & Beremosi)
    if (config.elevenLabsApiKey) {
      try {
        const elevenBuffer = await this.synthesizeWithElevenLabs(cleanText);
        if (elevenBuffer) {
          console.log('🎙️ [VOICE] Berhasil generate suara manusia asli via ElevenLabs!');
          return elevenBuffer;
        }
      } catch (err: any) {
        console.error('ElevenLabs TTS failed, falling back to next provider:', err?.message || err);
      }
    }

    // 2. OPSI KEDUA: OpenAI TTS (Neural Voice)
    if (config.openAiApiKey) {
      try {
        const openAiBuffer = await this.synthesizeWithOpenAI(cleanText);
        if (openAiBuffer) {
          console.log('🎙️ [VOICE] Berhasil generate suara neural via OpenAI TTS!');
          return openAiBuffer;
        }
      } catch (err: any) {
        console.error('OpenAI TTS failed, falling back to Google TTS:', err?.message || err);
      }
    }

    // 3. OPSI DEFAULT / FALLBACK: Google High-Speed TTS
    try {
      const base64List = await googleTTS.getAllAudioBase64(cleanText, {
        lang: lang,
        slow: false,
        host: 'https://translate.google.com',
        timeout: 10000,
        splitPunct: ',.?!;:',
      });

      if (!base64List || base64List.length === 0) return null;

      const buffers = base64List.map((item) => Buffer.from(item.base64, 'base64'));
      return Buffer.concat(buffers);
    } catch (err: any) {
      console.error('❌ Gagal menggenerasi Voice Note Audio:', err?.message || err);
      return null;
    }
  }

  /**
   * ElevenLabs Synthesizer (Human Voice Ultra-Realistic)
   */
  private async synthesizeWithElevenLabs(text: string): Promise<Buffer | null> {
    const voiceId = config.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM';
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': config.elevenLabsApiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          style: 0.2,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`ElevenLabs API returned ${res.status}: ${errText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * OpenAI TTS Synthesizer
   */
  private async synthesizeWithOpenAI(text: string): Promise<Buffer | null> {
    const url = 'https://api.openai.com/v1/audio/speech';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: 'nova', // suara ramah hangat guru
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI TTS API returned ${res.status}: ${errText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Mengecek apakah pesan siswa mengandung permintaan balasan suara / audio
   */
  public static isAudioRequested(text: string): boolean {
    const lower = text.toLowerCase();
    const patterns = [
      /\bvn\b/i,
      /\bvoice\b/i,
      /\bvoice note\b/i,
      /\bsuara\b/i,
      /\baudio\b/i,
      /\bbacakan\b/i,
      /\brekaman\b/i,
      /\blafaz\b/i,
      /\blafal\b/i,
      /\btajwid\b/i,
      /\/vn/i,
      /\/suara/i,
      /\/voice/i,
      /cara baca/i,
      /bacaan/i,
      /dengar/i,
      /ngomong/i,
      /bicara/i,
      /pakai suara/i,
      /kirim suara/i,
    ];
    return patterns.some((p) => p.test(lower));
  }

  /**
   * Mendeteksi bahasa dominan ('en' untuk Bahasa Inggris native speaker, 'id' untuk Bahasa Indonesia)
   */
  public static detectLanguage(text: string): 'en' | 'id' {
    const lower = text.toLowerCase();
    const englishWords = [
      'the', 'is', 'are', 'you', 'how', 'what', 'why', 'can', 'could',
      'good', 'morning', 'hello', 'practice', 'speaking', 'pronunciation',
      'repeat', 'sentence', 'english', 'grammar', 'vocabulary', 'listen',
      'say', 'great', 'awesome', 'today', 'let\'s'
    ];
    let matches = 0;
    for (const w of englishWords) {
      if (new RegExp(`\\b${w}\\b`, 'i').test(lower)) matches++;
    }
    return matches >= 2 ? 'en' : 'id';
  }
}
