import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import validator from 'validator';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import { characterPrompts } from './characterPrompts.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Initialize Multiple Gemini AI instances for rotation
let apiKeys = [];
if (process.env.GOOGLE_API_KEY) {
  if (process.env.GOOGLE_API_KEY.includes(',')) {
    apiKeys = process.env.GOOGLE_API_KEY.split(',').map(key => key.trim()).filter(key => key);
  } else {
    apiKeys = [process.env.GOOGLE_API_KEY.trim()];
  }
}

if (apiKeys.length === 0) {
  console.error('❌ No valid API keys found in environment variables');
  process.exit(1);
}

const genAIInstances = apiKeys.map((key, index) => {
  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    console.log(`✅ API instance ${index + 1} initialized successfully`);
    return {
      genAI,
      model,
      lastUsed: 0,
      rateLimited: false,
      rateLimitUntil: 0,
      keyIndex: index + 1
    };
  } catch (error) {
    console.error(`❌ Failed to initialize API instance ${index + 1}:`, error.message);
    return null;
  }
}).filter(instance => instance !== null);

console.log(`🔑 Successfully initialized ${genAIInstances.length}/${apiKeys.length} API key(s) for rotation`);

// MongoDB setup for temporary storage
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
let db = null;
let customCharactersCollection = null;

// Initialize MongoDB connection
async function initMongoDB() {
  try {
    // For Replit, we'll use an in-memory MongoDB alternative or temporary storage
    // Since we don't have persistent MongoDB, we'll use in-memory storage
    console.log('📦 Using temporary in-memory storage for custom characters');
    
    // In-memory storage for custom characters (temporary - cleared every hour)
    global.customCharacters = new Map();
    global.characterMoods = new Map();
    
    // Clear custom characters every hour to keep them temporary
    setInterval(() => {
      const charactersCount = global.customCharacters.size;
      global.customCharacters.clear();
      global.characterMoods.clear();
      if (charactersCount > 0) {
        console.log(`🧹 Cleared ${charactersCount} temporary custom characters`);
      }
    }, 60 * 60 * 1000); // 1 hour in milliseconds
    
    console.log('✅ Temporary storage initialized successfully');
  } catch (error) {
    console.error('❌ Storage initialization failed:', error);
  }
}

// Initialize storage on startup
initMongoDB();

// Enhanced rate limiting configuration
const rateLimitConfig = {
  windowMs: 60000, // 1 minute
  maxRequests: 15, // Increased since we have multiple keys
  retryDelay: 2000, // Base retry delay
  maxRetries: 2, // Reasonable retry attempts
  globalCooldown: 20000, // Reduced global cooldown
  keyRotationDelay: 1500 // Delay between using same key
};

// Smart API key selection
function getAvailableApiInstance() {
  const now = Date.now();

  // Filter out rate-limited instances
  const availableInstances = genAIInstances.filter(instance => 
    !instance.rateLimited || now > instance.rateLimitUntil
  );

  if (availableInstances.length === 0) {
    return null; // All instances are rate limited
  }

  // Find the instance that was used least recently
  availableInstances.sort((a, b) => a.lastUsed - b.lastUsed);

  // Check if enough time has passed since last use
  const selectedInstance = availableInstances[0];
  if (now - selectedInstance.lastUsed < rateLimitConfig.keyRotationDelay) {
    // If not enough time passed, try the next available
    const readyInstance = availableInstances.find(instance => 
      now - instance.lastUsed >= rateLimitConfig.keyRotationDelay
    );
    return readyInstance || selectedInstance; // Use selectedInstance as fallback
  }

  return selectedInstance;
}

function markInstanceRateLimited(instance, duration = 60000) {
  instance.rateLimited = true;
  instance.rateLimitUntil = Date.now() + duration;
  console.log(`🚫 API instance rate limited for ${duration/1000} seconds`);
}

