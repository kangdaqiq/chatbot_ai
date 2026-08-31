import fs from 'fs';
import path from 'path';

const { PDFParse } = require('pdf-parse');

export interface CurriculumItem {
  subjectId: string;
  subjectName: string;
  grade: string;
  chapter: string;
  content: string;
}

export interface CurriculumChunk {
  id: string;
  sourceFile: string;
  subjectName: string;
  grade: string;
  chapter: string;
  content: string;
}

export interface SearchResult {
  chunk: CurriculumChunk;
  score: number;
}

const STOP_WORDS = new Set([
  'yang', 'di', 'ke', 'dari', 'pada', 'dalam', 'untuk', 'dengan', 'dan', 'atau',
  'ini', 'itu', 'adalah', 'yaitu', 'sebagai', 'oleh', 'karena', 'maka', 'bisa',
  'dapat', 'akan', 'telah', 'sudah', 'saya', 'kamu', 'dia', 'mereka', 'kita',
  'kami', 'apa', 'siapa', 'kapan', 'dimana', 'mengapa', 'bagaimana', 'berapa',
  'the', 'is', 'at', 'which', 'on', 'in', 'to', 'for', 'with', 'and', 'or', 'an', 'a'
]);

export class CurriculumService {
  private static instance: CurriculumService;
  private curriculumDir = path.join(process.cwd(), 'data', 'curriculum');
  private cacheFilePath = path.join(process.cwd(), 'data', 'cache_rag_chunks.json');
  private materials: CurriculumItem[] = [];
  private chunks: CurriculumChunk[] = [];
  private isLoading = false;
  private isLoaded = false;
  private loadingPromise: Promise<void> | null = null;

  // BM25 Index Data
  private docLengths: number[] = [];
  private avgDocLength = 0;
  private dfMap: Map<string, number> = new Map();
  private docTermFreqs: Array<Map<string, number>> = [];

  public static getInstance(): CurriculumService {
    if (!CurriculumService.instance) {
      CurriculumService.instance = new CurriculumService();
    }
    return CurriculumService.instance;
  }

  constructor() {
    if (CurriculumService.instance) {
      return CurriculumService.instance;
    }
    CurriculumService.instance = this;
    this.loadingPromise = this.internalLoadMaterials();
  }

  /**
   * Tokenizer & Normalisasi kata untuk Bahasa Indonesia & Inggris
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  }

  /**
   * Memecah dokumen panjang menjadi potongan (chunks) dengan overlap
   */
  private createChunksFromText(
    fullText: string,
    sourceFile: string,
    subjectName: string,
    grade: string,
    chapter: string,
    chunkSize = 650,
    chunkOverlap = 150
  ): CurriculumChunk[] {
    const result: CurriculumChunk[] = [];
    const cleanText = fullText.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
    if (!cleanText) return result;

    let start = 0;
    let chunkId = 1;

    while (start < cleanText.length) {
      let end = start + chunkSize;
      if (end < cleanText.length) {
        // Cari batas spasi atau titik terdekat agar kalimat tidak terpotong kasar
        const lastPeriod = cleanText.lastIndexOf('. ', end);
        const lastNewline = cleanText.lastIndexOf('\n', end);
        const breakPoint = Math.max(lastPeriod !== -1 && lastPeriod > start + 200 ? lastPeriod + 1 : -1, lastNewline !== -1 && lastNewline > start + 200 ? lastNewline : -1);

        if (breakPoint > start) {
          end = breakPoint;
        }
      } else {
        end = cleanText.length;
      }

      const chunkText = cleanText.substring(start, end).trim();
      if (chunkText.length > 50) {
        result.push({
          id: `${sourceFile}_${chunkId++}`,
          sourceFile,
          subjectName,
          grade,
          chapter,
          content: chunkText,
        });
      }

      if (end >= cleanText.length) break;
      start = Math.max(start + 1, end - chunkOverlap);
    }

    return result;
  }

