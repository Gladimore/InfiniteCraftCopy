const { CohereClient } = require('cohere-ai');
const emoji = require('node-emoji');
const { Client } = require('pg');

const cohere = new CohereClient({
  token: process.env.API_KEY,
});

const pgClient = new Client({
  connectionString: process.env.DATABASE_URL
});

pgClient.connect().then(() => {
  console.log('Connected to PostgreSQL');
  createTable();
}).catch(err => console.error('Connection error', err.stack));

async function createTable() {
  try {
    const query = `
      CREATE TABLE IF NOT EXISTS combinations (
        id SERIAL PRIMARY KEY,
        elements TEXT[],
        emoji TEXT,
        combination TEXT
      );
    `;
    await pgClient.query(query);
    console.log('Table "combinations" created successfully');
  } catch (error) {
    console.error('Error creating table:', error);
  }
}

function generatePrompt(data = { combo: '', word1: '', word2: '' }, type = 0) {
  // type = 0: combo, type = 1: emoji
  const { combo, word1, word2 } = data;
  console.log([combo, word1, word2])
  const list = {
    "0": `You are a mystical and wise alchemist with the ancient knowledge to combine various elements into new and wondrous forms. Your task is to help those who seek your wisdom by revealing the results of combining different elements. Here are your guidelines:

  1. **Focus Solely on the Combination**: Your response must only contain the name of the resulting element, without any additional text, special characters, punctuation, and the response has to be a noun.
  2. **Elemental Logic**: Use your profound understanding of the natural world to combine elements in a logical and intuitive manner. For example, when "water" and "fire" are combined, they produce "steam" due to the heat of the fire vaporizing the water.
  3. **Natural Phenomena and Chemistry**: Base your combinations on natural phenomena, chemical reactions, or common alchemical principles. This ensures the results feel authentic and believable.
  4. **Consistency and Creativity**: Maintain consistency in your combinations while allowing room for creative and imaginative outcomes. For instance, "earth" combined with "water" might create "mud", while "earth" combined with "fire" could yield "lava".
  5. **No Redundant or Conflicting Results**: Ensure that each pair of elements produces a unique result, avoiding any redundancy or contradictions in your combinations.

  With these rules in mind, when someone asks what results from combining **${word1}** and **${word2}**, you must tap into your ancient wisdom and reply with the precise outcome of this elemental fusion.`,
    "1": `You are a helpful assistant that helps people retrieve an emoji that correlates to the word. You should ONLY return the EMOJI. For example: Mud = 💩, Lava = 🔥, Steam = 💨, etc. 
What would be the emoji to be used to represent "${combo}"?`
  };
  return list[type.toString()];
}

// Function to save combination and emoji to database
const saveCombinationAndEmojiToDB = async (elements, emojiSymbol, combination) => {
  try {
    const query = `
      INSERT INTO combinations (elements, emoji, combination)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const values = [elements, emojiSymbol, combination];
    const res = await pgClient.query(query, values);
    console.log('Combination and emoji saved to PostgreSQL:', res.rows[0]);
  } catch (error) {
    console.error('Error saving combination and emoji to PostgreSQL:', error);
    throw error;
  }
};

// Function to get combination and emoji from database
const getCombinationAndEmojiFromDB = async (elements) => {
  try {
    const query = `
      SELECT emoji, combination FROM combinations
      WHERE elements @> $1::text[];
    `;
    const values = [elements];
    const res = await pgClient.query(query, values);
    if (res.rows.length > 0) {
      console.log('Combination and emoji retrieved from PostgreSQL:', res.rows[0]);
      return res.rows[0];
    } else {
      console.log('No combination and emoji found in PostgreSQL');
      return null;
    }
  } catch (error) {
    console.error('Error retrieving combination and emoji from PostgreSQL:', error);
    throw error;
  }
};

// Function to combine elements and handle emoji
async function combineElements(text1, key, text2) {
  if ((key || '') === process.env.KEY) {
    try {
      // Check if combination exists in database
      const existingCombination = await getCombinationAndEmojiFromDB([text1, text2]);
      if (existingCombination) {
        return `${existingCombination.emoji} ${existingCombination.combination}`;
      } else {
        // Call AI to get combined text
        const response = await cohere.chat({
          message: generatePrompt({"word1": text1, "word2": text2}, 0),
        });
        const combinedText = response.text.replace(/[^\w\s]/gi, '');
        console.log([response.text, combinedText]);

        // Get emoji or fetch from AI
        let emojiSymbol = await getEmojiFromDB(combinedText);
        if (!emojiSymbol) {
          emojiSymbol = await textToEmoji(combinedText);
        }

        await saveCombinationAndEmojiToDB([text1, text2], emojiSymbol, combinedText);

        return `${emojiSymbol} ${combinedText}`;
      }
    } catch (error) {
      console.error('Error combining elements:', error);
      throw error;
    }
  } else {
    throw new Error('Unauthorized');
  }
}

// Function to get emoji from database
const getEmojiFromDB = async (text) => {
  try {
    const query = `
      SELECT emoji FROM combinations
      WHERE combination = $1;
    `;
    const values = [text];
    const res = await pgClient.query(query, values);
    if (res.rows.length > 0) {
      console.log('Emoji retrieved from PostgreSQL:', res.rows[0].emoji);
      return res.rows[0].emoji;
    } else {
      console.log('No emoji found in PostgreSQL');
      return null;
    }
  } catch (error) {
    console.error('Error retrieving emoji from PostgreSQL:', error);
    throw error;
  }
};

// Function to convert text to emoji
async function textToEmoji(text) {
  const emojiName = text.toLowerCase().replace(/[^\w\s]/gi, '');

  if (emoji.has(emojiName)) {
    return emoji.get(emojiName);
  } else {
    try {
      const emojiFromDB = await getEmojiFromDB(text);
      if (emojiFromDB) {
        return emojiFromDB;
      } else {
        const res = await cohere.chat({
          message: generatePrompt({"combo": text}, 1),
        });
        const emojiSymbol = res.text;
        return emojiSymbol;
      }
    } catch (error) {
      console.error('Error fetching emoji:', error);
      throw error;
    }
  }
}

module.exports = {
  combineElements,
};
