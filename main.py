import os
import json
import asyncio
import aiohttp
from datetime import datetime, timezone, timedelta
from telegram import Update, ReplyKeyboardMarkup, KeyboardButton
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# Configuration
BOT_TOKEN = os.getenv('BOT_TOKEN')
USERS_FILE = 'users.json'

# Load user data
def load_users():
    try:
        with open(USERS_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

# Save user data
def save_users(users):
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f, indent=2)

# Get MonkeyType user data
async def get_monkeytype_data(ape_key):
    headers = {
        'Authorization': f'ApeKey {ape_key}',
        'Accept': 'application/json'
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get('https://api.monkeytype.com/users/profile', headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    return data
                else:
                    return None
    except Exception as e:
        print(f"Error fetching MonkeyType data: {e}")
        return None

# Start command handler
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    users = load_users()
    
    if user_id in users:
        await update.message.reply_text(
            "Welcome back! You're already registered. Your streak tracking is active! 🎯\n\n"
            "Commands:\n"
            "/status - Check your current streak\n"
            "/reset - Reset your API key (use carefully!)"
        )
    else:
        await update.message.reply_text(
            "🎯 Welcome to MonkeyType Streak Tracker! 🎯\n\n"
            "To get started, I need your MonkeyType API key.\n\n"
            "📝 How to get your API key:\n"
            "1. Go to monkeytype.com\n"
            "2. Login to your account\n"
            "3. Go to Settings → Account\n"
            "4. Generate/copy your 'Ape Key'\n\n"
            "Please send your API key now:"
        )
        
        # Set user state to waiting for API key
        context.user_data['waiting_for_api_key'] = True

# Handle API key input
async def handle_api_key(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.user_data.get('waiting_for_api_key'):
        return
    
    user_id = str(update.effective_user.id)
    ape_key = update.message.text.strip()
    
    # Validate API key
    await update.message.reply_text("🔍 Validating your API key...")
    
    user_data = await get_monkeytype_data(ape_key)
    
    if user_data is None:
        await update.message.reply_text(
            "❌ Invalid API key or connection error. Please check your key and try again:"
        )
        return
    
    # API key is valid, now ask for offset
    context.user_data['ape_key'] = ape_key
    context.user_data['user_data'] = user_data
    context.user_data['waiting_for_api_key'] = False
    context.user_data['waiting_for_offset'] = True
    
    # Create offset selection keyboard
    keyboard = [
        [KeyboardButton("0 (Midnight UTC)"), KeyboardButton("+1"), KeyboardButton("+2")],
        [KeyboardButton("+3"), KeyboardButton("+4"), KeyboardButton("+5")],
        [KeyboardButton("+6"), KeyboardButton("+7"), KeyboardButton("+8")],
        [KeyboardButton("+9"), KeyboardButton("+10"), KeyboardButton("+11")],
        [KeyboardButton("+12"), KeyboardButton("-1"), KeyboardButton("-2")],
        [KeyboardButton("-3"), KeyboardButton("-4"), KeyboardButton("-5")],
        [KeyboardButton("-6"), KeyboardButton("-7"), KeyboardButton("-8")],
        [KeyboardButton("-9"), KeyboardButton("-10"), KeyboardButton("-11")]
    ]
    reply_markup = ReplyKeyboardMarkup(keyboard, one_time_keyboard=True, resize_keyboard=True)
    
    await update.message.reply_text(
        f"✅ Great! Found your MonkeyType profile.\n"
        f"Username: {user_data.get('data', {}).get('name', 'Unknown')}\n\n"
        f"🕐 Now, please select your streak hour offset:\n\n"
        f"This determines when your 'new day' starts for streak tracking.\n"
        f"For example:\n"
        f"• +0 = Midnight UTC (default)\n"
        f"• +5.5 = 5:30 AM UTC (if your streak resets at 2:30 PM in your timezone)\n"
        f"• -8 = 4:00 PM UTC (8 hours behind)\n\n"
        f"Choose from the options below:",
        reply_markup=reply_markup
    )

# Handle offset selection
async def handle_offset(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.user_data.get('waiting_for_offset'):
        return
    
    user_id = str(update.effective_user.id)
    offset_text = update.message.text.strip()
    
    # Parse offset
    try:
        if offset_text == "0 (Midnight UTC)":
            offset = 0
        else:
            offset = int(offset_text.replace("+", ""))
    except ValueError:
        await update.message.reply_text(
            "❌ Invalid offset. Please select from the provided options."
        )
        return
    
    # Save user data
    users = load_users()
    users[user_id] = {
        'ape_key': context.user_data['ape_key'],
        'offset_hours': offset,
        'username': context.user_data['user_data'].get('data', {}).get('name', 'Unknown'),
        'chat_id': update.effective_chat.id,
        'registered_at': datetime.now(timezone.utc).isoformat(),
        'last_reminder': None
    }
    save_users(users)
    
    # Clear user context
    context.user_data.clear()
    
    # Calculate when reminders will be sent
    reminder_time_utc = (offset) % 24
    
    await update.message.reply_text(
        f"🎉 Perfect! You're all set up!\n\n"
        f"⚙️ Configuration:\n"
        f"• MonkeyType User: {users[user_id]['username']}\n"
        f"• Offset: {offset:+d} hours from UTC\n"
        f"• Daily reminders will be sent around hour {reminder_time_utc:02d}:00 UTC\n\n"
        f"🔥 I'll remind you daily with motivational messages like:\n"
        f"'New day new me or new day new record?' 🚀\n\n"
        f"Commands:\n"
        f"/status - Check your current streak\n"
        f"/reset - Reset your API key"
    )

# Status command
async def status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    users = load_users()
    
    if user_id not in users:
        await update.message.reply_text(
            "❌ You're not registered yet. Use /start to begin!"
        )
        return
    
    user = users[user_id]
    user_data = await get_monkeytype_data(user['ape_key'])
    
    if user_data is None:
        await update.message.reply_text(
            "❌ Unable to fetch your MonkeyType data. Please check your connection."
        )
        return
    
    streak = user_data.get('data', {}).get('streak', {}).get('days', 0)
    
    await update.message.reply_text(
        f"📊 Your MonkeyType Status:\n"
        f"• Username: {user['username']}\n"
        f"• Current Streak: {streak} days 🔥\n"
        f"• Offset: {user['offset_hours']:+d} hours\n"
        f"• Last reminder: {user.get('last_reminder', 'Never')}"
    )

# Reset command
async def reset(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = str(update.effective_user.id)
    users = load_users()
    
    if user_id in users:
        del users[user_id]
        save_users(users)
        await update.message.reply_text(
            "🔄 Your data has been reset. Use /start to register again."
        )
    else:
        await update.message.reply_text(
            "❌ You're not registered yet. Use /start to begin!"
        )

# Message handler for API key and offset
async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if context.user_data.get('waiting_for_api_key'):
        await handle_api_key(update, context)
    elif context.user_data.get('waiting_for_offset'):
        await handle_offset(update, context)
    else:
        await update.message.reply_text(
            "🤔 I'm not sure what you mean. Try using /start or /status"
        )

# Send daily reminders (called by GitHub Actions)
async def send_reminders():
    users = load_users()
    
    if not users:
        print("No users registered")
        return
    
    app = Application.builder().token(BOT_TOKEN).build()
    
    current_hour = datetime.now(timezone.utc).hour
    today = datetime.now(timezone.utc).date().isoformat()
    
    for user_id, user_data in users.items():
        try:
            # Calculate the target hour for this user
            target_hour = user_data['offset_hours'] % 24
            
            # Check if it's time to send reminder for this user
            if current_hour == target_hour:
                # Check if we already sent a reminder today
                if user_data.get('last_reminder') == today:
                    continue
                
                # Get current streak
                monkeytype_data = await get_monkeytype_data(user_data['ape_key'])
                if monkeytype_data:
                    streak = monkeytype_data.get('data', {}).get('streak', {}).get('days', 0)
                    
                    messages = [
                        "🌅 New day new me or new day new record? 🚀",
                        f"🔥 Time to keep that {streak}-day streak alive!",
                        "⌨️ Ready to type your way to greatness? 💪",
                        "🎯 Another day, another chance to improve!",
                        "⚡ Let's make today count on MonkeyType!"
                    ]
                    
                    import random
                    message = random.choice(messages)
                    
                    await app.bot.send_message(
                        chat_id=user_data['chat_id'],
                        text=message
                    )
                    
                    # Update last reminder date
                    users[user_id]['last_reminder'] = today
                    
                    print(f"Sent reminder to user {user_id}")
                
        except Exception as e:
            print(f"Error sending reminder to user {user_id}: {e}")
    
    # Save updated user data
    save_users(users)

def main():
    if not BOT_TOKEN:
        print("BOT_TOKEN environment variable not set")
        return
    
    # Check if we're running in reminder mode
    if os.getenv('REMINDER_MODE') == 'true':
        asyncio.run(send_reminders())
        return
    
    # Regular bot mode
    application = Application.builder().token(BOT_TOKEN).build()
    
    # Add handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("status", status))
    application.add_handler(CommandHandler("reset", reset))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    
    print("Bot is starting...")
    application.run_polling()

if __name__ == '__main__':
    main()
