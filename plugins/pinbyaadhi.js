const axios = require("axios");

const DEFAULT_API = "https://xenosirapis.zone.id/api/klickpin";
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

async function fetchVideoBuffer(url) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 90000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 13; Infinix X6836) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
      Referer: "https://www.pinterest.com/",
      Accept: "*/*",
    },
  });

  const contentType = String(res.headers["content-type"] || "").toLowerCase();
  const buffer = Buffer.from(res.data);

  if (!buffer || buffer.length < 1024) {
    throw new Error("Downloaded video buffer is empty or too small");
  }

  if (
    contentType.includes("image/") ||
    contentType.includes("text/html") ||
    contentType.includes("application/json")
  ) {
    throw new Error(`Invalid video content-type received: ${contentType}`);
  }

  return {
    buffer,
    contentType: contentType.includes("video") ? contentType : "video/mp4",
  };
}

async function fetchOptionalThumbnail(url) {
  if (!url || !String(url).startsWith("http")) return null;
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 20000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 13; Infinix X6836) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
      },
    });
    const buf = Buffer.from(res.data);
    return buf.length > 0 ? buf : null;
  } catch (e) {
    return null;
  }
}

function parseKlickPinVideoResponse(data) {
  const payload =
    data?.data && typeof data.data === "object"
      ? data.data
      : data?.result && typeof data.result === "object"
      ? data.result
      : data;

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid KlickPin API response");
  }

  if (payload.success === false || payload.status === false) {
    throw new Error("KlickPin API returned unsuccessful status");
  }

  const mediaType = String(payload.type || "").toLowerCase();
  if (mediaType && mediaType !== "video") {
    throw new Error(`Expected video, received type: ${mediaType}`);
  }

  const videoListUrl =
    Array.isArray(payload.videos) && payload.videos.length > 0
      ? payload.videos.find((v) => v && typeof v.url === "string" && v.url.startsWith("http"))?.url ||
        (typeof payload.videos[0] === "string" ? payload.videos[0] : null)
      : null;

  const videoUrl =
    payload.mp4 ||
    payload.downloadUrl ||
    videoListUrl ||
    (mediaType === "video" ? payload.url || payload.video : null);

  if (!videoUrl || typeof videoUrl !== "string" || !videoUrl.startsWith("http")) {
    throw new Error("Missing video URL in KlickPin response");
  }

  const title = String(payload.title || "Pinterest Video").trim();
  const quality = String(
    payload.quality ||
      (Array.isArray(payload.videos) && payload.videos[0]?.quality) ||
      "default"
  ).trim();
  const thumbnail =
    typeof payload.thumbnail === "string" && payload.thumbnail.startsWith("http")
      ? payload.thumbnail
      : null;

  return {
    videoUrl: videoUrl.trim(),
    title,
    quality,
    thumbnail,
  };
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
          text: `📌 *Pinterest Video Downloader*\n\nUsage: *.pinbyaadhi <pinterest_video_url>*\n\n${CREDIT_LINE}`,
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
          text: `❌ Invalid Pinterest URL.\n\n${CREDIT_LINE}`,
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

    const parsed = parseKlickPinVideoResponse(data);
    const [{ buffer, contentType }, thumbBuffer] = await Promise.all([
      fetchVideoBuffer(parsed.videoUrl),
      fetchOptionalThumbnail(parsed.thumbnail),
    ]);

    const caption =
      `◈ ━━━〔 *💗 𝐏𝐈𝐍𝐓𝐄𝐑𝐄𝐒𝐓 𝐕𝐈𝐃𝐄𝐎* 〕━━━ ◈\n` +
      `│ ✦ *Title*   : ${parsed.title}\n` +
      `│ ✦ *Quality* : ${parsed.quality}\n` +
      `◈ ━━━━━━━━━━━━━━━━━━━━━━━━ ◈\n` +
      `${CREDIT_LINE}`;

    await sock.sendMessage(
      targetChatId,
      {
        video: buffer,
        mimetype: contentType,
        jpegThumbnail: thumbBuffer || undefined,
        caption,
        contextInfo: CONTEXT_INFO,
      },
      quoteOpt
    );

    if (message?.key) {
      try {
        await sock.sendMessage(targetChatId, { react: { text: "✅", key: message.key } });
      } catch (e) {}
    }
  } catch (err) {
    console.error("[pinbyaadhi error]:", err?.response?.data || err?.message || err);
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
        text: `❌ Failed to download Pinterest video.\n\n${CREDIT_LINE}`,
        contextInfo: CONTEXT_INFO,
      },
      message?.key ? { quoted: message } : undefined
    );
  }
}

pinByAadhiCommand.command = ["pinbyaadhi"];
pinByAadhiCommand.description = "Download Pinterest videos only";

module.exports = pinByAadhiCommand;
