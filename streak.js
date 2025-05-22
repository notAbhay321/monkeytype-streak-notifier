const axios = require('axios');
const APE_KEY = process.env.APE_KEY;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

async function checkStreak() {
  try {
    // 1. Fetch MonkeyType data
    console.log("Fetching streak data...");
    const { data } = await axios.get("https://api.monkeytype.com/users/streak", {
      headers: { Authorization: `Bearer ${APE_KEY}` }
    });
    console.log("MonkeyType response:", JSON.stringify(data, null, 2));

    // 2. Prepare message
    const today = new Date().toISOString().split('T')[0];
    const lastCompleted = data.data.lastCompleted;
    const streakLength = data.data.length;
    
    let message = lastCompleted === today
      ? `✅ *${streakLength}-day streak maintained!* \\n\\nKeep typing tomorrow!`
      : `⚠️ *Streak Alert!* \\n\\nYour ${streakLength}-day streak needs typing today!`;

    // 3. Send to Telegram
    console.log("Sending to Telegram:", message);
    const tgResponse = await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "MarkdownV2"
      }
    );
    console.log("Telegram response:", JSON.stringify(tgResponse.data, null, 2));

  } catch (error) {
    console.error("FULL ERROR:", error.response?.data || error.message);
    process.exit(1);
  }
}

checkStreak();
