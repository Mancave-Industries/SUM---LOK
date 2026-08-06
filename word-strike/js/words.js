// words.js — word bank, selection and validation. No DOM access.

// Each word is tagged with a loose category so board setup can avoid
// drawing four thematically-clustered words in the same game.
const BANK_4 = [
  // nature
  ["WAVE", "nature"], ["DUSK", "nature"], ["FIRE", "nature"], ["WIND", "nature"],
  ["RAIN", "nature"], ["SNOW", "nature"], ["LEAF", "nature"], ["TREE", "nature"],
  ["HAIL", "nature"], ["MIST", "nature"], ["DAWN", "nature"], ["DUNE", "nature"],
  ["PEAK", "nature"], ["LAKE", "nature"], ["POND", "nature"], ["CAVE", "nature"],
  ["REEF", "nature"], ["COVE", "nature"], ["ISLE", "nature"],
  // sky
  ["MOON", "sky"], ["STAR", "sky"],
  // animal
  ["BIRD", "animal"], ["FISH", "animal"], ["LION", "animal"], ["BEAR", "animal"],
  ["WOLF", "animal"], ["DEER", "animal"], ["GOAT", "animal"], ["MULE", "animal"],
  ["DUCK", "animal"], ["CRAB", "animal"], ["FROG", "animal"], ["MOTH", "animal"],
  ["SEAL", "animal"], ["MINK", "animal"], ["LYNX", "animal"], ["HARE", "animal"],
  ["BOAR", "animal"], ["SWAN", "animal"], ["CARP", "animal"], ["PONY", "animal"],
  ["COLT", "animal"], ["FAWN", "animal"], ["CALF", "animal"], ["VOLE", "animal"],
  ["NEWT", "animal"], ["TOAD", "animal"], ["MOLE", "animal"], ["WASP", "animal"],
  ["FLEA", "animal"], ["GNAT", "animal"],
  // body
  ["BONE", "body"], ["SKIN", "body"], ["HAIR", "body"], ["HAND", "body"],
  ["FOOT", "body"], ["HEAD", "body"], ["NAIL", "body"], ["LIMB", "body"],
  ["PALM", "body"], ["SHIN", "body"], ["CHIN", "body"], ["LUNG", "body"],
  ["VEIN", "body"],
  // material
  ["GOLD", "material"], ["IRON", "material"], ["ROCK", "material"], ["SAND", "material"],
  ["WIRE", "material"], ["GLUE", "material"], ["TAPE", "material"], ["CORK", "material"],
  ["FOIL", "material"], ["YARN", "material"], ["SILK", "material"], ["WOOL", "material"],
  ["FELT", "material"], ["CLAY", "material"],
  // food
  ["SALT", "food"], ["MILK", "food"], ["CAKE", "food"], ["SOUP", "food"],
  ["RICE", "food"], ["CORN", "food"], ["BEAN", "food"], ["MEAT", "food"],
  ["CHIP", "food"], ["MINT", "food"], ["LIME", "food"], ["PLUM", "food"],
  ["PEAR", "food"], ["KALE", "food"], ["TUNA", "food"], ["OKRA", "food"],
  ["VEAL", "food"], ["PORK", "food"], ["BEEF", "food"], ["STEW", "food"],
  // structure
  ["DOOR", "structure"], ["GATE", "structure"], ["ROOF", "structure"], ["WALL", "structure"],
  ["ROAD", "structure"], ["PARK", "structure"], ["YARD", "structure"], ["BARN", "structure"],
  ["SHED", "structure"], ["DOCK", "structure"], ["PIER", "structure"], ["FORT", "structure"],
  ["CAMP", "structure"], ["MALL", "structure"], ["FARM", "structure"], ["SHOP", "structure"],
  // object
  ["SOAP", "object"], ["LAMP", "object"], ["DESK", "object"], ["LOCK", "object"],
  ["VEST", "object"], ["BELT", "object"], ["SOCK", "object"], ["BOOT", "object"],
  ["CAPE", "object"], ["HOOD", "object"], ["COAT", "object"], ["SHOE", "object"],
  ["RING", "object"], ["PIPE", "object"], ["FILE", "object"], ["TOOL", "object"],
  // abstract
  ["TIME", "abstract"], ["LUCK", "abstract"], ["HOPE", "abstract"], ["FEAR", "abstract"],
  ["LOVE", "abstract"], ["RISK", "abstract"], ["PLAN", "abstract"], ["IDEA", "abstract"],
  ["FACT", "abstract"], ["RULE", "abstract"], ["GOAL", "abstract"], ["TASK", "abstract"],
  ["DUTY", "abstract"], ["FAME", "abstract"], ["PAIN", "abstract"], ["EASE", "abstract"],
  ["CALM", "abstract"], ["FURY", "abstract"], ["GLEE", "abstract"], ["ZEAL", "abstract"],
  // game
  ["GOLF", "game"], ["BALL", "game"], ["TEAM", "game"], ["RACE", "game"],
  ["GAME", "game"], ["SONG", "game"], ["DRUM", "game"], ["HORN", "game"],
  ["BAND", "game"], ["BEAT", "game"], ["NOTE", "game"], ["TUNE", "game"],
];

