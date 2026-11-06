// ZORO-MD Clean Mention Plugin (with type/audio format support)
const mongoose = require('mongoose');

// 🌟 പുതിയ മോംഗോ ഡിബി കണക്ഷൻ യു.ആർ.എൽ
const MONGO_URI = "mongodb+srv://xdleoxd33_db_user:5Sm5Z3UQLcbKVnSj@cluster0.uh9hwjg.mongodb.net/";

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
    audios: [String]
}, { collection: 'mentiondata' }));

// ഡിഫോൾട്ട് ആയിട്ടുള്ള ഓഡിയോ ലിങ്കുകൾ (വാട്സാപ്പിൽ ഉറപ്പായും പ്ലേ ആകുന്നവ)
const DEFAULT_AUDIOS = [
    "https://files.catbox.moe/9c6z8z.mp3",
    "https://files.catbox.moe/sd28g8.mp3"
];

async function sendMention(conn, to, quotedMek, sessionId) {
    let audioList = [...DEFAULT_AUDIOS];
    
    const connected = await ensureDb();
    if (connected) {
        try {
            const doc = await MentionData.findOne({ sessionId });
            // 🌟 ഡാറ്റാബേസിൽ കസ്റ്റം ലിങ്കുകൾ ഉണ്ടെങ്കിൽ മാത്രം ഡിഫോൾട്ടിന്റെ കൂടെ ചേർക്കും, ഇല്ലെങ്കിൽ ഡിഫോൾട്ട് മാത്രം വർക്ക് ചെയ്യും
            if (doc && Array.isArray(doc.audios) && doc.audios.length > 0) {
                audioList = [...DEFAULT_AUDIOS, ...doc.audios];
            }
        } catch (e) {}
    }

    const selectedUrl = audioList[Math.floor(Math.random() * audioList.length)];
    if (!selectedUrl) return false;

    const participantJid = quotedMek.key.participant || quotedMek.key.remoteJid;

    try {
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
    } catch (err) {
        console.error('Error sending mention voice note:', err);
        return false;
    }
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
    } catch (err) {
        console.error('Error in handleMentionDetection:', err);
    }
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
    let commandArgs = textContent.split(/\s+/).slice(1).join(' ');

    if (!commandArgs) {
        return sock.sendMessage(chatId, {
            text: `╭─❖ 『 📣 𝙕𝙊𝙍🇴 - 𝙈𝘿 ᴍᴇɴᴛɪᴏɴ 』 ❖\n` +
                  `╰──────────────⍟\n\n` +
                  `📌 *Usage Examples:*\n` +
                  `• \`.setmention https://url1.mp3 type/audio\`\n` +
                  `• \`.setmention https://url1.mp3 , https://url2.mp3 type/audio\`\n` +
                  `• \`.setmention reset\``
        }, { quoted: message });
    }

    if (commandArgs.toLowerCase() === 'reset') {
        await ensureDb();
        await MentionData.deleteOne({ sessionId });
        return sock.sendMessage(chatId, { text: `✅ Mention audios reset to default!` }, { quoted: message });
    }

    commandArgs = commandArgs.replace(/type\/audio/gi, '').trim();
    const newUrls = commandArgs.split(/[\s,]+/).filter(u => u.startsWith('http'));

    if (newUrls.length === 0) {
        return sock.sendMessage(chatId, { text: `❌ Please provide a valid URL ending with type/audio` }, { quoted: message });
    }

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

module.exports = { handleMentionDetection, setMentionCommand };
