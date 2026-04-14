const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    getContentType 
} = require("@whiskeysockets/baileys");
const pino = require("pino");

// --- إعدادات المالك ---
const OWNER_ID = "9647xxxxxxxx@s.whatsapp.net"; // رقمك بالصيغة الدولية
let protectedGroups = [];
let securityActive = false;

// دالة الذكاء الاصطناعي البسيطة لكشف السب والتشفير
function isToxic(text) {
    if (!text) return false;
    
    // 1. تنظيف النص من الرموز والزخارف (لكشف التشفير)
    const cleanText = text.replace(/[^\u0621-\u064A]/g, ''); 
    
    // 2. أنماط السب المشهورة (حتى لو مشفرة بنقاط أو مسافات)
    // ملاحظة: الـ Regex هنا يصيد الكلمات حتى لو بينها زوائد
    const toxicPatterns = [
        /ك.*س/g, /ط.*ي.*ز/g, /ق.*ح.*ب/g, /ع.*ي.*ر/g, /ن.*ي.*چ/g
    ];

    // 3. فحص النص المكتوب
    const hasBadPattern = toxicPatterns.some(pattern => pattern.test(text.replace(/\s+/g, '')));
    
    // 4. كشف "الرسائل المشفرة" (إذا الرسالة عبارة عن رموز غريبة أو حروف مقطعة بشكل مريب)
    const isEncrypted = (text.includes('.') || text.includes('*')) && cleanText.length > 2;

    return hasBadPattern || (isEncrypted && hasBadPattern);
}

async function startWanoBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: ["Wano AI Security", "Safari", "1.0.0"]
    });

    if (!sock.authState.creds.registered) {
        const myNumber = "9647xxxxxxxx"; // رقمك لطلب كود الربط
        await delay(5000);
        const code = await sock.requestPairingCode(myNumber);
        console.log("\n\n=== PAIRING CODE: " + code + " ===\n\n");
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const type = getContentType(msg.message);
        const sender = msg.key.participant || msg.key.remoteJid;
        
        // استخراج النص من الرسالة أو الملصق
        let text = "";
        if (type === 'conversation') text = msg.message.conversation;
        else if (type === 'extendedTextMessage') text = msg.message.extendedTextMessage.text;
        else if (type === 'stickerMessage') text = msg.message.stickerMessage.description || "";

        // --- أوامر التحكم (لك فقط) ---
        if (sender === OWNER_ID) {
            if (text === "+تحديد") {
                if (!protectedGroups.includes(from)) {
                    protectedGroups.push(from);
                    await sock.sendMessage(from, { text: "🎯 تم تفعيل الرادار في هذا الجروب." });
                }
            }
            if (text === "+سكيورتي") {
                securityActive = !securityActive;
                await sock.sendMessage(from, { text: securityActive ? "🛡️ الحماية الذكية: [ON]" : "🛡️ الحماية الذكية: [OFF]" });
            }
        }

        // --- تنفيذ الحماية (Delete For Everyone) ---
        if (protectedGroups.includes(from) && securityActive) {
            // استثناء المالك من الحذف إذا أردت، أو حذفه أيضاً كما طلبت:
            if (isToxic(text)) {
                console.log(`❗ رصد محتوى مسيء من: ${sender}`);
                
                await sock.sendMessage(from, { 
                    delete: { 
                        remoteJid: from, 
                        fromMe: false, 
                        id: msg.key.id, 
                        participant: sender 
                    } 
                });
            }
        }
    });

    sock.ev.on("connection.update", (update) => {
        const { connection } = update;
        if (connection === "open") console.log("🚀 Wano AI Security Is Ready!");
        if (connection === "close") startWanoBot();
    });
}

startWanoBot();
