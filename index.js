const { CohereClient } = require('cohere-ai');
const express = require('express');
const emoji = require('node-emoji');
const { Client } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const cohere = new CohereClient({
  token: process.env.API_KEY,
});

const pgClient = new Client({
  connectionString: process.env.DATABASE_URL
});
pgClient.connect();

// Function to create table if not exists
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
    const res = await pgClient.query(query);
    console.log('Table "combinations" created successfully');
  } catch (error) {
    console.error('Error creating table:', error);
  }
}

// Call createTable function to ensure table exists
createTable();

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
          message: `Combine these elements: ${text1}, ${text2}. What is the result of the combinations being together? Short and straightforward, as only word.`,
        });
        const combinedText = response.text.replace(/[^\w\s]/gi, '');

        // Get emoji or fetch from AI
        let emojiSymbol = await getEmojiFromDB(combinedText);
        if (!emojiSymbol) {
          emojiSymbol = await textToEmoji(combinedText);
          await saveCombinationAndEmojiToDB([text1, text2], emojiSymbol, combinedText);
        }

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

// Function to save emoji to database
const saveEmojiToDB = async (text, emojiSymbol) => {
  try {
    const query = `
      INSERT INTO combinations (elements, emoji, combination)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const values = [[], emojiSymbol, text];
    const res = await pgClient.query(query, values);
    console.log('Emoji saved to PostgreSQL:', res.rows[0]);
  } catch (error) {
    console.error('Error saving emoji to PostgreSQL:', error);
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
          message: `What emoji is this? ${text}. And only give me the emoji.`,
        });
        const emojiSymbol = res.text;
        await saveEmojiToDB(text, emojiSymbol);
        return emojiSymbol;
      }
    } catch (error) {
      console.error('Error fetching emoji:', error);
      throw error;
    }
  }
}

// API endpoint to combine elements
app.get('/api/combine', async (req, res) => {
  const text1 = req.query.ele1;
  const key = req.query.key;
  const text2 = req.query.ele2;

  try {
    const result = await combineElements(text1, key, text2);
    res.json(result);
  } catch (error) {
    console.error('Error combining elements:', error);
    res.sendStatus(500);
  }
});

// Default route for handling 404 errors
app.get('*', (req, res) => {
  res.sendStatus(404);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
