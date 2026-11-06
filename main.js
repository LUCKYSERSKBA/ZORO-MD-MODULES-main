// 🧹 Fix for ENOSPC / temp overflow in hosted panels
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const consoleLogger = require('./lib/consoleLogger');

// Redirect temp storage away from system /tmp
const customTemp = path.join(process.cwd(), 'temp');
if (!fs.existsSync(customTemp)) fs.mkdirSync(customTemp, { recursive: true });
process.env.TMPDIR = customTemp;
process.env.TEMP = customTemp;
process.env.TMP = customTemp;

// Auto-cleaner every 3 hours
setInterval(() => {
  fs.readdir(customTemp, (err, files) => {
    if (err) return;
    for (const file of files) {
      const filePath = path.join(customTemp, file);
      fs.stat(filePath, (err, stats) => {
        if (!err && Date.now() - stats.mtimeMs > 3 * 60 * 60 * 1000) {
          fs.unlink(filePath, () => {});
        }
      });
    }
  });
  console.log('🧹 Temp folder auto-cleaned');
}, 3 * 60 * 60 * 1000);

const settings = require('./settings');
require('./config.js');
const { isBanned } = require('./lib/isBanned');
const yts = require('yt-search');
const { fetchBuffer } = require('./lib/myfunc');
const fetch = require('node-fetch');
const youtubeDl = require('youtube-dl-exec');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const { isSudo } = require('./lib/index');
const { autoreadCommand, isAutoreadEnabled, handleAutoread } = require('./plugins/autoread');

// 🌟 User-Specific Prefix MongoDB Schema & Functions (Session Isolated)
const botSettingsSchema = new mongoose.Schema({
    botId: { type: String, required: true, unique: true },
    prefix: { type: String, default: '.' }
});

const BotSettings = mongoose.models.BotSettings || mongoose.model('BotSettings', botSettingsSchema);

async function getBotPrefix(sock) {
    try {
        const botId = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : sock.user?.id;
        const doc = await BotSettings.findOne({ botId });
        return doc ? doc.prefix : '.';
    } catch (e) {
        return '.';
    }
}

async function setBotPrefix(sock, newPrefix) {
    try {
        const botId = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : sock.user?.id;
        return await BotSettings.findOneAndUpdate(
            { botId },
            { prefix: newPrefix },
            { upsert: true, new: true }
        );
    } catch (e) {
        console.error('Error setting prefix:', e);
    }
}

// Global Allowed Prefixes List (Single & Double Emojis, Symbols without =)
const globalAllowedPrefixes = [
    ".", ",", "/", "!", "%", "<3", 
    "🤍", "🎀", "🐱", "🥂", "🍒", "🐦‍🔥", "🏷️", 
    "🌚", "🌷", "🪻", "🌿", "🍃",
    "🌚🍃"
];

