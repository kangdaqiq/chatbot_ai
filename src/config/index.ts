import dotenv from 'dotenv';
dotenv.config();

export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  botName: process.env.BOT_NAME || 'AI Tutor Bot',
  defaultModel: process.env.DEFAULT_MODEL || 'gemini-flash-lite-latest',
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || '',
  elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL', // Default premade free female teacher voice (Sarah)
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
};
