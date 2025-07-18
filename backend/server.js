const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const winston = require('winston');
const { TelegramClient, NewMessage } = require('telegram');
const { StringSession } = require('telegram/sessions');
require('dotenv').config();

// Fix Mongoose strictQuery warning
mongoose.set('strictQuery', true);

const app = express();
app.use(helmet());
app.use(cors({ origin: 'https://telegram-forwarder.pages.dev' }));
app.use(express.json());

// Logger Setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console()
  ]
});

// MongoDB Setup
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => logger.info('MongoDB connected'))
  .catch(err => logger.error('MongoDB connection error:', err));

// Telegram Setup
const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessions = new Map();
const activeClients = new Map();

// Schemas
const UserSchema = new mongoose.Schema({
  telegramId: String,
  phoneNumber: String,
  username: String,
  firstName: String,
  country: String
});
const User = mongoose.model('User', UserSchema);

const RuleSchema = new mongoose.Schema({
  telegramId: String,
  sourceChat: String,
  targetChat: String,
  filterType: String,
  keyword: String,
  editText: String,
  replaceText: String,
  isForwarding: Boolean
});
const Rule = mongoose.model('Rule', RuleSchema);

const SessionSchema = new mongoose.Schema({
  telegramId: String,
  sessionString: String
});
const Session = mongoose.model('Session', SessionSchema);

// Send OTP
app.post('/api/send-otp', async (req, res) => {
  const { phone, country } = req.body;
  logger.info(`OTP request for phone: ${phone}, country: ${country}`);
  if (!phone || !country) {
    return res.status(400).json({ message: 'Phone number and country required' });
  }
  try {
    const existingSession = await Session.findOne({ phone });
    const session = existingSession ? new StringSession(existingSession.sessionString) : new StringSession('');
    const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
    await client.start({
      phoneNumber: phone,
      phoneCode: async () => '',
      onError: err => { throw err }
    });
    sessions.set(phone, { client, session });
    res.json({ message: 'OTP sent to your Telegram' });
  } catch (error) {
    logger.error(`Send OTP error for ${phone}: ${error.message}`);
    res.status(500).json({ message: error.message || 'Failed to send OTP' });
  }
});

// Verify OTP
app.post('/api/verify-otp', async (req, res) => {
  const { phone, code, password } = req.body;
  logger.info(`OTP verification attempt for phone: ${phone}`);
  const sessionData = sessions.get(phone);
  if (!sessionData) {
    return res.status(400).json({ message: 'No session found. Request OTP first.' });
  }
  const { client, session } = sessionData;
  try {
    await client.start({
      phoneNumber: phone,
      phoneCode: async () => code,
      password: async () => password || '',
      onError: err => { throw err }
    });
    const me = await client.getMe();
    const telegramId = me.id.toString();
    const userData = {
      telegramId,
      phoneNumber: phone,
      username: me.username || 'N/A',
      firstName: me.firstName || 'N/A',
      country: req.body.country || 'N/A'
    };
    await User.findOneAndUpdate({ telegramId }, userData, { upsert: true });
    await Session.findOneAndUpdate(
      { telegramId },
      { telegramId, sessionString: session.save() },
      { upsert: true }
    );
    await client.disconnect();
    sessions.delete(phone);
    res.json({ message: 'Login successful', telegramId });
  } catch (error) {
    logger.error(`Verify OTP error for ${phone}: ${error.message}`);
    res.status(error.message.includes('2FA') ? 400 : 500).json({
      message: error.message.includes('2FA') ? '2FA password required' : 'Failed to verify OTP'
    });
  }
});

// Create Rule
app.post('/api/rules', async (req, res) => {
  const { telegramId, sourceChat, targetChat, filterType, keyword, editText, replaceText } = req.body;
  logger.info(`Creating rule for telegramId: ${telegramId}`);
  try {
    const rule = new Rule({ telegramId, sourceChat, targetChat, filterType, keyword, editText, replaceText, isForwarding: false });
    await rule.save();
    res.json({ message: 'Rule created', rule });
  } catch (error) {
    logger.error(`Error creating rule: ${error.message}`);
    res.status(500).json({ message: 'Failed to create rule' });
  }
});

// Fetch Rules
app.get('/api/rules/:telegramId', async (req, res) => {
  logger.info(`Fetching rules for telegramId: ${req.params.telegramId}`);
  try {
    const rules = await Rule.find({ telegramId: req.params.telegramId });
    res.json(rules);
  } catch (error) {
    logger.error(`Error fetching rules: ${error.message}`);
    res.status(500).json({ message: 'Failed to fetch rules' });
  }
});

// Start Forwarding Logic
const startForwarding = async (telegramId, client) => {
  try {
    const rules = await Rule.find({ telegramId, isForwarding: true });
    if (!rules.length) return;

    client.addEventHandler(async (event) => {
      const message = event.message;
      for (const rule of rules) {
        if (message.chatId.toString() !== rule.sourceChat) continue;

        let shouldForward = false;
        if (rule.filterType === 'all') shouldForward = true;
        else if (rule.filterType === 'text' && message.text) shouldForward = true;
        else if (rule.filterType === 'media' && (message.photo || message.video)) shouldForward = true;
        else if (rule.filterType === 'links' && message.text?.includes('http')) shouldForward = true;

        if (rule.keyword && shouldForward) {
          shouldForward = message.text?.toLowerCase().includes(rule.keyword.toLowerCase());
        }

        if (!shouldForward) continue;

        let finalText = message.text || '';
        if (rule.editText && rule.replaceText) {
          finalText = finalText.replace(new RegExp(rule.editText, 'g'), rule.replaceText);
        }

        await client.sendMessage(rule.targetChat, {
          message: finalText,
          file: message.photo || message.video || null
        });
      }
    }, new NewMessage({}));
  } catch (error) {
    logger.error(`Forwarding error for ${telegramId}: ${error.message}`);
  }
};

// Toggle Forwarding
app.post('/api/toggle-forwarding', async (req, res) => {
  const { telegramId, enable } = req.body;
  logger.info(`Toggling forwarding for telegramId: ${telegramId}, enable: ${enable}`);
  try {
    await Rule.updateMany({ telegramId }, { isForwarding: enable });
    if (enable) {
      const user = await User.findOne({ telegramId });
      if (!user) return res.status(404).json({ message: 'User not found' });
      
      const existingSession = await Session.findOne({ telegramId });
      const session = existingSession ? new StringSession(existingSession.sessionString) : new StringSession('');
      const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
      await client.start({
        phoneNumber: user.phoneNumber,
        phoneCode: async () => '',
        onError: err => { throw err }
      });
      activeClients.set(telegramId, client);
      await startForwarding(telegramId, client);
    } else {
      const client = activeClients.get(telegramId);
      if (client) {
        await client.disconnect();
        activeClients.delete(telegramId);
      }
    }
    res.json({ message: `Forwarding ${enable ? 'started' : 'stopped'}` });
  } catch (error) {
    logger.error(`Toggle forwarding error: ${error.message}`);
    res.status(500).json({ message: 'Failed to toggle forwarding' });
  }
});

// Cleanup on Shutdown
process.on('SIGTERM', async () => {
  logger.info('Shutting down server...');
  for (const [telegramId, client] of activeClients) {
    await client.disconnect();
    activeClients.delete(telegramId);
  }
  mongoose.connection.close();
  process.exit(0);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => logger.info(`Server running on port ${PORT}`));
