# TrueCompanion 💕

An interactive AI companion chat application powered by Google Gemini AI, featuring diverse AI personalities for meaningful conversations and emotional support.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

## ✨ Features

### 🤖 AI Companions
- **AI Girlfriend**: Choose from passionate characters like Love Quinn, Caroline Forbes, Hermione Granger, and Gwen Stacy
- **AI Boyfriend**: Connect with compelling personalities like Joe Goldberg, Aaron Warner, Steve Harrington, and Damon Salvatore
- **Custom Characters**: Create your own AI companion with personalized personality traits
- **Let It Burn**: A safe venting space for emotional release without judgment

### 💬 Advanced Chat System
- Real-time messaging with typing indicators
- Character-specific responses with unique personalities
- Mood selector to adjust character responses
- Smooth animations and interactive UI
- Mobile-responsive design optimized for all devices
- Rate limiting and comprehensive error handling

### 🎨 Modern UI/UX
- Beautiful purple-themed color scheme using OKLCH color space
- Glassmorphism design with backdrop blur effects
- Responsive design for mobile, tablet, and desktop
- Smooth animations and transitions
- Accessibility-focused with ARIA labels and keyboard navigation

### 🔒 Security & Performance
- Helmet.js for security headers
- Input sanitization and validation
- Multiple Google Gemini API key rotation for reliability
- Smart rate limiting and quota management
- Request size limits and CSRF protection

## 🚀 Quick Start