const BANK_5 = [
  // nature
  ["FLAME", "nature"], ["RIVER", "nature"], ["STONE", "nature"], ["CLOUD", "nature"],
  ["STORM", "nature"], ["WATER", "nature"], ["OCEAN", "nature"], ["RIDGE", "nature"],
  ["CLIFF", "nature"], ["SWAMP", "nature"], ["MARSH", "nature"], ["DELTA", "nature"],
  ["CREEK", "nature"], ["BROOK", "nature"], ["GRASS", "nature"], ["PLANT", "nature"],
  ["BLOOM", "nature"], ["THORN", "nature"],
  // place
  ["BEACH", "place"], ["FIELD", "place"], ["MANOR", "place"], ["CABIN", "place"],
  ["LODGE", "place"], ["TOWER", "place"], ["VILLA", "place"], ["STAGE", "place"],
  ["STAND", "place"], ["COURT", "place"], ["ARENA", "place"],
  // structure
  ["HOUSE", "structure"],
  // animal
  ["MOUSE", "animal"], ["HORSE", "animal"], ["TIGER", "animal"], ["EAGLE", "animal"],
  ["SHARK", "animal"], ["WHALE", "animal"], ["ROBIN", "animal"], ["HERON", "animal"],
  ["OTTER", "animal"], ["PANDA", "animal"], ["ZEBRA", "animal"], ["CAMEL", "animal"],
  ["SLOTH", "animal"], ["KOALA", "animal"], ["MOOSE", "animal"], ["BISON", "animal"],
  ["RAVEN", "animal"], ["GECKO", "animal"],
  // food
  ["BREAD", "food"], ["APPLE", "food"], ["GRAPE", "food"], ["LEMON", "food"],
  ["MANGO", "food"], ["PEACH", "food"], ["CANDY", "food"], ["SUGAR", "food"],
  ["HONEY", "food"], ["CREAM", "food"], ["STEAK", "food"], ["PASTA", "food"],
  ["PIZZA", "food"], ["SALAD", "food"], ["JUICE", "food"], ["ONION", "food"],
  ["GRAIN", "food"], ["SPICE", "food"], ["SYRUP", "food"], ["MELON", "food"],
  ["GUAVA", "food"],
  // object
  ["PAINT", "object"], ["BRUSH", "object"], ["CHAIR", "object"], ["TABLE", "object"],
  ["RADIO", "object"], ["VIDEO", "object"], ["PHONE", "object"], ["CLOCK", "object"],
  ["WATCH", "object"], ["KNIFE", "object"], ["SPOON", "object"], ["PLATE", "object"],
  ["TOWEL", "object"], ["BLADE", "object"], ["CHAIN", "object"], ["CROWN", "object"],
  ["SWORD", "object"],
  // abstract
  ["GHOST", "abstract"], ["MUSIC", "abstract"], ["LIGHT", "abstract"], ["DREAM", "abstract"],
  ["PEACE", "abstract"], ["FAITH", "abstract"], ["PRIDE", "abstract"], ["GRACE", "abstract"],
  ["MAGIC", "abstract"], ["POWER", "abstract"], ["FORCE", "abstract"], ["VALUE", "abstract"],
  ["TRUTH", "abstract"], ["LOGIC", "abstract"], ["LEVEL", "abstract"], ["SPACE", "abstract"],
  // game
  ["CHESS", "game"], ["TRACK", "game"], ["RUGBY", "game"], ["BOXER", "game"],
  ["MEDAL", "game"], ["RALLY", "game"], ["SCORE", "game"], ["COACH", "game"],
  ["ROUND", "game"],
  // verb
  ["BEGIN", "verb"], ["CATCH", "verb"], ["REACH", "verb"], ["TEACH", "verb"],
  ["LEARN", "verb"], ["BUILD", "verb"], ["CARRY", "verb"], ["GUARD", "verb"],
  ["GUIDE", "verb"], ["SHARE", "verb"], ["SPEAK", "verb"], ["SOUND", "verb"],
  ["SMELL", "verb"], ["TASTE", "verb"], ["TOUCH", "verb"], ["THINK", "verb"],
  ["DANCE", "verb"], ["LAUGH", "verb"], ["SMILE", "verb"],
  // clothing
  ["JEANS", "clothing"], ["SHIRT", "clothing"], ["PANTS", "clothing"], ["GLOVE", "clothing"],
  ["SCARF", "clothing"], ["CLOAK", "clothing"], ["TUNIC", "clothing"], ["DRESS", "clothing"],
  // color
  ["BLACK", "color"], ["WHITE", "color"], ["GREEN", "color"], ["BROWN", "color"],
  ["CORAL", "color"], ["AMBER", "color"], ["IVORY", "color"], ["OLIVE", "color"],
];

