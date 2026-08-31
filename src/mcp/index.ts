export * from './server';
export * from './orchestrator';

import { McpAgentOrchestrator } from './orchestrator';

/**
 * Runner Mandiri untuk Pengujian Arsitektur MCP AI
 */
export async function runMcpDemo() {
  console.log('====================================================');
  console.log('🤖 MENJALANKAN MCP (MODEL CONTEXT PROTOCOL) AI AGENT');
  console.log('====================================================\n');

  const orchestrator = new McpAgentOrchestrator();
  const testPhone = '6281234567890';

  console.log('📌 Menguji Tool Calling 1: Permintaan Diagram Siklus Air...');
  const res1 = await orchestrator.executeUserMessage(
    testPhone,
    'IPA',
    'Bisa jelaskan proses siklus air dan buatkan bagan diagramnya?'
  );
  console.log('📝 Respon Teks:\n', res1.text);
  console.log('🖼️ Diagram Buffer Terbentuk:', res1.imageBuffer ? `${res1.imageBuffer.length} bytes` : 'Tidak');
  console.log('⚡ XP Diperoleh:', res1.xpEarned, `(${res1.xpReason})\n`);

  console.log('----------------------------------------------------\n');

  console.log('📌 Menguji Tool Calling 2: Latihan Listening Bahasa Inggris...');
  const res2 = await orchestrator.executeUserMessage(
    testPhone,
    'Bahasa Inggris',
    'Ayo latihan listening kalimat pendek instruksi memasak'
  );
  console.log('📝 Respon Teks:\n', res2.text);
  console.log('🎙️ Voice Note Buffer Terbentuk:', res2.audioBuffer ? `${res2.audioBuffer.length} bytes` : 'Tidak');
  console.log('⚡ XP Diperoleh:', res2.xpEarned, `(${res2.xpReason})\n`);
}

// Jalankan demo jika dieksekusi langsung
if (require.main === module) {
  runMcpDemo().catch(console.error);
}
