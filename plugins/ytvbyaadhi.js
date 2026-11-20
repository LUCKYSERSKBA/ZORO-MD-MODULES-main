const axios = require("axios");

const NEWSLETTER_JID = "0029Vb7pgsF4tRrkS5CECe24@newsletter";
const NEWSLETTER_NAME = "𝒁𝑶𝑹𝑶 𝑿𝑴𝑫 𝑶𝒇𝒇𝒊𝒄𝒊𝒂";
const CREDIT_LINE = `> 𝒁𝑶𝑹𝑶 𝐗𝐌𝐃 ⟩ - Bᴏᴛ v0.0.1\n> _Crafted by Aadhi.xd乡_`;

const CONTEXT_INFO = {
  forwardingScore: 999,
  isForwarded: true,
  forwardedNewsletterMessageInfo: {
    newsletterJid: NEWSLETTER_JID,
    newsletterName: NEWSLETTER_NAME,
    serverMessageId: 100,
  },
};

const processedMessages = new Set();

function cleanText(text = "") {
  return String(text).replace(/\n{3,}/g, "\n\n").trim();
}

function getRawText(message) {
  return (
    message?.message?.conversation?.trim() ||
    message?.message?.extendedTextMessage?.text?.trim() ||
    message?.message?.imageMessage?.caption?.trim() ||
    message?.message?.videoMessage?.caption?.trim() ||
    ""
  );
}

function getArgText(rawText = "") {
  const parts = String(rawText).trim().split(/\s+/);
  return parts.slice(1).join(" ").trim();
}

function extractYouTubeUrl(input = "") {
  const match = String(input).match(
    /https?:\/\/(?:[\w-]+\.)?(?:youtube\.com|youtu\.be)\/[^\s]+/i
  );
  return match ? match[0] : "";
}

function parseResolution(q = "") {
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

async function fetchOptionalThumbnail(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 20000,
    });
    const buf = Buffer.from(res.data);
    return buf.length > 0 ? buf : null;
  } catch (e) {
    return null;
  }
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
          text: `❌ Please provide a valid YouTube link.\nExample: .ytvbyaadhi https://youtu.be/xxxxxxx\n\n${CREDIT_LINE}`,
          contextInfo: CONTEXT_INFO,
        },
        { quoted: message }
      );
    }

    try {
      await sock.sendMessage(chatId, { react: { text: "🤍", key: message.key } });
    } catch (e) {}

    const apiUrl = `https://xenosirapis.zone.id/api/ytdlp?url=${encodeURIComponent(ytUrl)}`;
    const { data } = await axios.get(apiUrl, { timeout: 30000 });

    const bestVideo = pickHighestQualityVideo(
      data?.video || data?.result?.video || data?.data?.video
    );
    if (!bestVideo?.downloadUrl) {
      try {
        await sock.sendMessage(chatId, { react: { text: "📉", key: message.key } });
      } catch (e) {}

      return await sock.sendMessage(
        chatId,
        {
          text: `❌ Video not found.\n\n${CREDIT_LINE}`,
          contextInfo: CONTEXT_INFO,
        },
        { quoted: message }
      );
    }

    const title = cleanText(data?.title || "YouTube Video");
    const quality = bestVideo.quality || "HD";
    const sizeText = bestVideo.sizeMB ? `${bestVideo.sizeMB} MB` : "Auto";
    const thumbUrl = data?.thumbnail || data?.result?.thumbnail || data?.data?.thumbnail || null;

    const [videoRes, thumbBuffer] = await Promise.all([
      axios.get(bestVideo.downloadUrl, {
        responseType: "arraybuffer",
        timeout: 120000,
      }),
      fetchOptionalThumbnail(thumbUrl),
    ]);
    const videoBuffer = Buffer.from(videoRes.data);

    const caption = cleanText(
      `◈ ━━━〔 *🤍 𝐘𝐓 𝐕𝐈𝐃𝐄𝐎* 〕━━━ ◈\n` +
        `│ ✦ *Title*   : ${title}\n` +
        `│ ✦ *Quality* : ${quality}\n` +
        `│ ✦ *Size*    : ${sizeText}\n` +
        `◈ ━━━━━━━━━━━━━━━━━━━━━━━━ ◈\n` +
        `${CREDIT_LINE}`
    );

    await sock.sendMessage(
      chatId,
      {
        video: videoBuffer,
        mimetype: "video/mp4",
        jpegThumbnail: thumbBuffer || undefined,
        caption,
        contextInfo: CONTEXT_INFO,
      },
      { quoted: message }
    );

    try {
      await sock.sendMessage(chatId, { react: { text: "✅", key: message.key } });
    } catch (e) {}
  } catch (error) {
    try {
      await sock.sendMessage(chatId, { react: { text: "📉", key: message.key } });
    } catch (e) {}

    await sock.sendMessage(
      chatId,
      {
        text: `❌ Failed to download YouTube video.\n\n${CREDIT_LINE}`,
        contextInfo: CONTEXT_INFO,
      },
      { quoted: message }
    );
  }
}

ytvByAadhiCommand.command = ["ytvbyaadhi"];
ytvByAadhiCommand.description = "Download highest quality YouTube video";

module.exports = ytvByAadhiCommand;