  /**
   * Membangun Indeks BM25 untuk pencarian cerdas
   */
  private buildBM25Index(): void {
    this.docLengths = [];
    this.dfMap.clear();
    this.docTermFreqs = [];

    let totalLength = 0;

    for (let i = 0; i < this.chunks.length; i++) {
      const tokens = this.tokenize(this.chunks[i].content);
      const docLen = tokens.length;
      this.docLengths.push(docLen);
      totalLength += docLen;

      const tf = new Map<string, number>();
      const seen = new Set<string>();

      for (const t of tokens) {
        tf.set(t, (tf.get(t) || 0) + 1);
        if (!seen.has(t)) {
          seen.add(t);
          this.dfMap.set(t, (this.dfMap.get(t) || 0) + 1);
        }
      }
      this.docTermFreqs.push(tf);
    }

    this.avgDocLength = this.chunks.length > 0 ? totalLength / this.chunks.length : 1;
    console.log(`⚡ [RAG ENGINE] Indeks BM25 selesai dibangun: ${this.chunks.length} Chunks materi.`);
  }

  /**
   * Memeriksa dan memuat cache chunks dari disk jika valid
   */
  private tryLoadFromCache(files: string[]): boolean {
    try {
      if (!fs.existsSync(this.cacheFilePath)) return false;

      const raw = fs.readFileSync(this.cacheFilePath, 'utf-8');
      const data = JSON.parse(raw);

      if (!data.chunks || !Array.isArray(data.chunks) || data.chunks.length === 0) {
        return false;
      }

      // Verifikasi daftar file cocok
      const cachedFiles: string[] = data.files || [];
      if (files.length !== cachedFiles.length || !files.every((f) => cachedFiles.includes(f))) {
        return false;
      }

      this.chunks = data.chunks;
      this.buildBM25Index();
      console.log(`🚀 [RAG CACHE] Memuat ${this.chunks.length} Chunks materi dari cache disk secara instan!`);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Menyimpan chunks ke cache disk
   */
  private saveToCache(files: string[]): void {
    try {
      const data = {
        savedAt: new Date().toISOString(),
        files,
        chunks: this.chunks,
      };
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(data), 'utf-8');
      console.log(`💾 [RAG CACHE] ${this.chunks.length} Chunks kurikulum berhasil dicache ke disk.`);
    } catch (e) {
      console.error('Gagal menyimpan cache RAG:', e);
    }
  }

  /**
   * Memuat semua file PDF, TXT, MD, dan JSON di folder data/curriculum/
   */
  public async loadMaterials(forceReload = false): Promise<void> {
    if (this.isLoaded && !forceReload) return;
    if (this.loadingPromise && !forceReload) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.internalLoadMaterials(forceReload);
    return this.loadingPromise;
  }

  private async internalLoadMaterials(forceReload = false): Promise<void> {
    this.isLoading = true;
    this.materials = [];
    this.chunks = [];

    if (!fs.existsSync(this.curriculumDir)) {
      fs.mkdirSync(this.curriculumDir, { recursive: true });
      this.isLoading = false;
      this.isLoaded = true;
      return;
    }

    const files = fs.readdirSync(this.curriculumDir);

    // Coba gunakan cache jika tidak dipaksa reload
    if (!forceReload && this.tryLoadFromCache(files)) {
      this.isLoading = false;
      this.isLoaded = true;
      return;
    }

    console.log(`📚 [RAG ENGINE] Mulai memproses & mengindeks ${files.length} berkas materi...`);

    for (const file of files) {
      const filePath = path.join(this.curriculumDir, file);
      const ext = path.extname(file).toLowerCase();
      const baseName = file.replace(ext, '');

      try {
        if (ext === '.json') {
          const content = fs.readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(content) as CurriculumItem[];
          if (Array.isArray(parsed)) {
            this.materials.push(...parsed);
            for (const item of parsed) {
              const fileChunks = this.createChunksFromText(
                item.content,
                file,
                item.subjectName || baseName,
                item.grade || 'Kurikulum',
                item.chapter || item.subjectName
              );
              this.chunks.push(...fileChunks);
            }
          }
        } else if (ext === '.txt' || ext === '.md') {
          const text = fs.readFileSync(filePath, 'utf-8');
          const fileChunks = this.createChunksFromText(text, file, baseName, 'Buku Teks', file);
          this.chunks.push(...fileChunks);
          console.log(`📄 [RAG TXT] ${file} -> ${fileChunks.length} Chunks`);
        } else if (ext === '.pdf') {
          const originalWarn = console.warn;
          console.warn = (...args: any[]) => {
            const msg = args[0] ? String(args[0]) : '';
            if (
              msg.startsWith('Warning:') ||
              msg.includes('UnknownErrorException') ||
              msg.includes('translateFont') ||
              msg.includes('standardFontDataUrl') ||
              msg.includes('cMapUrl')
            ) {
              return;
            }
            originalWarn(...args);
          };

          try {
            const dataBuffer = fs.readFileSync(filePath);
            const uint8Array = new Uint8Array(dataBuffer);
            const parser = new PDFParse(uint8Array);
            await parser.load();
            const parsedRes = await parser.getText();
            const extractedText = parsedRes?.text || '';

            if (extractedText) {
              const fileChunks = this.createChunksFromText(extractedText, file, baseName, 'Modul PDF', file);
              this.chunks.push(...fileChunks);
              console.log(`📖 [RAG PDF] ${file} (${parsedRes?.total || 0} Hal) -> ${fileChunks.length} Chunks`);
            }
          } finally {
            console.warn = originalWarn;
          }
        }
      } catch (err: any) {
        console.error(`❌ Gagal memuat file kurikulum ${file}:`, err?.message || err);
      }
    }

    this.buildBM25Index();
    this.saveToCache(files);

    this.isLoading = false;
    this.isLoaded = true;
  }

  /**
   * Helper untuk menentukan relevansi nama mapel
   */
  private isSubjectMatch(chunkSubject: string, targetSubject: string): boolean {
    const s1 = chunkSubject.toLowerCase();
    const s2 = targetSubject.toLowerCase();

    if (s2 === 'umum' || s2.length === 0) return true;
    if (s1.includes(s2) || s2.includes(s1)) return true;

    // Mapping sinonim mata pelajaran
    if ((s2.includes('islam') || s2.includes('pai') || s2.includes('agama')) && (s1.includes('islam') || s1.includes('pai') || s1.includes('agama'))) return true;
    if ((s2.includes('math') || s2.includes('matematika')) && (s1.includes('math') || s1.includes('matematika'))) return true;
    if ((s2.includes('inggris') || s2.includes('english') || s2.includes('eng')) && (s1.includes('inggris') || s1.includes('english') || s1.includes('eng'))) return true;
    if (s2.includes('sejarah') && s1.includes('sejarah')) return true;
    if (s2.includes('informatika') && s1.includes('informatika')) return true;
    if (s2.includes('fisika') && s1.includes('fisika')) return true;

    return false;
  }

  /**
   * Melakukan Semantic / BM25 Search terhadap potongan dokumen kurikulum
   */
  public searchRelevantChunks(subjectName: string, query: string, topK = 4): SearchResult[] {
    if (this.chunks.length === 0) return [];

    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    const k1 = 1.5;
    const b = 0.75;
    const N = this.chunks.length;
    const results: SearchResult[] = [];

    const cleanQuery = query.toLowerCase();

    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];

      // Filter subjek mata pelajaran jika spesifik
      if (!this.isSubjectMatch(chunk.subjectName, subjectName)) {
        continue;
      }

      let bm25Score = 0;
      const tfMap = this.docTermFreqs[i] || new Map();
      const docLen = this.docLengths[i] || 1;

      for (const token of queryTokens) {
        const tf = tfMap.get(token) || 0;
        if (tf > 0) {
          const df = this.dfMap.get(token) || 1;
          const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
          const num = tf * (k1 + 1);
          const denom = tf + k1 * (1 - b + b * (docLen / this.avgDocLength));
          bm25Score += idf * (num / denom);
        }
      }

      // Bonus Skor untuk kecocokan frasa persis (Exact Phrase Match)
      if (cleanQuery.length > 5 && chunk.content.toLowerCase().includes(cleanQuery)) {
        bm25Score += 5.0;
      }

      if (bm25Score > 0) {
        results.push({ chunk, score: bm25Score });
      }
    }

    // Urutkan dari skor tertinggi
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Mengambil konteks materi kurikulum yang relevan secara presisi untuk diberikan ke AI
   */
  public getRelevantContext(subjectName: string, query: string, topK = 3): string {
    const hits = this.searchRelevantChunks(subjectName, query, topK);
    if (hits.length === 0) return '';

    return hits
      .map(
        (hit, idx) =>
          `[RUJUKAN RESMI ${idx + 1}: ${hit.chunk.sourceFile} (${hit.chunk.chapter})]\n${hit.chunk.content}`
      )
      .join('\n\n---\n\n');
  }

  /**
   * Backward Compatibility: Mengambil konteks materi kurikulum
   */
  public getCurriculumContext(subjectName: string): string {
    return this.getRelevantContext(subjectName, subjectName, 3);
  }

  /**
   * Total chunks yang terindeks dalam sistem
   */
  public getTotalChunksCount(): number {
    return this.chunks.length;
  }
}
