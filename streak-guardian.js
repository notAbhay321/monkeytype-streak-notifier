// streak-guardian.js
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class StreakGuardian {
  constructor() {
    this.apeKey = process.env.MONKEYTYPE_APE_KEY;
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.testMode = process.env.TEST_MODE;
    this.historyFile = 'streak-history.json';
  }

  async run() {
    try {
      console.log('🚀 MonkeyType Streak Guardian starting...');
      
      const userData = await this.fetchMonkeyTypeData();
      const history = await this.loadHistory();
      const currentTime = new Date();
      
      // Determine reminder type
      const reminderType = this.testMode && this.testMode !== 'current' 
        ? this.testMode 
        : this.determineReminderType(currentTime);
      
      console.log(`📋 Reminder type: ${reminderType}`);
      
      if (reminderType === 'weekly') {
        await this.sendWeeklyReport(userData, history);
      } else {
        await this.sendDailyReminder(userData, history, reminderType);
      }
      
      // Update history
      await this.updateHistory(userData, history);
      
      console.log('✅ Streak Guardian completed successfully');
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      await this.sendErrorNotification(error);
    }
  }

  async fetchMonkeyTypeData() {
    console.log('📡 Fetching MonkeyType data...');
    
    const response = await axios.get('https://api.monkeytype.com/users', {
      headers: {
        'Authorization': `ApeKey ${this.apeKey}`,
        'Accept': 'application/json',
        'User-Agent': 'StreakGuardian/1.0'
      }
    });
    
    if (!response.data || !response.data.data) {
      throw new Error('Invalid response from MonkeyType API');
    }
    
    return response.data.data;
  }

  determineReminderType(currentTime) {
    const hour = currentTime.getUTCHours();
    const day = currentTime.getUTCDay();
    
    if (day === 0 && hour === 10) return 'weekly';
    if (hour === 7) return 'morning';
    if (hour === 12) return 'midday';
    if (hour === 16) return 'afternoon';
    if (hour === 21) return 'evening';
    if (hour === 23) return 'warning';
    
    return 'current';
  }

  async sendDailyReminder(userData, history, reminderType) {
    const streakData = this.analyzeStreak(userData, history);
    const message = this.generateMessage(streakData, reminderType);
    
    await this.sendTelegramMessage(message.text, message.emoji, message.buttons);
  }

  analyzeStreak(userData, history) {
    const currentStreak = userData.streak?.length || 0;
    const lastResultTime = userData.streak?.lastResultTimestamp;
    const totalTests = userData.typingStats?.completedTests || 0;
    const avgWpm = userData.typingStats?.avgWpm || 0;
    const avgAcc = userData.typingStats?.avgAcc || 0;
    
    const today = new Date().toDateString();
    const lastTestDate = lastResultTime ? new Date(lastResultTime).toDateString() : null;
    const hasTypedToday = lastTestDate === today;
    
    // Calculate streak statistics
    const longestStreak = this.calculateLongestStreak(history, currentStreak);
    const streakTrend = this.calculateStreakTrend(history);
    const riskLevel = this.calculateRiskLevel(lastResultTime);
    
    return {
      currentStreak,
      longestStreak,
      hasTypedToday,
      lastResultTime,
      totalTests,
      avgWpm: Math.round(avgWpm),
      avgAcc: Math.round(avgAcc * 100) / 100,
      streakTrend,
      riskLevel,
      daysUntilMilestone: this.getDaysUntilMilestone(currentStreak)
    };
  }

  generateMessage(streakData, reminderType) {
    const { currentStreak, hasTypedToday, riskLevel, daysUntilMilestone } = streakData;
    
    const emojis = {
      fire: '🔥', star: '⭐', warning: '⚠️', urgent: '🚨', 
      celebration: '🎉', muscle: '💪', target: '🎯', rocket: '🚀'
    };
    
    let message = '';
    let emoji = '';
    let buttons = [];

    switch (reminderType) {
      case 'morning':
        if (hasTypedToday) {
          message = `${emojis.celebration} Amazing start! You've already typed today!\n\n`;
          message += `${emojis.fire} Current streak: **${currentStreak} days**\n`;
          message += `${emojis.target} You're ${daysUntilMilestone} days from your next milestone!`;
          emoji = emojis.star;
        } else {
          message = `${emojis.rocket} Good morning, typing champion!\n\n`;
          message += `${emojis.fire} Your ${currentStreak}-day streak is waiting for you\n`;
          message += `${emojis.muscle} Let's make today count!`;
          emoji = '🌅';
        }
        break;

      case 'midday':
        if (hasTypedToday) {
          message = `${emojis.target} Midday check: You're all set!\n\n`;
          message += `${emojis.fire} Streak: ${currentStreak} days (SAFE)\n`;
          message += `Maybe squeeze in another practice session? ${emojis.muscle}`;
          emoji = '✅';
        } else {
          message = `${emojis.warning} Midday reminder: Haven't practiced yet today\n\n`;
          message += `${emojis.fire} Your ${currentStreak}-day streak needs attention\n`;
          message += `${emojis.target} Perfect time for a quick session!`;
          emoji = '⏰';
        }
        break;

      case 'afternoon':
        if (hasTypedToday) {
          message = `${emojis.celebration} Afternoon update: Streak secured!\n\n`;
          message += `${emojis.fire} ${currentStreak} days and counting\n`;
          message += `${emojis.star} You're crushing it today!`;
          emoji = '👍';
        } else {
          message = `${emojis.warning} Afternoon alert: Time is ticking!\n\n`;
          message += `${emojis.fire} ${currentStreak}-day streak at risk\n`;
          message += `${emojis.target} Don't let your hard work slip away`;
          emoji = '⚠️';
        }
        break;

      case 'evening':
        if (hasTypedToday) {
          message = `${emojis.celebration} Evening report: Mission accomplished!\n\n`;
          message += `${emojis.fire} Streak: ${currentStreak} days (SECURE)\n`;
          message += `${emojis.star} Rest easy, champion!`;
          emoji = '🌙';
        } else {
          message = `${emojis.urgent} EVENING WARNING!\n\n`;
          message += `${emojis.fire} Your ${currentStreak}-day streak is in DANGER\n`;
          message += `${emojis.warning} Only a few hours left to save it!\n`;
          message += `${emojis.target} Quick 1-minute test can save everything!`;
          emoji = '🚨';
        }
        break;

      case 'warning':
        if (!hasTypedToday) {
          message = `${emojis.urgent} FINAL WARNING! STREAK IN CRITICAL DANGER!\n\n`;
          message += `${emojis.fire} ${currentStreak} DAYS ABOUT TO BE LOST\n`;
          message += `${emojis.warning} LESS THAN 1 HOUR REMAINING!\n`;
          message += `${emojis.target} SAVE YOUR STREAK NOW!\n\n`;
          message += `Don't let ${currentStreak} days of hard work disappear!`;
          emoji = '🆘';
          buttons = [
            { text: '🏃‍♂️ GO TO MONKEYTYPE NOW!', url: 'https://monkeytype.com' }
          ];
        } else {
          message = `${emojis.celebration} Late night check: You're SAFE!\n\n`;
          message += `${emojis.fire} ${currentStreak}-day streak is secure\n`;
          message += `${emojis.star} Sleep well, typing champion!`;
          emoji = '😴';
        }
        break;

      default:
        message = `${emojis.fire} Streak Status: ${currentStreak} days\n`;
        message += hasTypedToday ? '✅ Safe for today' : '⚠️ Needs attention';
        emoji = hasTypedToday ? '✅' : '⚠️';
    }

    // Add milestone notifications
    if (this.isMilestone(currentStreak) && hasTypedToday) {
      message += `\n\n🎊 MILESTONE ACHIEVED! 🎊\n${currentStreak} DAYS STREAK! 🏆`;
    }

    // Add stats
    message += `\n\n📊 **Quick Stats:**`;
    message += `\n• Average WPM: ${streakData.avgWpm}`;
    message += `\n• Average Accuracy: ${streakData.avgAcc}%`;
    message += `\n• Total Tests: ${streakData.totalTests}`;

    return { text: message, emoji, buttons };
  }

  async sendWeeklyReport(userData, history) {
    const report = this.generateWeeklyReport(userData, history);
    await this.sendTelegramMessage(report.text, report.emoji);
  }

  generateWeeklyReport(userData, history) {
    const currentStreak = userData.streak?.length || 0;
    const weeklyStats = this.calculateWeeklyStats(history);
    
    let report = `📈 **WEEKLY STREAK REPORT** 📈\n\n`;
    report += `🔥 Current Streak: **${currentStreak} days**\n`;
    report += `🏆 Longest Streak: **${this.calculateLongestStreak(history, currentStreak)} days**\n\n`;
    
    report += `📊 **This Week's Performance:**\n`;
    report += `• Days Practiced: ${weeklyStats.daysPracticed}/7\n`;
    report += `• Average WPM: ${Math.round(userData.typingStats?.avgWpm || 0)}\n`;
    report += `• Average Accuracy: ${Math.round((userData.typingStats?.avgAcc || 0) * 100)}%\n`;
    report += `• Total Tests: ${userData.typingStats?.completedTests || 0}\n\n`;
    
    if (weeklyStats.daysPracticed === 7) {
      report += `🎉 **PERFECT WEEK!** You practiced every single day!\n`;
      report += `💪 Keep this momentum going, champion!`;
    } else if (weeklyStats.daysPracticed >= 5) {
      report += `👍 **Great week!** You're staying consistent!\n`;
      report += `🎯 Aim for all 7 days next week!`;
    } else {
      report += `⚠️ **Room for improvement** - only ${weeklyStats.daysPracticed} days practiced\n`;
      report += `💪 Let's aim higher next week!`;
    }
    
    return { text: report, emoji: '📈' };
  }

  async sendTelegramMessage(text, emoji, buttons = []) {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    
    const keyboard = buttons.length > 0 ? {
      inline_keyboard: [buttons.map(btn => ({
        text: btn.text,
        url: btn.url
      }))]
    } : undefined;
    
    const payload = {
      chat_id: this.chatId,
      text: `${emoji} ${text}`,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    };
    
    await axios.post(url, payload);
    console.log('📱 Message sent to Telegram');
  }

  async sendErrorNotification(error) {
    try {
      const message = `🔧 **Streak Guardian Error**\n\n` +
                    `❌ ${error.message}\n` +
                    `⏰ Time: ${new Date().toISOString()}\n\n` +
                    `🔍 Please check the system status.`;
      
      await this.sendTelegramMessage(message, '⚠️');
    } catch (e) {
      console.error('Failed to send error notification:', e.message);
    }
  }

  async loadHistory() {
    try {
      const data = await fs.readFile(this.historyFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.log('📝 Creating new history file');
      return { streaks: [], lastUpdate: null };
    }
  }

  async updateHistory(userData, history) {
    const currentStreak = userData.streak?.length || 0;
    const today = new Date().toISOString().split('T')[0];
    
    // Update streak history
    if (!history.streaks) history.streaks = [];
    
    const lastEntry = history.streaks[history.streaks.length - 1];
    if (!lastEntry || lastEntry.date !== today) {
      history.streaks.push({
        date: today,
        streak: currentStreak,
        avgWpm: Math.round(userData.typingStats?.avgWpm || 0),
        avgAcc: Math.round((userData.typingStats?.avgAcc || 0) * 100) / 100,
        totalTests: userData.typingStats?.completedTests || 0
      });
    }
    
    // Keep only last 90 days
    history.streaks = history.streaks.slice(-90);
    history.lastUpdate = new Date().toISOString();
    
    await fs.writeFile(this.historyFile, JSON.stringify(history, null, 2));
    console.log('💾 History updated');
  }

  calculateLongestStreak(history, currentStreak) {
    if (!history.streaks || history.streaks.length === 0) return currentStreak;
    const maxHistorical = Math.max(...history.streaks.map(s => s.streak));
    return Math.max(maxHistorical, currentStreak);
  }

  calculateStreakTrend(history) {
    if (!history.streaks || history.streaks.length < 7) return 'stable';
    const recent = history.streaks.slice(-7);
    const older = history.streaks.slice(-14, -7);
    const recentAvg = recent.reduce((sum, s) => sum + s.streak, 0) / recent.length;
    const olderAvg = older.reduce((sum, s) => sum + s.streak, 0) / older.length;
    
    if (recentAvg > olderAvg * 1.1) return 'improving';
    if (recentAvg < olderAvg * 0.9) return 'declining';
    return 'stable';
  }

  calculateRiskLevel(lastResultTime) {
    if (!lastResultTime) return 'high';
    const hoursSince = (Date.now() - lastResultTime) / (1000 * 60 * 60);
    if (hoursSince < 12) return 'low';
    if (hoursSince < 20) return 'medium';
    return 'high';
  }

  getDaysUntilMilestone(streak) {
    const milestones = [10, 25, 50, 100, 200, 365, 500, 1000];
    const next = milestones.find(m => m > streak);
    return next ? next - streak : 0;
  }

  isMilestone(streak) {
    const milestones = [10, 25, 50, 100, 200, 365, 500, 1000];
    return milestones.includes(streak);
  }

  calculateWeeklyStats(history) {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const thisWeek = history.streaks?.filter(s => 
      new Date(s.date) >= oneWeekAgo
    ) || [];
    
    return {
      daysPracticed: thisWeek.length,
      avgWpm: thisWeek.reduce((sum, s) => sum + s.avgWpm, 0) / (thisWeek.length || 1),
      avgAcc: thisWeek.reduce((sum, s) => sum + s.avgAcc, 0) / (thisWeek.length || 1)
    };
  }
}

// Run the application
const guardian = new StreakGuardian();
guardian.run();
