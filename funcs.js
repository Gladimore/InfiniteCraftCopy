const Together = require("together-ai");
const fs = require("fs");
const { Client } = require('pg');

const prompt = `You are a helpful assistant that helps people to craft new things by combining two words into a new word. No sentences, no phrases, no multiple words, no punctuation, no special characters, no numbers, no emojis, no URLs, no code, no commands, no programming. The answer has to be a noun. The order of the both words does not matter, both are equally important. The answer has to be related to both words and the context of the words. The answer can either be a combination of the words or the role of one word in relation to the other. Answers can be things, materials, people, companies, animals, occupations, food, places, objects, emotions, events, concepts, natural phenomena, body parts, vehicles, sports, clothing, furniture, technology, buildings, technology, instruments, beverages, plants, academic subjects and everything else you can think of that is a noun. The result should be JSON formatted, like {emoji: emoji correlating to combination, combination: combination from result}.

Some examples are:
1. Water + Fire = Steam
2. Water + Wind = Wave
3. Water + Earth = Plant
4. Water + Water = Ocean
5. Fire + Wind = Smoke
6. Fire + Earth = Lava
7. Fire + Fire = Lava
8. Wind + Wind = Tornado
9. Wind + Earth = Dust
10. Earth + Earth = Mountain

If the elements can be downgraded to the starting elements then do it, for example Ocean = Water, Smoke = Wind, etc.`

const together = new Together({ 
  apiKey: process.env.TOGETHER_API_KEY });

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

// Function to check if a combination exists in the database for a specific word
const checkCombinationExists = async (word) => {
  try {
    const query = `
      SELECT * FROM combinations
      WHERE $1 = ANY(elements);
    `;
    const values = [word];
    const res = await pgClient.query(query, values);

    if (res.rows.length > 0) {
      console.log('Combination found in PostgreSQL:', res.rows);
      return true;
    } else {
      console.log('No combination found for the word:', word);
      return false;
    }
  } catch (error) {
    console.error('Error checking combination in PostgreSQL:', error);
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

async function combineElements(key, element1, element2) {
  const sorted = [element1, element2].sort();
  const [w1, w2] = sorted;
  
  if (key == process.env.KEY && w1 && w2) {
    const combo = await getCombinationAndEmojiFromDB([w1, w2])
    
    if (!combo) {
      const response = await together.chat.completions.create({
        messages: [
          {
            role: "system",
            content: prompt
          },
          {role: "user", content: `Combine “${w1}” and “${w2}”, the first letter of the combination should be capitalized.`}
        ],
        model: "mistralai/Mistral-7B-Instruct-v0.3",
        max_tokens: 512,
        temperature: 0.3,
        top_p: 0.7,
        top_k: 50,
        repetition_penalty: 1,
        stop: ["</s>"],
      });
      const js = JSON.parse(response.choices[0].message.content);

      js.new = checkCombinationExists(js.combination);
      
      if (!js.elements) js.elements = [w1, w2];
    
      await saveCombinationAndEmojiToDB(js.elements, js.emoji, js.combination);

      return js;
    } else return combo
  } else throw new Error('Invalid key');
}

module.exports = combineElements;
