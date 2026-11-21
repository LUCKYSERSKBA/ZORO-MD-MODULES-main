const { downloadContentFromMessage } = require('@aadhixd777/baileys');

function unwrapViewOnce(msg) {
    let curr = msg;
    while (curr) {
        if (curr.viewOnceMessage?.message) {
            curr = curr.viewOnceMessage.message;
        } else if (curr.viewOnceMessageV2?.message) {
            curr = curr.viewOnceMessageV2.message;
        } else if (curr.viewOnceMessageV2Extension?.message) {
            curr = curr.viewOnceMessageV2Extension.message;
        } else if (curr.ephemeralMessage?.message) {
            curr = curr.ephemeralMessage.message;
        } else {
            break;
        }
    }
    return curr;
}

function getQuotedMessage(message) {
    const m = unwrapViewOnce(message?.message);
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

function hasMediaLocation(mediaObj) {
    return Boolean(mediaObj && (mediaObj.url || mediaObj.directPath));
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

        const targetMedia =
            (quotedImage && quotedImage.viewOnce && { msg: quotedImage, type: 'image' }) ||
            (quotedVideo && quotedVideo.viewOnce && { msg: quotedVideo, type: 'video' }) ||
            (quotedAudio && quotedAudio.viewOnce && { msg: quotedAudio, type: 'audio' }) ||
            null;

        if (!targetMedia) {
            await sock.sendMessage(
                chatId,
                { text: '❌ Quoted message is not a ViewOnce image, video, or audio!' },
                { quoted: message }
            );
            return;
        }

        if (!hasMediaLocation(targetMedia.msg)) {
            await sock.sendMessage(
                chatId,
                { text: '⚠️ Media URL/directPath missing! This ViewOnce message may already be opened or expired.' },
                { quoted: message }
            );
            return;
        }

        const stream = await downloadContentFromMessage(targetMedia.msg, targetMedia.type);
        const buffer = await streamToBuffer(stream);

        if (targetMedia.type === 'image') {
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
        } else if (targetMedia.type === 'video') {
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
        } else if (targetMedia.type === 'audio') {
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