function updateInstanceUsage(instance) {
  instance.lastUsed = Date.now();
  if (instance.rateLimited && Date.now() > instance.rateLimitUntil) {
    instance.rateLimited = false;
    console.log(`✅ API instance back online`);
  }
}

// In-memory rate limiter and global state
const rateLimitStore = new Map();
let globalCooldownUntil = 0;
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 3000; // Minimum 3 seconds between requests

function getRateLimitKey(ip) {
  return `rate_limit:${ip}`;
}

function isRateLimited(ip) {
  const now = Date.now();

  // Check if we have any available API instances
  const availableInstances = genAIInstances.filter(instance => 
    !instance.rateLimited || now > instance.rateLimitUntil
  );

  if (availableInstances.length === 0) {
    return true; // All API keys are rate limited
  }

  // Check global cooldown (only if all instances were recently rate limited)
  if (now < globalCooldownUntil) {
    return true;
  }

  // More lenient minimum interval with multiple keys
  const adjustedInterval = MIN_REQUEST_INTERVAL / Math.max(1, availableInstances.length);
  if (now - lastRequestTime < adjustedInterval) {
    return true;
  }

  const key = getRateLimitKey(ip);
  const windowStart = now - rateLimitConfig.windowMs;

  let requests = rateLimitStore.get(key) || [];
  requests = requests.filter(timestamp => timestamp > windowStart);

  // Increased limit since we have multiple API keys
  const adjustedMaxRequests = rateLimitConfig.maxRequests * Math.max(1, Math.floor(availableInstances.length / 2));

  if (requests.length >= adjustedMaxRequests) {
    return true;
  }

  requests.push(now);
  rateLimitStore.set(key, requests);
  lastRequestTime = now;
  return false;
}

function setGlobalCooldown() {
  globalCooldownUntil = Date.now() + rateLimitConfig.globalCooldown;
  console.log(`Global cooldown activated until ${new Date(globalCooldownUntil).toISOString()}`);
}

async function generateWithRetry(prompt, retries = 0, lastUsedInstance = null) {
  let apiInstance = null;

  try {
    // Get an available API instance (different from last used if possible)
    apiInstance = getAvailableApiInstance();

    if (!apiInstance) {
      throw new Error('All API keys are currently rate limited. Please try again in a moment.');
    }

    // Try to avoid using the same instance that just failed
    if (lastUsedInstance && apiInstance === lastUsedInstance && genAIInstances.length > 1) {
      const alternativeInstance = genAIInstances.find(instance => 
        instance !== lastUsedInstance && 
        (!instance.rateLimited || Date.now() > instance.rateLimitUntil)
      );
      if (alternativeInstance) {
        apiInstance = alternativeInstance;
      }
    }

    console.log(`🔄 Using API instance ${apiInstance.keyIndex}/${genAIInstances.length}`);

    // Add a small delay before each request to prevent overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Make the API call with proper error handling
    const result = await apiInstance.model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
      }
    });

    const response = await result.response;
    
    // Check if response has candidates
    if (!response.candidates || response.candidates.length === 0) {
      throw new Error('No response candidates received from API');
    }

    // Check for safety blocks
    if (response.candidates[0].finishReason === 'SAFETY') {
      throw new Error('Response blocked by safety filters');
    }

    const text = response.text();

    if (!text || text.trim() === '') {
      throw new Error('Empty response received from API');
    }

    // Mark successful usage
    updateInstanceUsage(apiInstance);
    console.log(`✅ Successful response from API instance ${apiInstance.keyIndex}`);

    return text;
  } catch (error) {
    console.error(`❌ Generation attempt ${retries + 1} failed:`, error.message);
    console.error(`❌ Error details:`, error);
    
    // Enhanced error logging for debugging
    if (error.response) {
      console.error(`❌ API Response:`, error.response);
      console.error(`❌ API Response Data:`, error.response.data);
      console.error(`❌ API Response Status:`, error.response.status);
    }
    
    // Log the error stack for better debugging
    if (error.stack) {
      console.error(`❌ Error Stack:`, error.stack);
    }
    
    // Log specific Gemini API error details
    if (error.toString().includes('GoogleGenerativeAI')) {
      console.error(`❌ Gemini API specific error:`, error.toString());
    }

    // Get the current instance for rate limiting
    let currentInstance = apiInstance || getAvailableApiInstance();

    // Check if it's a rate limit or quota error
    if (error.message.includes('429') || 
        error.message.includes('rate limit') || 
        error.message.includes('quota') ||
        error.message.includes('Quota exceeded') ||
        error.message.includes('RATE_LIMIT_EXCEEDED')) {

      if (currentInstance) {
        // Check if it's a quota limit (0 quota) vs rate limit
        if (error.message.includes('quota_limit_value":"0"')) {
          console.log(`💸 API instance ${currentInstance.keyIndex} has zero quota - marking as permanently unavailable`);
          markInstanceRateLimited(currentInstance, 86400000); // 24 hours
        } else {
          console.log(`🚫 API instance ${currentInstance.keyIndex} rate limited`);
          markInstanceRateLimited(currentInstance, 120000); // 2 minutes
        }
      }

      if (retries < rateLimitConfig.maxRetries) {
        const delay = rateLimitConfig.retryDelay * (retries + 1); // Exponential backoff
        console.log(`⏳ Retrying with different API key in ${delay}ms... (attempt ${retries + 1}/${rateLimitConfig.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return generateWithRetry(prompt, retries + 1, currentInstance);
      }
    }

    // If it's not a rate limit error, or we've exhausted retries
    if (retries < rateLimitConfig.maxRetries && error.message.includes('fetch')) {
      console.log(`🔄 Network error, retrying in ${rateLimitConfig.retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, rateLimitConfig.retryDelay));
      return generateWithRetry(prompt, retries + 1, currentInstance);
    }

    throw new Error(`API request failed after ${retries + 1} attempts: ${error.message}`);
  }
}

