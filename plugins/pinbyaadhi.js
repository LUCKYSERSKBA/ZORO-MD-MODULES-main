const axios = require("axios");

const DEMO_LINK = "https://pin.it/2Uu82fPs2";
const CHANNEL_LINK = "https://whatsapp.com/channel/0029Vb7pgsF4tRrkS5CECe24";
const CREDIT = "𝐁𝐲 𝐀𝐚𝐝𝐡𝐢𝐱𝐝 ㌅";
const FOOTER = "✅ *Download Completed By Zoro*";

function isValidPinUrl(text = "") {
  return /^https?:\/\/(www\.)?(pin\.it\/[A-Za-z0-9_-]+|([a-z]{2}\.)?pinterest\.com\/pin\/[A-Za-z0-9_-]+)/i.test(
    text.trim()
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

  if (rawType === "video" || videoCandidate) {
    const mediaUrl = videoCandidate || payload.downloadUrl;
    if (!mediaUrl) throw new Error("Missing Pinterest video URL");
    return { kind: "video", mediaUrl, title };
  }

  if (rawType === "image" || imageCandidate) {
    const mediaUrl = imageCandidate || payload.downloadUrl;
    if (!mediaUrl) throw new Error("Missing Pinterest image URL");
    return { kind: "image", mediaUrl, title };
  }

  throw new Error("Unsupported Pinterest media type");
}

async function pinByAadhiPlugin(sock, m, { text = "", apiEndpoint }) {
  const input = text.trim();

  if (!input) {
    await sock.sendMessage(
      m.key.remoteJid,
      {
        text:
          `📌 *Pinterest Downloader*\n\n` +
          `Usage: *.pinbyaadhi <pinterest_url>*\n` +
          `Demo Link: ${DEMO_LINK}\n\n` +
          `${CREDIT}\n${CHANNEL_LINK}`,
      },
      { quoted: m }
    );
    return;
  }

  if (!isValidPinUrl(input)) {
    await sock.sendMessage(m.key.remoteJid, { react: { text: "📉", key: m.key } });
    await sock.sendMessage(
      m.key.remoteJid,
      {
        text:
          `❌ Invalid Pinterest URL.\n` +
          `Demo Link: ${DEMO_LINK}\n\n` +
          `${CREDIT}\n${CHANNEL_LINK}`,
      },
      { quoted: m }
    );
    return;
  }

  try {
    await sock.sendMessage(m.key.remoteJid, { react: { text: "💗", key: m.key } });

    const { data } = await axios.get(apiEndpoint, {
      params: { url: input },
      timeout: 30000,
    });

    const parsed = parsePinResponse(data);
    const { buffer, contentType } = await fetchBuffer(parsed.mediaUrl);

    const caption =
      `╭───「 💗 𝐏𝐈𝐍𝐓𝐄𝐑𝐄𝐒𝐓 」───\n` +
      `│ ✨ *${parsed.title}*\n` +
      `│ ${CREDIT}\n` +
      `╰────────────────────\n` +
      `${CHANNEL_LINK}`;

    if (parsed.kind === "video") {
      await sock.sendMessage(
        m.key.remoteJid,
        {
          video: buffer,
          mimetype: contentType.includes("video") ? contentType : "video/mp4",
          caption,
        },
        { quoted: m }
      );
    } else {
      const mime = contentType.includes("png")
        ? "image/png"
        : contentType.includes("webp")
        ? "image/webp"
        : "image/jpeg";

      await sock.sendMessage(
        m.key.remoteJid,
        {
          image: buffer,
          mimetype: mime,
          caption,
        },
        { quoted: m }
      );
    }

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
          `❌ Failed to download Pinterest media.\n` +
          `Demo Link: ${DEMO_LINK}\n\n` +
          `${CREDIT}\n${CHANNEL_LINK}`,
      },
      { quoted: m }
    );
  }
}

module.exports = pinByAadhiPlugin;
