const MenuSettings = require('../database/model');

async function setMenuUrlCommand(sock, chatId, message, args) {
    try {
        const newUrl = args[0]; // യൂസർ നൽകുന്ന മീഡിയ ലിങ്ക്
        if (!newUrl) {
            return await sock.sendMessage(chatId, { 
                text: '❌ Please provide a valid media URL!\nExample: `.setmenuurl https://files.catbox.moe/xxxxxx.mp4`' 
            }, { quoted: message });
        }

        // ഗ്രൂപ്പായാലും പ്രൈവറ്റ് ആയാലും കൃത്യമായ യൂസർ ഐഡി എടുക്കാൻ
        const userId = message.key.participant || message.key.remoteJid;
        const isImage = /\.(jpg|jpeg|png|webp)$/i.test(newUrl);

        // MongoDB-യിൽ യൂസറുടെ ലിങ്ക് സേവ് ചെയ്യുകയോ അപ്ഡേറ്റ് ചെയ്യുകയോ ചെയ്യുന്നു
        await MenuSettings.findOneAndUpdate(
            { userId: userId },
            { mediaUrl: newUrl, mediaType: isImage ? 'image' : 'video' },
            { upsert: true, new: true }
        );

        await sock.sendMessage(chatId, { 
            text: '✅ Success! Your custom menu media URL has been saved in database.' 
        }, { quoted: message });

    } catch (error) {
        console.error('Error in setmenuurl:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to save menu URL.' }, { quoted: message });
    }
}

module.exports = setMenuUrlCommand;
