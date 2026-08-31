import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';
// @ts-ignore
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import EventEmitter from 'events';
import { MessageRouter } from './router';
import { DataStore } from '../web/dataStore';
import { AudioService } from '../services/audio.service';

export class WhatsAppClient extends EventEmitter {
  private router: MessageRouter;
  private dataStore: DataStore;
  private sock: WASocket | null = null;
  private authFolder = path.join(process.cwd(), 'auth_info_baileys');
  public status: 'DISCONNECTED' | 'SCAN_QR' | 'CONNECTED' = 'DISCONNECTED';
  public currentQrUrl: string = '';
  public connectedPhone: string = '';
  private isLoggingOut: boolean = false;

  constructor() {
    super();
    this.router = new MessageRouter();
    this.dataStore = new DataStore();
  }

  public getRouter(): MessageRouter {
    return this.router;
  }

  public async start() {
    this.emitLog('🚀 Memulai koneksi WhatsApp (Engine Baileys)...');

    const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);

    const dummyLogger: any = {
      level: 'silent',
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      child: () => dummyLogger,
    };

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: dummyLogger,
      browser: ['AI Learning Bot', 'Chrome', '1.0.0'],
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.status = 'SCAN_QR';
        this.connectedPhone = '';
        try {
          this.currentQrUrl = await QRCode.toDataURL(qr);
        } catch {
          this.currentQrUrl = '';
        }
        qrcode.generate(qr, { small: true });
        this.emit('qr', { qr, qrDataUrl: this.currentQrUrl });
        this.emitStatus();
        this.emitLog('📱 QR Code baru dibuat. Silakan scan di HP atau Dashboard Web.');
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !this.isLoggingOut;
        this.status = 'DISCONNECTED';
        this.currentQrUrl = '';
        this.connectedPhone = '';
        this.emitStatus();
        this.emitLog(`⚠️ Koneksi terputus (Status: ${statusCode}). Reconnect: ${shouldReconnect}`);

