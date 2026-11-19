const axios = require('axios');

const CHANNEL_LINK = 'https://whatsapp.com/channel/0029Vb7pgsF4tRrkS5CECe24';
const NEWSLETTER_JID = '0029Vb7pgsF4tRrkS5CECe24@newsletter';
const CREDIT_TEXT = '𝐁𝐲 𝐀𝐚𝐝𝐡𝐢𝐱𝐝 ㌅';
const COMPLETE_TEXT = 'Download Completed By Zoro';
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

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

function parseQueryAndLimit(argText = '') {
    const cleaned = String(argText).trim();
    if (!cleaned) return { query: '', limit: DEFAULT_LIMIT };

    const match = cleaned.match(/^(.*?)\s+(\d+)$/);
    if (match && match[1].trim()) {
        const parsedLimit = parseInt(match[2], 10);
        const clampedLimit = Math.max(1, Math.min(MAX_LIMIT, parsedLimit || DEFAULT_LIMIT));
        return {
            query: match[1].trim(),
            limit: clampedLimit
        };
    }

    return {
        query: cleaned,
        limit: DEFAULT_LIMIT
    };
}

function getMimeType(item = {}) {
    const fmt = String(item.format || '').toLowerCase();
    if (fmt === 'png') return 'image/png';
    if (fmt === 'webp') return 'image/webp';
    return 'image/jpeg';
}

async function pinHuntCommand(sock, chatId, message) {
    try {
        if (message?.key?.id) {
            if (processedMessages.has(message.key.id)) return;
            processedMessages.add(message.key.id);
            setTimeout(() => processedMessages.delete(message.key.id), 5 * 60 * 1000);
        }

        const rawText = getRawText(message);
        const argText = getArgText(rawText);
        const { query, limit } = parseQueryAndLimit(argText);

        if (!query) {
            return await sock.sendMessage(
                chatId,
                {
                    text: replaceChannelLinks(
                        `❌ Please enter a search name and optional count.\nExample: .pinhunt anime hd 5\n\n${CREDIT_TEXT}\n${CHANNEL_LINK}`
                    )
                },
                { quoted: message }
            );
        }

        try {
            await sock.sendMessage(chatId, { react: { text: '🍭', key: message.key } });
        } catch (e) {}

        const apiUrl = `https://xenosirapis.zone.id/api/pinterest?query=${encodeURIComponent(query)}&limit=${limit}`;
        const { data } = await axios.get(apiUrl, { timeout: 30000 });

        const list = Array.isArray(data?.results) ? data.results : [];
        const selected = list
            .filter((item) => item && (item.downloadUrl || item.image || item.thumbnail))
            .slice(0, limit);

        if (selected.length === 0) {
            try {
                await sock.sendMessage(chatId, { react: { text: '📉', key: message.key } });
            } catch (e) {}

            return await sock.sendMessage(
                chatId,
                {
                    text: replaceChannelLinks(`❌ No Pinterest images found for "${query}".\n\n${CREDIT_TEXT}\n${CHANNEL_LINK}`)
                },
                { quoted: message }
            );
        }

        let sentCount = 0;

        for (let i = 0; i < selected.length; i++) {
            const item = selected[i];
            const imgUrl = item.downloadUrl || item.image || item.thumbnail;

            try {
                const imgRes = await axios.get(imgUrl, {
                    responseType: 'arraybuffer',
                    timeout: 60000
                });
                const imgBuffer = Buffer.from(imgRes.data);
                const mimetype = getMimeType(item);
                const title = replaceChannelLinks(item.title || 'Pinterest Image');

                const caption = replaceChannelLinks(
                    `╭───「 🍭 𝐏𝐈𝐍𝐇𝐔𝐍𝐓 」───\n│ 🖼️ *${title}* (${i + 1}/${selected.length})\n│ 🔍 *${query}*\n│ ${CREDIT_TEXT}\n╰────────────────────\n${CHANNEL_LINK}`
                );

                await sock.sendMessage(
                    chatId,
                    {
                        image: imgBuffer,
                        mimetype,
                        caption,
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: NEWSLETTER_JID,
                                newsletterName: '𝚉𝙾𝚁𝙾 𝙼𝙳 𝙿𝙸𝙽𝚃𝙴𝚁𝙴𝚂𝚃'
                            }
                        }
                    },
                    { quoted: i === 0 ? message : undefined }
                );

                sentCount++;
            } catch (err) {}
        }

        if (sentCount === 0) {
            try {
                await sock.sendMessage(chatId, { react: { text: '📉', key: message.key } });
            } catch (e) {}

            return await sock.sendMessage(
                chatId,
                {
                    text: replaceChannelLinks(`❌ Failed to download Pinterest images.\n\n${CREDIT_TEXT}\n${CHANNEL_LINK}`)
                },
                { quoted: message }
            );
        }

        await sock.sendMessage(
            chatId,
            {
                text: replaceChannelLinks(`✅ *${COMPLETE_TEXT}* • ${CREDIT_TEXT}`),
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: NEWSLETTER_JID,
                        newsletterName: '𝚉𝙾𝚁𝙾 𝙼𝙳 𝙿𝙸𝙽𝚃𝙴𝚁𝙴𝚂𝚃'
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
                text: replaceChannelLinks(`❌ Failed to search Pinterest.\n\n${CREDIT_TEXT}\n${CHANNEL_LINK}`)
            },
            { quoted: message }
        );
    }
}

pinHuntCommand.command = ['pinhunt'];
pinHuntCommand.description = 'Search and download Pinterest images by query and count';

module.exports = pinHuntCommand;
