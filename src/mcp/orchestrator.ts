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
   * Eksekusi pesan siswa menggunakan arsitektur Resmi MCP Tool Calling Multi-Turn
   */
  public async executeUserMessage(
    userPhone: string,
    subjectName: string,
    message: string,
    history?: ChatMessageHistory[]
  ): Promise<McpExecutionResult> {
    const candidateModels = [
      'gemini-flash-lite-latest',
      'gemini-flash-latest',
    ];

    let lastError: any = null;

    for (const modelName of candidateModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const model = this.genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: `
Kamu adalah "AI Tutor Bot (MCP Agent)", guru/tutor pribadi cerdas berbasis Model Context Protocol (MCP) untuk mata pelajaran ${subjectName}.

PRINSIP KOMUNIKASI & PEMBELAJARAN (METODE SOKRATIK):
1. WAJIB SELALU MENULIS BALASAN TEKS YANG RAMAH, EDUKATIF, DAN MEMBIMBING SISWA.
2. Jika siswa hanya menyapa, mengirim pesan singkat/iseng ("Woy", "Ga", "p", "halo"):
   - Balas dengan ramah dan pancing mereka untuk mulai belajar materi pelajaran.
   - Panggil tool award_learning_xp dengan score: 0 (tidak ada poin).
3. Jika siswa bertanya atau belajar konsep:
   - Jelaskan dengan analogi menarik, jangan berikan jawaban instan, dan akhiri selalu dengan 1 pertanyaan pancingan pemantik nalar.
   - Evaluasi nalar kritisnya via tool award_learning_xp (score: 5-8 tanya konsep, 12-18 nalar aktif, 20-25 HOTS tinggi).

KEMAMPUAN TOOLS MCP YANG TERSEDIA:
1. create_concept_diagram: Panggil jika konsep membutuhkan bagan alur proses/siklus sains (siklus air, fotosintesis, rantai makanan), grafik fungsi, atau geometri.
2. send_voice_note: Panggil jika siswa ingin latihan listening / dictation / percakapan suara.
   - PENTING untuk listening: Masukkan kalimat yang dibacakan ke parameter "spokenText". JANGAN tuliskan kalimatnya di balasan teks agar siswa benar-benar mendengarkan audio!
3. award_learning_xp: Panggil di setiap giliran untuk mencatat evaluasi poin nalar siswa (0-25).

Gunakan bahasa Indonesia yang ramah, santun, komunikatif, dan format Markdown WhatsApp (*bold*, _italic_, emoji edukatif secukupnya).
`,
            tools: [
              {
                functionDeclarations: [
                  {
                    name: 'create_concept_diagram',
                    description: 'Membuat gambar diagram visual untuk konsep sains, alur siklus/proses, bangun ruang geometri, atau grafik matematika.',
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
                          description: 'Skor XP dari 0 hingga 25 (0 untuk spam/sapaan/main-main)',
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

          // Format riwayat chat untuk sesi Gemini
          const chatHistory = (history || []).slice(-6).map((h) => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.parts }],
          }));

          const chat = model.startChat({
            history: chatHistory,
          });

          let result = await chat.sendMessage(`Pertanyaan/Pesan Siswa: "${message}"`);
          let response = result.response;

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
                const args = call.args as { score: any; reason: string };
                const numericScore = typeof args.score === 'number' ? args.score : parseInt(String(args.score), 10) || 0;
                xpEarned = Math.max(0, Math.min(25, numericScore));
                xpReason = args.reason || '';

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

          let replyText = response.text() || '';

          // Jika model hanya memanggil tool tanpa teks balasan, minta teks balasan lengkap
          if (!replyText || replyText.trim().length < 5) {
            try {
              let guidance = 'Tuliskan balasan ramah edukatif kepada siswa!';
              if (audioBuffer) {
                guidance = 'Beritahu siswa untuk mendengarkan Voice Note di atas baik-baik dan minta mereka mengetik kalimat yang didengar.';
              } else if (imageBuffer) {
                guidance = 'Jelaskan konsep berdasarkan diagram di atas secara ringkas dan akhiri dengan 1 pertanyaan pancingan.';
              }
              const followUp = await chat.sendMessage(guidance);
              replyText = followUp.response.text() || '';
            } catch {
              if (audioBuffer) {
                replyText = 'Dengarkan Voice Note di atas baik-baik ya! 🎧 Coba ketik kalimat apa yang baru saja kamu dengar ✏️.';
              } else if (imageBuffer) {
                replyText = 'Berikut diagram ilustrasi konsepnya! Coba perhatikan bagan di atas, apa yang bisa kamu simpulkan? 💡';
              } else {
                replyText = 'Halo! Ada materi pelajaran yang ingin kita bahas bersama hari ini? Coba tanyakan topik apa saja yang sedang kamu pelajari! 😊';
              }
            }
          }

          // Tambahkan notifikasi XP dan badge jika benar-benar ada poin (skor > 0)
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
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || String(err);
          const is503 = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('RESOURCE_EXHAUSTED');
          if (is503 && attempt === 1) {
            console.warn(`[MCP AGENT] Model ${modelName} 503 high demand spike, mencoba ulang dalam 1.5 detik...`);
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          console.warn(`[MCP AGENT] Model ${modelName} gagal: ${errMsg}. Mencoba model berikutnya...`);
          break;
        }
      }
    }

    throw lastError || new Error('Semua model kandidat Gemini gagal dieksekusi.');
  }
}