const BANK_6 = [
  // place
  ["PLANET", "place"], ["GARDEN", "place"], ["FOREST", "place"], ["DESERT", "place"],
  ["ISLAND", "place"], ["VALLEY", "place"], ["CANYON", "place"], ["HARBOR", "place"],
  ["JUNGLE", "place"], ["LAGOON", "place"], ["MEADOW", "place"], ["TUNDRA", "place"],
  ["MARKET", "place"],
  // structure
  ["BRIDGE", "structure"], ["CASTLE", "structure"], ["TUNNEL", "structure"], ["TEMPLE", "structure"],
  ["CHURCH", "structure"], ["PALACE", "structure"], ["MUSEUM", "structure"], ["CINEMA", "structure"],
  // animal
  ["DRAGON", "animal"], ["FALCON", "animal"], ["RABBIT", "animal"], ["BEAVER", "animal"],
  ["DONKEY", "animal"], ["MONKEY", "animal"], ["TURTLE", "animal"], ["SPIDER", "animal"],
  ["LIZARD", "animal"], ["JAGUAR", "animal"], ["COYOTE", "animal"], ["OYSTER", "animal"],
  ["SALMON", "animal"], ["PUFFIN", "animal"], ["MAGPIE", "animal"],
  // food
  ["BURGER", "food"], ["COOKIE", "food"], ["BANANA", "food"], ["ORANGE", "food"],
  ["CARROT", "food"], ["POTATO", "food"], ["TOMATO", "food"], ["PEPPER", "food"],
  ["GARLIC", "food"], ["WALNUT", "food"], ["ALMOND", "food"], ["RAISIN", "food"],
  ["NOODLE", "food"], ["PICKLE", "food"], ["MUFFIN", "food"],
  // material
  ["SILVER", "material"], ["COPPER", "material"], ["BRONZE", "material"], ["VELVET", "material"],
  ["COTTON", "material"], ["MARBLE", "material"],
  // object
  ["ENGINE", "object"], ["ROCKET", "object"], ["RIBBON", "object"], ["PENCIL", "object"],
  ["CRAYON", "object"], ["BASKET", "object"], ["BUCKET", "object"], ["BOTTLE", "object"],
  ["BUTTON", "object"], ["CANDLE", "object"], ["FOLDER", "object"], ["FRIDGE", "object"],
  ["HAMMER", "object"], ["HELMET", "object"], ["JACKET", "object"], ["SHOVEL", "object"],
  ["WALLET", "object"], ["PILLOW", "object"], ["MIRROR", "object"], ["LADDER", "object"],
  // shape
  ["CIRCLE", "shape"], ["CORNER", "shape"],
  // abstract
  ["COUPLE", "abstract"], ["CRISIS", "abstract"], ["FLIGHT", "abstract"], ["GOLDEN", "abstract"],
  ["GROUND", "abstract"], ["GALAXY", "abstract"], ["WISDOM", "abstract"], ["MOTION", "abstract"],
  ["SYSTEM", "abstract"], ["VOYAGE", "abstract"], ["RESULT", "abstract"], ["REASON", "abstract"],
  ["SEASON", "abstract"], ["PERIOD", "abstract"], ["REGION", "abstract"],
  // role
  ["DRIVER", "role"],
  // sport
  ["BOXING", "sport"], ["TENNIS", "sport"], ["ARCHER", "sport"], ["SPRINT", "sport"],
  ["HOCKEY", "sport"], ["SOCCER", "sport"], ["WICKET", "sport"], ["UMPIRE", "sport"],
  ["SPIRIT", "sport"], ["PUZZLE", "sport"],
  // verb
  ["FOLLOW", "verb"], ["BECOME", "verb"], ["CREATE", "verb"], ["DELETE", "verb"],
  ["ATTACK", "verb"], ["DEFEND", "verb"], ["ESCAPE", "verb"], ["EXPAND", "verb"],
  ["EXPECT", "verb"], ["EXPOSE", "verb"], ["HANDLE", "verb"], ["IGNORE", "verb"],
  ["INFORM", "verb"], ["INVENT", "verb"], ["INVITE", "verb"], ["LAUNCH", "verb"],
  ["MANAGE", "verb"], ["OFFEND", "verb"], ["RECALL", "verb"], ["REDUCE", "verb"],
  ["RENDER", "verb"], ["RESIST", "verb"], ["RETURN", "verb"], ["REVEAL", "verb"],
  ["SELECT", "verb"], ["SIMPLE", "verb"], ["STRIKE", "verb"], ["STRONG", "verb"],
  ["SUPPLY", "verb"], ["SURVEY", "verb"], ["TARGET", "verb"], ["TRAVEL", "verb"],
  ["UPDATE", "verb"],
];

