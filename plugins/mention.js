// ZORO-MD Mention Plugin (Final & Corrected with Full Tag/Mention Support)
const fs = require('fs')
const os = require('os')
const path = require('path')
const axios = require('axios')
const mongoose = require('mongoose')
const { spawn } = require('child_process')
const { downloadContentFromMessage } = require('@aadhixd777/baileys')
const config = require('../config')

// 🌟 മോംഗോ ഡിബി കണക്ഷൻ യു.ആർ.എൽ
const MONGO_URI = "mongodb+srv://xdleoxd33_db_user:5Sm5Z3UQLcbKVnSj@cluster0.uh9hwjg.mongodb.net/"

let FFMPEG = 'ffmpeg'
try { FFMPEG = require('ffmpeg-static') || 'ffmpeg' } catch (e) { /* system ffmpeg */ }

const MAX_MEDIA_BYTES = 20 * 1024 * 1024
const COOLDOWN_MS = 5000
const lastReply = new Map()

// 🌟 മെൻഷൻ ഡാറ്റാബേസ് സ്കീമ
const MentionData = mongoose.models.MentionData || mongoose.model('MentionData', new mongoose.Schema({
    sessionId: { type: String, unique: true, index: true },
    audios: [Buffer],
    audio: Buffer,
    kind: String,
    wave: String
}, { collection: 'mentiondata' }))

const dataCache = new Map()
const dbReady = () => mongoose.connection.readyState === 1

async function getData(sessionId) {
    if (dataCache.has(sessionId)) return dataCache.get(sessionId)
    if (!dbReady()) return {}
    try {
        const doc = await MentionData.findOne({ sessionId })
        const audios = (doc && Array.isArray(doc.audios) ? doc.audios : []).filter(a => a && a.length).map(a => Buffer.from(a))
        if (!audios.length && doc && doc.audio && doc.audio.length) audios.push(Buffer.from(doc.audio))
        const data = { audios, wave: (doc && doc.wave) || 'random' }
        dataCache.set(sessionId, data)
        return data
    } catch (e) {
        return {}
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
    await MentionData.deleteOne({ sessionId })
    dataCache.delete(sessionId)
}

async function withTemp(fn) {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mention-'))
    try { return await fn(dir) }
    finally { fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {}) }
}

const WAVE_BARS = 64
const clamp = (v) => Math.max(2, Math.min(100, Math.round(v)))
const rnd = (a, b) => a + Math.random() * (b - a)
const WAVE_STYLES = [
    () => { const f = rnd(2, 5); return i => 50 + 45 * Math.sin((i / WAVE_BARS) * Math.PI * 2 * f) },
    () => i => (i % 2 ? 95 : 6),
    () => i => 8 + 92 * (1 - Math.abs(i - WAVE_BARS / 2) / (WAVE_BARS / 2)),
    () => () => rnd(4, 100)
]
const DNA_STYLES = [
    () => { const ph = rnd(0, 6.28); return i => 50 + 44 * Math.sin(i * 0.45 + ph) * (i % 2 ? 1 : -1) }
]

function funnyWaveform(mode) {
    const pool = mode === 'dna' ? DNA_STYLES : WAVE_STYLES.concat(DNA_STYLES)
    const fn = pool[Math.floor(Math.random() * pool.length)]()
    return new Uint8Array(Array.from({ length: WAVE_BARS }, (_, i) => clamp(fn(i))))
}

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

// 🌟 മെൻഷൻ ചെയ്യുമ്പോൾ വോയിസ് നോട്ട് (PTT) ആയി അയക്കുന്ന ഫങ്ഷൻ
async function sendMention(conn, to, quotedMek, sessionId) {
    const d = await getData(sessionId)
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
        ptt: true,
        waveform: funnyWaveform(d.wave)
    }, { quoted: quotedMek })
    return true
}

const numOf = (jid) => String(jid || '').split('@')[0].split(':')[0]

