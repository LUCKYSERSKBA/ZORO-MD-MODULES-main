// ZORO-MD Shazam Plugin (Using shazamio npm package)
const { Shazam } = require('shazamio');
const fs = require('fs');
const path = require('path');

const shazam = new Shazam();

async function shazamCommand(sock, chatId, message) {
    try {
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const mime = quoted ? Object.keys(quoted)[0] : '';
        
        if (!quoted || (!mime.includes('audioMessage') && !mime.includes('videoMessage') && !mime.includes('documentMessage'))) {
            return await sock.sendMessage(chatId, { text: '❌ Please reply to an audio, video, or voice note to find the song using Shazam!' }, { quoted: message });
        }

        await sock.sendMessage(chatId, { text: '🔍 Searching for this song...' }, { quoted: message });

        // ഓഡിയോ ഫയൽ ഡൗൺലോഡ് ചെയ്ത് ടെമ്പററി ആയി സേവ് ചെയ്യുന്നു
        let stream;
        try {
            stream = await sock.downloadAndSaveMediaMessage(quoted, 'shazam_temp');
        } catch (e) {
            const { downloadMediaMessage } = require('@aadhixd777/baileys');
            const buffer = await downloadMediaMessage({ message: quoted }, 'buffer', {});
            stream = path.join(process.cwd(), 'temp', 'shazam_temp.mp3');
            fs.writeFileSync(stream, buffer);
        }
        
        if (!fs.existsSync(stream)) {
            return await sock.sendMessage(chatId, { text: '❌ Failed to process the audio file for Shazam.' }, { quoted: message });
        }

        // shazamio പാക്കേജ് ഉപയോഗിച്ച് ഓഡിയോ റെക്കഗ്നൈസ് ചെയ്യുന്നു
        const data = await shazam.recognize(stream);

        // ടെംപ് ഫയൽ ഡിലീറ്റ് ചെയ്യുന്നു
        if (fs.existsSync(stream)) fs.unlinkSync(stream);

        if (!data || !data.track) {
            return await sock.sendMessage(chatId, { text: '❌ Could not find any matching song. Try sending a clearer audio sample!' }, { quoted: message });
        }

        const track = data.track;
        const title = track.title || 'Unknown';
        const artist = track.subtitle || 'Unknown Artist';
        const genres = track.genres?.primary || 'N/A';
        const coverArt = track.images?.coverart || track.images?.background || '';
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

    } catch (err) {
        console.error('Shazam Error:', err);
        await sock.sendMessage(chatId, { text: '❌ An error occurred while recognizing the song.' }, { quoted: message });
    }
}

module.exports = shazamCommand;
