// ZORO-MD Final Bulletproof Mention Plugin (MongoDB, PTT, Universal LID & JID Match)
const fs = require('fs')
const os = require('os')
const path = require('path')
const axios = require('axios')
const mongoose = require('mongoose')
const { spawn } = require('child_process')
const { downloadContentFromMessage } = require('@aadhixd777/baileys')
const config = require('../config')

const MentionData = mongoose.models.MentionData || mongoose.model('MentionData', new mongoose.Schema({
    sessionId: { type: String, unique: true, index: true },
    audios: [Buffer],
    audio: Buffer,
    kind: String,
    status: { type: String, default: 'on' }
}, { collection: 'mentiondata' }))

const dataCache = new Map()
const dbReady = () => mongoose.connection.readyState === 1

const cleanNum = (jid) => String(jid || '').replace(/[^0-9]/g, '')

const getSessionId = (sock) => {
    const botUser = sock.user || {}
    const botJid = botUser.id ? (sock.decodeJid ? sock.decodeJid(botUser.id) : botUser.id) : ''
    return cleanNum(botJid) || config.SESSION_ID || "default_session"
}

async function getData(sessionId) {
    if (dataCache.has(sessionId)) return dataCache.get(sessionId)
    if (!dbReady()) return { status: 'on', audios: [] }
    try {
        const doc = await MentionData.findOne({ sessionId })
        const audios = (doc && Array.isArray(doc.audios) ? doc.audios : []).filter(a => a && a.length).map(a => Buffer.from(a))
        if (!audios.length && doc && doc.audio && doc.audio.length) audios.push(Buffer.from(doc.audio))
        const data = { 
            audios, 
            status: doc && doc.status ? doc.status : 'on'
        }
        dataCache.set(sessionId, data)
        return data
    } catch (e) {
        return { status: 'on', audios: [] }
    }
}

async function saveData(sessionId, fields, unset = []) {
    if (!dbReady()) throw new Error('DB_OFFLINE')
    const update = {}
    if (Object.keys(fields).length > 0) update.$set = fields
    const unsetKeys = unset.filter(k => !(k in fields))
    if (unsetKeys.length > 0) {
        update.$unset = Object.fromEntries(unsetKeys.map(k => [k, 1]))
    }
    if (Object.keys(update).length === 0) return
    await MentionData.findOneAndUpdate({ sessionId }, update, { upsert: true })
    dataCache.delete(sessionId)
}

async function resetData(sessionId) {
    if (!dbReady()) return
    await MentionData.deleteOne({ sessionId })
    dataCache.delete(sessionId)
}

async function withTemp(fn) {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mention-'))
    try { return await fn(dir) }
    finally { fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {}) }
}

let FFMPEG = 'ffmpeg'
try { FFMPEG = require('ffmpeg-static') || 'ffmpeg' } catch (e) {}

const MAX_MEDIA_BYTES = 20 * 1024 * 1024
const COOLDOWN_MS = 2000 // സ്പാം തടയാൻ ചെറിയ കോൾഡൗൺ
const lastReply = new Map()

const toVoiceNote = (input) => withTemp(async (dir) => {
    const inFile = path.join(dir, 'in'), outFile = path.join(dir, 'out.ogg')
    await fs.promises.writeFile(inFile, input)
    return new Promise((resolve, reject) => {
        const p = spawn(FFMPEG, ['-y', '-i', inFile, '-vn', '-t', '60', '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1', '-f', 'ogg', outFile])
        p.on('error', () => reject(new Error('NO_FFMPEG')))
        p.on('close', code => code === 0 ? fs.promises.readFile(outFile).then(resolve).catch(reject) : reject(new Error('FFMPEG_FAILED')))
    })
})

const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage']
function pickMedia(quoted) {
    if (!quoted || typeof quoted !== 'object') return null
    let msg = quoted
    for (let i = 0; i < 4; i++) {
        const inner = msg.viewOnceMessage?.message || msg.viewOnceMessageV2?.message ||
            msg.viewOnceMessageV2Extension?.message || msg.ephemeralMessage?.message ||
            msg.documentWithCaptionMessage?.message
        if (!inner) break
        msg = inner
    }
    const type = MEDIA_TYPES.find(t => msg[t])
    return type ? { type, node: msg[type] } : null
}

