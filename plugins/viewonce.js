const { downloadContentFromMessage } = require('@aadhixd777/baileys');

function unwrapViewOnce(msg) {
    if (!msg) return null;
    return (
        msg.viewOnceMessage?.message ||
        msg.viewOnceMessageV2?.message ||
        msg.viewOnceMessageV2Extension?.message ||
        msg
    );
}

function getQuotedMessage(message) {
    const m = message?.message;
    if (!m) return null;

    const contextInfo =
        m.extendedTextMessage?.contextInfo ||
        m.imageMessage?.contextInfo ||
        m.videoMessage?.contextInfo ||
        m.audioMessage?.contextInfo ||
        m.documentMessage?.contextInfo ||
        m.stickerMessage?.contextInfo ||
        m.buttonsResponseMessage?.contextInfo ||
        m.templateButtonReplyMessage?.contextInfo ||
        m.interactiveResponseMessage?.contextInfo ||
        null;

    const rawQuoted = contextInfo?.quotedMessage;
    return unwrapViewOnce(rawQuoted);
}

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

async function viewonceCommand(sock, chatId, message) {
    try {
        const quoted = getQuotedMessage(message);
        if (!quoted) {
            await sock.sendMessage(
                chatId,
                { text: '❌ Please reply to a ViewOnce image, video, or audio message!' },
                { quoted: message }
            );
            return;
        }

        const quotedImage = quoted.imageMessage;
        const quotedVideo = quoted.videoMessage;
        const quotedAudio = quoted.audioMessage;

        if (quotedImage && quotedImage.viewOnce) {
            const stream = await downloadContentFromMessage(quotedImage, 'image');
            const buffer = await streamToBuffer(stream);
            await sock.sendMessage(
                chatId,
                {
                    image: buffer,
                    fileName: 'media.jpg',
                    caption: quotedImage.caption || '',
                    viewOnce: false
                },
                { quoted: message }
            );
        } else if (quotedVideo && quotedVideo.viewOnce) {
            const stream = await downloadContentFromMessage(quotedVideo, 'video');
            const buffer = await streamToBuffer(stream);
            await sock.sendMessage(
                chatId,
                {
                    video: buffer,
                    fileName: 'media.mp4',
                    caption: quotedVideo.caption || '',
                    viewOnce: false
                },
                { quoted: message }
            );
        } else if (quotedAudio && quotedAudio.viewOnce) {
            const stream = await downloadContentFromMessage(quotedAudio, 'audio');
            const buffer = await streamToBuffer(stream);
            const isPTT = Boolean(quotedAudio.ptt);
            const mimetype = quotedAudio.mimetype || (isPTT ? 'audio/ogg; codecs=opus' : 'audio/mpeg');

            await sock.sendMessage(
                chatId,
                {
                    audio: buffer,
                    mimetype,
                    ptt: isPTT,
                    fileName: isPTT ? 'voice.ogg' : 'audio.mp3',
                    viewOnce: false
                },
                { quoted: message }
            );
        } else {
            await sock.sendMessage(
                chatId,
                { text: '❌ Quoted message is not a ViewOnce image, video, or audio!' },
                { quoted: message }
            );
        }
    } catch (err) {
        console.error('ViewOnce command error:', err);
        await sock.sendMessage(
            chatId,
            { text: '⚠️ Failed to retrieve ViewOnce media. It may have expired or already been opened.' },
            { quoted: message }
        );
    }
}

module.exports = viewonceCommand;
