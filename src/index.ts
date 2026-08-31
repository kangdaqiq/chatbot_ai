import readline from 'readline';
import { MessageRouter } from './bot/router';
import { WhatsAppClient } from './bot/waClient';
import { config } from './config';

async function runSimulator() {
  console.log('====================================================');
  console.log(`🚀 MODES SIMULASI TERMINAL: ${config.botName.toUpperCase()}`);
  console.log('====================================================');
  console.log('📱 Ketik pesan seolah-olah Anda adalah siswa yang sedang chat di WA.');
  console.log('Ketik "exit" untuk keluar.\n');

  const router = new MessageRouter();
  const simulatedUserPhone = '6281234567890';

  const initialGreeting = await router.handleMessage(simulatedUserPhone, 'Halo');
  const greetingText = typeof initialGreeting === 'string' ? initialGreeting : initialGreeting.text;
  console.log(`🤖 BOT WA:\n${greetingText}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptUser = () => {
    rl.question('👤 SISWA (WA): ', async (input) => {
      if (input.trim().toLowerCase() === 'exit') {
        console.log('\n👋 Simulasi selesai. Terima kasih!');
        rl.close();
        process.exit(0);
      }

      if (input.trim().length > 0) {
        console.log('⏳ Bot sedang memikirkan balasan...');
        const botResponse = await router.handleMessage(simulatedUserPhone, input);
        const reply = typeof botResponse === 'string' ? botResponse : botResponse.text;
        console.log(`\n🤖 BOT WA:\n${reply}\n`);
      }

      promptUser();
    });
  };

  promptUser();
}

async function main() {
  const isSimulator = process.argv.includes('--sim');

  if (isSimulator) {
    await runSimulator();
  } else {
    const waClient = new WhatsAppClient();
    await waClient.start();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
});
