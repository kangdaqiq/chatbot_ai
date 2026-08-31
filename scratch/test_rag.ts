import { CurriculumService } from '../src/services/curriculum.service';

async function testRAG() {
  console.log('Testing RAG Engine...');
  const curriculum = CurriculumService.getInstance();
  await curriculum.loadMaterials();

  console.log(`Total Chunks: ${curriculum.getTotalChunksCount()}`);

  const testQueries = [
    { subject: 'Matematika', q: 'Eksponen dan Logaritma' },
    { subject: 'Pendidikan Agama Islam', q: 'Hukum Tajwid Al-Qur\'an dan Fiqih' },
    { subject: 'Bahasa Inggris', q: 'Descriptive text and simple past tense' },
    { subject: 'Informatika', q: 'Algoritma dan pemrograman' },
  ];

  for (const t of testQueries) {
    console.log(`\n========================================`);
    console.log(`Query: "${t.q}" [Mapel: ${t.subject}]`);
    const hits = curriculum.searchRelevantChunks(t.subject, t.q, 2);
    hits.forEach((h, i) => {
      console.log(`  [Hit #${i+1}] File: ${h.chunk.sourceFile} | Score: ${h.score.toFixed(2)}`);
      console.log(`  Snippet: ${h.chunk.content.substring(0, 120)}...`);
    });
  }
}

testRAG();
