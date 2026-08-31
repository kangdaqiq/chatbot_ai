import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../src/config';

async function testModels() {
  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const modelsToTest = [
    'gemini-2.0-flash-lite-001',
    'gemini-2.0-flash-001',
    'gemini-flash-lite-latest',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-002',
    'gemini-1.5-flash-8b',
    'gemini-1.5-pro-latest',
    'gemini-flash-latest'
  ];

  for (const m of modelsToTest) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const t0 = Date.now();
      const res = await model.generateContent('Hi, test 123');
      console.log(`✅ Model ${m} SUCCESS (${Date.now() - t0}ms):`, res.response.text().trim().substring(0, 30));
    } catch (e: any) {
      console.log(`❌ Model ${m} FAILED:`, e?.message?.substring(0, 80));
    }
  }
}

testModels().catch(console.error);
