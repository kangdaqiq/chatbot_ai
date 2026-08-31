import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { config } from '../config';
import { LearningMcpServer, McpExecutionResult } from './server';
import { ChatMessageHistory } from '../models/types';
import { AudioService } from '../services/audio.service';

export class McpAgentOrchestrator {
  private genAI: GoogleGenerativeAI;
  private mcpServer: LearningMcpServer;

  constructor(mcpServer?: LearningMcpServer) {
    this.genAI = new GoogleGenerativeAI(config.geminiApiKey || '');
    this.mcpServer = mcpServer || new LearningMcpServer();
  }

  public getMcpServer(): LearningMcpServer {
    return this.mcpServer;
  }

  /**
   * Eksekusi pesan siswa menggunakan arsitektur MCP Tool Calling
   */
  public async executeUserMessage(
    userPhone: string,
    subjectName: string,
    message: string,
    history?: ChatMessageHistory[]
  ): Promise<McpExecutionResult> {
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: `
Kamu adalah "AI Tutor Bot (MCP Agent)", guru/tutor pribadi cerdas berbasis Model Context Protocol (MCP) untuk mata pelajaran ${subjectName}.

PRINSIP PEMBELAJARAN METODE SOKRATIK:
1. Jangan berikan jawaban instan langsung. Bimbing siswa langkah demi langkah agar mereka berpikir kritis dan menemukan jawaban sendiri.
2. Akhiri selalu dengan 1 pertanyaan pancingan pemantik nalar.

KEMAMPUAN MULTIMODAL & MCP TOOLS YANG TERSEDIA:
Kamu memiliki 3 Tool MCP resmi:
1. create_concept_diagram: Panggil tool ini jika konsep membutuhkan gambar alur siklus (siklus air, awan, fotosintesis, rantai makanan), grafik fungsi, atau geometri.
2. send_voice_note: Panggil tool ini jika siswa ingin latihan listening / dictation / percakapan suara.
   - PENTING untuk latihan listening: Masukkan kalimat yang dibacakan ke parameter tool "spokenText", dan JANGAN bocorkan kalimatnya di teks chat agar siswa benar-benar mendengarkan audio!
3. award_learning_xp: Panggil tool ini di setiap interaksi untuk mengevaluasi kesungguhan nalar kritis siswa (score 0: spam/main-main, 5-8: tanya konsep, 12-18: nalar aktif, 20-25: HOTS tinggi).

Gunakan bahasa Indonesia yang ramah, santun, komunikatif, dan format Markdown WhatsApp (*bold*, _italic_, emoji edukatif secukupnya).
`,
      tools: [
        {
          functionDeclarations: [
            {
              name: 'create_concept_diagram',
              description: 'Membuat gambar diagram visual untuk konsep sains, alur siklus, bangun ruang geometri, atau grafik matematika.',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  diagramType: {
                    type: SchemaType.STRING,
                    description: 'Jenis diagram: "flowchart", "geometry", "graph", atau "venn"',
                  },
                  codeOrDescription: {
                    type: SchemaType.STRING,
                    description: 'Kode Mermaid alur proses (misal: graph TD; A-->B) atau nama bentuk geometri',
                  },
                },
                required: ['diagramType', 'codeOrDescription'],
              },
            },
            {
              name: 'send_voice_note',
              description: 'Mengirimkan rekaman audio Voice Note (PTT) untuk latihan listening atau percakapan bahasa Inggris.',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  spokenText: {
                    type: SchemaType.STRING,
                    description: 'Kalimat spesifik yang diucapkan oleh native speaker',
                  },
                  language: {
                    type: SchemaType.STRING,
                    description: '"en" untuk English atau "id" untuk Indonesia',
                  },
                },
                required: ['spokenText', 'language'],
              },
            },
            {
              name: 'award_learning_xp',
              description: 'Menganalisis proses belajar nalar kritis siswa dan memberikan poin XP (0-25).',
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  score: {
                    type: SchemaType.NUMBER,
                    description: 'Skor XP dari 0 hingga 25 berdasarkan nalar kritis siswa',
                  },
                  reason: {
                    type: SchemaType.STRING,
                    description: 'Alasan singkat evaluasi proses berpikir siswa (2-4 kata)',
                  },
                },
                required: ['score', 'reason'],
              },
            },
          ],
        },
      ],
    });

    let historyContext = '';
    if (history && history.length > 0) {
      const recentTurns = history.slice(-6);
      historyContext = '--- RIWAYAT PERCAKAPAN SEBELUMNYA ---\n' +
        recentTurns.map((h) => `${h.role === 'user' ? 'Siswa' : 'AI Tutor'}: ${h.parts}`).join('\n') +
        '\n------------------------------------\n\n';
    }

    const prompt = `${historyContext}Pertanyaan Siswa: "${message}"`;
    const result = await model.generateContent(prompt);
    const response = result.response;

    let replyText = response.text() || '';
    let imageBuffer: Buffer | null = null;
    let audioBuffer: Buffer | null = null;
    let xpEarned = 0;
    let xpReason = '';
    let levelUp = false;
    let badgeUnlocked: string | undefined;

    // Eksekusi Tool Calls yang diminta oleh Model AI via MCP Server
    const functionCalls = response.functionCalls();
    if (functionCalls && functionCalls.length > 0) {
      for (const call of functionCalls) {
        console.log(`🔌 [MCP TOOL CALL] AI memanggil tool: ${call.name}`, call.args);

        if (call.name === 'create_concept_diagram') {
          const args = call.args as { diagramType: string; codeOrDescription: string };
          if (args.diagramType === 'flowchart') {
            imageBuffer = await this.mcpServer.getDiagramService().generateDiagramBuffer({
              type: 'flowchart',
              data: { code: args.codeOrDescription },
            });
          } else if (args.diagramType === 'geometry') {
            imageBuffer = await this.mcpServer.getDiagramService().generateDiagramBuffer({
              type: 'geometry',
              data: { shape: args.codeOrDescription },
            });
          }
        }

        if (call.name === 'send_voice_note') {
          const args = call.args as { spokenText: string; language?: string };
          const lang = args.language === 'en' ? 'en' : 'id';
          audioBuffer = await this.mcpServer.getAudioService().generateVoiceNoteBuffer(args.spokenText, lang);
        }

        if (call.name === 'award_learning_xp') {
          const args = call.args as { score: number; reason: string };
          xpEarned = args.score;
          xpReason = args.reason;
          if (xpEarned > 0) {
            const reward = this.mcpServer.getGamificationService().recordInteractionReward({
              userPhone,
              xpEarned,
              reason: xpReason,
              subjectName,
            });
            levelUp = reward.levelUp;
            if (reward.newBadges.length > 0) {
              badgeUnlocked = `${reward.newBadges[0].icon} ${reward.newBadges[0].name}`;
            }
          }
        }
      }
    }

    // Tambahkan info perolehan XP dan Badge di akhir teks balasan jika ada
    if (xpEarned > 0) {
      replyText += `\n\n✨ _+${xpEarned} XP Belajar Aktif (${xpReason})_`;
      if (levelUp) {
        replyText += `\n🎊 *Selamat! Kamu naik level baru!*`;
      }
      if (badgeUnlocked) {
        replyText += `\n🎖️ *Medali Baru Terbuka: ${badgeUnlocked}!*`;
      }
    }

    return {
      text: replyText.trim(),
      imageBuffer,
      audioBuffer,
      xpEarned,
      xpReason,
      badgeUnlocked,
      levelUp,
    };
  }
}
