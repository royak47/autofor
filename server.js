const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Telegram Bot Setup
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// MongoDB Schemas
const UserSchema = new mongoose.Schema({
  telegramId: String,
  phoneNumber: String,
  username: String,
  firstName: String
});
const User = mongoose.model('User', UserSchema);

const RuleSchema = new mongoose.Schema({
  telegramId: String,
  sourceChat: String,
  targetChat: String,
  filterType: String,
  keyword: String,
  editText: String,
  replaceText: String
});
const Rule = mongoose.model('Rule', RuleSchema);

// Telegram Login Verification
function verifyTelegramHash(data) {
  const secretKey = crypto.createHash('sha256').update(process.env.TELEGRAM_TOKEN).digest();
  const dataCheckString = Object.keys(data)
    .filter(key => key !== 'hash')
    .sort()
    .map(key => `${key}=${data[key]}`)
    .join('\n');
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return computedHash === data.hash;
}

// Telegram Login API
app.post('/api/telegram-login', async (req, res) => {
  const data = req.body;
  if (!verifyTelegramHash(data)) {
    return res.status(401).json({ message: 'Invalid Telegram login attempt' });
  }

  try {
    const telegramId = data.id.toString();
    const phoneNumber = data.phone_number || 'N/A';
    const username = data.username || 'N/A';
    const firstName = data.first_name || 'N/A';

    let user = await User.findOne({ telegramId });
    if (!user) {
      user = new User({ telegramId, phoneNumber, username, firstName });
      await user.save();
    } else {
      user.phoneNumber = phoneNumber;
      user.username = username;
      user.firstName = firstName;
      await user.save();
    }

    await bot.sendMessage(telegramId, 'Welcome to the Auto-Forward App!');
    res.json({ message: 'Login successful' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Failed to process login' });
  }
});

// Create Rule API
app.post('/api/rules', async (req, res) => {
  const { telegramId, sourceChat, targetChat, filterType, keyword, editText, replaceText } = req.body;
  try {
    const rule = new Rule({ telegramId, sourceChat, targetChat, filterType, keyword, editText, replaceText });
    await rule.save();
    res.json({ rule });
  } catch (error) {
    console.error('Error creating rule:', error);
    res.status(500).json({ message: 'Failed to create rule' });
  }
});

// Fetch Rules API
app.get('/api/rules/:telegramId', async (req, res) => {
  try {
    const rules = await Rule.find({ telegramId: req.params.telegramId });
    res.json(rules);
  } catch (error) {
    console.error('Error fetching rules:', error);
    res.status(500).json({ message: 'Failed to fetch rules' });
  }
});

// Telegram Message Forwarding
bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();
  const rules = await Rule.find({ sourceChat: chatId });

  for (const rule of rules) {
    let shouldForward = true;
    let messageText = msg.text || '';

    // Apply filters
    if (rule.filterType !== 'all') {
      if (rule.filterType === 'text' && msg.text) shouldForward = true;
      else if (rule.filterType === 'media' && (msg.photo || msg.video)) shouldForward = true;
      else if (rule.filterType === 'links' && msg.text?.includes('http')) shouldForward = true;
      else shouldForward = false;
    }

    if (rule.keyword && !msg.text?.includes(rule.keyword)) {
      shouldForward = false;
    }

    // Apply text editing
    if (shouldForward && rule.editText && msg.text) {
      messageText = msg.text.replaceAll(rule.editText, rule.replaceText);
    }

    if (shouldForward) {
      try {
        if (msg.text) {
          await bot.sendMessage(rule.targetChat, messageText);
        } else if (msg.photo) {
          await bot.sendPhoto(rule.targetChat, msg.photo[msg.photo.length - 1].file_id);
        } else if (msg.video) {
          await bot.sendVideo(rule.targetChat, msg.video.file_id);
        }
      } catch (error) {
        console.error('Forwarding error:', error);
      }
    }
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
