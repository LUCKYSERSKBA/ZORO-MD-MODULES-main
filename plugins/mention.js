// ZORO-MD Mention Plugin (Fixed & Optimized)
const fs = require('fs')
const os = require('os')
const path = require('path')
const axios = require('axios')
const dns = require('dns').promises
const net = require('net')
const mongoose = require('mongoose')
const { spawn } = require('child_process')
const { downloadContentFromMessage } = require('@aadhixd777/baileys') // 🌟 ഇവിടെ നിന്റെ ഒറിജിനൽ ലൈബ്രറി നൽകിയിരിക്കുന്നു
const config = require('../config')
const { cmd } = require('../command')

// 🌟 പുതിയ മോംഗോ ഡിബി കണക്ഷൻ യു.ആർ.എൽ
const MONGO_URI = "mongodb+srv://xdleoxd33_db_user:5Sm5Z3UQLcbKVnSj@cluster0.uh9hwjg.mongodb.net/"

let FFMPEG = 'ffmpeg'
try { FFMPEG = require('ffmpeg-static') || 'ffmpeg' } catch (e) { /* system ffmpeg */ }

const COOLDOWN_MS = 5000
const MAX_MEDIA_BYTES = 20 * 1024 * 1024
const OWNER_ONLY = 'Only the bot owner can use this command.'
const lastReply = new Map()

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
        console.log('[MENTION] read error:', e.message)
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
    try {
        await MentionData.findOneAndUpdate({ sessionId }, update, { upsert: true })
    } catch (e) {
        console.log('[MENTION] save error:', e.code || '', e.message)
        throw e
    }
    dataCache.delete(sessionId)
}

async function resetData(sessionId) {
    await MentionData.deleteOne({ sessionId })
    dataCache.delete(sessionId)
}

const dnsCb = require('dns')
const fallbackResolver = new dns.Resolver()
try { fallbackResolver.setServers(['1.1.1.1', '8.8.8.8']) } catch (e) { /* keep default */ }
const DNS_RETRY = ['ENOTFOUND', 'EAI_AGAIN', 'ESERVFAIL', 'ETIMEOUT', 'ETIMEDOUT']

async function lookupAll(host) {
    try {
        return await dns.lookup(host, { all: true })
    } catch (err) {
        if (!DNS_RETRY.includes(err.code)) throw err
        try {
            const addrs = await fallbackResolver.resolve4(host)
            if (addrs.length) return addrs.map(a => ({ address: a, family: 4 }))
        } catch (e) { /* use the original error */ }
        throw err
    }
}

function smartLookup(hostname, options, cb) {
    if (typeof options === 'function') { cb = options; options = {} }
    dnsCb.lookup(hostname, options, (err, address, family) => {
        if (!err) return cb(null, address, family)
        if (!DNS_RETRY.includes(err.code)) return cb(err)
        fallbackResolver.resolve4(hostname).then(addrs => {
            if (!addrs.length) return cb(err)
            if (options && options.all) return cb(null, addrs.map(a => ({ address: a, family: 4 })))
            cb(null, addrs[0], 4)
        }).catch(() => cb(err))
    })
}