async function downloadMedia(sel) {
    const stream = await downloadContentFromMessage(sel.node, sel.type.replace('Message', ''))
    const chunks = []
    let size = 0
    for await (const c of stream) {
        size += c.length
        if (size > MAX_MEDIA_BYTES) throw new Error('FILE_TOO_LARGE')
        chunks.push(c)
    }
    return Buffer.concat(chunks)
}

function findDefaultAudioSource() {
    const set = process.env.MENTION_AUDIO || config.MENTION_AUDIO
    if (set) return set
    for (const f of ['mention.mp3', 'mention.ogg', 'mention.opus', 'mention.m4a', 'mention.wav']) {
        if (fs.existsSync(path.join(__dirname, '..', 'media', f))) return path.join('media', f)
    }
    return null
}

const defaultAudioCache = new Map()
async function loadDefaultAudio(src) {
    if (defaultAudioCache.has(src)) return defaultAudioCache.get(src)
    let input
    if (/^https?:\/\//i.test(src)) {
        const res = await axios.get(src, { responseType: 'arraybuffer' })
        input = Buffer.from(res.data)
    } else {
        input = await fs.promises.readFile(path.resolve(__dirname, '..', src))
    }
    const result = await toVoiceNote(input)
    defaultAudioCache.set(src, result)
    return result
}

async function sendMention(conn, to, quotedMek, sessionId) {
    const d = await getData(sessionId)
    if (d.status !== 'on') return false

    let audio = null
    if (d.audios && d.audios.length) {
        audio = d.audios[Math.floor(Math.random() * d.audios.length)]
    } else {
        const src = findDefaultAudioSource()
        if (src) {
            try { audio = await loadDefaultAudio(src) } catch (e) {}
        }
    }
    if (!audio) return false

    await conn.sendMessage(to, {
        audio,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true
    }, { quoted: quotedMek })
    return true
}

// 🌟 BULLETPROOF MENTION DETECTION (Zero Failure Universal Match)
async function handleMentionDetection(sock, chatId, message) {
    try {
        if (!message || !message.message) return
        if (message.key?.fromMe) return

        const targetChat = message.key?.remoteJid || chatId
        if (!targetChat) return

        const sessionId = getSessionId(sock)
        const botNum = sessionId
        if (!botNum) return

        const d = await getData(sessionId)
        if (d.status !== 'on') return

        const msg = message.message || {}
        
        // എല്ലാതരം ContextInfo-കളും പരതുന്നു
        const contextInfo = msg.extendedTextMessage?.contextInfo || 
                            msg.imageMessage?.contextInfo || 
                            msg.videoMessage?.contextInfo || 
                            msg.audioMessage?.contextInfo ||
                            msg.documentMessage?.contextInfo ||
                            msg.stickerMessage?.contextInfo ||
                            msg.ephemeralMessage?.message?.extendedTextMessage?.contextInfo ||
                            msg.viewOnceMessage?.message?.extendedTextMessage?.contextInfo ||
                            Object.values(msg).find(v => v?.contextInfo)?.contextInfo

        let mentionedList = []
        if (contextInfo && Array.isArray(contextInfo.mentionedJid)) {
            mentionedList = mentionedList.concat(contextInfo.mentionedJid)
        }
        if (Array.isArray(msg.extendedTextMessage?.mentionedJid)) {
            mentionedList = mentionedList.concat(msg.extendedTextMessage.mentionedJid)
        }
        if (Array.isArray(msg.mentionedJid)) {
            mentionedList = mentionedList.concat(msg.mentionedJid)
        }

        // Universal Clean Number Match (LID & JID Bypass)
        const isMentioned = mentionedList.some(jid => cleanNum(jid) === botNum)

        // Text / Number mention fallback
        const textContent = (
            msg.conversation || 
            msg.extendedTextMessage?.text || 
            msg.imageMessage?.caption || 
            msg.videoMessage?.caption || ''
        ).toString()

        const isTextMatch = textContent.includes(botNum) || textContent.includes(`@${botNum}`)

        if (!isMentioned && !isTextMatch) return

        // Cooldown check
        if (Date.now() - (lastReply.get(targetChat) || 0) < COOLDOWN_MS) return
        lastReply.set(targetChat, Date.now())

        await sendMention(sock, targetChat, message, sessionId)
    } catch (err) {
        console.log('[MENTION ERROR]:', err.message)
    }
}

