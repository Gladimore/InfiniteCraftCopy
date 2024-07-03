# InfiniteCraft

InfiniteCraft is an element-combining game built using Node.js, Express, and PostgreSQL. Players can discover new elements by combining existing ones, and the results are enhanced with emoji representations.

## Features

- **Element Combination:** Combine elements to discover new ones.
- **Emoji Integration:** Each combination is represented with an emoji.
- **Database Storage:** Store and retrieve combinations and emojis from a PostgreSQL database.
- **AI Assistance:** Use Cohere's AI to determine new combinations and appropriate emojis.

## API Endpoints

### Combine Elements

**Endpoint:** `/api/combine`

**Method:** `GET`

**Parameters:**

- `ele1`: The first element to combine.
- `key`: A key for authorization.
- `ele2`: The second element to combine.

**Example Request:**
```bash
curl "http://localhost:3000/api/combine?ele1=water&key=your_key&ele2=fire"
```