### Prerequisites
- **Node.js** v16 or higher
- **Google Gemini API keys** ([Get them here](https://makersuite.google.com/app/apikey))

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/TrueCompanion.git
   cd TrueCompanion-main
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   GOOGLE_API_KEY=your_primary_api_key,your_secondary_api_key,your_third_api_key
   PORT=3000
   NODE_ENV=production
   ```
   
   > **💡 Tip**: Use multiple API keys separated by commas for better rate limit handling and reliability

4. **Start the application**
   ```bash
   npm start
   ```

5. **Open your browser**
   
   Navigate to `http://localhost:3000`

## 📁 Project Structure

```
TrueCompanion-main/
├── frontend/
│   ├── index.html              # Landing page
│   ├── select-character.html   # Character selection
│   ├── chat.html               # Main chat interface
│   ├── venting.html            # Emotional release page
│   ├── create-character.html   # Custom character creation
│   ├── info.html               # About page
│   ├── script.js               # Frontend JavaScript
│   └── styles.css              # All styling (purple theme)
├── public/
│   └── img/                    # Static images
├── characterPrompts.js         # AI character personalities
├── server.js                   # Express.js backend
├── package.json                # Dependencies
├── .env                        # Environment variables (create this)
└── README.md                   # This file
```

## 🎭 Available Characters

### Girlfriends
- **Love Quinn** - Passionate and intense chef with deep emotional devotion
- **Caroline Forbes** - Bubbly Type-A perfectionist with a golden heart
- **Hermione Granger** - Brilliant, logical, and deeply principled witch
- **Gwen Stacy** - Brave and witty superhero with Gen-Z humor

### Boyfriends
- **Joe Goldberg** - Mysterious bookworm with poetic soul
- **Aaron Warner** - Cold exterior hiding a romantic heart
- **Steve Harrington** - Reformed popular kid with genuine warmth
- **Damon Salvatore** - Charming bad boy with hidden depths

## 🛠️ API Documentation

### Endpoints

#### `POST /generate`
Generate AI response for chat messages.

**Request Body:**
```json
{
  "prompt": "Hello, how are you?",
  "character": "Love Quinn"
}
```

**Response:**
```json
{
  "response": "Hey! I'm doing great, thinking about you..."
}
```

#### `POST /create-character`
Create a custom AI character.

**Request Body:**
```json
{
  "name": "Custom Character",
  "description": "Brief description",
  "personality": "Detailed personality traits",
  "avatar": "😊",
  "gender": "girlfriend"
}
```

#### `POST /set-mood`
Set character mood for responses.

**Request Body:**
```json
{
  "character": "Love Quinn",
  "mood": "flirty"
}
```

**Available Moods:** `happy`, `sad`, `flirty`, `energetic`, `calm`

#### `POST /generate-vent`
Generate supportive response for venting.

**Request Body:**
```json
{
  "ventText": "I had a really tough day...",
  "character": "Love Quinn"
}
```

#### `GET /health`
Check API and server health status.

**Response:**
```json
{
  "status": "ok",
  "totalApiKeys": 3,
  "availableApiKeys": 3,
  "rateLimitedKeys": 0,
  "uptime": 3600
}
```

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `GOOGLE_API_KEY` | Comma-separated Gemini API keys | - | ✅ Yes |
| `PORT` | Server port | 3000 | ❌ No |
| `NODE_ENV` | Environment mode | development | ❌ No |
| `MONGODB_URI` | MongoDB connection string | mongodb://localhost:27017 | ❌ No |

### Rate Limiting

The application implements intelligent rate limiting:
- **Window**: 60 seconds
- **Max Requests**: 15 per window (scales with number of API keys)
- **Minimum Interval**: 3 seconds between requests
- **Retry Logic**: Automatic retry with exponential backoff

### Security Features

- **Helmet.js**: Security headers (CSP, XSS protection)
- **Input Validation**: Type checking and length limits
- **Input Sanitization**: HTML escaping to prevent XSS
- **Request Size Limits**: 10KB maximum request body
- **API Key Rotation**: Prevents single point of failure

## 🎨 Customization

### Adding New Characters

1. **Add character prompt** to `characterPrompts.js`:
```javascript
export const characterPrompts = {
  "Your Character": `
    You are [Character Name]. [Personality description]
    Keep responses under 100 words.
  `,
  // ... other characters
};
```

2. **Add character data** to `frontend/script.js`:
```javascript
const characters = {
  girlfriend: [
    {
      name: "Your Character",
      description: "Brief description",
      avatar: "💕"
    }
  ]
};
```

### Customizing Colors

The application uses a purple OKLCH color scheme defined in `frontend/styles.css`:

```css
:root {
  --bg-dark: oklch(0.1 0.1 305);
  --bg: oklch(0.15 0.1 305);
  --primary: oklch(0.76 0.2 305);
  /* ... more colors */
}
```

Modify these CSS variables to change the entire color scheme.

## 📱 Responsive Design

The application is fully responsive and optimized for:

- **Mobile** (320px - 767px): Touch-optimized interface with 44px minimum touch targets
- **Tablet** (768px - 1024px): 2-column layouts with optimized spacing
- **Desktop** (1025px+): Full-featured interface with hover effects

## 🆘 Troubleshooting

### Common Issues

**API Not Responding**
- ✅ Check your API keys in `.env`
- ✅ Verify quota limits in [Google Cloud Console](https://console.cloud.google.com)
- ✅ Ensure multiple API keys for better reliability
- ✅ Check `/health` endpoint for API status

**Rate Limiting Errors**
- ⏳ Wait for rate limit to reset (check console for timing)
- 🔑 Add more API keys to `.env` for higher throughput
- 📊 Monitor usage in Google Cloud Console

**Character Not Loading**
- 🔤 Verify character name spelling matches exactly
- 📝 Check `characterPrompts.js` for character definition
- 🗑️ Clear browser localStorage if needed

**Styling Issues**
- 🔄 Hard refresh browser (Ctrl+F5 or Cmd+Shift+R)
- 🧹 Clear browser cache
- 🌐 Try a different browser

### Debug Mode

Enable debug mode by setting in `.env`:
```env
NODE_ENV=development
```

This will show detailed error messages and stack traces.

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Google Gemini AI** for powering the conversational AI
- **Express.js** for the robust backend framework
- **Inter & Poppins** fonts from Google Fonts
- All the amazing fictional characters that inspired our AI personalities

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Troubleshooting](#-troubleshooting) section
2. Review existing [GitHub Issues](https://github.com/yourusername/TrueCompanion/issues)
3. Create a new issue with detailed information

## 🔮 Future Enhancements

- [ ] Voice chat capabilities
- [ ] Image generation for characters
- [ ] Conversation history with MongoDB
- [ ] Multi-language support
- [ ] Advanced personality customization
- [ ] Group chat with multiple characters

---

**Made with 💜 by the TrueCompanion Team**

*Your AI companion awaits...*
