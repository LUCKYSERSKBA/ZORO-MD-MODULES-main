const fs = require('fs');

const words = ['javascript', 'bot', 'hangman', 'whatsapp', 'nodejs'];
let hangmanGames = {};

function startHangman(sock, chatId) {
    const word = words[Math.floor(Math.random() * words.length)];
    const maskedWord = '_ '.repeat(word.length).trim();

    hangmanGames[chatId] = {
        word,
        maskedWord: maskedWord.split(' '),
        guessedLetters: [],
        wrongGuesses: 0,
        maxWrongGuesses: 6,
    };

    sock.sendMessage(chatId, { text: `🎮 Hangman Game Started!\nThe word is: ${maskedWord}\nGuess a letter using `.guess <letter>`` });
}

function guessLetter(sock, chatId, letterInput) {
    if (!hangmanGames[chatId]) {
        return;
    }

    if (!letterInput || typeof letterInput !== 'string') return;
    const letter = letterInput.trim().toLowerCase();
    if (letter.length !== 1) return; // ഒരൊറ്റ അക്ഷരം മാത്രം ഗെസ്സ് ചെയ്യാൻ

    const game = hangmanGames[chatId];
    const { word, guessedLetters, maskedWord, maxWrongGuesses } = game;

    if (guessedLetters.includes(letter)) {
        sock.sendMessage(chatId, { text: `⚠️ You already guessed "${letter}". Try another letter.` });
        return;
    }

    guessedLetters.push(letter);

    if (word.includes(letter)) {
        for (let i = 0; i < word.length; i++) {
            if (word[i] === letter) {
                maskedWord[i] = letter;
            }
        }
        
        if (!maskedWord.includes('_')) {
            sock.sendMessage(chatId, { text: `🎉 Congratulations! You guessed the word correctly: *${word}*` });
            delete hangmanGames[chatId];
        } else {
            sock.sendMessage(chatId, { text: `✅ Good guess!\nWord: ${maskedWord.join(' ')}` });
        }
    } else {
        game.wrongGuesses += 1;
        const triesLeft = maxWrongGuesses - game.wrongGuesses;

        if (game.wrongGuesses >= maxWrongGuesses) {
            sock.sendMessage(chatId, { text: `❌ Game Over! You ran out of tries.\nThe correct word was: *${word}*` });
            delete hangmanGames[chatId];
        } else {
            sock.sendMessage(chatId, { text: `❌ Wrong guess! You have ${triesLeft} tries left.` });
        }
    }
}

module.exports = { startHangman, guessLetter };
