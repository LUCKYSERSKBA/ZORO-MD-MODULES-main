const axios = require("axios");

const DEMO_LINK = "https://youtube.com/shorts/dJXjbxbiDTk";
const DEFAULT_API = "https://xenosirapis.zone.id/api/ytshortsdl";
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

function isValidShortsUrl(text = "") {
  return /^https?:\/\/((www\.|m\.)?youtube\.com\/(shorts\/[A-Za-z0-9_-]+|watch\?v=[A-Za-z0-9_-]+)|youtu\.be\/[A-Za-z0-9_-]+)/i.test(
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
      Referer: "https://www.youtube.com/",
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
  if (!url || !/^https?:\/\//i.test(String(url).trim())) return null;
  try {
    const res = await axios.get(String(url).trim(), {
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

function parseYtShortsResponse(data) {
  const payload =
    data?.data && typeof data.data === "object"
      ? data.data
      : data?.result && typeof data.result === "object"
      ? data.result
      : data;

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid YT Shorts API response");
  }

  if (payload.success === false || payload.status === false) {
    throw new Error("YT Shorts API returned unsuccessful status");
  }

  const downloadUrl =
    payload.downloadUrl ||
    payload.mp4 ||
    payload.videoUrl ||
    payload.video ||
    payload.url;

  if (!downloadUrl || typeof downloadUrl !== "string" || !downloadUrl.startsWith("http")) {
    throw new Error("Missing downloadUrl in YT Shorts response");
  }

  const title = String(payload.title || "YouTube Shorts").trim();
  const rawDuration = payload.duration ?? payload.lengthSeconds ?? null;
  const duration = Number.isFinite(Number(rawDuration)) ? Number(rawDuration) : null;
  const thumbnail =
    typeof payload.thumbnail === "string" && payload.thumbnail.startsWith("http")
      ? payload.thumbnail
      : null;
  const channel =
    typeof payload.channel === "string" && payload.channel.trim()
      ? payload.channel.trim()
      : null;

  return {
    title,
    duration,
    thumbnail,
    channel,
    downloadUrl: downloadUrl.trim(),
  };
}

async function ytsShortCommand(sock, chatId, message, opts = {}) {
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
          text: `🎬 *YT Shorts Downloader*\n\nUsage: *.ytsshort <shorts_url>*\nDemo Link: ${DEMO_LINK}\n\n${CREDIT_LINE}`,
          contextInfo: CONTEXT_INFO,
        },
        quoteOpt
      );
      return;
    }

    if (!isValidShortsUrl(input)) {
      if (message?.key) {
        try {
          await sock.sendMessage(targetChatId, { react: { text: "📉", key: message.key } });
        } catch (e) {}
      }
      await sock.sendMessage(
        targetChatId,
        {
          text: `❌ Invalid YouTube Shorts URL.\n\n${CREDIT_LINE}`,
          contextInfo: CONTEXT_INFO,
        },
        quoteOpt
      );
      return;
    }

    if (message?.key) {
      try {
        await sock.sendMessage(targetChatId, { react: { text: "🎬", key: message.key } });
      } catch (e) {}
    }

    const { data } = await axios.get(apiEndpoint, {
      params: { url: input },
      timeout: 30000,
    });

    const info = parseYtShortsResponse(data);
    const [{ buffer, contentType }, thumbBuffer] = await Promise.all([
      fetchVideoBuffer(info.downloadUrl),
      fetchOptionalThumbnail(info.thumbnail),
    ]);

    const lines = [
      `◈ ━━━〔 *🎬 𝐘𝐓 𝐒𝐇𝐎𝐑𝐓𝐒* 〕━━━ ◈`,
      `│ ✦ *Title*    : ${info.title}`,
    ];

    if (info.channel) {
      lines.push(`│ ✦ *Channel*  : ${info.channel}`);
    }

    if (info.duration !== null) {
      lines.push(`│ ✦ *Duration* : ${info.duration}s`);
    }

    lines.push(`◈ ━━━━━━━━━━━━━━━━━━━━━━━━ ◈`);
    lines.push(`${CREDIT_LINE}`);

    await sock.sendMessage(
      targetChatId,
      {
        video: buffer,
        mimetype: contentType,
        jpegThumbnail: thumbBuffer || undefined,
        caption: lines.join("\n"),
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
    console.error("[ytsshort error]:", err?.response?.data || err?.message || err);
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
        text: `❌ Failed to download YT Shorts video.\n\n${CREDIT_LINE}`,
        contextInfo: CONTEXT_INFO,
      },
      message?.key ? { quoted: message } : undefined
    );
  }
}

ytsShortCommand.command = ["ytsshort"];
ytsShortCommand.description = "Download YouTube Shorts video";

module.exports = ytsShortCommand;
