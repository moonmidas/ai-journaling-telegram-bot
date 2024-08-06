# Journal Bot

A Telegram bot that allows users to create, retrieve, and analyze journal entries. The bot uses OpenAI's GPT-4 model to generate insights and actionable steps based on the user's entries.

## Features

- Create new journal entries
- Retrieve entries by date range
- Generate insights and actionable steps based on the user's entries

## Installation

1. Clone the repository:

```bash
git clone https://github.com/moonmidas/journal-bot.git
```

2. Install dependencies:

```bash
cd journal-bot
npm install
```

3. Go to telegram and message @BotFather to get your bot token.
4. Go to MongoDB Atlas and create a new cluster.
5. Go to OpenAI Platform and create a new account.

6. Create a `.env` file in the project root directory and add your OpenAI API, MongoDB, and Telegram Bot key:

```bash
OPENAI_API_KEY=your_openai_api_key
MONGODB_URI=your_mongodb_uri
BOT_TOKEN=your_telegram_bot_token
```

7. Run the bot:

```bash
npm start
```

## Usage

1. Start the bot by sending `/start` to the bot.