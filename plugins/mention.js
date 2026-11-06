import mongoose from 'mongoose'
import axios from 'axios'
import fs from 'fs'
import path from 'path'

// Define MongoDB Schema for Mention Audio with session isolation (botNum)
const mentionSchema = new mongoose.Schema({
    botNum: { type: String, required: true, unique: true }, // Session ID / Bot Number
    audioUrl: { type: String, required: true },
    mimetype: { type: String, default: 'audio/ogg; codecs=opus' },
    wave: { type: Array, default: [30, 61, 80, 25, 40, 50, 70] },
    updatedAt: { type: Date, default: Date.now }
})

const Mention = mongoose.models.Mention || mongoose.model('Mention', mentionSchema)

// Fun waveform generator
function funnyWaveform(arr) {
    return Buffer.from(arr.map(v => Math.min(100, Math.max(0, v))))
}

export default {
    command: ['mention', 'setmention'],
    async execute(conn, mek, m, { args, q, isOwner, botNum, from }) {
        try {
            const command = m.command || (args && args[0])

            // 1. HANDLE SETMENTION (Owner Only & Session Isolated)
            if (command === 'setmention') {
                // Security Check: Only the bot owner/user can modify their session's mention audio
                if (!isOwner) {
                    return m.reply('❌ This is an owner command! Only the bot owner can set the mention voice note.')
                }

                let audioUrl = ''

                // Check if replying to an audio/ptt/video
                const quoted = m.quoted ? m.quoted : mek
                const mime = (quoted.msg || quoted).mimetype || ''

                if (mime && (mime.includes('audio') || mime.includes('video'))) {
                    // Download media buffer and we can handle/store its direct link or buffer info
                    // For cloud hosting (Koyeb/MongoDB), storing direct HTTP URLs or catbox/telegraph links is best,
                    // but if they replied to a media, we can download and upload/store or grab media stream.
                    // Let's check if the quoted message has a direct downloadable media url or stream:
                    const mediaStream = await quoted.download?.()
                    if (mediaStream) {
                        // If your bot has a media uploader (like catbox or Telegraph), you can upload it here,
                        // Or if a direct URL was provided in args:
                        // Let's fallback to checking if args contains a URL.
                    }
                }

                // If a direct URL is provided in the command arguments (e.g. .setmention https://.../audio.mp3)
                if (q && q.startsWith('http')) {
                    audioUrl = q.trim()
                } else if (args && args.length > 0 && args[0].startsWith('http')) {
                    audioUrl = args[0].trim()
                }

                // If still no url, check if they replied with a direct downloadable url or if we need a valid link
                if (!audioUrl) {
                    return m.reply('⚠️ Please provide a direct audio/voice note URL or reply to an audio message with a valid link!\n\n*Example:* `.setmention https://example.com/audio.mp3`')
                }

                // Save or update in MongoDB isolated by botNum (Session ID)
                await Mention.findOneAndUpdate(
                    { botNum: botNum || 'default' },
                    { 
                        audioUrl: audioUrl,
                        mimetype: mime.includes('audio') ? mime : 'audio/ogg; codecs=opus',
                        updatedAt: Date.now()
                    },
                    { upsert: true, new: true }
                )

                return m.reply('✅ Success! Custom mention voice note has been saved securely to MongoDB for your session.')
            }

            // 2. MENTION TRIGGER (Handled automatically when someone mentions the bot)
            // This part is called when mention detection triggers
        } catch (e) {
            console.error('Error in mention plugin:', e)
            if (m && m.reply) m.reply('❌ An error occurred while processing the mention audio.')
        }
    },

    // Helper function called by your main.js mention detector
    async handleMentionDetection(conn, mek, m, botNum, to) {
        try {
            // Fetch audio configuration strictly isolated by this session's botNum from MongoDB
            const data = await Mention.findOne({ botNum: botNum || 'default' })

            // If no voice note is configured in MongoDB for this session, do nothing (No local fallback folder!)
            if (!data || !data.audioUrl) {
                return false // No voice note set yet
            }

            // Fetch the audio buffer from the saved URL in MongoDB
            const response = await axios.get(data.audioUrl, { responseType: 'arraybuffer' })
            const audio = Buffer.from(response.data)

            // Send as native WhatsApp Voice Note (PTT)
            await conn.sendMessage(to, {
                audio,
                mimetype: data.mimetype || 'audio/ogg; codecs=opus',
                ptt: true,
                waveform: funnyWaveform(data.wave)
            }, { quoted: mek })

            return true
        } catch (e) {
            console.error('Error sending mention voice note from DB:', e)
            return false
        }
    }
}