// Command imports
const tagAllCommand = require('./plugins/tagall');
const helpCommand = require('./plugins/help');
const banCommand = require('./plugins/ban');
const { promoteCommand } = require('./plugins/promote');
const { demoteCommand } = require('./plugins/demote');
const muteCommand = require('./plugins/mute');
const unmuteCommand = require('./plugins/unmute');
const stickerCommand = require('./plugins/sticker');
const isAdmin = require('./lib/isAdmin');
const warnCommand = require('./plugins/warn');
const warningsCommand = require('./plugins/warnings');
const ttsCommand = require('./plugins/tts');
const { tictactoeCommand, handleTicTacToeMove } = require('./plugins/tictactoe');
const { incrementMessageCount, topMembers } = require('./plugins/topmembers');
const ownerCommand = require('./plugins/owner');
const deleteCommand = require('./plugins/delete');
const { handleAntilinkCommand, handleLinkDetection } = require('./plugins/antilink');
const { handleAntitagCommand, handleTagDetection } = require('./plugins/antitag');
const { Antilink } = require('./lib/antilink');
const { handleMentionDetection, mentionToggleCommand, setMentionCommand } = require('./plugins/mention');
const memeCommand = require('./plugins/meme');
const tagCommand = require('./plugins/tag');
const tagNotAdminCommand = require('./plugins/tagnotadmin');
const hideTagCommand = require('./plugins/hidetag');
const jokeCommand = require('./plugins/joke');
const quoteCommand = require('./plugins/quote');
const factCommand = require('./plugins/fact');
const weatherCommand = require('./plugins/weather');
const newsCommand = require('./plugins/news');
const kickCommand = require('./plugins/kick');
const simageCommand = require('./plugins/simage');
const attpCommand = require('./plugins/attp');
const { startHangman, guessLetter } = require('./plugins/hangman');
const { startTrivia, answerTrivia } = require('./plugins/trivia');
const { complimentCommand } = require('./plugins/compliment');
const { insultCommand } = require('./plugins/insult');
const { eightBallCommand } = require('./plugins/eightball');
const { lyricsCommand } = require('./plugins/lyrics');
const { dareCommand } = require('./plugins/dare');
const { truthCommand } = require('./plugins/truth');
const { clearCommand } = require('./plugins/clear');
const pingCommand = require('./plugins/ping');
const aliveCommand = require('./plugins/alive');
const sayMyNameCommand = require('./plugins/saymyname');
const animEditCommand = require('./plugins/animedit');
const blurCommand = require('./plugins/img-blur');
const { welcomeCommand, handleJoinEvent } = require('./plugins/welcome');
const { goodbyeCommand, handleLeaveEvent } = require('./plugins/goodbye');
const githubCommand = require('./plugins/github');
const { handleAntiBadwordCommand, handleBadwordDetection } = require('./lib/antibadword');
const antibadwordCommand = require('./plugins/antibadword');
const { handleChatbotCommand, handleChatbotResponse } = require('./plugins/chatbot');
const takeCommand = require('./plugins/take');
const { flirtCommand } = require('./plugins/flirt');
const characterCommand = require('./plugins/character');
const wastedCommand = require('./plugins/wasted');
const shipCommand = require('./plugins/ship');
const groupInfoCommand = require('./plugins/groupinfo');
const resetlinkCommand = require('./plugins/resetlink');
const staffCommand = require('./plugins/staff');
const unbanCommand = require('./plugins/unban');
const emojimixCommand = require('./plugins/emojimix');
const { handlePromotionEvent } = require('./plugins/promote');
const { handleDemotionEvent } = require('./plugins/demote');
const viewOnceCommand = require('./plugins/viewonce');
const clearSessionCommand = require('./plugins/clearsession');
const { autoStatusCommand, handleStatusUpdate } = require('./plugins/autostatus');
const { simpCommand } = require('./plugins/simp');
const { stupidCommand } = require('./plugins/stupid');
const stickerTelegramCommand = require('./plugins/stickertelegram');
const textmakerCommand = require('./plugins/textmaker');
const { handleAntideleteCommand, handleMessageRevocation, storeMessage } = require('./plugins/antidelete');
const clearTmpCommand = require('./plugins/cleartmp');
const setProfilePicture = require('./plugins/setpp');
const { setGroupDescription, setGroupName, setGroupPhoto } = require('./plugins/groupmanage');
const instagramCommand = require('./plugins/instagram');
const facebookCommand = require('./plugins/facebook');
const spotifyCommand = require('./plugins/spotify');
const playCommand = require('./plugins/play');
const tiktokCommand = require('./plugins/tiktok');
const songCommand = require('./plugins/song');
const aiCommand = require('./plugins/ai');
const urlCommand = require('./plugins/url');
const { handleTranslateCommand } = require('./plugins/translate');
const { handleSsCommand } = require('./plugins/ss');
const { addCommandReaction, handleAreactCommand } = require('./lib/reactions');
const { goodnightCommand } = require('./plugins/goodnight');
const { shayariCommand } = require('./plugins/shayari');
const { rosedayCommand } = require('./plugins/roseday');
const imagineCommand = require('./plugins/imagine');
const videoCommand = require('./plugins/video');
const sudoCommand = require('./plugins/sudo');
const { miscCommand, handleHeart } = require('./plugins/misc');
const { animeCommand } = require('./plugins/anime');
const { piesCommand, piesAlias } = require('./plugins/pies');
const stickercropCommand = require('./plugins/stickercrop');
const updateCommand = require('./plugins/update');
const removebgCommand = require('./plugins/removebg');
const { reminiCommand } = require('./plugins/remini');
const { igsCommand } = require('./plugins/igs');
const settingsCommand = require('./plugins/settings');
const soraCommand = require('./plugins/sora');
const imgCommand = require('./plugins/img');
const pinterestImgCommand = require('./plugins/pinterestimg');
const bingImgCommand = require('./plugins/bingimg');
const solveCommand = require('./plugins/solve');
const ageCommand = require('./plugins/age');
const fliptextCommand = require('./plugins/fliptext');
const { setbotfontCommand } = require('./plugins/setbotfont');
const bratCommand = require('./plugins/brat-local');
const createGroupCommand = require('./plugins/creategr');
const obfuscateCommand = require('./plugins/obfuscate');
const textstickerCommand = require('./plugins/textsticker');
const picCommand = require('./plugins/pic');

const stiCommand = require('./plugins/sti');
const m4aCommand = require('./plugins/m4a');
const shazamCommand = require('./plugins/shazam'); // 🌟 Added Shazam Plugin

const {
    bassCommand,
    blowCommand,
    deepCommand,
    errapeCommand,
    robotCommand
} = require('./plugins/audioeffects');

const {
    approveCommand,
    disapproveCommand,
    getGroupPPCommand,
    getPPCommand,
    groupIdCommand,
    closeGroupCommand,
    openGroupCommand,
    antistickerCommand,
    handleAntiSticker,
    antibotCommand,
    handleAntiBot,
    handleAntiBotMessage,
    antiforwardCommand,
    handleAntiForward,
    toAudioCommand,
    volvideoCommand,
    toViewOnceCommand,
    editCaptionCommand,
    blockCommand,
    unblockAllCommand,
    autoreactionCommand,
    handleAutoReaction,
    realownerCommand
} = require('./plugins/enhanced-commands');

const { anticallCommand: anticallImproved, handleCall } = require('./plugins/anticall-improved');
const { autotypingCommand: autotypingImproved, isAutotypingEnabled: isAutotypingEnabledNew, handleAutotypingForMessage: handleAutotypingNew } = require('./plugins/autotyping-improved');
const { pmblockerCommand: pmblockerImproved, readState: readPmBlockerStateNew } = require('./plugins/pmblocker-improved');

// Global settings
global.packname = settings.packname;
global.author = settings.author;
global.channelLink = "https://chat.whatsapp.com/JD6upTGh8a44e5t7pUahgq?s=cl&p=a&mlu=3&amv=0";
global.ytch = "ROMEO";