        if (shouldReconnect) {
          setTimeout(() => this.start(), 4000);
        }
      } else if (connection === 'open') {
        this.status = 'CONNECTED';
        this.currentQrUrl = '';
        this.isLoggingOut = false;
        
        const rawJid = this.sock?.user?.id || '';
        this.connectedPhone = rawJid.split(':')[0] || rawJid.replace('@s.whatsapp.net', '');

        this.emitStatus();
        this.emitLog(`✅ WHATSAPP BERHASIL TERHUBUNG & AKTIF! (${this.connectedPhone})`);
      }
    });

    this.sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;

      for (const msg of m.messages) {
        if (msg.key.fromMe) continue;
        const remoteJid = msg.key.remoteJid;
        if (!remoteJid || remoteJid.endsWith('@g.us')) continue;

        // Cek apakah nomor pengirim terdaftar di data Guru / Siswa (Dukungan LID WhatsApp Multi-Device)
        const keyAny = msg.key as any;
        let senderPhone = remoteJid.replace('@s.whatsapp.net', '');
        if (keyAny?.remoteJidAlt && keyAny.remoteJidAlt.includes('@s.whatsapp.net')) {
          senderPhone = keyAny.remoteJidAlt.replace('@s.whatsapp.net', '');
        } else if (keyAny?.participant && keyAny.participant.includes('@s.whatsapp.net')) {
          senderPhone = keyAny.participant.replace('@s.whatsapp.net', '');
        }

        const isRegistered = this.dataStore.isUserRegistered(senderPhone);

        if (!isRegistered) {
          this.emitLog(`⛔ [DIBATASI] Pesan dari nomor tidak terdaftar (${senderPhone}) diabaikan.`);
          continue;
        }

        const imageMsg = msg.message?.imageMessage;
        const audioMsg = msg.message?.audioMessage;
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          imageMsg?.caption ||
          '';

        // 1. Tangani Pesan Gambar / Foto Soal
        if (imageMsg) {
          this.emitLog(`🖼️ [FOTO MASUK] dari ${senderPhone}`);
          try {
            const buffer = (await downloadMediaMessage(msg, 'buffer', {})) as Buffer;
            const imageBase64 = buffer.toString('base64');
            const mimeType = imageMsg.mimetype || 'image/jpeg';

            const res = await this.router.handleImageMessage(remoteJid, imageBase64, mimeType, text);
            if (res.imageBuffer) {
              await this.sock?.sendMessage(remoteJid, { image: res.imageBuffer, caption: '📊 *Diagram / Visualisasi Konsep*' });
            }
            if (res.audioBuffer) {
              await this.sock?.sendMessage(remoteJid, { audio: res.audioBuffer, mimetype: 'audio/mp4', ptt: true });
            }
            if (res.text) {
              await this.sock?.sendMessage(remoteJid, { text: res.text });
            }
            this.emitLog(`📤 [BALASAN FOTO] terkirim ke ${senderPhone}`);
          } catch (err) {
            console.error(err);
          }
          continue;
        }

        // 2. Tangani Pesan Suara / Voice Note (PTT) dari Siswa
        if (audioMsg) {
          this.emitLog(`🎙️ [VOICE NOTE MASUK] dari ${senderPhone}`);
          try {
            const buffer = (await downloadMediaMessage(msg, 'buffer', {})) as Buffer;
            const audioBase64 = buffer.toString('base64');
            const mimeType = audioMsg.mimetype || 'audio/ogg; codecs=opus';

            const res = await this.router.handleAudioMessage(remoteJid, audioBase64, mimeType);

            // Kirim Diagram Gambar jika ada
            if (res.imageBuffer) {
              await this.sock?.sendMessage(remoteJid, { image: res.imageBuffer, caption: '📊 *Diagram / Visualisasi Konsep*' });
            }

            // Kirim Balasan Voice Note Dua Arah (Dua Arah Audio VN)
            if (res.audioBuffer) {
              await this.sock?.sendMessage(remoteJid, { audio: res.audioBuffer, mimetype: 'audio/mp4', ptt: true });
            }

            // Kirim Balasan Teks Penjelasan
            if (res.text) {
              await this.sock?.sendMessage(remoteJid, { text: res.text });
            }
            this.emitLog(`📤 [BALASAN VN & TEKS] terkirim ke ${senderPhone}`);
          } catch (err) {
            console.error('Error processing audio voice note:', err);
          }
          continue;
        }

        // 3. Tangani Pesan Teks
        if (!text.trim()) continue;
        this.emitLog(`📩 [PESAN MASUK] ${senderPhone}: "${text}"`);

        try {
          const res = await this.router.handleMessage(remoteJid, text);

          // Kirim Diagram Gambar jika ada
          if (res.imageBuffer) {
            await this.sock?.sendMessage(remoteJid, { image: res.imageBuffer, caption: '📊 *Diagram / Visualisasi Konsep*' });
          }

          // Kirim Balasan Voice Note jika diminta / sesi speaking
          if (res.audioBuffer) {
            await this.sock?.sendMessage(remoteJid, { audio: res.audioBuffer, mimetype: 'audio/mp4', ptt: true });
          }

          // Kirim Balasan Teks
          if (res.text) {
            await this.sock?.sendMessage(remoteJid, { text: res.text });
          }
          this.emitLog(`📤 [BALASAN TERKIRIM] ke ${senderPhone}`);
        } catch (err) {
          console.error(err);
        }
      }
    });
  }

  /**
   * Logout WhatsApp, menghapus sesi auth lama, dan membuat QR Code baru untuk ganti nomor
   */
  public async logout(): Promise<void> {
    this.isLoggingOut = true;
    this.emitLog('🚪 [LOGOUT] Memutuskan koneksi WhatsApp & menghapus sesi lama...');

    try {
      if (this.sock) {
        try {
          await this.sock.logout();
        } catch {}
        try {
          this.sock.end(undefined);
        } catch {}
      }
    } catch (e) {
      console.error('Error during sock logout:', e);
    }

    // Hapus file kredensial auth
    try {
      if (fs.existsSync(this.authFolder)) {
        fs.rmSync(this.authFolder, { recursive: true, force: true });
        this.emitLog('🧹 [LOGOUT] File kredensial auth berhasil dibersihkan.');
      }
    } catch (err) {
      console.error('Error clearing auth folder:', err);
    }

    this.status = 'DISCONNECTED';
    this.currentQrUrl = '';
    this.connectedPhone = '';
    this.emitStatus();

    // Tunggu sejenak lalu generate QR Code baru
    setTimeout(() => {
      this.isLoggingOut = false;
      this.start();
    }, 2000);
  }

  private emitStatus() {
    this.emit('status', {
      status: this.status,
      qrDataUrl: this.currentQrUrl,
      connectedPhone: this.connectedPhone,
    });
  }

  private emitLog(message: string) {
    console.log(message);
    this.emit('log', {
      timestamp: new Date().toLocaleTimeString('id-ID'),
      message,
    });
  }
}
