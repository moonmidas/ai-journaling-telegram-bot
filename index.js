const { Telegraf, Scenes, session, Markup } = require('telegraf');
const mongoose = require('mongoose');
const OpenAI = require('openai');
const dotenv = require('dotenv');
const moment = require('moment');

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch((err) => console.error('MongoDB connection error:', err));


// Journal Entry Schema
const JournalEntrySchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  content: { type: String, required: true },
});

JournalEntrySchema.index({ userId: 1, date: -1 });
const JournalEntry = mongoose.model('JournalEntry', JournalEntrySchema);

// Helper function
async function displayEntries(ctx, startDate, endDate) {
  const entries = await JournalEntry.find({
    userId: ctx.from.id,
    date: { $gte: startDate, $lte: endDate }
  }).sort({ date: -1 });

  if (entries.length === 0) {
    ctx.reply('No entries found for the selected date range.', entriesListKeyboard);
    return null;
  }

  let response = `Entries from ${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}:\n\n`;
  entries.forEach((entry, index) => {
    response += `${index + 1}. ${moment(entry.date).format('YYYY-MM-DD')}: ${entry.content.substring(0, 50)}...\n\n`;
  });

  if (response.length > 4096) {
    const chunks = response.match(/(.|[\r\n]){1,4096}/g);
    for (let chunk of chunks) {
      await ctx.reply(chunk);
    }
  } else {
    await ctx.reply(response);
  }

  await ctx.reply('Enter the number of the entry you want to read in full, or select an option:', entriesListKeyboard);
  
  // Store the date range and entries in the session for later use
  ctx.session.startDate = startDate;
  ctx.session.endDate = endDate;
  ctx.session.entries = entries;

  return entries;
}

// NEW ENTRY SCENE
const newEntryScene = new Scenes.WizardScene(
  'newEntry',
  (ctx) => {
    ctx.reply('Please enter your journal entry:', Markup.keyboard(['Cancel']).resize());
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (ctx.message.text === 'Cancel') {
      ctx.reply('Entry cancelled.', mainMenu);
      return ctx.scene.leave();
    }

    const newEntry = new JournalEntry({
      userId: ctx.from.id,
      content: ctx.message.text,
    });

    try {
      await newEntry.save();
      ctx.reply('Journal entry saved successfully!', Markup.removeKeyboard());
    } catch (error) {
      console.error('Error saving journal entry:', error);
      ctx.reply('Sorry, there was an error saving your entry. Please try again.', Markup.removeKeyboard());
    }

    return ctx.scene.leave();
  }
);

