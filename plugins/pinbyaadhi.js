const axios = require("axios");

const DEMO_LINK = "https://pin.it/2Uu82fPs2";
const DEFAULT_API = "https://xenosirapis.zone.id/api/pinterestdl";
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
  const parts = String(rawText || "").trim().split(/\s+/);
  return parts.slice(1).join(" ").trim();
}

function isValidPinUrl(text = "") {
  return /^https?:\/\/(www\.)?(pin\.it\/[A-Za-z0-9_-]+|([a-z]{2}\.)?pinterest\.com\/pin\/[A-Za-z0-9_-]+)/i.test(
    String(text || "").trim()
  );
}

async function fetchBuffer(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 60000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 13; Infinix X6836) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
      Referer: "https://www.pinterest.com/",
      Accept: "*/*",
    },
  });

  const buffer = Buffer.from(res.data);
  if (!buffer || buffer.length === 0) {
    throw new Error("Empty media buffer received");
  }

  return {
    buffer,
    contentType: (res.headers["content-type"] || "").toLowerCase(),
  };
}

function parsePinResponse(data) {
  const payload = data?.data && typeof data.data === "object" ? data.data : data;
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid API response");
  }

  const rawType = String(payload.type || "").toLowerCase();
  const videoCandidate =
    payload.mp4 ||
    (Array.isArray(payload.videos) && payload.videos[0]?.url) ||
    (rawType === "video" ? payload.downloadUrl || payload.url || payload.video : null);

  const imageCandidate =
    rawType === "image"
      ? payload.downloadUrl || payload.image || payload.url || payload.thumbnail
      : payload.image || payload.thumbnail;

  const title = (payload.title || "Pinterest Media").trim();
  const thumbnail = payload.thumbnail || payload.image || null;

  if (rawType === "video" || videoCandidate) {
    const mediaUrl = videoCandidate || payload.downloadUrl;
    if (!mediaUrl) throw new Error("Missing Pinterest video URL");
    return { kind: "video", mediaUrl, title, thumbnail };
  }

  if (rawType === "image" || imageCandidate) {
    const mediaUrl = imageCandidate || payload.downloadUrl;
    if (!mediaUrl) throw new Error("Missing Pinterest image URL");
    return { kind: "image", mediaUrl, title, thumbnail };
  }

  throw new Error("Unsupported Pinterest media type");
}

async function pinByAadhiCommand(sock, chatId, message, opts = {}) {
  try {
    const targetChatId = chatId || message?.key?.remoteJid;
    if (!sock || !targetChatId) return;

    const quoteOpt = message?.key ? { quoted: message } : undefined;
    const rawText = getRawText(message);
    const input = (opts?.text || getArgText(rawText) || "").trim();
    const apiEndpoint = opts?.apiEndpoint || DEFAULT_API;

    if (!input) {
      await sock.sendMessage(
        targetChatId,
        {
          text: `📌 *Pinterest Downloader*\n\nUsage: *.pinbyaadhi <pinterest_url>*\nDemo Link: ${DEMO_LINK}\n\n${CREDIT_LINE}`,
          contextInfo: CONTEXT_INFO,
        },
        quoteOpt
      );
      return;
    }

    if (!isValidPinUrl(input)) {
      if (message?.key) {
        try {
          await sock.sendMessage(targetChatId, { react: { text: "📉", key: message.key } });
        } catch (e) {}
      }
      await sock.sendMessage(
        targetChatId,
        {
          text: `❌ Invalid Pinterest URL.\nDemo Link: ${DEMO_LINK}\n\n${CREDIT_LINE}`,
          contextInfo: CONTEXT_INFO,
        },
        quoteOpt
      );
      return;
    }

    if (message?.key) {
      try {
        await sock.sendMessage(targetChatId, { react: { text: "💗", key: message.key } });
      } catch (e) {}
    }

    const { data } = await axios.get(apiEndpoint, {
      params: { url: input },
      timeout: 30000,
    });

    const parsed = parsePinResponse(data);
    const { buffer, contentType } = await fetchBuffer(parsed.mediaUrl);

    let thumbBuffer = null;
    if (parsed.kind === "video" && parsed.thumbnail) {
      try {
        const thumbRes = await fetchBuffer(parsed.thumbnail);
        thumbBuffer = thumbRes.buffer;
      } catch (e) {}
    }

    const mediaLabel = parsed.kind === "video" ? "Video Reel" : "HD Image";
    const caption =
      `◈ ━━━〔 *💗 𝐏𝐈𝐍𝐓𝐄𝐑𝐄𝐒𝐓 𝐌𝐄𝐃𝐈𝐀* 〕━━━ ◈\n` +
      `│ ✦ *Title* : ${parsed.title}\n` +
      `│ ✦ *Format* : ${mediaLabel}\n` +
      `◈ ━━━━━━━━━━━━━━━━━━━━━━━━ ◈\n` +
      `${CREDIT_LINE}`;

    if (parsed.kind === "video") {
      await sock.sendMessage(
        targetChatId,
        {
          video: buffer,
          mimetype: contentType.includes("video") ? contentType : "video/mp4",
          jpegThumbnail: thumbBuffer || undefined,
          caption,
          contextInfo: CONTEXT_INFO,
        },
        quoteOpt
      );
    } else {
      const mime = contentType.includes("png")
        ? "image/png"
        : contentType.includes("webp")
        ? "image/webp"
        : "image/jpeg";

      await sock.sendMessage(
        targetChatId,
        {
          image: buffer,
          mimetype: mime,
          caption,
          contextInfo: CONTEXT_INFO,
        },
        quoteOpt
      );
    }

    if (message?.key) {
      try {
        await sock.sendMessage(targetChatId, { react: { text: "✅", key: message.key } });
      } catch (e) {}
    }
  } catch (err) {
    const targetChatId = chatId || message?.key?.remoteJid;
    if (!sock || !targetChatId) return;

    if (message?.key) {
      try {
        await sock.sendMessage(targetChatId, { react: { text: "📉", key: message.key } });
      } catch (e) {}
    }
    await sock.sendMessage(
      targetChatId,
      {
        text: `❌ Failed to download Pinterest media.\nDemo Link: ${DEMO_LINK}\n\n${CREDIT_LINE}`,
        contextInfo: CONTEXT_INFO,
      },
      message?.key ? { quoted: message } : undefined
    );
  }
}

pinByAadhiCommand.command = ["pinbyaadhi"];
pinByAadhiCommand.description = "Download Pinterest video or image";

module.exports = pinByAadhiCommand;
