/**
 * Improved Anti-Call Command
 * Features: Custom messages, decline/block options, beautiful styling
 */

const fs = require('fs');
const path = require('path');

const ANTICALL_PATH = './data/anticall.json';

// Track recently-notified callers to avoid spamming messages
const antiCallNotified = new Set();

function readState() {
    try {
        if (!fs.existsSync(ANTICALL_PATH)) {
            return { 
                enabled: false, 
                mode: 'decline', // 'decline' or 'block'
                message: '╭━━━━━━━━━━━━━━━━━━━╮\n│  📵 *Call Rejected*  │\n╰━━━━━━━━━━━━━━━━━━━╯\n\n✨ _Hello! I\'m currently unavailable to take calls._\n\n💬 *Please send me a text message instead, and I\'ll get back to you as soon as possible!*\n\n🌟 _Thank you for understanding._\n\n_— Automated by ZORO MD 🚀_'
            };
        }
        const raw = fs.readFileSync(ANTICALL_PATH, 'utf8');
        const data = JSON.parse(raw || '{}');
        return {
            enabled: !!data.enabled,
            mode: data.mode || 'decline',
            message: data.message || '╭━━━━━━━━━━━━━━━━━━━╮\n│  📵 *Call Rejected*  │\n╰━━━━━━━━━━━━━━━━━━━╯\n\n✨ _Hello! I\'m currently unavailable to take calls._\n\n💬 *Please send me a text message instead, and I\'ll get back to you as soon as possible!*\n\n🌟 _Thank you for understanding._\n\n_— Automated by ZORO MD 🚀_'
        };
    } catch {
        return { 
            enabled: false, 
            mode: 'decline',
            message: '╭━━━━━━━━━━━━━━━━━━━╮\n│  📵 *Call Rejected*  │\n╰━━━━━━━━━━━━━━━━━━━╯\n\n✨ _Hello! I\'m currently unavailable to take calls._\n\n💬 *Please send me a text message instead, and I\'ll get back to you as soon as possible!*\n\n🌟 _Thank you for understanding._\n\n_— Automated by ZORO MD 🚀_'
        };
    }
}

function writeState(enabled, mode, message) {
    try {
        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
        const current = readState();
        const payload = {
            enabled: enabled !== undefined ? !!enabled : current.enabled,
            mode: mode !== undefined ? mode : current.mode,
            message: message !== undefined ? message : current.message
        };
        fs.writeFileSync(ANTICALL_PATH, JSON.stringify(payload, null, 2));
    } catch (e) {
        console.error('Error writing anticall state:', e);
    }
}

async function anticallCommand(sock, chatId, message, args) {
    const state = readState();
    
    // Safely handle both Array and String args input
    const argStr = Array.isArray(args) ? args.join(' ') : (typeof args === 'string' ? args : '');
    const parts = argStr.trim().split(/\s+/).filter(Boolean);
    const sub = parts[0]?.toLowerCase();

    // Help text with beautiful styling
    const helpText = `╭━━━━━━━━━━━━━━━━━╮
│   📵 *ANTI-CALL*   │
╰━━━━━━━━━━━━━━━━━╯

*Commands:*
┌─────────────────
│ .anticall on
├ Enable anti-call
│
│ .anticall off
├ Disable anti-call
│
│ .anticall mode <decline/block>
├ Set action mode
│   • decline - Reject calls
│   • block - Block caller
│
│ .anticall setmsg <text>
├ Set custom message
│
│ .anticall status
├ Show current settings
└─────────────────

*Current Status:*
• Enabled: ${state.enabled ? '✅ ON' : '❌ OFF'}
• Mode: ${state.mode === 'block' ? '🚫 BLOCK' : '📵 DECLINE'}
• Message: ${state.message.substring(0, 50)}...`;

    if (!sub || !['on', 'off', 'status', 'mode', 'setmsg'].includes(sub)) {
        await sock.sendMessage(chatId, { text: helpText }, { quoted: message });
        return;
    }

    if (sub === 'status') {
        await sock.sendMessage(chatId, { text: helpText }, { quoted: message });
        return;
    }

    if (sub === 'mode') {
        const modeValue = parts[1]?.toLowerCase();
        if (!modeValue || !['decline', 'block'].includes(modeValue)) {
            await sock.sendMessage(chatId, { 
                text: '❌ Invalid mode!\n\nUsage: .anticall mode <decline/block>\n\n• *decline* - Reject incoming calls\n• *block* - Block callers automatically' 
            }, { quoted: message });
            return;
        }
        
        writeState(state.enabled, modeValue, state.message);
        const icon = modeValue === 'block' ? '🚫' : '📵';
        await sock.sendMessage(chatId, { 
            text: `✅ Anti-call mode set to ${icon} *${modeValue.toUpperCase()}*` 
        }, { quoted: message });
        return;
    }

    if (sub === 'setmsg') {
        const customMsg = parts.slice(1).join(' ').trim();
        if (!customMsg) {
            await sock.sendMessage(chatId, { 
                text: '❌ Please provide a message!\n\nUsage: .anticall setmsg <your custom message>\n\nExample:\n.anticall setmsg Sorry, I cannot take calls right now. Please text me instead!' 
            }, { quoted: message });
            return;
        }
        
        writeState(state.enabled, state.mode, customMsg);
        await sock.sendMessage(chatId, { 
            text: `✅ Anti-call message updated!\n\n*New message:*\n${customMsg}` 
        }, { quoted: message });
        return;
    }

    const enable = sub === 'on';
    writeState(enable, state.mode, state.message);
    
    const statusIcon = enable ? '✅' : '❌';
    const statusText = enable ? 'ENABLED' : 'DISABLED';
    const modeIcon = state.mode === 'block' ? '🚫' : '📵';
    
    await sock.sendMessage(chatId, { 
        text: `${statusIcon} *Anti-call ${statusText}*\n\nMode: ${modeIcon} ${state.mode.toUpperCase()}\n\nIncoming calls will be automatically ${state.mode === 'block' ? 'blocked' : 'declined'}.` 
    }, { quoted: message });
}

// Handle call events
async function handleCall(sock, callData) {
    const state = readState();
    if (!state.enabled) return;

    try {
        const { from, id, status } = callData;
        if (!from) return;
        
        if (status === 'offer') {
            // Attempt to reject the call using available methods
            try {
                if (typeof sock.rejectCall === 'function' && id) {
                    await sock.rejectCall(id, from);
                } else if (typeof sock.sendCallOfferAck === 'function' && id) {
                    await sock.sendCallOfferAck(id, from, 'reject');
                }
            } catch (rejectError) {
                console.error('Error rejecting call:', rejectError);
            }
            
            // Send custom message (only once within a short window to avoid spam)
            if (!antiCallNotified.has(from)) {
                antiCallNotified.add(from);
                setTimeout(() => antiCallNotified.delete(from), 60000); // Clear after 1 minute
                try {
                    await sock.sendMessage(from, { text: state.message });
                } catch (msgError) {
                    console.error('Error sending message:', msgError);
                }
            }
            
            // Block if mode is 'block'
            if (state.mode === 'block') {
                try {
                    await sock.updateBlockStatus(from, 'block');
                    console.log(`📵 Blocked caller: ${from}`);
                } catch (blockError) {
                    console.error('Error blocking caller:', blockError);
                }
            }
            
            console.log(`📵 Auto-${state.mode}d call from: ${from}`);
        }
    } catch (error) {
        console.error('Error handling call:', error);
    }
}

module.exports = { anticallCommand, handleCall, readState };
