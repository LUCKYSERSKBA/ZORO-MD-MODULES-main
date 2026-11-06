// ZORO-MD Shazam Plugin
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

async function shazamCommand(sock, chatId, message) {
    try {
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const mime = quoted ? Object.keys(quoted)[0] : '';
        
        if (!quoted || (!mime.includes('audioMessage') && !mime.includes('videoMessage') && !mime.includes('documentMessage'))) {
            return await sock.sendMessage(chatId, { text: '❌ Please reply to an audio, video, or voice note to find the song using Shazam!' }, { quoted: message });
        }

        await sock.sendMessage(chatId, { text: '🔍 Searching for this song...' }, { quoted: message });

        // ഓഡിയോ ഫയൽ ഡൗൺലോഡ് ചെയ്ത് ടെമ്പററി ആയി സേവ് ചെയ്യുന്നു
        const stream = await sock.downloadAndSaveMediaMessage(quoted, 'shazam_temp');
        
        // Shazam API ലേക്ക് ഫയൽ അയച്ച് ഡീറ്റെയിൽസ് ഫെച്ച് ചെയ്യുന്നു (Public Shazam API endpoint)
        const bitmap = fs.readFileSync(stream);
        const bufferBase64 = Buffer.from(bitmap).toString('base64');

        const response = await axios.post('https://www.shazam.com/discovery/v5/en/US/web/-/track/shazam-buff', bufferBase64, {
            headers: { 'Content-Type': 'application/octet-stream' }
        }).catch(() => null);

        // ടെംപ് ഫയൽ ഡിലീറ്റ് ചെയ്യുന്നു
        if (fs.existsSync(stream)) fs.unlinkSync(stream);

        if (!response || !response.data || !response.data.track) {
            // ആൾട്ടർനേറ്റീവ് API മെത്തേഡ് അല്ലെങ്കിൽ റാപ്പർ ഉപയോഗിച്ചുള്ള സിമ്പിൾ സെർച്ച്
            return await sock.sendMessage(chatId, { text: '❌ Could not find any matching song. Try sending a clearer audio sample!' }, { quoted: message });
        }

        const track = response.data.track;
        const title = track.title || 'Unknown';
        const artist = track.subtitle || 'Unknown Artist';
        const genres = track.genres?.primary || 'N/A';
        const coverArt = track.images?.coverart || '';
        const shareUrl = track.share?.href || '';

        let caption = `╭─❖ 『 🎵 𝙕𝙊𝙍🇴 - 𝙈𝘿 𝙎𝙃𝘼𝙕𝘼𝙈 』 ❖\n` +
                      `╰──────────────⍟\n\n` +
                      `📌 *Title:* ${title}\n` +
                      `🎤 *Artist:* ${artist}\n` +
                      `🎧 *Genre:* ${genres}\n`;

        if (shareUrl) caption += `🔗 *Link:* ${shareUrl}\n`;

        if (coverArt) {
            await sock.sendMessage(chatId, { image: { url: coverArt }, caption: caption }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, { text: caption }, { quoted: message });
        }

    } file (err) {
        console.error('Shazam Error:', err);
        await sock.sendMessage(chatId, { text: '❌ An error occurred while recognizing the song.' }, { quoted: message });
    }
}

module.exports = shazamCommand;
