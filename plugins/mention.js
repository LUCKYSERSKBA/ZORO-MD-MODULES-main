// ZORO-MD Clean Mention Plugin (Default + Custom URLs + Random PTT)
const mongoose = require('mongoose');

const MONGO_URI = "mongodb+srv://sncckollam_db_user:u1F26vimHTZ9wYLe@cluster0.5qfiepf.mongodb.net/";

async function ensureDb() {
    if (mongoose.connection.readyState === 1) return true;
    try {
        await mongoose.connect(MONGO_URI);
        return true;
    } catch (e) {
        return false;
    }
}

const MentionData = mongoose.models.MentionData || mongoose.model('MentionData', new mongoose.Schema({
    sessionId: { type: String, unique: true, index: true },
    audios: [String] // യൂസർ ആഡ് ചെയ്യുന്ന കസ്റ്റം ഓഡിയോ URL-കൾ ഇവിടെ സേവ് ആകും
}, { collection: 'mentiondata' }));

// ഡിഫോൾട്ട് ആയിട്ടുള്ള 2 ഓഡിയോ ലിങ്കുകൾ (ആരും കസ്റ്റം സെറ്റ് ചെയ്തില്ലെങ്കിൽ ഇത് വർക്ക് ചെയ്യും)
const DEFAULT_AUDIOS = [
    "https://files.catbox.moe/9c6z8z.mp3",
    "https://files.catbox.moe/sd28g8.mp3"
];

async function sendMention(conn, to, quotedMek, sessionId) {
    let audioList = [...DEFAULT_AUDIOS]; // തുടക്കത്തിൽ ഡിഫോൾട്ട് ലിങ്കുകൾ എടുക്കുന്നു
    
    const connected = await ensureDb();
    if (connected) {
        try {
            const doc = await MentionData.findOne({ sessionId });
            if (doc && Array.isArray(doc.audios) && doc.audios.length > 0) {
                // ഡിഫോൾട്ട് ലിങ്കുകളും യൂസർ സെറ്റ് ചെയ്ത കസ്റ്റം ലിങ്കുകളും ഒന്നിച്ചു ചേർക്കുന്നു
                audioList = [...DEFAULT_AUDIOS, ...doc.audios];
            }
        } catch (e) {}
    }

    // ആകെ ഉള്ള ലിസ്റ്റിൽ നിന്ന് റാൻഡം ആയി ഒരെണ്ണം തിരഞ്ഞെടുക്കുന്നു
    const selectedUrl = audioList[Math.floor(Math.random() * audioList.length)];
    if (!selectedUrl) return false;

    const participantJid = quotedMek.key.participant || quotedMek.key.remoteJid;

    // ജസ്റ്റ് ഒരു നോർമൽ വോയിസ് നോട്ട് (PTT) ആയി മാത്രം സെൻഡ് ചെയ്യുന്നു (വേറെ ആഡ്സോ ഫോട്ടോയോ ഇല്ല)
    await conn.sendMessage(to, {
        audio: { url: selectedUrl },
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
        contextInfo: {
            mentionedJid: [participantJid],
            remoteJid: to,
            participant: participantJid
        }
    }, { quoted: quotedMek });

    return true;
}

async function handleMentionDetection(sock, chatId, message) {
    try {
        if (!message || !message.message) return;
        if (message.key?.fromMe) return;

        const targetChat = message.key?.remoteJid || chatId;
        if (!targetChat) return;

        const botUser = sock.user || {};
        const botJid = botUser.id ? (sock.decodeJid ? sock.decodeJid(botUser.id) : botUser.id) : '';
        const botNum = botJid ? botJid.split('@')[0].split(':')[0] : '';
        const rawBotLid = botUser.lid ? botUser.lid.split('@')[0] : '';
        const botLid = rawBotLid.split(':')[0];
        const sessionId = botNum || "default_session";

        const msg = message.message || {};
        let mentionedJids = [];
        const contextInfo = msg.extendedTextMessage?.contextInfo || 
                            msg.imageMessage?.contextInfo || 
                            msg.videoMessage?.contextInfo || 
                            msg.audioMessage?.contextInfo;

        if (contextInfo && Array.isArray(contextInfo.mentionedJid)) {
            mentionedJids = contextInfo.mentionedJid;
        }

        const textContent = (msg.conversation || msg.extendedTextMessage?.text || '').toString();
        
        const isBotMentioned = mentionedJids.some(jid => {
            const cleanJid = jid.split('@')[0].split(':')[0];
            return (botNum && cleanJid === botNum) || (botLid && cleanJid === botLid);
        }) || (botNum && textContent.includes(botNum)) || (botLid && textContent.includes(botLid));

        if (!isBotMentioned) return;

        await sendMention(sock, targetChat, message, sessionId);
    } catch (err) {}
}

async function setMentionCommand(sock, chatId, message, args) {
    const senderId = message.key.participant || message.key.remoteJid;
    const botUser = sock.user || {};
    const botJid = botUser.id ? (sock.decodeJid ? sock.decodeJid(botUser.id) : botUser.id) : '';
    const botNum = botJid ? botJid.split('@')[0].split(':')[0] : '';
    const sessionId = botNum || "default_session";

    const isOwner = message.key.fromMe || (botNum && senderId.includes(botNum));
    if (!isOwner) return sock.sendMessage(chatId, { text: '❌ Only Bot Owner can use this command.' }, { quoted: message });

    const msg = message.message || {};
    const textContent = (msg.conversation || msg.extendedTextMessage?.text || '').trim();
    const commandArgs = textContent.split(/\s+/).slice(1).join(' ');

    if (commandArgs.toLowerCase() === 'reset') {
        await ensureDb();
        await MentionData.deleteOne({ sessionId });
        return sock.sendMessage(chatId, { text: `✅ Mention audios reset to default defaults!` }, { quoted: message });
    }

    // യൂസർ `.setmention https://url1.mp3 https://url2.mp3` എന്ന് നൽകിയാൽ സേവ് ആകും
    if (commandArgs && commandArgs.startsWith('http')) {
        const newUrls = commandArgs.split(/[\s,]+/).filter(u => u.startsWith('http'));
        await ensureDb();
        
        const doc = await MentionData.findOne({ sessionId });
        const existingAudios = (doc && Array.isArray(doc.audios)) ? doc.audios : [];
        const updatedAudios = [...existingAudios, ...newUrls];

        await MentionData.findOneAndUpdate(
            { sessionId },
            { audios: updatedAudios },
            { upsert: true }
        );

        return sock.sendMessage(chatId, { text: `✅ Successfully added ${newUrls.length} audio URL(s)! Total custom URLs: ${updatedAudios.length}` }, { quoted: message });
    }

    return sock.sendMessage(chatId, {
        text: `╭─❖ 『 📣 𝙕𝙊𝙍𝙊 - 𝙈𝘿 ᴍᴇɴᴛɪᴏɴ 』 ❖\n` +
              `╰──────────────⍟\n\n` +
              `📌 *Usage:*\n` +
              `• \`.setmention https://url1.mp3 https://url2.mp3\` - Add custom audio URLs.\n` +
              `• \`.setmention reset\` - Reset to default audios only.`
    }, { quoted: message });
}

module.exports = { handleMentionDetection, setMentionCommand };
