const axios = require('axios');
const APE_KEY = process.env.APE_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

async function checkStreak() {
  try {
    const { data } = await axios.get("https://api.monkeytype.com/users/streak", {
      headers: { Authorization: `Bearer ${APE_KEY}` }
    });

    const today = new Date().toISOString().split('T')[0];
    const lastCompleted = data.data.lastCompleted;
    const streakLength = data.data.length;

    let message = "";
    if (lastCompleted === today) {
      message = `✅ *${streakLength}-day streak maintained!* \\n\\nKeep it going tomorrow!`;
    } else {
      const now = new Date();
      message = now.getHours() < 18
        ? `⚠️ *Streak Alert!* \\n\\nYour ${streakLength}-day streak needs typing today!`
        : `⏰ *EMERGENCY!* \\n\\nYour ${streakLength}-day streak will BREAK soon!`;
    }

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "MarkdownV2"
    });
  } catch (error) {
    console.error("Error:", error.message);
  }
}

checkStreak();