async function mentionToggleCommand(sock, chatId, message, args, isOwner) {
    try {
        if (!isOwner) return sock.sendMessage(chatId, { text: '❌ Only bot owner can use this command!' }, { quoted: message })
        const v = (args || '').trim().toLowerCase()
        if (v !== 'on' && v !== 'off') {
            return sock.sendMessage(chatId, { text: `╭─❖ 『 📣 ᴍᴇɴᴛɪᴏɴ ꜱᴛᴀᴛᴜꜱ 』 ❖\n│ • Usage: .mention on\n│ • Usage: .mention off\n╰──────────────⍟` }, { quoted: message })
        }
        const sessionId = getSessionId(sock)
        await saveData(sessionId, { status: v })
        
        const statusText = v === 'on' ? '🟢 ENABLED (Voice Note Active)' : '🔴 DISABLED (Silenced)'
        return sock.sendMessage(chatId, { text: `✅ Mention reply feature is now *${statusText}* for this session!` }, { quoted: message })
    } catch (e) {
        return sock.sendMessage(chatId, { text: `❌ Error: ${e.message}` }, { quoted: message })
    }
}

async function setMentionCommand(sock, chatId, message, isOwner) {
    try {
        if (!isOwner) return sock.sendMessage(chatId, { text: '❌ Only bot owner can use this command!' }, { quoted: message })
        if (!dbReady()) return sock.sendMessage(chatId, { text: '❌ Database is offline!' }, { quoted: message })

        const raw = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').trim()
        const parts = raw.split(/\s+/).filter(Boolean)
        const sub = (parts[1] || '').toLowerCase()
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage
        const sessionId = getSessionId(sock)

        const sel = pickMedia(quoted)

        if (/^(https?:\/\/)/i.test(parts[1])) {
            const url = parts[1]
            const res = await axios.get(url, { responseType: 'arraybuffer' })
            const audio = await toVoiceNote(Buffer.from(res.data))
            await saveData(sessionId, { audios: [audio], kind: 'audio' }, ['audio', 'mediaSrc'])
            return sock.sendMessage(chatId, { text: `✅ Mention voice note successfully saved from URL!` }, { quoted: message })
        }

        if (sel && ['audioMessage', 'videoMessage'].includes(sel.type)) {
            const audio = await toVoiceNote(await downloadMedia(sel))
            await saveData(sessionId, { audios: [audio], kind: 'audio' }, ['audio', 'mediaSrc'])
            return sock.sendMessage(chatId, { text: `✅ Mention voice note successfully saved from reply!` }, { quoted: message })
        }

        if (sub === 'reset' || sub === 'remove' || sub === 'delete') {
            await resetData(sessionId)
            return sock.sendMessage(chatId, { text: '✅ Mention settings completely reset!' }, { quoted: message })
        }

        if (sub === 'test' || sub === 'preview') {
            const ok = await sendMention(sock, chatId, message, sessionId)
            if (!ok) return sock.sendMessage(chatId, { text: `❌ Mention is OFF or no voice set yet!` }, { quoted: message })
            return
        }

        return sock.sendMessage(chatId, {
            text: `╭─❖ 『 📣 ᴍᴇɴᴛɪᴏɴ ꜱᴇᴛᴛɪɴɢꜱ ᴍᴇɴᴜ 』 ❖\n` +
                  `│ • .mention on / off\n` +
                  `│ • .setmention <direct-audio-link>\n` +
                  `│ • Reply audio/video with .setmention\n` +
                  `│ • .setmention test\n` +
                  `│ • .setmention reset\n` +
                  `╰──────────────⍟`
        }, { quoted: message })
    } catch (e) {
        return sock.sendMessage(chatId, { text: `❌ Error: ${e.message}` }, { quoted: message })
    }
}

async function cleanupOnLogout(sock) {
    try {
        const sessionId = getSessionId(sock)
        if (sessionId) {
            await resetData(sessionId)
        }
    } catch (e) {}
}

module.exports = { handleMentionDetection, mentionToggleCommand, setMentionCommand, cleanupOnLogout }
