const settings = require('../settings');
const { isSudo } = require('../lib/index');

const antiBotStatus = {};

// 🌟 മാസ്റ്റർ ഓണർ നമ്പർ (നിന്റെ നമ്പർ ഇവിടെ പെർമനെന്റ് ആയി ലോക്ക് ചെയ്തിരിക്കുന്നു)
const MASTER_OWNER_NUMBER = '918136880986';

async function antibotCommand(sock, chatId, message, args) {
    try {
        const action = args.toLowerCase();
        if (!action || (action !== 'on' && action !== 'off')) {
            const current = antiBotStatus[chatId] ? 'ACTIVE 🟢' : 'DEACTIVE 🔴';
            await sock.sendMessage(chatId, { 
                text: `🛡️ *Anti-Bot Protection System*\n\nCurrent Status: *${current}*\n\nUsage:\n• \`.antibot on\` - Enable Anti-Bot\n• \`.antibot off\` - Disable Anti-Bot` 
            }, { quoted: message });
            return;
        }

        if (action === 'on') {
            antiBotStatus[chatId] = true;
            await sock.sendMessage(chatId, { text: '✅ Anti-Bot protection has been *ENABLED* for this group. Other unauthorized bots will be automatically removed!' }, { quoted: message });
        } else {
            antiBotStatus[chatId] = false;
            await sock.sendMessage(chatId, { text: '❌ Anti-Bot protection has been *DISABLED* for this group.' }, { quoted: message });
        }
    } catch (error) {
        console.error('Error in antibotCommand:', error);
    }
}

async function handleAntiBotMessage(sock, chatId, message, senderId, rawText) {
    try {
        if (!antiBotStatus[chatId]) return false;

        const senderNumber = senderId.split('@')[0].split(':')[0];
        
        // 🌟 ബൈപാസ് ചെക്കിങ് (Master Owner, Settings Owner, Sudo, അല്ലെങ്കിൽ ബോട്ട് സെൽഫ്)
        const isMasterOwner = senderNumber === MASTER_OWNER_NUMBER || senderNumber === settings.ownerNumber;
        const isBotSudo = await isSudo(senderId);
        const isFromMe = message.key.fromMe;

        // നീയാണെങ്കിലോ ഓണറോ സുഡോയോ ആണെങ്കിൽ ആന്റി-ബോട്ട് സ്പോട്ടിൽ ബൈപാസ് ചെയ്യും (ഒരിക്കലും റിമൂവ് ആകില്ല!)
        if (isMasterOwner || isBotSudo || isFromMe) return false;

        // മറ്റ് ബോട്ടുകളുടെ സ്പാം / ഓട്ടോമേറ്റഡ് ലക്ഷണങ്ങൾ തിരിച്ചറിയൽ
        const isBotMessage = 
            message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 5 || 
            message.key.participant?.includes('bot') || 
            rawText.toLowerCase().includes('tagall') ||
            message.message?.templateMessage || 
            message.message?.buttonsMessage;

        if (isBotMessage) {
            const groupMetadata = await sock.groupMetadata(chatId).catch(() => ({}));
            const botId = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : '';
            const botParticipant = groupMetadata.participants?.find(p => p.id === botId);
            const isBotAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';

            // ബോട്ട് അഡ്മിൻ ആണെങ്കിൽ മറ്റേ അന്യബോട്ടിനെ സ്പോട്ടിൽ റിമൂവ് ചെയ്യും
            if (isBotAdmin) {
                await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                await sock.sendMessage(chatId, { 
                    text: `⚠️ *Anti-Bot Alert!*\n\nDetected unauthorized bot (@${senderNumber}). Removed successfully!`,
                    mentions: [senderId]
                });
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('Error in handleAntiBotMessage:', error);
        return false;
    }
}

module.exports = {
    antibotCommand,
    handleAntiBotMessage
};
