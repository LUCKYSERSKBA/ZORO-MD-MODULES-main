const axios = require("axios");

const NEWSLETTER_JID = "0029Vb7pgsF4tRrkS5CECe24@newsletter";
const NEWSLETTER_NAME = "𝒁𝑶𝑹𝑶 𝑿𝑴𝑫 𝑶𝒇𝒇𝒊𝒄𝒊𝒂";
const CREDIT_LINE = `> 𝒁𝑶𝑹𝑶 𝐗𝐌𝐃 ⟩ - Bᴏᴛ v0.0.1\n> _Crafted by Aadhi.xd乡_`;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

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

function parseQueryAndLimit(argText = "") {
  const cleaned = String(argText).trim();
  if (!cleaned) return { query: "", limit: DEFAULT_LIMIT };

  const match = cleaned.match(/^(.*?)\s+(\d+)$/);
  if (match && match[1].trim()) {
    const parsedLimit = parseInt(match[2], 10);
    const clampedLimit = Math.max(1, Math.min(MAX_LIMIT, parsedLimit || DEFAULT_LIMIT));
    return {
      query: match[1].trim(),
      limit: clampedLimit,
    };
  }

  return {
    query: cleaned,
    limit: DEFAULT_LIMIT,
  };
}

function getMimeType(item = {}) {
  const fmt = String(item.format || "").toLowerCase();
  if (fmt === "png") return "image/png";
  if (fmt === "webp") return "image/webp";
  return "image/jpeg";
}

async function pinHuntCommand(sock, chatId, message) {
  try {
    if (message?.key?.id) {
      if (processedMessages.has(message.key.id)) return;
      processedMessages.add(message.key.id);
      setTimeout(() => processedMessages.delete(message.key.id), 5 * 60 * 1000);
    }

    const rawText = getRawText(message);
    const argText = getArgText(rawText);
    const { query, limit } = parseQueryAndLimit(argText);

    if (!query) {
      return await sock.sendMessage(
        chatId,
        {
          text: `❌ Please enter a search name and optional count.\nExample: .pinhunt anime hd 5\n\n${CREDIT_LINE}`,
          contextInfo: CONTEXT_INFO,
        },
        { quoted: m }
      );
    }

    try {
      await sock.sendMessage(chatId, { react: { text: "🍭", key: message.key } });
    } catch (e) {}

    const apiUrl = `https://xenosirapis.zone.id/api/pinterest?query=${encodeURIComponent(
      query
    )}&limit=${limit}`;
    const { data } = await axios.get(apiUrl, { timeout: 30000 });

    const list = Array.isArray(data?.results) ? data.results : [];
    const selected = list
      .filter((item) => item && (item.downloadUrl || item.image || item.thumbnail))
      .slice(0, limit);

    if (selected.length === 0) {
      try {
        await sock.sendMessage(chatId, { react: { text: "📉", key: message.key } });
      } catch (e) {}

      return await sock.sendMessage(
        chatId,
        {
          text: `❌ No Pinterest images found for "${query}".\n\n${CREDIT_LINE}`,
          contextInfo: CONTEXT_INFO,
        },
        { quoted: message }
      );
    }

    let sentCount = 0;

    for (let i = 0; i < selected.length; i++) {
      const item = selected[i];
      const imgUrl = item.downloadUrl || item.image || item.thumbnail;

      try {
        const imgRes = await axios.get(imgUrl, {
          responseType: "arraybuffer",
          timeout: 60000,
        });
        const imgBuffer = Buffer.from(imgRes.data);
        const mimetype = getMimeType(item);
        const title = cleanText(item.title || "Pinterest Image");

        const caption = cleanText(
          `◈ ━━━〔 *🍭 𝐏𝐈𝐍𝐇𝐔𝐍𝐓* 〕━━━ ◈\n` +
            `│ ✦ *Title* : ${title} (${i + 1}/${selected.length})\n` +
            `│ ✦ *Query* : ${query}\n` +
            `◈ ━━━━━━━━━━━━━━━━━━━━━━━━ ◈\n` +
            `${CREDIT_LINE}`
        );

        await sock.sendMessage(
          chatId,
          {
            image: imgBuffer,
            mimetype,
            caption,
            contextInfo: CONTEXT_INFO,
          },
          { quoted: i === 0 ? message : undefined }
        );

        sentCount++;
      } catch (err) {}
    }

    if (sentCount === 0) {
      try {
        await sock.sendMessage(chatId, { react: { text: "📉", key: message.key } });
      } catch (e) {}

      return await sock.sendMessage(
        chatId,
        {
          text: `❌ Failed to download Pinterest images.\n\n${CREDIT_LINE}`,
          contextInfo: CONTEXT_INFO,
        },
        { quoted: message }
      );
    }

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
        text: `❌ Failed to search Pinterest.\n\n${CREDIT_LINE}`,
        contextInfo: CONTEXT_INFO,
      },
      { quoted: message }
    );
  }
}

pinHuntCommand.command = ["pinhunt"];
pinHuntCommand.description = "Search and download Pinterest images by query and count";

module.exports = pinHuntCommand;
