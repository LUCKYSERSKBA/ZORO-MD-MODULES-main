const axios = require("axios");

const DEMO_LINK = "https://youtube.com/shorts/";
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

function isValidShortsUrl(text = "") {
  return /^https?:\/\/((www\.|m\.)?youtube\.com\/(shorts\/[A-Za-z0-9_-]+|watch\?v=[A-Za-z0-9_-]+)|youtu\.be\/[A-Za-z0-9_-]+)/i.test(
    text.trim()
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

  if (contentType.includes("text/html") || contentType.includes("application/json")) {
    throw new Error(`Invalid video content-type received: ${contentType}`);
  }

  return {
    buffer,
    contentType: contentType.includes("video") ? contentType : "video/mp4",
  };
}

async function fetchOptionalThumbnail(url) {
  if (!url) return null;
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

function parseShortsResponse(data) {
  const payload = data?.data && typeof data.data === "object" ? data.data : data;
  if (!payload || payload.success === false || payload.status === false) {
    throw new Error("API returned unsuccessful status");
  }

  const downloadUrl =
    payload.downloadUrl || payload.url || payload.video || payload.mp4;

  if (!downloadUrl) {
    throw new Error("Missing downloadUrl in YT Shorts response");
  }

  return {
    id: payload.id || "",
    title: String(payload.title || "YouTube Shorts").trim(),
    duration: Number.isFinite(Number(payload.duration)) ? Number(payload.duration) : null,
    thumbnail: payload.thumbnail || null,
    channel: payload.channel || null,
    shortsUrl: payload.shortsUrl || DEMO_LINK,
    downloadUrl: String(downloadUrl).trim(),
  };
}

async function ytsShortPlugin(sock, m, { text = "", apiEndpoint }) {
  const input = text.trim();

  if (!input) {
    await sock.sendMessage(
      m.key.remoteJid,
      {
        text: `🎬 *YT Shorts Downloader*\n\nUsage: *.ytsshort <shorts_url>*\nDemo Link: ${DEMO_LINK}\n\n${CREDIT_LINE}`,
        contextInfo: CONTEXT_INFO,
      },
      { quoted: m }
    );
    return;
  }

  if (!isValidShortsUrl(input)) {
    await sock.sendMessage(m.key.remoteJid, { react: { text: "📉", key: m.key } });
    await sock.sendMessage(
      m.key.remoteJid,
      {
        text: `❌ Invalid YouTube Shorts URL.\nDemo Link: ${DEMO_LINK}\n\n${CREDIT_LINE}`,
        contextInfo: CONTEXT_INFO,
      },
      { quoted: m }
    );
    return;
  }

  try {
    await sock.sendMessage(m.key.remoteJid, { react: { text: "🎬", key: m.key } });

    const { data } = await axios.get(apiEndpoint, {
      params: { url: input },
      timeout: 30000,
    });

    const info = parseShortsResponse(data);
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
      m.key.remoteJid,
      {
        video: buffer,
        mimetype: contentType,
        jpegThumbnail: thumbBuffer || undefined,
        caption: lines.join("\n"),
        contextInfo: CONTEXT_INFO,
      },
      { quoted: m }
    );

    await sock.sendMessage(m.key.remoteJid, { react: { text: "✅", key: m.key } });
  } catch (err) {
    await sock.sendMessage(m.key.remoteJid, { react: { text: "📉", key: m.key } });
    await sock.sendMessage(
      m.key.remoteJid,
      {
        text: `❌ Failed to download YT Shorts video.\nDemo Link: ${DEMO_LINK}\n\n${CREDIT_LINE}`,
        contextInfo: CONTEXT_INFO,
      },
      { quoted: m }
    );
  }
}

module.exports = ytsShortPlugin;