// RETRIEVE ENTRIES SCENE
// Modified helper function
async function displayEntries(ctx, startDate, endDate) {
    const entries = await JournalEntry.find({
      userId: ctx.from.id,
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: -1 });
  
    if (entries.length === 0) {
      ctx.reply('No entries found for the selected date range.', Markup.removeKeyboard());
      return null;
    }
  
    let response = `Entries from ${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}:\n\n`;
    entries.forEach((entry, index) => {
      response += `${index + 1}. ${moment(entry.date).format('YYYY-MM-DD')}: ${entry.content.substring(0, 50)}...\n\n`;
    });
  
    if (response.length > 4096) {
      const chunks = response.match(/(.|[\r\n]){1,4096}/g);
      for (let chunk of chunks) {
        await ctx.reply(chunk);
      }
    } else {
      ctx.reply(response);
    }
  
    ctx.reply('Enter the number of the entry you want to read in full, or type "done" to finish.');
    return entries;
  }
  
  const retrieveEntriesScene = new Scenes.WizardScene(
    'retrieveEntries',
    (ctx) => {
      ctx.reply('Select a date range:', Markup.keyboard([
        ['Last 7 days', 'Last 30 days'],
        ['Custom range', 'All entries'],
        ['Back to Main Menu']
      ]).resize());
      return ctx.wizard.next();
    },
    async (ctx) => {
      if (ctx.message.text === 'Back to Main Menu') {
        ctx.reply('Returning to main menu.', mainMenu);
        return ctx.scene.leave();
      }
  
      let startDate, endDate;
      const now = moment();
  
      switch (ctx.message.text) {
        case 'Last 7 days':
          startDate = now.clone().subtract(7, 'days').startOf('day');
          endDate = now.toDate();
          break;
        case 'Last 30 days':
          startDate = now.clone().subtract(30, 'days').startOf('day');
          endDate = now.toDate();
          break;
        case 'Custom range':
          ctx.reply('Please enter the start date (YYYY-MM-DD):');
          return ctx.wizard.next();
        case 'All entries':
          startDate = moment(0); // Unix epoch start
          endDate = now.toDate();
          break;
        default:
          ctx.reply('Invalid option. Please try again.');
          return;
      }
  
      if (startDate) {
        const entries = await displayEntries(ctx, startDate.toDate(), endDate);
        if (entries) {
          ctx.session.entries = entries;
          return ctx.wizard.selectStep(ctx.wizard.cursor + 3); // Skip to entry selection step
        } else {
          return ctx.scene.leave();
        }
      }
    },
    (ctx) => {
      const startDate = moment(ctx.message.text, 'YYYY-MM-DD', true);
      if (!startDate.isValid()) {
        ctx.reply('Invalid date format. Please enter the start date (YYYY-MM-DD):');
        return;
      }
      ctx.session.startDate = startDate;
      ctx.reply('Please enter the end date (YYYY-MM-DD):');
      return ctx.wizard.next();
    },
    async (ctx) => {
      const endDate = moment(ctx.message.text, 'YYYY-MM-DD', true);
      if (!endDate.isValid()) {
        ctx.reply('Invalid date format. Please enter the end date (YYYY-MM-DD):');
        return;
      }
      const entries = await displayEntries(ctx, ctx.session.startDate.toDate(), endDate.toDate());
      if (entries) {
        ctx.session.entries = entries;
        return ctx.wizard.next();
      } else {
        return ctx.scene.leave();
      }
    },
    async (ctx) => {
        // Ignore other inputs if we're generating insights
        if (ctx.session.generatingInsights) {
          await ctx.reply("Please wait, I'm still generating insights...");
          return;
        }
        if (ctx.message.text.toLowerCase() === 'done') {
          ctx.reply('Retrieval complete.', mainMenu);
          return ctx.scene.leave();
        }
        
        if (ctx.message.text === '🏠 Back to Main Menu') {
            ctx.reply('Returning to main menu.', mainMenu);
            return ctx.scene.leave();
          }
        
        if (ctx.message.text === '📖 Back to Entries') {
          // Re-display the list of entries
          await displayEntries(ctx, ctx.session.startDate, ctx.session.endDate);
          return;
        }
      
        if (ctx.message.text === '📊 Get Entry Insights') {
          if (ctx.session.currentEntry) {
            // Set a flag in the session to indicate we're generating insights
            ctx.session.generatingInsights = true;
            await getEntryInsights(ctx, ctx.session.currentEntry);
            // Reset the flag after generating insights
            ctx.session.generatingInsights = false;
          } else {
            ctx.reply('No entry selected. Please choose an entry first.', entryViewKeyboard);
          }
          return;
        }
      
        const entryNumber = parseInt(ctx.message.text) - 1;
        if (isNaN(entryNumber) || entryNumber < 0 || entryNumber >= ctx.session.entries.length) {
          ctx.reply('Invalid entry number. Please try again, type "done" to finish, or "Back to Main Menu" to return.');
          return;
        }
      
        const fullEntry = ctx.session.entries[entryNumber];
        ctx.session.currentEntry = fullEntry; // Store the current entry for insights
        await ctx.reply(`Full entry for ${moment(fullEntry.date).format('YYYY-MM-DD')}:\n\n${fullEntry.content}`, entryViewKeyboard);

        ctx.reply('Select an option or enter another entry number to read more.', entryViewKeyboard);
        return;
      }
  );

// INSIGHTS SCENE
const insightsScene = new Scenes.WizardScene(
  'insights',
  async (ctx) => {
    const entries = await JournalEntry.find({ userId: ctx.from.id }).sort({ date: -1 }).limit(10);
    if (entries.length === 0) {
      ctx.reply('No entries found to generate insights.', Markup.removeKeyboard());
      return ctx.scene.leave();
    }

    const entriesText = entries.map(entry => entry.content).join('\n\n');
    
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-2024-05-13',
        messages: [
          { role: 'system', content: 'You are an AI assistant that provides insights based on journal entries.' },
          { role: 'user', content: `Please provide insights and patterns based on these journal entries:\n\n${entriesText}` }
        ],
        max_tokens: 500
      });

      ctx.reply(`Here are some insights based on your recent entries:\n\n${response.choices[0].message.content}`, 
        Markup.keyboard(['Back to Main Menu']).resize());
    } catch (error) {
      console.error('Error generating insights:', error);
      ctx.reply('Sorry, there was an error generating insights. Please try again later.', 
        Markup.keyboard(['Back to Main Menu']).resize());
    }

    return ctx.wizard.next();
  },
  (ctx) => {
    if (ctx.message.text === 'Back to Main Menu') {
      ctx.reply('Returning to main menu.', Markup.removeKeyboard());
      return ctx.scene.leave();
    }
  }
);