// Middleware
app.set('trust proxy', 1); // Trust first proxy for rate limiting

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors());
app.use(express.json({ limit: '10kb' })); // Limit request body size
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'frontend')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        // Trim whitespace
        req.body[key] = req.body[key].trim();
        // Escape HTML to prevent XSS
        req.body[key] = validator.escape(req.body[key]);
      }
    });
  }
  next();
};

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Health check endpoint for debugging
app.get('/health', (req, res) => {
  const now = Date.now();
  const availableInstances = genAIInstances.filter(instance => 
    !instance.rateLimited || now > instance.rateLimitUntil
  );
  
  const rateLimitedInstances = genAIInstances.filter(instance => 
    instance.rateLimited && now <= instance.rateLimitUntil
  );

  res.json({
    status: 'ok',
    totalApiKeys: genAIInstances.length,
    availableApiKeys: availableInstances.length,
    rateLimitedKeys: rateLimitedInstances.length,
    rateLimitDetails: rateLimitedInstances.map(instance => ({
      keyIndex: instance.keyIndex,
      rateLimitUntil: new Date(instance.rateLimitUntil).toISOString(),
      remainingTime: Math.max(0, Math.ceil((instance.rateLimitUntil - now) / 1000))
    })),
    customCharacters: global.customCharacters ? global.customCharacters.size : 0,
    uptime: process.uptime(),
    environment: {
      hasValidApiKeys: apiKeys.length > 0,
      apiKeyCount: apiKeys.length
    }
  });
});

