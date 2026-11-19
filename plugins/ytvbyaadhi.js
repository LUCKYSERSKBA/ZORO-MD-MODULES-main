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

function extractYouTubeUrl(input = '') {
    const match = String(input).match(/https?:\/\/(?:[\w-]+\.)?(?:youtube\.com|youtu\.be)\/[^\s]+/i);
    return match ? match[0] : '';
}

function parseResolution(q = '') {
    const match = String(q).match(/(\d{3,4})p/i);
    return match ? parseInt(match[1], 10) : 0;
}

function pickHighestQualityVideo(videos = []) {
    if (!Array.isArray(videos) || videos.length === 0) return null;

    const validVideos = videos.filter((v) => v && v.downloadUrl);
    if (validVideos.length === 0) return null;

    validVideos.sort((a, b) => {
        const resDiff = parseResolution(b.quality) - parseResolution(a.quality);
        if (resDiff !== 0) return resDiff;

        const verDiff = Number(Boolean(b.verified)) - Number(Boolean(a.verified));
        if (verDiff !== 0) return verDiff;

        return Number(b.sizeMB || 0) - Number(a.sizeMB || 0);
    });

    return validVideos[0];
}

async function ytvByAadhiCommand(sock, chatId, message) {
    try {
        if (message?.key?.id) {
            if (processedMessages.has(message.key.id)) return;
            processedMessages.add(message.key.id);
            setTimeout(() => processedMessages.delete(message.key.id), 5 * 60 * 1000);
        }

        const rawText = getRawText(message);
        const argText = getArgText(rawText);
        const ytUrl = extractYouTubeUrl(argText || rawText);

        if (!ytUrl) {
            return await sock.sendMessage(
                chatId,
                {
                    text: replaceChannelLinks(
                        `❌ Please provide a valid YouTube link.\nExample: .ytvbyaadhi https://youtu.be/xxxxxxx\n\n${CREDIT_TEXT}\n${CHANNEL_LINK}`
                    )
                },
                { quoted: message }
            );
        }

        try {
            await sock.sendMessage(chatId, { react: { text: '🤍', key: message.key } });
        } catch (e) {}

        const apiUrl = `https://xenosirapis.zone.id/api/ytdlp?url=${encodeURIComponent(ytUrl)}`;
        const { data } = await axios.get(apiUrl, { timeout: 30000 });

        const bestVideo = pickHighestQualityVideo(data?.video || data?.result?.video || data?.data?.video);
        if (!bestVideo?.downloadUrl) {
            try {
                await sock.sendMessage(chatId, { react: { text: '📉', key: message.key } });
            } catch (e) {}

            return await sock.sendMessage(
                chatId,
                {
                    text: replaceChannelLinks(`❌ Video not found.\n\n${CREDIT_TEXT}\n${CHANNEL_LINK}`)
                },
                { quoted: message }
            );
        }

        const title = replaceChannelLinks(data?.title || 'YouTube Video');
        const quality = bestVideo.quality || 'HD';
        const sizeText = bestVideo.sizeMB ? ` (${bestVideo.sizeMB} MB)` : '';

        const videoRes = await axios.get(bestVideo.downloadUrl, {
            responseType: 'arraybuffer',
            timeout: 120000
        });
        const videoBuffer = Buffer.from(videoRes.data);

        const caption = replaceChannelLinks(
            `╭───「 🤍 𝐘𝐓 𝐕𝐈𝐃𝐄𝐎 」───\n│ 🎥 *${title}*\n│ 📺 *${quality}*${sizeText}\n│ ${CREDIT_TEXT}\n╰────────────────────\n${CHANNEL_LINK}`
        );

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
                        newsletterName: '𝚉𝙾𝚁𝙾 𝙼𝙳 𝚈𝚃 𝚅𝙸𝙳𝙴𝙾'
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
                        newsletterName: '𝚉𝙾𝚁𝙾 𝙼𝙳 𝚈𝚃 𝚅𝙸𝙳𝙴𝙾'
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
                text: replaceChannelLinks(`❌ Failed to download YouTube video.\n\n${CREDIT_TEXT}\n${CHANNEL_LINK}`)
            },
            { quoted: message }
        );
    }
}

ytvByAadhiCommand.command = ['ytvbyaadhi'];
ytvByAadhiCommand.description = 'Download highest quality YouTube video';

module.exports = ytvByAadhiCommand;
