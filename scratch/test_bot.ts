import { MessageRouter } from '../src/bot/router';

async function testChatbotTutor() {
  console.log('Testing Socratic AI Tutor with RAG Context...');
  const router = new MessageRouter();

  const userPhone = `6289999999${Date.now().toString().slice(-4)}`;

  // 1. Menu Utama -> Pilih Belajar
  console.log('\n--- 1. Siswa Ketik "1" (Menu Belajar) ---');
  let reply = await router.handleMessage(userPhone, '1');
  console.log('BOT:\n' + reply);

  // 2. Pilih Mapel 1 (Matematika)
  console.log('\n--- 2. Siswa Pilih Mapel "1" (Matematika) ---');
  reply = await router.handleMessage(userPhone, '1');
  console.log('BOT:\n' + reply);

  // 3. Siswa bertanya soal matematika
  console.log('\n--- 3. Siswa Bertanya Soal Eksponen ---');
  reply = await router.handleMessage(userPhone, 'Tolong dong kerjakan soal ini: sederhanakan (2^5 * 2^3) / 2^2');
  console.log('BOT:\n' + reply);
}

testChatbotTutor();