const channelInfo = {};

async function handleMessages(sock, messageUpdate, printLog) {
    let chatId;
    try {
        const { messages, type } = messageUpdate;
        if (type !== 'notify') return;

        const message = messages[0];
        if (!message?.message) return;

        await handleAutoread(sock, message);

        if (message.message) {
            storeMessage(sock, message);
        }

        if (message.message?.protocolMessage?.type === 0) {
            await handleMessageRevocation(sock, message);
            return;
        }

        chatId = message.key.remoteJid;
        const senderId = message.key.participant || chatId;
        const isGroup = chatId.endsWith('@g.us');

        const userMessageCheck = (
            message.message?.conversation || 
            message.message?.extendedTextMessage?.text || 
            ''
        ).trim();
        
        if (userMessageCheck === '1' || userMessageCheck === '2') {
            await songCommand(sock, chatId, message);
            return;
        }

        const senderIsSudo = await isSudo(senderId);
        const senderNumber = senderId.split('@')[0].split(':')[0];
        const senderHasOwnerAccess = (message.key.fromMe || senderNumber === settings.ownerNumber || senderIsSudo);

        const rawText = message.message?.conversation?.trim() ||
            message.message?.extendedTextMessage?.text?.trim() ||
            message.message?.imageMessage?.caption?.trim() ||
            message.message?.videoMessage?.caption?.trim() ||
            '';

        // 🌟 Strict User-Specific Prefix Customization & Global Allowed Logic
        const currentCustomPrefix = await getBotPrefix(sock);
        
        let parsedCmd = { isCommand: false };
        if (currentCustomPrefix && rawText.startsWith(currentCustomPrefix)) {
            const commandBody = rawText.slice(currentCustomPrefix.length).trim();
            const commandName = commandBody.split(' ')[0].toLowerCase();
            const args = commandBody.split(' ').slice(1);
            parsedCmd = { isCommand: true, prefixUsed: currentCustomPrefix, commandName, args, rawBody: commandBody };
        } else {
            const sortedPrefixes = [...globalAllowedPrefixes].sort((a, b) => b.length - a.length);
            for (const prefix of sortedPrefixes) {
                if (rawText.startsWith(prefix)) {
                    const commandBody = rawText.slice(prefix.length).trim();
                    const commandName = commandBody.split(' ')[0].toLowerCase();
                    const args = commandBody.split(' ').slice(1);
                    parsedCmd = { isCommand: true, prefixUsed: prefix, commandName, args, rawBody: commandBody };
                    break;
                }
            }
        }

        let senderName = 'Unknown User';
        let groupName = '';
        try {
            if (sock.contacts && sock.contacts[senderId]) {
                senderName = sock.contacts[senderId].name || senderName;
            }
            if (isGroup && sock.groupMetadata) {
                const groupMeta = await sock.groupMetadata(chatId).catch(() => ({}));
                groupName = groupMeta.subject || 'Unknown Group';
            }
        } catch (err) {}

        if (!message.key.fromMe) {
            consoleLogger.logIncomingMessage(senderId, senderName, rawText, isGroup, groupName);
        }

        if (parsedCmd.isCommand) {
            consoleLogger.logCommandUsage(parsedCmd.commandName, senderId, senderName, !isGroup, groupName);
        }

        if (isGroup && !message.key.fromMe) {
            const isDetectedAsBot = await handleAntiBotMessage(sock, chatId, message, senderId, rawText);
            if (isDetectedAsBot) return;
        }

        if (!parsedCmd.isCommand) {
            await handleAutoReaction(sock, chatId, message, isGroup);
            await handleAutotypingNew(sock, chatId, rawText, isGroup);
        }

        try {
            const data = JSON.parse(fs.readFileSync('./data/messageCount.json'));
            if (!data.isPublic && !senderHasOwnerAccess) {
                return;
            }
        } catch (error) {}

        if (isBanned(senderId) && parsedCmd.commandName !== 'unban') {
            if (Math.random() < 0.1) {
                await sock.sendMessage(chatId, {
                    text: '❌ You are banned from using the bot. Contact an admin to get unbanned.',
                    ...channelInfo
                });
            }
            return;
        }

        if (/^[1-9]$/.test(rawText) || rawText.toLowerCase() === 'surrender') {
            await handleTicTacToeMove(sock, chatId, senderId, rawText);
            return;
        }

        if (!message.key.fromMe) incrementMessageCount(chatId, senderId);

        if (isGroup && rawText) {
            await handleBadwordDetection(sock, chatId, message, rawText, senderId);
            await Antilink(message, sock);
        }

        if (!isGroup && !senderHasOwnerAccess) {
            try {
                const pmState = readPmBlockerStateNew();
                if (pmState.enabled && !pmState.whitelist.includes(senderId)) {
                    await sock.sendMessage(chatId, { text: pmState.message || 'Private messages are blocked. Please contact the owner in groups only.' });
                    await new Promise(r => setTimeout(r, 1500));
                    try { await sock.updateBlockStatus(chatId, 'block'); } catch (e) { }
                    return;
                }
            } catch (e) { }
        }

        if (isGroup && !message.key.fromMe) {
            await handleAntiSticker(sock, chatId, message, senderId);
            await handleAntiForward(sock, chatId, message, senderId);
        }

        if (!parsedCmd.isCommand) {
            if (isGroup) {
                await handleChatbotResponse(sock, chatId, message, rawText, senderId);
                await handleTagDetection(sock, chatId, message, senderId);
                await handleMentionDetection(sock, chatId, message);
            }
            return;
        }

        const adminCommands = ['mute', 'unmute', 'ban', 'unban', 'promote', 'demote', 'kick', 'antilink', 'antitag', 'setgdesc', 'setgname', 'setgpp'];
        const isAdminCommand = adminCommands.includes(parsedCmd.commandName);

        const senderAdminOnlyCommands = ['tagall', 'tagnotadmin', 'hidetag'];
        const isSenderAdminOnlyCommand = senderAdminOnlyCommands.includes(parsedCmd.commandName);

        const ownerCommands = ['mode', 'autostatus', 'antidelete', 'cleartmp', 'setpp', 'clearsession', 'areact', 'autoreact', 'autotyping', 'autoread', 'pmblocker', 'anticall'];
        const isOwnerCommand = ownerCommands.includes(parsedCmd.commandName);

        let isSenderAdmin = false;
        let isBotAdmin = false;

        if (isGroup && isAdminCommand) {
            const adminStatus = await isAdmin(sock, chatId, senderId, message);
            isSenderAdmin = adminStatus.isSenderAdmin;
            isBotAdmin = adminStatus.isBotAdmin;

            if (!isBotAdmin) {
                await sock.sendMessage(chatId, { text: 'Please make the bot an admin to use admin commands.', ...channelInfo }, { quoted: message });
                return;
            }

            if (['mute', 'unmute', 'ban', 'unban', 'promote', 'demote'].includes(parsedCmd.commandName)) {
                if (!isSenderAdmin && !senderHasOwnerAccess) {
                    await sock.sendMessage(chatId, {
                        text: 'Sorry, only group admins can use this command.',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
            }
        }

        if (isGroup && isSenderAdminOnlyCommand) {
            const adminStatus = await isAdmin(sock, chatId, senderId, message);
            isSenderAdmin = adminStatus.isSenderAdmin;
        }

        if (isOwnerCommand) {
            if (!senderHasOwnerAccess) {
                await sock.sendMessage(chatId, { text: '❌ This command is only available for the owner or sudo!' }, { quoted: message });
                return;
            }
        }

        let commandExecuted = false;

        // 🌟 .setprefix Command Handler
        if (parsedCmd.isCommand && parsedCmd.commandName === 'setprefix') {
            const newPrefixArg = parsedCmd.args[0];
            
            if (!newPrefixArg) {
                const suggestionMsg = 
`✨ *Bot Prefix Configuration* ✨

Current Prefix: \`${currentCustomPrefix}\`

To change your bot prefix, use the command followed by your desired symbol, single emoji, or double emoji combination.

*Examples:*
• \`.setprefix 🤍\`
• \`.setprefix 🌚🍃\`

*Recommended Emojis:*
1. 🤍
2. 🎀
3. 🍃
4. !`;

                await sock.sendMessage(chatId, { text: suggestionMsg }, { quoted: message });
                return;
            }

            await setBotPrefix(sock, newPrefixArg);
            await sock.sendMessage(chatId, { text: `✅ Bot prefix successfully updated to: *${newPrefixArg}*\n\nYou can now use commands with your new prefix!` }, { quoted: message });
            return;
        }

        switch (parsedCmd.commandName) {
            case 'sti':
                await stiCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case 'm4a':
                await m4aCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case 'shazam':
            case 'find':
            case 'whatsong':
                await shazamCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case 'simage': {
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (quotedMessage?.stickerMessage) {
                    await simageCommand(sock, quotedMessage, chatId);
                } else {
                    await sock.sendMessage(chatId, { text: 'Please reply to a sticker with the .simage command to convert it.', ...channelInfo }, { quoted: message });
                }
                commandExecuted = true;
                break;
            }
            case 'kick':
                const mentionedJidListKick = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await kickCommand(sock, chatId, senderId, mentionedJidListKick, message);
                break;
            case 'mute':
                {
                    const muteArg = parsedCmd.args[0];
                    const muteDuration = muteArg !== undefined ? parseInt(muteArg, 10) : undefined;
                    if (muteArg !== undefined && (isNaN(muteDuration) || muteDuration <= 0)) {
                        await sock.sendMessage(chatId, { text: 'Please provide a valid number of minutes or use .mute with no number to mute immediately.', ...channelInfo }, { quoted: message });
                    } else {
                        await muteCommand(sock, chatId, senderId, message, muteDuration);
                    }
                }
                break;
            case 'unmute':
                await unmuteCommand(sock, chatId, senderId, message);
                break;
            case 'ban':
                if (!isGroup && !senderHasOwnerAccess) {
                    await sock.sendMessage(chatId, { text: 'Only owner/sudo can use .ban in private chat.' }, { quoted: message });
                    break;
                }
                await banCommand(sock, chatId, message);
                break;
            case 'unban':
                if (!isGroup && !senderHasOwnerAccess) {
                    await sock.sendMessage(chatId, { text: 'Only owner/sudo can use .unban in private chat.' }, { quoted: message });
                    break;
                }
                await unbanCommand(sock, chatId, message);
                break;
            case 'help':
            case 'menu':
            case 'bot':
            case 'list':
                await helpCommand(sock, chatId, message, global.channelLink);
                commandExecuted = true;
                break;
            case 'sticker':
            case 's':
                await stickerCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case 'pic':
                const quoted = message.message.extendedTextMessage?.contextInfo?.quotedMessage;
                await picCommand(sock, chatId, message, quoted);
                commandExecuted = true;
                break;
            case 'warnings':
                const mentionedJidListWarnings = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await warningsCommand(sock, chatId, mentionedJidListWarnings, senderId);
                break;
            case 'warn':
                const mentionedJidListWarn = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                await warnCommand(sock, chatId, senderId, mentionedJidListWarn, message);
                break;
            case 'tts':
                const text = parsedCmd.rawBody.slice(3).trim();
                await ttsCommand(sock, chatId, text, message);
                break;
            case 'delete':
            case 'del':
                await deleteCommand(sock, chatId, message, senderId);
                break;
            case 'attp':
                await attpCommand(sock, chatId, message);
                break;
            case 'settings':
                await settingsCommand(sock, chatId, message);
                break;
            case 'mode':
                if (!senderHasOwnerAccess) {
                    await sock.sendMessage(chatId, { text: 'Only bot owner can use this command!', ...channelInfo }, { quoted: message });
                    return;
                }
                let data;
                try {
                    data = JSON.parse(fs.readFileSync('./data/messageCount.json'));
                } catch (error) {
                    await sock.sendMessage(chatId, { text: 'Failed to read bot mode status', ...channelInfo });
                    return;
                }

                const action = parsedCmd.args[0]?.toLowerCase();
                if (!action) {
                    const currentMode = data.isPublic ? 'public' : 'private';
                    await sock.sendMessage(chatId, {
                        text: `Current bot mode: *${currentMode}*\n\nUsage: .mode public/private`,
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }

                if (action !== 'public' && action !== 'private') {
                    await sock.sendMessage(chatId, {
                        text: 'Usage: .mode public/private',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }

                data.isPublic = action === 'public';
                fs.writeFileSync('./data/messageCount.json', JSON.stringify(data, null, 2));
                await sock.sendMessage(chatId, { text: `Bot is now in *${action}* mode`, ...channelInfo });
                break;
            case 'anticall':
                await anticallImproved(sock, chatId, message, parsedCmd.args.join(' '));
                break;
            case 'pmblocker':
                await pmblockerImproved(sock, chatId, message, parsedCmd.args.join(' '));
                commandExecuted = true;
                break;
            case 'approve':
                await approveCommand(sock, chatId, message, parsedCmd.args.join(' '), senderId);
                break;
            case 'disapprove':
                await disapproveCommand(sock, chatId, message, parsedCmd.args.join(' '), senderId);
                break;
            case 'getgroupp':
                await getGroupPPCommand(sock, chatId, message);
                break;
            case 'getpp':
                await getPPCommand(sock, chatId, message);
                break;
            case 'groupid':
                await groupIdCommand(sock, chatId, message);
                break;
            case 'close':
                await closeGroupCommand(sock, chatId, message);
                break;
            case 'open':
                await openGroupCommand(sock, chatId, message);
                break;
            case 'antisticker':
                await antistickerCommand(sock, chatId, message, parsedCmd.args.join(' '));
                break;
            case 'antibot':
                await antibotCommand(sock, chatId, message, parsedCmd.args.join(' '));
                break;
            case 'antiforward':
                await antiforwardCommand(sock, chatId, message, parsedCmd.args.join(' '));
                break;
            case 'toaudio':
                await toAudioCommand(sock, chatId, message);
                break;
            case 'volvideo':
                await volvideoCommand(sock, chatId, message);
                break;
            case 'toviewonce':
                await toViewOnceCommand(sock, chatId, message);
                break;
            case 'editcaption':
                await editCaptionCommand(sock, chatId, message, rawText.slice(parsedCmd.prefixUsed.length + 11).trim());
                break;
            case 'block':
                await blockCommand(sock, chatId, message);
                break;
            case 'unblockall':
                await unblockAllCommand(sock, chatId, message);
                break;
            case 'autoreaction':
                await autoreactionCommand(sock, chatId, message, parsedCmd.args.join(' '));
                break;
            case 'owner':
                await ownerCommand(sock, chatId);
                break;
            case 'realowner':
                await realownerCommand(sock, chatId, message);
                break;
            case 'tagall':
                await tagAllCommand(sock, chatId, senderId, message);
                break;
            case 'tagnotadmin':
                await tagNotAdminCommand(sock, chatId, senderId, message);
                break;
            case 'hidetag':
                {
                    const messageText = rawText.slice(parsedCmd.prefixUsed.length + 7).trim();
                    const replyMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
                    await hideTagCommand(sock, chatId, senderId, messageText, replyMessage, message);
                }
                break;
            case 'tag':
                {
                    const messageText = rawText.slice(parsedCmd.prefixUsed.length + 3).trim();
                    const replyMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
                    await tagCommand(sock, chatId, senderId, messageText, replyMessage, message);
                }
                break;
            case 'antilink':
                if (!isGroup || !isBotAdmin) {
                    await sock.sendMessage(chatId, { text: 'This command requires group & bot admin privileges.', ...channelInfo }, { quoted: message });
                    return;
                }
                await handleAntilinkCommand(sock, chatId, rawText, senderId, isSenderAdmin, message);
                break;
            case 'antitag':
                if (!isGroup || !isBotAdmin) {
                    await sock.sendMessage(chatId, { text: 'This command requires group & bot admin privileges.', ...channelInfo }, { quoted: message });
                    return;
                }
                await handleAntitagCommand(sock, chatId, rawText, senderId, isSenderAdmin, message);
                break;
            case 'bass':
                await bassCommand(sock, message, chatId);
                break;
            case 'blow':
                await blowCommand(sock, message, chatId);
                break;
            case 'deep':
                await deepCommand(sock, message, chatId);
                break;
            case 'errape':
                await errapeCommand(sock, message, chatId);
                break;
            case 'robot':
                await robotCommand(sock, message, chatId);
                break;
            case 'meme':
                await memeCommand(sock, chatId, message);
                break;
            case 'img':
                await imgCommand(sock, chatId, message);
                break;
            case 'pinterestimg':
                await pinterestImgCommand(sock, chatId, message);
                break;
            case 'bingimg':
                await bingImgCommand(sock, chatId, message);
                break;
            case 'joke':
                await jokeCommand(sock, chatId, message);
                break;
            case 'quote':
                await quoteCommand(sock, chatId, message);
                break;
            case 'fact':
                await factCommand(sock, chatId, message, message);
                break;
            case 'solve':
                await solveCommand(sock, chatId, message, parsedCmd.rawBody.slice(5).trim());
                break;
            case 'age':
                await ageCommand(sock, chatId, message, parsedCmd.args[0]);
                break;
            case 'fliptext':
                await fliptextCommand(sock, chatId, message, parsedCmd.args);
                break;
            case 'setbotfont':
                await setbotfontCommand(sock, chatId, message, parsedCmd.args, senderId, senderIsSudo);
                break;
            case 'brat':
                await bratCommand(sock, chatId, message, rawText.slice(parsedCmd.prefixUsed.length + 4).trim());
                break;
            case 'textsticker':
            case 'text2sticker':
                await textstickerCommand(sock, chatId, message, rawText.slice(parsedCmd.prefixUsed.length + (parsedCmd.commandName === 'textsticker' ? 11 : 12)).trim());
                commandExecuted = true;
                break;
            case 'weather':
                const city = parsedCmd.args.join(' ');
                if (city) await weatherCommand(sock, chatId, message, city);
                else await sock.sendMessage(chatId, { text: 'Please specify a city, e.g., .weather London', ...channelInfo }, { quoted: message });
                break;
            case 'news':
                await newsCommand(sock, chatId);
                break;
            case 'ttt':
            case 'tictactoe':
                await tictactoeCommand(sock, chatId, senderId, parsedCmd.args.join(' '));
                break;
            case 'move':
                const pos = parseInt(parsedCmd.args[0]);
                if (isNaN(pos)) await sock.sendMessage(chatId, { text: 'Provide valid position.', ...channelInfo }, { quoted: message });
                else tictactoeMove(sock, chatId, senderId, pos);
                break;
            case 'topmembers':
                topMembers(sock, chatId, isGroup);
                break;
            case 'hangman':
                startHangman(sock, chatId);
                break;
            case 'guess':
                if (parsedCmd.args[0]) guessLetter(sock, chatId, parsedCmd.args[0]);
                break;
            case 'trivia':
                startTrivia(sock, chatId);
                break;
            case 'answer':
                if (parsedCmd.args.length) answerTrivia(sock, chatId, parsedCmd.args.join(' '));
                break;
            case 'compliment':
                await complimentCommand(sock, chatId, message);
                break;
            case 'insult':
                await insultCommand(sock, chatId, message);
                break;
            case '8ball':
                await eightBallCommand(sock, chatId, parsedCmd.args.join(' '));
                break;
            case 'lyrics':
                await lyricsCommand(sock, chatId, parsedCmd.args.join(' '), message);
                break;
            case 'simp':
                await simpCommand(sock, chatId, message.message?.extendedTextMessage?.contextInfo?.quotedMessage, message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [], senderId);
                break;
            case 'stupid':
            case 'itssostupid':
            case 'iss':
                await stupidCommand(sock, chatId, message.message?.extendedTextMessage?.contextInfo?.quotedMessage, message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [], senderId, parsedCmd.args);
                break;
            case 'dare':
                await dareCommand(sock, chatId, message);
                break;
            case 'truth':
                await truthCommand(sock, chatId, message);
                break;
            case 'clear':
                if (isGroup) await clearCommand(sock, chatId, senderId, message);
                break;
            case 'promote':
                await promoteCommand(sock, chatId, message.message.extendedTextMessage?.contextInfo?.mentionedJid || [], message);
                break;
            case 'demote':
                await demoteCommand(sock, chatId, message.message.extendedTextMessage?.contextInfo?.mentionedJid || [], message);
                break;
            case 'ping':
                await pingCommand(sock, chatId, message);
                break;
            case 'alive':
                await aliveCommand(sock, chatId, message);
                break;
            case 'saymyname':
                await sayMyNameCommand(sock, chatId, message);
                break;
            case 'sad':
            case 'happy':
            case 'angry':
                await animEditCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case 'mention':
                await mentionToggleCommand(sock, chatId, message, parsedCmd.args.join(' '), senderHasOwnerAccess);
                break;
            case 'setmention':
                await setMentionCommand(sock, chatId, message, senderHasOwnerAccess);
                break;
            case 'blur':
                await blurCommand(sock, chatId, message, message.message?.extendedTextMessage?.contextInfo?.quotedMessage);
                break;
            case 'welcome':
                if (isGroup) await welcomeCommand(sock, chatId, message);
                break;
            case 'goodbye':
                if (isGroup) await goodbyeCommand(sock, chatId, message);
                break;
            case 'git':
            case 'github':
            case 'sc':
            case 'script':
            case 'repo':
                await githubCommand(sock, chatId, message);
                break;
            case 'antibadword':
                if (isGroup) await antibadwordCommand(sock, chatId, message, senderId, isSenderAdmin);
                break;
            case 'chatbot':
                if (isGroup) await handleChatbotCommand(sock, chatId, message, parsedCmd.rawBody.slice(7).trim());
                break;
            case 'take':
            case 'steal':
                await takeCommand(sock, chatId, message, parsedCmd.args);
                break;
            case 'flirt':
                await flirtCommand(sock, chatId, message);
                break;
            case 'character':
                await characterCommand(sock, chatId, message);
                break;
            case 'waste':
                await wastedCommand(sock, chatId, message);
                break;
            case 'ship':
                if (isGroup) await shipCommand(sock, chatId, message);
                break;
            case 'groupinfo':
            case 'infogp':
            case 'infogrupo':
                if (isGroup) await groupInfoCommand(sock, chatId, message);
                break;
            case 'resetlink':
            case 'revoke':
            case 'anularlink':
                if (isGroup) await resetlinkCommand(sock, chatId, senderId);
                break;
            case 'staff':
            case 'admins':
            case 'listadmin':
                if (isGroup) await staffCommand(sock, chatId, message);
                break;
            case 'tourl':
            case 'url':
                await urlCommand(sock, chatId, message);
                break;
            case 'emojimix':
            case 'emix':
                await emojimixCommand(sock, chatId, message);
                break;
            case 'tg':
            case 'stickertelegram':
            case 'tgsticker':
            case 'telesticker':
                await stickerTelegramCommand(sock, chatId, message);
                break;
            case 'vv':
                await viewOnceCommand(sock, chatId, message);
                break;
            case 'clearsession':
            case 'clearsesi':
                await clearSessionCommand(sock, chatId, message);
                break;
            case 'autostatus':
                await autoStatusCommand(sock, chatId, message, parsedCmd.args);
                break;
            case 'metallic':
            case 'ice':
            case 'snow':
            case 'impressive':
            case 'matrix':
            case 'light':
            case 'neon':
            case 'devil':
            case 'purple':
            case 'thunder':
            case 'leaves':
            case '1917':
            case 'arena':
            case 'hacker':
            case 'sand':
            case 'blackpink':
            case 'glitch':
            case 'fire':
                await textmakerCommand(sock, chatId, message, rawText, parsedCmd.commandName);
                break;
            case 'antidelete':
                await handleAntideleteCommand(sock, chatId, message, parsedCmd.rawBody.slice(10).trim());
                break;
            case 'surrender':
                await handleTicTacToeMove(sock, chatId, senderId, 'surrender');
                break;
            case 'cleartmp':
                await clearTmpCommand(sock, chatId, message);
                break;
            case 'setpp':
                await setProfilePicture(sock, chatId, message);
                break;
            case 'setgdesc':
                await setGroupDescription(sock, chatId, senderId, rawText.slice(parsedCmd.prefixUsed.length + 8).trim(), message);
                break;
            case 'setgname':
                await setGroupName(sock, chatId, senderId, rawText.slice(parsedCmd.prefixUsed.length + 8).trim(), message);
                break;
            case 'setgpp':
                await setGroupPhoto(sock, chatId, senderId, message);
                break;
            case 'creategr':
                await createGroupCommand(sock, chatId, message, rawText.slice(parsedCmd.prefixUsed.length + 8).trim(), senderId, senderIsSudo);
                break;
            case 'instagram':
            case 'insta':
            case 'ig':
                await instagramCommand(sock, chatId, message);
                break;
            case 'igsc':
                await igsCommand(sock, chatId, message, true);
                break;
            case 'igs':
                await igsCommand(sock, chatId, message, false);
                break;
            case 'fb':
            case 'facebook':
                await facebookCommand(sock, chatId, message);
                break;
            case 'music':
                await playCommand(sock, chatId, message);
                break;
            case 'spotify':
                await spotifyCommand(sock, chatId, message);
                break;
            case 'play':
            case 'mp3':
            case 'ytmp3':
            case 'song':
                await songCommand(sock, chatId, message);
                break;
            case 'video':
            case 'ytmp4':
                await videoCommand(sock, chatId, message);
                break;
            case 'tiktok':
            case 'tt':
                await tiktokCommand(sock, chatId, message);
                break;
            case 'gpt':
            case 'gemini':
                await aiCommand(sock, chatId, message);
                break;
            case 'translate':
            case 'trt':
                await handleTranslateCommand(sock, chatId, message, parsedCmd.rawBody.slice(parsedCmd.commandName === 'translate' ? 9 : 3).trim());
                return;
            case 'ss':
            case 'ssweb':
            case 'screenshot':
                await handleSsCommand(sock, chatId, message, parsedCmd.rawBody.slice(parsedCmd.commandName.length).trim());
                break;
            case 'areact':
            case 'autoreact':
            case 'autoreaction':
                await handleAreactCommand(sock, chatId, message, senderHasOwnerAccess);
                break;
            case 'sudo':
                await sudoCommand(sock, chatId, message);
                break;
            case 'goodnight':
            case 'lovenight':
            case 'gn':
                await goodnightCommand(sock, chatId, message);
                break;
            case 'shayari':
            case 'shayri':
                await shayariCommand(sock, chatId, message);
                break;
            case 'roseday':
                await rosedayCommand(sock, chatId, message);
                break;
            case 'imagine':
            case 'flux':
            case 'dalle':
                await imagineCommand(sock, chatId, message);
                break;
            case 'jid':
                await groupJidCommand(sock, chatId, message);
                break;
            case 'autotyping':
                await autotypingImproved(sock, chatId, message, parsedCmd.args.join(' '));
                commandExecuted = true;
                break;
            case 'autoread':
                await autoreadCommand(sock, chatId, message);
                break;
            case 'heart':
                await handleHeart(sock, chatId, message);
                break;
            case 'horny':
            case 'circle':
            case 'lgbt':
            case 'lolice':
            case 'simpcard':
            case 'tonikawa':
            case 'its-so-stupid':
            case 'namecard':
            case 'tweet':
            case 'ytcomment':
            case 'comrade':
            case 'gay':
            case 'glass':
            case 'jail':
            case 'passed':
            case 'triggered':
                await miscCommand(sock, chatId, message, [parsedCmd.commandName, ...parsedCmd.args]);
                break;
            case 'oogway2':
            case 'oogway':
                await miscCommand(sock, chatId, message, [parsedCmd.commandName, ...parsedCmd.args]);
                break;
            case 'anime':
            case 'animu':
                await animeCommand(sock, chatId, message, parsedCmd.args);
                commandExecuted = true;
                break;
            case 'nom':
            case 'poke':
            case 'cry':
            case 'kiss':
            case 'pat':
            case 'hug':
            case 'wink':
            case 'facepalm':
            case 'face-palm':
            case 'animuquote':
            case 'loli':
                {
                    let sub = parsedCmd.commandName;
                    if (sub === 'facepalm') sub = 'face-palm';
                    if (sub === 'animuquote') sub = 'quote';
                    await animeCommand(sock, chatId, message, [sub]);
                }
                break;
            case 'crop':
                await stickercropCommand(sock, chatId, message);
                commandExecuted = true;
                break;
            case 'pies':
                await piesCommand(sock, chatId, message, parsedCmd.args);
                commandExecuted = true;
                break;
            case 'china':
            case 'indonesia':
            case 'japan':
            case 'korea':
            case 'hijab':
                await piesAlias(sock, chatId, message, parsedCmd.commandName);
                commandExecuted = true;
                break;
            case 'update':
                await updateCommand(sock, chatId, message, senderIsSudo, parsedCmd.args[0] || '');
                commandExecuted = true;
                break;
            case 'removebg':
            case 'rmbg':
            case 'nobg':
                removebgCommand.exec(sock, message, parsedCmd.args);
                break;
            case 'remini':
            case 'enhance':
            case 'upscale':
                await reminiCommand(sock, chatId, message, parsedCmd.args);
                break;
            case 'sora':
                await soraCommand(sock, chatId, message);
                break;
            case 'obfuscate':
                await obfuscateCommand(sock, chatId, message, parsedCmd.args.join(' '));
                break;
            default:
                if (isGroup) {
                    if (rawText) {
                        await handleChatbotResponse(sock, chatId, message, rawText, senderId);
                    }
                    await handleTagDetection(sock, chatId, message, senderId);
                    await handleMentionDetection(sock, chatId, message);
                }
                commandExecuted = false;
                break;
        }

        async function groupJidCommand(sock, chatId, message) {
            const groupJid = message.key.remoteJid;
            if (!groupJid.endsWith('@g.us')) {
                return await sock.sendMessage(chatId, { text: "❌ This command can only be used in a group." });
            }
            await sock.sendMessage(chatId, { text: `✅ Group JID: ${groupJid}` }, { quoted: message });
        }

        if (parsedCmd.isCommand) {
            await addCommandReaction(sock, message);
        }
    } catch (error) {
        console.error('❌ Error in message handler:', error.message);
        if (chatId) {
            await sock.sendMessage(chatId, {
                text: '❌ Failed to process command!',
                ...channelInfo
            });
        }
    }
}

async function handleGroupParticipantUpdate(sock, update) {
    try {
        const { id, participants, action, author } = update;
        if (!id.endsWith('@g.us')) return;

        let isPublic = true;
        try {
            const modeData = JSON.parse(fs.readFileSync('./data/messageCount.json'));
            if (typeof modeData.isPublic === 'boolean') isPublic = modeData.isPublic;
        } catch (e) {}

        if (action === 'promote') {
            if (!isPublic) return;
            await handlePromotionEvent(sock, id, participants, author);
            return;
        }

        if (action === 'demote') {
            if (!isPublic) return;
            await handleDemotionEvent(sock, id, participants, author);
            return;
        }

        if (action === 'add') {
            await handleAntiBot(sock, id, participants);
            await handleJoinEvent(sock, id, participants);
        }

        if (action === 'remove') {
            await handleLeaveEvent(sock, id, participants);
        }
    } catch (error) {
        console.error('Error in handleGroupParticipantUpdate:', error);
    }
}

module.exports = {
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatus: async (sock, status) => {
        await handleStatusUpdate(sock, status);
    }
};
