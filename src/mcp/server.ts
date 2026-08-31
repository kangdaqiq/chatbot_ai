import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DiagramService } from '../services/diagram.service';
import { AudioService } from '../services/audio.service';
import { GamificationService } from '../services/gamification.service';
import { CurriculumService } from '../services/curriculum.service';
import { DataStore } from '../web/dataStore';

export interface McpExecutionResult {
  text: string;
  imageBuffer?: Buffer | null;
  audioBuffer?: Buffer | null;
  xpEarned?: number;
  xpReason?: string;
  badgeUnlocked?: string;
  levelUp?: boolean;
}

export class LearningMcpServer {
  private server: McpServer;
  private diagramService: DiagramService;
  private audioService: AudioService;
  private gamificationService: GamificationService;
  private curriculumService: CurriculumService;
  private dataStore: DataStore;

  constructor() {
    this.server = new McpServer({
      name: 'wa-ai-learning-mcp-server',
      version: '1.0.0',
    });

    this.diagramService = new DiagramService();
    this.audioService = new AudioService();
    this.gamificationService = new GamificationService();
    this.curriculumService = new CurriculumService();
    this.dataStore = new DataStore();

    this.registerTools();
  }

  public getServer(): McpServer {
    return this.server;
  }

  public getDiagramService(): DiagramService {
    return this.diagramService;
  }

  public getAudioService(): AudioService {
    return this.audioService;
  }

  public getGamificationService(): GamificationService {
    return this.gamificationService;
  }

  public getCurriculumService(): CurriculumService {
    return this.curriculumService;
  }

  /**
   * Mendaftarkan seluruh Tools standar MCP ke server
   */
  private registerTools() {
    // 1. Tool: Visualisasi & Diagram Edukatif
    this.server.tool(
      'create_concept_diagram',
      'Membuat gambar diagram visual untuk konsep sains, alur siklus/proses, bangun ruang geometri, diagram Venn, atau grafik fungsi matematika',
      {
        type: z.enum(['flowchart', 'geometry', 'graph', 'venn']).describe('Jenis diagram yang ingin dibuat'),
        codeOrDescription: z.string().describe('Kode Mermaid untuk flowchart alur siklus, atau data geometri/grafik'),
        title: z.string().optional().describe('Judul grafik atau diagram'),
      },
      async ({ type, codeOrDescription, title }) => {
        try {
          let buffer: Buffer | null = null;
          if (type === 'flowchart') {
            buffer = await this.diagramService.generateDiagramBuffer({
              type: 'flowchart',
              data: { code: codeOrDescription },
            });
          } else if (type === 'geometry') {
            buffer = await this.diagramService.generateDiagramBuffer({
              type: 'geometry',
              data: { shape: codeOrDescription },
            });
          } else if (type === 'graph') {
            buffer = await this.diagramService.generateDiagramBuffer({
              type: 'graph',
              title: title || 'Grafik Fungsi',
              data: { values: [0, 1, 4, 9] },
            });
          } else if (type === 'venn') {
            buffer = await this.diagramService.generateDiagramBuffer({
              type: 'venn',
              data: { setA: 'Himpunan A', setB: 'Himpunan B', intersection: 'A ∩ B' },
            });
          }

          if (buffer) {
            return {
              content: [
                {
                  type: 'text',
                  text: `✅ [DIAGRAM GENERATED] Berhasil membuat diagram ${type}. Gambar terlampir.`,
                },
              ],
            };
          }
          return { content: [{ type: 'text', text: 'Gagal membuat diagram buffer' }] };
        } catch (err: any) {
          return { content: [{ type: 'text', text: `Error: ${err?.message || err}` }] };
        }
      }
    );

    // 2. Tool: Voice Note & Latihan Suara
    this.server.tool(
      'send_voice_note',
      'Mengirimkan rekaman audio Voice Note (PTT) untuk latihan listening, speaking, atau penjelasan materi suara',
      {
        spokenText: z.string().describe('Kalimat spesifik yang diucapkan secara jernih oleh pembicara native'),
        language: z.enum(['en', 'id']).describe('Bahasa audio: "en" untuk Native English atau "id" untuk Bahasa Indonesia'),
      },
      async ({ spokenText, language }) => {
        const buffer = await this.audioService.generateVoiceNoteBuffer(spokenText, language);
        if (buffer) {
          return {
            content: [
              {
                type: 'text',
                text: `🎙️ [AUDIO GENERATED] Berhasil membuat Voice Note (${language}): "${spokenText}"`,
              },
            ],
          };
        }
        return { content: [{ type: 'text', text: 'Gagal menghasilkan audio Voice Note' }] };
      }
    );

    // 3. Tool: Evaluasi Gamifikasi XP & Daya Nalar
    this.server.tool(
      'award_learning_xp',
      'Menganalisis proses belajar dan memberikan poin XP keaktifan/nalar kritis siswa',
      {
        userPhone: z.string().describe('Nomor WhatsApp siswa'),
        score: z.number().min(0).max(25).describe('Skor XP (0: main-main, 5-8: bertanya konsep, 12-18: nalar aktif, 20-25: HOTS tinggi)'),
        reason: z.string().describe('Alasan singkat evaluasi proses berpikir siswa (2-4 kata)'),
        subjectName: z.string().optional().describe('Mata pelajaran terkait'),
      },
      async ({ userPhone, score, reason, subjectName }) => {
        if (score <= 0) {
          return { content: [{ type: 'text', text: 'Skor 0 (interaksi tidak memenuhi syarat poin)' }] };
        }
        const result = this.gamificationService.recordInteractionReward({
          userPhone,
          xpEarned: score,
          reason,
          subjectName: subjectName || 'Umum',
        });
        return {
          content: [
            {
              type: 'text',
              text: `✨ +${score} XP Belajar Aktif diberikan ke ${userPhone} (${reason}). Total XP: ${result.profile.totalXp}, Level: ${result.profile.levelTitle}`,
            },
          ],
        };
      }
    );

    // 4. Tool: Pencarian Referensi Kurikulum (RAG)
    this.server.tool(
      'search_curriculum_rag',
      'Mencari potongan modul ajar atau buku paket kurikulum yang relevan dengan pertanyaan siswa',
      {
        subjectName: z.string().describe('Nama mata pelajaran (Matematika, PAI, IPA, Fisika, dll)'),
        query: z.string().describe('Topik atau pertanyaan spesifik yang dicari'),
      },
      async ({ subjectName, query }) => {
        const context = this.curriculumService.getRelevantContext(subjectName, query);
        return {
          content: [
            {
              type: 'text',
              text: context || 'Tidak ada materi rujukan khusus ditemukan.',
            },
          ],
        };
      }
    );
  }
}
