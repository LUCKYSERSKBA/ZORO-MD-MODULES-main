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

function extractYouTubeShortsUrl(input = '') {
    const match = String(input).match(
        /https?:\/\/(?:[\w-]+\.)?(?:youtube\.com\/shorts\/|youtu\.be\/|youtube\.com\/watch\?v=)[^\s]+/i
    );
    return match ? match[0] : '';
}

async function ytsShortCommand(sock, chatId, message) {
    try {
        if (message?.key?.id) {
            if (processedMessages.has(message.key.id)) return;
            processedMessages.add(message.key.id);
            setTimeout(() => processedMessages.delete(message.key.id), 5 * 60 * 1000);
        }

        const rawText = getRawText(message);
        const argText = getArgText(rawText);
        const shortsUrl = extractYouTubeShortsUrl(argText || rawText);

        if (!shortsUrl) {
            return await sock.sendMessage(
                chatId,
                {
                    text: replaceChannelLinks(
                        `❌ Please provide a valid YouTube Shorts link.\nExample: .ytsshort https://youtube.com/shorts/xxxxxxx\n\n${CREDIT_TEXT}\n${CHANNEL_LINK}`
                    )
                },
                { quoted: message }
            );
        }

        try {
            await sock.sendMessage(chatId, { react: { text: '🥂', key: message.key } });
        } catch (e) {}

        const apiUrl = `https://xenosirapis.zone.id/api/ytshortsdl?url=${encodeURIComponent(shortsUrl)}`;
        const { data } = await axios.get(apiUrl, { timeout: 30000 });

        const mediaUrl = data?.downloadUrl || data?.result?.downloadUrl || data?.data?.downloadUrl;
        if (!mediaUrl) {
            try {
                await sock.sendMessage(chatId, { react: { text: '📉', key: message.key } });
            } catch (e) {}

            return await sock.sendMessage(
                chatId,
                {
                    text: replaceChannelLinks(`❌ Shorts video not found.\n\n${CREDIT_TEXT}\n${CHANNEL_LINK}`)
                },
                { quoted: message }
            );
        }

        const title = replaceChannelLinks(data?.title || 'YouTube Shorts');
        const durationLine = data?.duration ? `│ ⏱️ *${data.duration}s*\n` : '';
        const caption = replaceChannelLinks(
            `╭───「 🥂 𝐘𝐓 𝐒𝐇𝐎𝐑𝐓𝐒 」───\n│ 🎥 *${title}*\n${durationLine}│ ${CREDIT_TEXT}\n╰────────────────────\n${CHANNEL_LINK}`
        );

        const videoRes = await axios.get(mediaUrl, {
            responseType: 'arraybuffer',
            timeout: 120000
        });
        const videoBuffer = Buffer.from(videoRes.data);

        await sock.sendMessage(
            chatId,
            {
                video: videoBuffer,
                mimetype: 'video/mp4',
                caption,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: NEWSLETTER_JID,
                        newsletterName: '𝚉𝙾𝚁𝙾 𝙼𝙳 𝚈𝚃 𝚂𝙷𝙾𝚁𝚃𝚂'
                    }
                }
            },
            { quoted: message }
        );

        await sock.sendMessage(
            chatId,
            {
                text: replaceChannelLinks(`✅ *${COMPLETE_TEXT}* • ${CREDIT_TEXT}`),
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: NEWSLETTER_JID,
                        newsletterName: '𝚉𝙾𝚁𝙾 𝙼𝙳 𝚈𝚃 𝚂𝙷𝙾𝚁𝚃𝚂'
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
                text: replaceChannelLinks(`❌ Failed to download YouTube Shorts.\n\n${CREDIT_TEXT}\n${CHANNEL_LINK}`)
            },
            { quoted: message }
        );
    }
}

ytsShortCommand.command = ['ytsshort'];
ytsShortCommand.description = 'Download YouTube Shorts video';

module.exports = ytsShortCommand;
