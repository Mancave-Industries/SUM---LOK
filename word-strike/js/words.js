// words.js — word bank, selection and validation. No DOM access.

// Each word is tagged with a loose category so board setup can avoid
// drawing four thematically-clustered words in the same game.
const BANK_4 = [
  ["WAVE", "nature"], ["DUSK", "nature"], ["LOCK", "object"], ["FIRE", "nature"],
  ["GOLD", "material"], ["MOON", "sky"], ["STAR", "sky"], ["WIND", "nature"],
  ["RAIN", "weather"], ["SNOW", "weather"], ["LEAF", "plant"], ["TREE", "plant"],
  ["BIRD", "animal"], ["FISH", "animal"], ["LION", "animal"], ["BEAR", "animal"],
  ["WOLF", "animal"], ["DEER", "animal"], ["GOAT", "animal"], ["MULE", "animal"],
  ["DUCK", "animal"], ["CRAB", "animal"], ["FROG", "animal"], ["MOTH", "animal"],
  ["BONE", "body"], ["SKIN", "body"], ["HAIR", "body"], ["HAND", "body"],
  ["FOOT", "body"], ["HEAD", "body"], ["IRON", "material"], ["ROCK", "material"],
  ["SAND", "material"], ["SALT", "food"], ["MILK", "food"], ["CAKE", "food"],
  ["SOUP", "food"], ["RICE", "food"], ["CORN", "food"], ["BEAN", "food"],
  ["MEAT", "food"], ["CHIP", "food"], ["SOAP", "object"], ["LAMP", "object"],
  ["DESK", "object"], ["DOOR", "structure"], ["GATE", "structure"], ["ROOF", "structure"],
  ["WALL", "structure"], ["ROAD", "structure"],
];

const BANK_5 = [
  ["FLAME", "nature"], ["GHOST", "abstract"], ["TRACK", "object"], ["RIVER", "nature"],
  ["STONE", "material"], ["CLOUD", "sky"], ["STORM", "weather"], ["BEACH", "place"],
  ["FIELD", "place"], ["HOUSE", "structure"], ["MOUSE", "animal"], ["HORSE", "animal"],
  ["TIGER", "animal"], ["EAGLE", "animal"], ["SHARK", "animal"], ["WHALE", "animal"],
  ["CHESS", "game"], ["MUSIC", "abstract"], ["PAINT", "object"], ["BRUSH", "object"],
  ["CHAIR", "object"], ["TABLE", "object"], ["BREAD", "food"], ["APPLE", "food"],
  ["GRAPE", "food"], ["LEMON", "food"], ["MANGO", "food"], ["PEACH", "food"],
  ["CANDY", "food"], ["SUGAR", "food"], ["HONEY", "food"], ["CREAM", "food"],
  ["STEAK", "food"], ["PASTA", "food"], ["PIZZA", "food"], ["SALAD", "food"],
  ["JUICE", "food"], ["WATER", "nature"], ["OCEAN", "nature"], ["RADIO", "object"],
  ["VIDEO", "object"], ["PHONE", "object"], ["CLOCK", "object"], ["WATCH", "object"],
  ["LIGHT", "abstract"],
];