// INSIGHTS FUNCTIONS
async function getEntryInsights(ctx, entry) {
  try {

    // Remove keyboard and show "generating" message
    await ctx.reply('Generating insights... Please wait.', Markup.removeKeyboard());

    // Send "typing" action to show the bot is processing
    await ctx.sendChatAction('typing');
    const prompt = `Analyze the following journal entry and provide insightful observations about the writer's thoughts, feelings, and behaviors. Also, suggest one or two actionable steps the writer could take based on this entry. Here's the entry:

${entry.content}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-2024-05-13", // You can use "gpt-4" if you have access to it
      messages: [
        { role: 'system', content: `You are a world renowned life coach, and journaling expert that provides insights based on journal entries. Your response is casual, as if you were talking to a friend. Never refer to the person as "the writer", say "you" instead.
          Please format your response in the following way:
1. Key Observations:
   - [Observation 1]
   - [Observation 2]
   - [Observation 3]

2. Potential Patterns:
   - [Pattern 1]
   - [Pattern 2]

3. Actionable Steps:
   - [Step 1]
   - [Step 2]

4. Further Thoughts, Reflections, and Recommendations:
   - [Thought 1]
   - [Thought 2]
   - [Thought 3]

   5. Questions that could help you journey further:
   - [Question 1]
   - [Question 2]
   - [Question 3]
          ` 
        },
        { role: "user", content: prompt }
      ],
      max_tokens: 900,
      temperature: 0.7,
    });

    const insights = response.choices[0].message.content.trim();
    
    await ctx.reply(`Insights for entry on ${moment(entry.date).format('YYYY-MM-DD')}:\n\n${insights}`, entryViewKeyboard);
  } catch (error) {
    console.error('Error generating insights:', error);
    await ctx.reply('I apologize, but I encountered an error while generating insights. Please try again later.', entryViewKeyboard);
  }
}

// Create stage with all scenes
const stage = new Scenes.Stage([newEntryScene, retrieveEntriesScene, insightsScene]);

// Set up session and stage middleware
bot.use(session());
bot.use(stage.middleware());

// MENUS
const mainMenu = Markup.keyboard([
  ['📝 New Entry', '📚 Retrieve Entries'],
  ['🧠 Get Insights', '❓ Help']
]).resize();

const entryViewKeyboard = Markup.keyboard([
    ['📊 Get Entry Insights'],
    ['📖 Back to Entries', '🏠 Back to Main Menu']
  ]).resize();

const entriesListKeyboard = Markup.keyboard([
  ['Last 7 days', 'Last 30 days'],
  ['Custom range', 'All entries'],
  ['🏠 Back to Main Menu']
]).resize();

// Start command
bot.command('start', (ctx) => {
  ctx.reply('Welcome to your journaling bot!', mainMenu);
});

bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}`, err);
  // Reset the generating insights flag in case of an error
  if (ctx.session) {
    ctx.session.generatingInsights = false;
  }
  ctx.reply('An error occurred while processing your request. Please try again later.', entryViewKeyboard);
});

// Handle button clicks
bot.hears('📝 New Entry', (ctx) => ctx.scene.enter('newEntry'));
bot.hears('📚 Retrieve Entries', (ctx) => ctx.scene.enter('retrieveEntries'));
bot.hears('🧠 Get Insights', (ctx) => ctx.scene.enter('insights'));
bot.hears('❓ Help', (ctx) => {
  ctx.reply('Here are the available commands:\n\n' +
    '📝 New Entry - Create a new journal entry\n' +
    '📚 Retrieve Entries - View your past entries with date range selection\n' +
    '🧠 Get Insights - Get AI-powered insights from your entries\n' +
    '❓ Help - Show this help message');
});
bot.hears('🏠 Back to Main Menu', (ctx) => {
  ctx.reply('Main Menu', mainMenu);
});
bot.hears('📖 Back to Entries', async (ctx) => {
  if (ctx.scene.current) {
    await ctx.scene.reenter();
  } else {
    ctx.reply('Please start by retrieving entries first.', mainMenu);
  }
});

bot.launch();
console.log('Bot is running...');

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));