const BANK_7 = [
  // place
  ["KINGDOM", "place"], ["GALLERY", "place"], ["LIBRARY", "place"], ["STATION", "place"],
  ["THEATER", "place"], ["VILLAGE", "place"], ["ARCHIVE", "place"], ["GATEWAY", "place"],
  ["HIGHWAY", "place"], ["TERRAIN", "place"], ["GLACIER", "place"], ["VOLCANO", "place"],
  // nature
  ["HORIZON", "nature"], ["WEATHER", "nature"], ["RAINBOW", "nature"],
  // animal
  ["DOLPHIN", "animal"], ["GIRAFFE", "animal"], ["PANTHER", "animal"], ["SPARROW", "animal"],
  ["REPTILE", "animal"], ["MAMMOTH", "animal"], ["BUFFALO", "animal"], ["LEOPARD", "animal"],
  ["PENGUIN", "animal"], ["OCTOPUS", "animal"], ["CRICKET", "animal"], ["HAMSTER", "animal"],
  ["PEACOCK", "animal"],
  // food
  ["PANCAKE", "food"], ["OATMEAL", "food"], ["POPCORN", "food"], ["CABBAGE", "food"],
  ["PUMPKIN", "food"], ["AVOCADO", "food"], ["APRICOT", "food"], ["BISCUIT", "food"],
  ["MUSTARD", "food"], ["VINEGAR", "food"],
  // object
  ["COMPASS", "object"], ["MACHINE", "object"], ["PACKAGE", "object"], ["PICTURE", "object"],
  ["CIRCUIT", "object"], ["DESKTOP", "object"], ["CUSHION", "object"], ["WHISTLE", "object"],
  ["LANTERN", "object"], ["BLENDER", "object"], ["STAPLER", "object"], ["BLANKET", "object"],
  // abstract
  ["CAPTURE", "abstract"], ["JOURNEY", "abstract"], ["CRYSTAL", "abstract"], ["DIAMOND", "abstract"],
  ["FREEDOM", "abstract"], ["HARMONY", "abstract"], ["MYSTERY", "abstract"], ["VICTORY", "abstract"],
  ["FANTASY", "abstract"], ["NETWORK", "abstract"], ["PROBLEM", "abstract"], ["PROJECT", "abstract"],
  ["QUALITY", "abstract"], ["QUANTUM", "abstract"], ["SEGMENT", "abstract"], ["STORAGE", "abstract"],
  ["TEXTURE", "abstract"], ["AMBIENT", "abstract"], ["BALANCE", "abstract"], ["BENEATH", "abstract"],
  ["CENTURY", "abstract"], ["CHAPTER", "abstract"], ["COMFORT", "abstract"], ["CONTACT", "abstract"],
  ["CONTENT", "abstract"], ["CONTEST", "abstract"], ["CULTURE", "abstract"], ["CURRENT", "abstract"],
  // verb
  ["ACCOUNT", "verb"], ["ACHIEVE", "verb"], ["ANALYZE", "verb"], ["APPOINT", "verb"],
  ["APPROVE", "verb"], ["ASSAULT", "verb"], ["ATTEMPT", "verb"], ["BENEFIT", "verb"],
  ["BETWEEN", "verb"], ["CONVERT", "verb"], ["DECLARE", "verb"], ["DELIVER", "verb"],
  ["DEVELOP", "verb"], ["EXAMINE", "verb"], ["EXECUTE", "verb"], ["EXHIBIT", "verb"],
  ["EXPLAIN", "verb"], ["EXPRESS", "verb"], ["FEATURE", "verb"], ["IMPROVE", "verb"],
  ["INCLUDE", "verb"], ["INSPECT", "verb"], ["INSTALL", "verb"], ["MEASURE", "verb"],
  ["MENTION", "verb"], ["OBSERVE", "verb"], ["OPERATE", "verb"], ["ORGANIC", "verb"],
  ["OUTLINE", "verb"], ["PERFORM", "verb"], ["PORTRAY", "verb"], ["PREVENT", "verb"],
  ["PROCESS", "verb"], ["PROMOTE", "verb"], ["PROTECT", "verb"], ["PROVIDE", "verb"],
  ["PUBLISH", "verb"], ["RECEIVE", "verb"], ["REQUEST", "verb"], ["REQUIRE", "verb"],
  ["RESERVE", "verb"], ["RESOLVE", "verb"], ["RESPOND", "verb"], ["REVENUE", "verb"],
  ["SUCCEED", "verb"], ["SUGGEST", "verb"], ["SUPPORT", "verb"], ["SURFACE", "verb"],
  ["SURVIVE", "verb"],
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