const BANK_6 = [
  ["PLANET", "sky"], ["BRIDGE", "structure"], ["CASTLE", "structure"], ["GARDEN", "place"],
  ["FOREST", "place"], ["DESERT", "place"], ["ISLAND", "place"], ["VALLEY", "place"],
  ["CANYON", "place"], ["HARBOR", "place"], ["TUNNEL", "structure"], ["TEMPLE", "structure"],
  ["MARKET", "place"], ["ENGINE", "object"], ["ROCKET", "object"], ["SILVER", "material"],
  ["COPPER", "material"], ["BRONZE", "material"], ["VELVET", "material"], ["COTTON", "material"],
  ["RIBBON", "object"], ["PENCIL", "object"], ["CRAYON", "object"], ["PUZZLE", "game"],
  ["MARBLE", "material"], ["JUNGLE", "place"], ["BASKET", "object"], ["BUCKET", "object"],
  ["BOTTLE", "object"], ["BUTTON", "object"], ["BURGER", "food"], ["CANDLE", "object"],
  ["CIRCLE", "shape"], ["CORNER", "shape"], ["COUPLE", "abstract"], ["CRISIS", "abstract"],
  ["DRIVER", "role"], ["DRAGON", "animal"], ["FALCON", "animal"], ["FLIGHT", "abstract"],
  ["FOLDER", "object"], ["FRIDGE", "object"], ["GALAXY", "sky"], ["GOLDEN", "abstract"],
  ["GROUND", "nature"], ["HAMMER", "object"], ["HELMET", "object"], ["JACKET", "object"],
  ["LAGOON", "place"], ["MEADOW", "place"],
];

const BANK_7 = [
  ["CAPTURE", "abstract"], ["KINGDOM", "place"], ["JOURNEY", "abstract"], ["CRYSTAL", "material"],
  ["DIAMOND", "material"], ["FREEDOM", "abstract"], ["HARMONY", "abstract"], ["MYSTERY", "abstract"],
  ["VICTORY", "abstract"], ["FANTASY", "abstract"], ["HORIZON", "sky"], ["COMPASS", "object"],
  ["GALLERY", "place"], ["LIBRARY", "place"], ["MACHINE", "object"], ["NETWORK", "abstract"],
  ["PACKAGE", "object"], ["PICTURE", "object"], ["PROBLEM", "abstract"], ["PROJECT", "abstract"],
  ["QUALITY", "abstract"], ["QUANTUM", "abstract"], ["SEGMENT", "abstract"], ["STATION", "place"],
  ["STORAGE", "abstract"], ["TEXTURE", "abstract"], ["THEATER", "place"], ["VILLAGE", "place"],
  ["WEATHER", "nature"], ["AMBIENT", "abstract"], ["ARCHIVE", "place"], ["BALANCE", "abstract"],
  ["BENEATH", "abstract"], ["CENTURY", "abstract"], ["CHAPTER", "abstract"], ["CIRCUIT", "object"],
  ["COMFORT", "abstract"], ["CONTACT", "abstract"], ["CONTENT", "abstract"], ["CONTEST", "abstract"],
  ["CULTURE", "abstract"], ["CURRENT", "abstract"], ["DESKTOP", "object"],
];

export const WORD_BANK = {
  4: BANK_4.map(([w]) => w),
  5: BANK_5.map(([w]) => w),
  6: BANK_6.map(([w]) => w),
  7: BANK_7.map(([w]) => w),
};

const CATEGORY_LOOKUP = new Map();
for (const bank of [BANK_4, BANK_5, BANK_6, BANK_7]) {
  for (const [word, category] of bank) CATEGORY_LOOKUP.set(word, category);
}

export function categoryOf(word) {
  return CATEGORY_LOOKUP.get(word) || "misc";
}

export function isValidWord(word) {
  if (typeof word !== "string") return false;
  return /^[A-Z]{4,7}$/.test(word);
}

/**
 * Picks one word of each required length (7, 6, 5, 4), preferring a
 * combination whose categories aren't all identical so a single game
 * doesn't feel like four variations on the same theme.
 */
export function pickWordSet(rng) {
  const lengths = [7, 6, 5, 4];
  const MAX_ATTEMPTS = 25;
  let best = null;
  let bestDiversity = -1;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const chosen = lengths.map((len) => {
      const list = WORD_BANK[len];
      return list[Math.floor(rng() * list.length)];
    });
    const categories = new Set(chosen.map(categoryOf));
    if (categories.size === chosen.length) {
      return chosen; // fully diverse, good enough
    }
    if (categories.size > bestDiversity) {
      bestDiversity = categories.size;
      best = chosen;
    }
  }
  return best;
}
