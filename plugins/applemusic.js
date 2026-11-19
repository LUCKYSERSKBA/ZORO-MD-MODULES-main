const axios = require('axios');

const CHANNEL_LINK = 'https://whatsapp.com/channel/0029Vb7pgsF4tRrkS5CECe24';
const NEWSLETTER_JID = '0029Vb7pgsF4tRrkS5CECe24@newsletter';
const CREDIT_TEXT = '𝐁𝐲 𝐀𝐚𝐝𝐡𝐢𝐱𝐝 ㌅';
const COMPLETE_TEXT = 'Download Completed By Zoro';

const processedMessages = new Set();

function replaceChannelLinks(text = '') {
    return String(text)
        .replace(/https?:\/\/(?:www\.)?(?:whatsapp\.com\/channel\/|chat\.whatsapp\.com\/|t\.me\/|telegram\.me\/)[^\s]+/gi, CHANNEL_LINK)
        .replace(/(?:www\.)?whatsapp\.com\/channel\/[^\s]+/gi, CHANNEL_LINK)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function getRawText(message) {
    return (
        message?.message?.conversation?.trim() ||
        message?.message?.extendedTextMessage?.text?.trim() ||
        message?.message?.imageMessage?.caption?.trim() ||
        message?.message?.videoMessage?.caption?.trim() ||
        ''
    );
}

function getArgText(rawText = '') {
    const parts = String(rawText).trim().split(/\s+/);
    return parts.slice(1).join(' ').trim();
}

function extractAppleMusicUrl(input = '') {
    const match = String(input).match(/https?:\/\/music\.apple\.com\/[^\s]+/i);
    return match ? match[0] : '';
}

async function appleMusicCommand(sock, chatId, message) {
    try {
        if (message?.key?.id) {
            if (processedMessages.has(message.key.id)) return;
            processedMessages.add(message.key.id);
            setTimeout(() => processedMessages.delete(message.key.id), 5 * 60 * 1000);
        }

        const rawText = getRawText(message);
        const argText = getArgText(rawText);
        const appleUrl = extractAppleMusicUrl(argText || rawText);

        if (!appleUrl) {
            return await sock.sendMessage(
                chatId,
                {
                    text: replaceChannelLinks(
                        `❌ Please provide a valid Apple Music link.\nExample: .applemusic https://music.apple.com/...\n\n${CREDIT_TEXT}\n${CHANNEL_LINK}`
                    )
                },
                { quoted: message }
            );
        }

        try {
            await sock.sendMessage(chatId, { react: { text: '🎼', key: message.key } });
        } catch (e) {}

        const apiUrl = `https://xenosirapis.zone.id/api/applemusic?url=${encodeURIComponent(appleUrl)}`;
        const { data } = await axios.get(apiUrl, { timeout: 30000 });

        const payload = data?.result || data?.data || data || {};
        const audioUrl = payload.downloadUrl || payload.audio || payload.url;

        if (!audioUrl) {
            try {
                await sock.sendMessage(chatId, { react: { text: '📉', key: message.key } });
            } catch (e) {}

            return await sock.sendMessage(
                chatId,
                {
                    text: replaceChannelLinks(`❌ Audio not found.\n\n${CREDIT_TEXT}\n${CHANNEL_LINK}`)
                },
                { quoted: message }
            );
        }

        const title = replaceChannelLinks(payload.title || payload.name || 'Apple Music Track');
        const artist = replaceChannelLinks(payload.artist || '');

        const audioRes = await axios.get(audioUrl, {
            responseType: 'arraybuffer',
            timeout: 120000
        });
        const audioBuffer = Buffer.from(audioRes.data);

        await sock.sendMessage(
            chatId,
            {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                ptt: false,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: NEWSLETTER_JID,
                        newsletterName: '𝚉𝙾𝚁𝙾 𝙼𝙳 𝙰𝙿𝙿𝙻𝙴 𝙼𝚄𝚂𝙸𝙲'
                    }
                }
            },
            { quoted: message }
        );

        const creditNotice = replaceChannelLinks(
            `╭───「 🎼 𝐀𝐏𝐏𝐋𝐄 𝐌𝐔𝐒𝐈𝐂 」───\n│ 🎶 *${title}*${artist ? `\n│ 👤 *${artist}*` : ''}\n│ ${CREDIT_TEXT}\n│ ✅ ${COMPLETE_TEXT}\n╰────────────────────\n${CHANNEL_LINK}`
        );

        await sock.sendMessage(
            chatId,
            {
                text: creditNotice,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: NEWSLETTER_JID,
                        newsletterName: '𝚉𝙾𝚁𝙾 𝙼𝙳 𝙰𝙿𝙿𝙻𝙴 𝙼𝚄𝚂𝙸𝙲'
                    }
                }
            }
        );

        try {
            await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        } catch (e) {}
    } catch (error) {
        try {
            await sock.sendMessage(chatId, { react: { text: '📉', key: message.key } });
        } catch (e) {}

        await sock.sendMessage(
            chatId,
            {
                text: replaceChannelLinks(`❌ Failed to download Apple Music track.\n\n${CREDIT_TEXT}\n${CHANNEL_LINK}`)
            },
            { quoted: message }
        );
    }
}

appleMusicCommand.command = ['applemusic'];
appleMusicCommand.description = 'Download Apple Music audio';

module.exports = appleMusicCommand;