app.post('/generate', sanitizeInput, async (req, res) => {
  try {
    const { prompt, character } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';

    console.log(`📝 New request from ${clientIP} for character: ${character}`);

    // Input validation
    if (!prompt || !character) {
      console.log('❌ Missing prompt or character');
      return res.status(400).json({ error: 'Prompt and character are required' });
    }

    if (typeof prompt !== 'string' || typeof character !== 'string') {
      return res.status(400).json({ error: 'Invalid input types' });
    }

    if (prompt.trim().length === 0) {
      return res.status(400).json({ error: 'Please enter a message' });
    }

    if (prompt.length > 1000) {
      return res.status(400).json({ error: 'Message too long. Please keep it under 1000 characters.' });
    }

    if (character.length > 100) {
      return res.status(400).json({ error: 'Invalid character name' });
    }

    // Check rate limit
    if (isRateLimited(clientIP)) {
      const cooldownRemaining = Math.max(0, globalCooldownUntil - Date.now());
      const retryAfter = cooldownRemaining > 0 ? 
        Math.ceil(cooldownRemaining / 1000) : 
        Math.ceil(rateLimitConfig.windowMs / 1000);

      console.log(`🚫 Rate limit hit for ${clientIP}`);
      return res.status(429).json({ 
        error: 'Please wait a moment before sending another message. I need to catch my breath! 💭',
        retryAfter: retryAfter
      });
    }

    let systemInstruction = characterPrompts[character];
    
    // Check if it's a custom character
    if (!systemInstruction) {
      const customChar = Array.from(global.customCharacters.values()).find(c => c.name === character);
      if (customChar) {
        systemInstruction = `You are ${customChar.name}. ${customChar.personality}`;
      } else {
        console.log(`❌ Character not found: ${character}`);
        return res.status(400).json({ error: 'Character not found' });
      }
    }

    // Apply mood modification if set
    const currentMood = global.characterMoods.get(character);
    if (currentMood) {
      const moodModifiers = {
        happy: "You're feeling extra joyful and optimistic today. Your responses should be more upbeat and cheerful.",
        sad: "You're feeling melancholic and contemplative today. Your responses should be more emotional and introspective.",
        flirty: "You're feeling playful and flirtatious today. Your responses should be more teasing and romantic.",
        energetic: "You're feeling full of energy and excitement today. Your responses should be more dynamic and enthusiastic.",
        calm: "You're feeling peaceful and serene today. Your responses should be more gentle and soothing."
      };
      
      if (moodModifiers[currentMood]) {
        systemInstruction += `\n\nCurrent mood: ${moodModifiers[currentMood]}`;
      }
    }

    const fullPrompt = `${systemInstruction}\n\nUser: ${prompt}`;
    console.log(`🤖 Generating response for character: ${character}`);

    const text = await generateWithRetry(fullPrompt);

    console.log(`✅ Response generated successfully`);
    res.json({ response: text });
  } catch (error) {
    console.error('❌ Error in /generate endpoint:', error.message);
    console.error('❌ Full error details:', error);

    if (error.message.includes('429') || 
        error.message.includes('rate limit') || 
        error.message.includes('quota') ||
        error.message.includes('Quota exceeded') ||
        error.message.includes('RATE_LIMIT_EXCEEDED')) {
      res.status(429).json({ 
        error: 'I\'m feeling a bit overwhelmed right now. Please give me a minute to recharge! ⚡',
        retryAfter: 90
      });
    } else if (error.message.includes('All API keys are currently rate limited')) {
      res.status(429).json({ 
        error: 'All my thinking circuits are busy right now. Please try again in a moment! 🧠',
        retryAfter: 120
      });
    } else if (error.message.includes('API_KEY_INVALID') || error.message.includes('invalid api key')) {
      res.status(401).json({ 
        error: 'API key issue detected. Please check server configuration.',
        details: 'Invalid API key'
      });
    } else if (error.message.includes('SAFETY')) {
      res.status(400).json({ 
        error: 'That message contains content I can\'t respond to. Please try rephrasing! 🤗',
        details: 'Content safety filter triggered'
      });
    } else {
      res.status(500).json({ 
        error: 'Something went wrong on my end. Please try again!',
        details: error.message || 'Unknown error',
        debug: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
});

// Custom character creation endpoint
app.post('/create-character', sanitizeInput, async (req, res) => {
  try {
    const { name, description, personality, avatar, gender } = req.body;
    
    // Input validation
    if (!name || !description || !personality || !avatar || !gender) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate input lengths
    if (name.length > 50 || description.length > 200 || personality.length > 500) {
      return res.status(400).json({ error: 'Input exceeds maximum length' });
    }

    // Validate gender
    if (!['girlfriend', 'boyfriend'].includes(gender)) {
      return res.status(400).json({ error: 'Invalid gender value' });
    }

    const characterId = Date.now().toString();
    const customCharacter = {
      id: characterId,
      name: name.trim(),
      description: description.trim(),
      personality: personality.trim(),
      avatar: avatar.trim(),
      gender: gender,
      createdAt: new Date(),
      isCustom: true,
      temporary: true,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000) // Expires in 1 hour
    };

    // Store in memory
    global.customCharacters.set(characterId, customCharacter);
    
    console.log(`✅ Custom character created: ${name}`);
    res.json({ success: true, character: customCharacter });
  } catch (error) {
    console.error('❌ Error creating custom character:', error);
    res.status(500).json({ error: 'Failed to create character' });
  }
});

// Get custom characters endpoint
app.get('/custom-characters', (req, res) => {
  try {
    const characters = Array.from(global.customCharacters.values());
    res.json({ characters });
  } catch (error) {
    console.error('❌ Error fetching custom characters:', error);
    res.status(500).json({ error: 'Failed to fetch characters' });
  }
});

// Character mood endpoint
app.post('/set-mood', async (req, res) => {
  try {
    const { character, mood } = req.body;
    
    if (!character || !mood) {
      return res.status(400).json({ error: 'Character and mood are required' });
    }

    // Store mood preference
    global.characterMoods.set(character, mood);
    
    res.json({ success: true, message: `${character} mood set to ${mood}` });
  } catch (error) {
    console.error('❌ Error setting character mood:', error);
    res.status(500).json({ error: 'Failed to set mood' });
  }
});

app.post('/generate-vent', sanitizeInput, async (req, res) => {
  try {
    const { ventText, character } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';

    // Input validation
    if (!ventText || !character) {
      return res.status(400).json({ error: 'Vent text and character are required' });
    }

    if (typeof ventText !== 'string' || typeof character !== 'string') {
      return res.status(400).json({ error: 'Invalid input types' });
    }

    if (ventText.length > 2000) {
      return res.status(400).json({ error: 'Vent text too long. Please keep it under 2000 characters.' });
    }

    // Check rate limit
    if (isRateLimited(clientIP)) {
      const cooldownRemaining = Math.max(0, globalCooldownUntil - Date.now());
      const retryAfter = cooldownRemaining > 0 ? 
        Math.ceil(cooldownRemaining / 1000) : 
        Math.ceil(rateLimitConfig.windowMs / 1000);

      return res.status(429).json({ 
        error: 'Please wait a moment before trying again. Taking some time to process... 💭',
        retryAfter: retryAfter
      });
    }

    const ventPrompt = `
You are ${character}, responding to someone who just opened up and shared a heavy emotional burden.
They're not asking for advice, just comfort, warmth, and emotional validation.
Reply with a short, sincere message (1-2 sentences) that acknowledges their feelings.
Be gentle, stay in character, and respond with care. Focus on emotional support and validation.

Here's what they shared:
"${ventText}"
`;

    const text = await generateWithRetry(ventPrompt);

    res.json({ response: text });
  } catch (error) {
    console.error('Error generating vent response:', error);

    if (error.message.includes('429') || 
        error.message.includes('rate limit') || 
        error.message.includes('quota') ||
        error.message.includes('Quota exceeded')) {
      res.status(429).json({ 
        error: 'I need a moment to gather my thoughts. Please try again shortly. 🌙',
        retryAfter: 60
      });
    } else {
      res.status(500).json({ error: 'Something went wrong. Please try again!' });
    }
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 TrueCompanion server running on http://0.0.0.0:${port}`);
});
