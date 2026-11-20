const axios = require("axios");

const DEMO_LINK = "https://youtube.com/shorts/5Btds7jtJUQ";
const CHANNEL_LINK = "https://whatsapp.com/channel/0029Vb7pgsF4tRrkS5CECe24";
const CREDIT = "𝐁𝐲 𝐀𝐚𝐝𝐡𝐢𝐱𝐝 ㌅";
const FOOTER = "✅ *Download Completed By Zoro*";

function normalizeChannelUrl(url = CHANNEL_LINK) {
  const cleaned = String(url || CHANNEL_LINK)
    .trim()
    .replace(/^(https?:\/\/)+/i, "https://");
  return cleaned.startsWith("https://") ? cleaned : `https://${cleaned}`;
}

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
  const cleanChannel = normalizeChannelUrl(CHANNEL_LINK);

  if (!input) {
    await sock.sendMessage(
      m.key.remoteJid,
      {
        text:
          `🎬 *YT Shorts Downloader*\n\n` +
          `Usage: *.ytsshort <shorts_url>*\n` +
          `Demo Link: ${DEMO_LINK}\n\n` +
          `${CREDIT}\n${cleanChannel}`,
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
        text:
          `❌ Invalid YouTube Shorts URL.\n` +
          `Demo Link: ${DEMO_LINK}\n\n` +
          `${CREDIT}\n${cleanChannel}`,
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
    const { buffer, contentType } = await fetchVideoBuffer(info.downloadUrl);

    const captionLines = [
      `╭───「 🎬 𝐘𝐓 𝐒𝐇𝐎𝐑𝐓𝐒 」───`,
      `│ 🎥 *${info.title}*`,
    ];

    if (info.duration !== null) {
      captionLines.push(`│ ⏱️ *${info.duration}s*`);
    }

    if (info.channel) {
      captionLines.push(`│ 📺 *${info.channel}*`);
    }

    captionLines.push(`│ ${CREDIT}`);
    captionLines.push(`╰────────────────────`);
    captionLines.push(`${cleanChannel}`);

    await sock.sendMessage(
      m.key.remoteJid,
      {
        video: buffer,
        mimetype: contentType,
        caption: captionLines.join("\n"),
      },
      { quoted: m }
    );

    await sock.sendMessage(
      m.key.remoteJid,
      {
        text: `${FOOTER} • ${CREDIT}`,
      },
      { quoted: m }
    );

    await sock.sendMessage(m.key.remoteJid, { react: { text: "✅", key: m.key } });
  } catch (err) {
    await sock.sendMessage(m.key.remoteJid, { react: { text: "📉", key: m.key } });
    await sock.sendMessage(
      m.key.remoteJid,
      {
        text:
          `❌ Failed to download YT Shorts video.\n` +
          `Demo Link: ${DEMO_LINK}\n\n` +
          `${CREDIT}\n${cleanChannel}`,
      },
      { quoted: m }
    );
  }
}

module.exports = ytsShortPlugin;
