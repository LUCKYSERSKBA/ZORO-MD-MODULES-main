const settings = require("../settings");

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

async function animEditCommand(sock, chatId, message) {
    try {
        const sender = message.key.participant || message.key.remoteJid;
        const botNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const senderClean = sender ? sender.split(':')[0] + '@s.whatsapp.net' : "";

        const isOwner = message.key.fromMe || (senderClean === botNumber);

        const text = message.message?.conversation || 
                     message.message?.extendedTextMessage?.text || 
                     message.message?.imageMessage?.caption || 
                     message.message?.videoMessage?.caption || "";
                     
        const cleanText = text.trim().toLowerCase();

        const emojiSets = {
            sad: {
                emojis: ['😢', '😭', '💔', '🙁', '☹️', '😿', '😾', '🥺', '🥀', '🥲', '😔', '🖤'],
                reaction: '😶',
                outro: ['🥀', '🌧️', '🖤']
            },
            happy: {
                emojis: ['😀', '😃', '😄', '😁', '😆', '🥳', '😍', '✨', '🎉', '🤩', '😇', '🌝'],
                reaction: '🫣',
                outro: ['✨', '💫', '🌟']
            },
            angry: {
                emojis: ['😠', '😡', '🤬', '😤', '😒', '🙄', '😑', '💢', '🔥', '👿', '😾', '🗯️'],
                reaction: '😤',
                outro: ['💢', '🔥', '🤬']
            },
            heart: {
                emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '🩷', '💖', '💘'],
                reaction: '🥰',
                outro: ['💖', '✨', '❤️']
            },
            funny: {
                emojis: ['😂', '🤣', '😹', '😜', '🤪', '😝', '🤡', '🙃', '🤭', '🐒', '🥴', '😂'],
                reaction: '🤣',
                outro: ['😂', '🎉', '🤣']
            }
        };

        let matchedKey = null;
        for (const key of Object.keys(emojiSets)) {
            if (cleanText.includes(key)) {
                matchedKey = key;
                break;
            }
        }

        if (!matchedKey) {
            return;
        }

        if (!isOwner) {
            await sock.sendMessage(chatId, { react: { text: '😂', key: message.key } });
            await sock.sendMessage(chatId, { text: '_This is an owner command._' }, { quoted: message });
            return;
        }

        const currentSet = emojiSets[matchedKey];
        const shuffledEmojis = shuffleArray(currentSet.emojis);

        await sock.sendMessage(chatId, { react: { text: currentSet.reaction, key: message.key } });

        const sentMsg = await sock.sendMessage(chatId, { text: shuffledEmojis[0] }, { quoted: message });

        for (let i = 1; i < shuffledEmojis.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 700));
            await sock.sendMessage(chatId, {
                text: shuffledEmojis[i],
                edit: sentMsg.key
            });
        }

        // അവസാനത്തെ ആനിമേഷൻ (Final outro sequence)
        for (const outroEmoji of currentSet.outro) {
            await new Promise(resolve => setTimeout(resolve, 500));
            await sock.sendMessage(chatId, {
                text: outroEmoji,
                edit: sentMsg.key
            });
        }

    } catch (err) {
        console.error('Animated Edit Error:', err);
    }
}

animEditCommand.command = ['sad', 'happy', 'angry', 'heart', 'funny'];
module.exports = animEditCommand;