function isPrivateIp(ip) {
    if (net.isIPv6(ip)) {
        const v = ip.toLowerCase()
        if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true
        const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
        return mapped ? isPrivateIp(mapped[1]) : false
    }
    const [a, b] = ip.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

async function assertPublic(u) {
    const url = new URL(u)
    if (!/^https?:$/.test(url.protocol)) throw new Error('BAD_URL')
    const host = url.hostname.replace(/^\[|\]$/g, '')
    const addrs = net.isIP(host) ? [{ address: host }] : await lookupAll(host)
    if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('BLOCKED_URL')
}

async function fetchBuffer(u, maxBytes = MAX_MEDIA_BYTES, hops = 4) {
    let current = u
    for (let i = 0; i <= hops; i++) {
        let res
        try {
            await assertPublic(current)
            res = await axios.get(current, {
                responseType: 'stream', maxRedirects: 0, timeout: 30000, lookup: smartLookup,
                validateStatus: st => st < 400, headers: { 'User-Agent': 'Mozilla/5.0' }
            })
        } catch (e) {
            try { e.host = new URL(current).hostname } catch (_) {}
            throw e
        }
        if (res.status >= 300 && res.headers.location) {
            res.data.destroy()
            current = new URL(res.headers.location, current).href
            await assertPublic(current)
            continue
        }
        if (Number(res.headers['content-length']) > maxBytes) { res.data.destroy(); throw new Error('FILE_TOO_LARGE') }
        const chunks = []
        let size = 0
        for await (const c of res.data) {
            size += c.length
            if (size > maxBytes) { res.data.destroy(); throw new Error('FILE_TOO_LARGE') }
            chunks.push(c)
        }
        return { buffer: Buffer.concat(chunks), contentType: String(res.headers['content-type'] || '').toLowerCase() }
    }
    throw new Error('TOO_MANY_REDIRECTS')
}

function runFfmpeg(args, collect = false) {
    return new Promise((resolve, reject) => {
        const p = spawn(FFMPEG, args, { stdio: ['ignore', collect ? 'pipe' : 'ignore', 'ignore'] })
        const chunks = []
        if (collect) p.stdout.on('data', c => chunks.push(c))
        p.on('error', () => reject(new Error('NO_FFMPEG')))
        p.on('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('FFMPEG_FAILED')))
    })
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
    await runFfmpeg(['-y', '-i', inFile, '-vn', '-t', '60', '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1', '-f', 'ogg', outFile])
    return fs.promises.readFile(outFile)
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
        input = (await fetchBuffer(src, 15 * 1024 * 1024)).buffer
    } else {
        input = await fs.promises.readFile(path.resolve(__dirname, '..', src))
    }
    const result = await toVoiceNote(input)
    defaultAudioCache.set(src, result)
    return result
}

async function sendMention(conn, to, quotedMek, sessionId) {
    const d = await getData(sessionId)
    let audio = null
    if (d.audios && d.audios.length) {
        audio = d.audios[Math.floor(Math.random() * d.audios.length)]
    } else {
        const src = findDefaultAudioSource()
        if (src) {
            try { audio = await loadDefaultAudio(src) } catch (e) { console.log('[MENTION] default audio failed:', e.message) }
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

function mentionedJids(mek) {
    for (const v of Object.values(mek.message || {})) {
        const ids = v?.contextInfo?.mentionedJid
        if (Array.isArray(ids) && ids.length) return ids
    }
    return []
}
const numOf = (jid) => String(jid || '').split('@')[0].split(':')[0]

cmd({ on: 'body', dontAddCommandList: true, filename: __filename },
async (conn, mek, m, ctx) => {
    try {
        const { from, isCmd, botNumber, sessionId, getSettings, body } = ctx
        if (mek.key.fromMe || isCmd) return

        const botNums = new Set([
            botNumber,
            numOf(conn.user?.id),
            numOf(conn.user?.lid),
            numOf(conn.authState?.creds?.me?.lid),
            conn.user?.id,
            conn.user?.lid
        ].filter(Boolean))

        const text = String(body || '')
        const mentionedJidsList = mentionedJids(mek)
        const mentioned = mentionedJidsList.some(j => botNums.has(j) || botNums.has(numOf(j))) || 
                          mentionedJidsList.some(j => text.includes(numOf(j)))
        if (!mentioned) return

        const s = await getSettings ? await getSettings() : { mention: 'on' }
        if (s.mention === 'off') return

        if (Date.now() - (lastReply.get(from) || 0) < COOLDOWN_MS) return
        lastReply.set(from, Date.now())

        await sendMention(conn, from, mek, sessionId)
    } catch (e) {
        console.log('[MENTION ERROR]:', e.message)
    }
})

const MAX_LINKS = 5

const friendlySet = (e) => {
    const m = String(e?.message || e)
    const code = e?.code, status = e?.response?.status
    if (m === 'NO_FFMPEG') return 'ffmpeg is not installed.'
    if (m === 'FFMPEG_FAILED') return 'Could not convert that file.'
    if (m === 'FILE_TOO_LARGE') return 'That file is too large.'
    if (m === 'BLOCKED_URL' || m === 'BAD_URL') return 'That link is not allowed.'
    if (m === 'BAD_FORMAT') return 'Wrong format. Use /setmention <link> type/audio'
    if (m === 'ONLY_AUDIO') return 'Only type/audio is supported.'
    if (m === 'DB_OFFLINE') return 'Database is offline right now.'
    return 'Could not save that. Please try again.'
}

function parseFormat(q) {
    const text = q.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'")
    const urls = [...new Set((text.match(/https?:\/\/[^\s,]+/gi) || []).map(u => u.replace(/[)\].;]+$/, '')))]
    const type = ((text.match(/type\/(audio|video|image|text)/i) || [])[1] || '').toLowerCase() || null
    return { urls, type }
}

async function applyFormat(sessionId, q) {
    const { urls, type } = parseFormat(q)
    if (!urls.length) throw new Error('BAD_FORMAT')
    if (type && type !== 'audio') throw new Error('ONLY_AUDIO')
    if (urls.length > MAX_LINKS) throw new Error('TOO_MANY_LINKS')

    const audios = []
    for (const u of urls) audios.push(await toVoiceNote((await fetchBuffer(u)).buffer))

    await saveData(sessionId, { audios, kind: 'audio' }, ['audio', 'mediaSrc'])
    return audios.length
}

cmd({
    pattern: "setmention",
    alias: ["setmentionreply", "mentionset"],
    desc: "Set up the mention voice note.",
    category: "settings",
    react: "📣",
    filename: __filename
},
async (conn, mek, m, { from, q, quoted, prefix, sessionId, reply }) => {
    try {
        if (!dbReady()) return reply('Database is offline')

        const sel = pickMedia(quoted)
        const raw = (q || '').trim()
        const parts = raw.split(/\s+/).filter(Boolean)
        const sub = (parts[0] || '').toLowerCase()

        if (/^(https?:\/\/|type\/)/i.test(raw)) {
            const count = await applyFormat(sessionId, raw)
            return reply(`Mention saved: ${count} voice note${count > 1 ? 's' : ''}\nTry it: ${prefix}setmention test`)
        }

        if (sel && ['audioMessage', 'videoMessage'].includes(sel.type) && (!sub || sub === 'audio' || sub === 'vn')) {
            const audio = await toVoiceNote(await downloadMedia(sel))
            await saveData(sessionId, { audios: [audio], kind: 'audio' }, ['audio', 'mediaSrc'])
            return reply(`Mention voice note saved.\nTry it: ${prefix}setmention test`)
        }

        if (sub === 'wave') {
            const mode = (parts[1] || '').toLowerCase()
            if (mode !== 'dna' && mode !== 'random') {
                const d0 = await getData(sessionId)
                return reply(`Wave style: *${(d0.wave || 'random').toUpperCase()}*\nUsage: ${prefix}setmention wave dna | random`)
            }
            await saveData(sessionId, { wave: mode })
            return reply(`Wave style set to *${mode.toUpperCase()}*`)
        }

        if (sub === 'reset' || sub === 'remove' || sub === 'delete') {
            await resetData(sessionId)
            return reply('Mention settings removed. Defaults will be used.')
        }
        
        if (sub === 'test' || sub === 'preview') {
            const ok = await sendMention(conn, from, mek, sessionId)
            if (!ok) return reply(`No voice note is set yet. Use *${prefix}setmention <link> type/audio* first.`)
            return
        }

        const d = await getData(sessionId)
        reply(
            `╭─❖ 『 📣 ᴍᴇɴᴛɪᴏɴ ꜱᴇᴛᴛɪɴɢꜱ 』 ❖\n` +
            `│ ✦ ᴡᴀᴠᴇ ➱ ${(d.wave || 'random').toUpperCase()}\n` +
            `│ ✦ ᴠᴏɪᴄᴇ ɴᴏᴛᴇꜱ ➱ ${d.audios && d.audios.length ? d.audios.length + ' custom' : 'default'}\n` +
            `╰──────────────⍟\n\n` +
            `Usage:\n` +
            `• ${prefix}setmention <link> type/audio\n` +
            `• Reply to audio with ${prefix}setmention\n` +
            `• ${prefix}setmention reset`
        )
    } catch (e) { console.log(e); reply('>' + friendlySet(e)) }
})