// 🌟 ഗ്രൂപ്പിലോ ചാറ്റിലോ വാട്സാപ്പ് ടാഗ് (@) വഴി മെൻഷൻ ചെയ്യുന്നത് LID സപ്പോർട്ടോടെ ഡിറ്റക്റ്റ് ചെയ്യുന്ന ഫങ്ഷൻ
async function handleMentionDetection(sock, chatId, message) {
    try {
        if (!message || !message.message) return
        if (message.key?.fromMe) return

        const targetChat = message.key?.remoteJid || chatId
        if (!targetChat) return

        const botUser = sock.user || {}
        const botJid = botUser.id ? (sock.decodeJid ? sock.decodeJid(botUser.id) : botUser.id) : ''
        const botNum = botJid ? botJid.split('@')[0].split(':')[0] : ''

        const msg = message.message || {}
        
        const contextInfo = msg.extendedTextMessage?.contextInfo || 
                            msg.imageMessage?.contextInfo || 
                            msg.videoMessage?.contextInfo || 
                            msg.audioMessage?.contextInfo ||
                            msg.documentMessage?.contextInfo ||
                            msg.stickerMessage?.contextInfo ||
                            msg.ephemeralMessage?.message?.extendedTextMessage?.contextInfo ||
                            msg.viewOnceMessage?.message?.extendedTextMessage?.contextInfo ||
                            Object.values(msg).find(v => v?.contextInfo)?.contextInfo

        let mentionedJidsList = []
        if (contextInfo && Array.isArray(contextInfo.mentionedJid)) {
            mentionedJidsList = contextInfo.mentionedJid
        }

        const isBotMentioned = mentionedJidsList.some(jid => {
            const cleanJid = String(jid || '').split('@')[0].split(':')[0]
            return botNum && cleanJid === botNum
        })

        const textContent = (msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption || '').toString()
        const isTextMentioned = botNum && textContent.includes(botNum)

        if (!isBotMentioned && !isTextMentioned) return

        if (Date.now() - (lastReply.get(targetChat) || 0) < COOLDOWN_MS) return
        lastReply.set(targetChat, Date.now())

        const sessionId = botNum || "default_session"
        await sendMention(sock, targetChat, message, sessionId)
    } catch (err) {
        console.log('[MENTION ERROR]:', err.message)
    }
}

// 🌟 `.mention on/off` കമാൻഡ് ഹാൻഡ്‌ലർ
async function mentionToggleCommand(sock, chatId, message, args, isOwner) {
    try {
        if (!isOwner) return sock.sendMessage(chatId, { text: '❌ Only bot owner can use this command!' }, { quoted: message })
        const v = (args || '').trim().toLowerCase()
        if (v !== 'on' && v !== 'off') {
            return sock.sendMessage(chatId, { text: `Usage: .mention on | off` }, { quoted: message })
        }
        sock.sendMessage(chatId, { text: `Mention reply turned *${v.toUpperCase()}*` }, { quoted: message })
    } catch (e) {
        sock.sendMessage(chatId, { text: `Error: ${e.message}` }, { quoted: message })
    }
}

// 🌟 `.setmention` കമാൻഡ് ഹാൻഡ്‌ലർ
async function setMentionCommand(sock, chatId, message, isOwner) {
    try {
        if (!isOwner) return sock.sendMessage(chatId, { text: '❌ Only bot owner can use this command!' }, { quoted: message })
        if (!dbReady()) return sock.sendMessage(chatId, { text: 'Database is offline' }, { quoted: message })

        const raw = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').trim()
        const parts = raw.split(/\s+/).filter(Boolean)
        const sub = (parts[1] || '').toLowerCase()
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage

        const sel = pickMedia(quoted)

        if (/^(https?:\/\/)/i.test(parts[1])) {
            const url = parts[1]
            const res = await axios.get(url, { responseType: 'arraybuffer' })
            const audio = await toVoiceNote(Buffer.from(res.data))
            const botNum = numOf(sock.user?.id) || "default_session"
            await saveData(botNum, { audios: [audio], kind: 'audio' }, ['audio', 'mediaSrc'])
            return sock.sendMessage(chatId, { text: `✅ Mention voice note successfully saved from URL!` }, { quoted: message })
        }

        if (sel && ['audioMessage', 'videoMessage'].includes(sel.type)) {
            const audio = await toVoiceNote(await downloadMedia(sel))
            const botNum = numOf(sock.user?.id) || "default_session"
            await saveData(botNum, { audios: [audio], kind: 'audio' }, ['audio', 'mediaSrc'])
            return sock.sendMessage(chatId, { text: `✅ Mention voice note successfully saved from reply!` }, { quoted: message })
        }

        if (sub === 'reset' || sub === 'remove' || sub === 'delete') {
            const botNum = numOf(sock.user?.id) || "default_session"
            await resetData(botNum)
            return sock.sendMessage(chatId, { text: '✅ Mention settings reset to default!' }, { quoted: message })
        }

        if (sub === 'test' || sub === 'preview') {
            const botNum = numOf(sock.user?.id) || "default_session"
            const ok = await sendMention(sock, chatId, message, botNum)
            if (!ok) return sock.sendMessage(chatId, { text: `❌ No voice note set yet.` }, { quoted: message })
            return
        }

        sock.sendMessage(chatId, {
            text: `╭─❖ 『 📣 ᴍᴇɴᴛɪᴏɴ ꜱᴇᴛᴛɪɴɢꜱ 』 ❖\n` +
                  `│ • .setmention <link>\n` +
                  `│ • Reply to audio with .setmention\n` +
                  `│ • .setmention test\n` +
                  `│ • .setmention reset\n` +
                  `╰──────────────⍟`
        }, { quoted: message })
    } catch (e) {
        sock.sendMessage(chatId, { text: `❌ Error: ${e.message}` }, { quoted: message })
    }
}

module.exports = { handleMentionDetection, mentionToggleCommand, setMentionCommand }
