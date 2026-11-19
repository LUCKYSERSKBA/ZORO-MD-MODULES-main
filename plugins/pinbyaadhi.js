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

function extractPinterestUrl(input = '') {
    const match = String(input).match(/https?:\/\/(?:[\w-]+\.)?(?:pinterest\.com|pin\.it)\/[^\s]+/i);
    return match ? match[0] : '';
}

async function pinByAadhiCommand(sock, chatId, message) {
    try {
        if (message?.key?.id) {
            if (processedMessages.has(message.key.id)) return;
            processedMessages.add(message.key.id);
            setTimeout(() => processedMessages.delete(message.key.id), 5 * 60 * 1000);
        }

        const rawText = getRawText(message);
        const argText = getArgText(rawText);
        const pinUrl = extractPinterestUrl(argText || rawText);

        if (!pinUrl) {
            return await sock.sendMessage(
                chatId,
                {
                    text: replaceChannelLinks(
                        `❌ Please provide a valid Pinterest link.\nExample: .pinbyaadhi https://pin.it/xxxxxxx\n\n${CREDIT_TEXT}\n${CHANNEL_LINK}`
                    )
                },
                { quoted: message }
            );
        }

        try {
            await sock.sendMessage(chatId, { react: { text: '💗', key: message.key } });
        } catch (e) {}

        const apiUrl = `https://xenosirapis.zone.id/api/pindl?url=${encodeURIComponent(pinUrl)}`;
        const { data } = await axios.get(apiUrl, { timeout: 30000 });

        const payload = data?.result || data?.data || data || {};
        const title = replaceChannelLinks(payload.title || 'Pinterest Media');
        const videoUrl = payload.video || payload.downloadUrl;
        const imageUrl = payload.image || payload.thumbnail;

        const caption = replaceChannelLinks(
            `╭───「 💗 𝐏𝐈𝐍𝐓𝐄𝐑𝐄𝐒𝐓 」───\n│ 🖼️ *${title}*\n│ ${CREDIT_TEXT}\n╰────────────────────\n${CHANNEL_LINK}`
        );

        let sentMedia = false;

        if (videoUrl && /\.mp4/i.test(videoUrl)) {
            const vidRes = await axios.get(videoUrl, {
                responseType: 'arraybuffer',
                timeout: 120000
            });
            const vidBuffer = Buffer.from(vidRes.data);

            await sock.sendMessage(
                chatId,
                {
                    video: vidBuffer,
                    mimetype: 'video/mp4',
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
                { quoted: message }
            );
            sentMedia = true;
        } else if (imageUrl) {
            const imgRes = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 60000
            });
            const imgBuffer = Buffer.from(imgRes.data);
            const isPng = /\.png/i.test(imageUrl);

            await sock.sendMessage(
                chatId,
                {
                    image: imgBuffer,
                    mimetype: isPng ? 'image/png' : 'image/jpeg',
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
                { quoted: message }
            );
            sentMedia = true;
        } else {
            try {
                await sock.sendMessage(chatId, { react: { text: '📉', key: message.key } });
            } catch (e) {}

            return await sock.sendMessage(
                chatId,
                {
                    text: replaceChannelLinks(`❌ Media not found.\n\n${CREDIT_TEXT}\n${CHANNEL_LINK}`)
                },
                { quoted: message }
            );
        }

        if (sentMedia) {
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
        }

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
                text: replaceChannelLinks(`❌ Failed to download Pinterest media.\n\n${CREDIT_TEXT}\n${CHANNEL_LINK}`)
            },
            { quoted: message }
        );
    }
}

pinByAadhiCommand.command = ['pinbyaadhi'];
pinByAadhiCommand.description = 'Download Pinterest image or video';

module.exports = pinByAadhiCommand;
