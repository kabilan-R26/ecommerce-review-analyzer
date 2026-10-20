const ERA_MAX_REVIEWS = 5000;
const ERA_MAX_ATTEMPTS = 20;
const ERA_WAIT = 1000;

let eraASIN = "";
let eraProduct = "";
let eraReviews = [];
let eraPredictions = [];
let eraStartedASIN = "";
let eraShownPredictions = 5;

/* ADDED STATE (feature analysis). Existing variables above are unchanged. */
let eraCategoryOverride = "";
let eraShowAllFeatures = false;
let eraFeatureCache = {
  source: null,
  categoryId: "",
  perReview: [],
  stats: [],
  reviewsWithFeatures: 0,
  usable: 0
};

/* ADDED STATE (v3): prediction list controls, confidence scale cache and a
   cache of cleaned review text. All are reset when a new product is opened. */
let eraPredictionFilter = "all";
let eraPredictionQuery = "";
let eraExpandedReviews = new Set();
let eraConfidenceCache = { source: null, scale: "fraction" };
const eraCleanCache = new WeakMap();

/* ==========================================================================
   PRODUCT CATEGORIES
   Detection is title-based and heuristic. It can be wrong, so the dashboard
   lets the user override it. To extend: add a label, a rule (ORDER MATTERS,
   first match wins) and a feature dictionary below.
   ========================================================================== */
const ERA_CATEGORY_LABELS = {
  smartphone: "Smartphone",
  laptop: "Laptop / computer",
  tablet: "Tablet",
  headphones: "Headphones / earphones",
  display: "TV / monitor",
  smartwatch: "Smartwatch",
  clothing: "Clothing / apparel",
  shoes: "Shoes / footwear",
  skincare: "Skincare / beauty",
  appliance: "Home appliance",
  kitchen: "Kitchen / cookware",
  furniture: "Furniture / home furnishing",
  bags: "Bags / luggage",
  books: "Books",
  toys: "Toys / games",
  sports: "Sports / fitness",
  general: "General product"
};

/* Rules run against the lower-cased title with punctuation turned into
   spaces. headOnly rules are skipped in the second pass (full title). */
const ERA_CATEGORY_RULES = [
  { id: "general", headOnly: true, // accessories: never apply device features to cases, stands, cables...
    pattern: /\b(?:cases?|covers?|screen (?:protector|guard)s?|tempered glass|sleeves?|holders?|mounts?|stand(?! mixer)s?|straps?|cables?|adapters?|stickers?|power ?banks?|chargers?)\b/ },
  { id: "bags",
    pattern: /\b(?:backpacks?|rucksacks?|handbags?|sling bags?|duffel|duffle|luggage|suitcases?|trolley bags?|wallets?|satchels?|totes?|bags?)\b/ },
  { id: "laptop",
    pattern: /\b(?:laptops?|notebook computers?|macbooks?|chromebooks?|ultrabooks?|galaxy book|surface (?:book|laptop|pro)|desktop computers?|desktop pcs?|gaming pcs?|all in one pcs?|imac|mac mini|intel core|ryzen|core i[3579]|ssd|windows 1[01]|ms office|thinkpad|ideapad|vivobook|inspiron|zenbook)\b/,
    exclude: /\b(?:external|portable ssd|pen drive|flash drive|hard drive|hard disk|enclosure|cooling pad)\b/ },
  { id: "tablet",
    pattern: /\b(?:tablets?|ipad(?: air| pro| mini)?|galaxy tab|fire hd|fire tablet|lenovo tab)\b/,
    exclude: /\b(?:\d+ ?(?:tablets?|capsules?)|vitamins?|supplements?|capsules?)\b/ },
  { id: "smartwatch",
    pattern: /\b(?:smart ?watch(?:es)?|fitness (?:bands?|trackers?)|smart bands?|apple watch|galaxy watch|amazfit)\b/ },
  { id: "headphones",
    pattern: /\b(?:headphones?|earphones?|earbuds?|ear buds?|neckbands?|headsets?|airpods?|airdopes|true wireless|tws|buds|earpods?|in ear|over ear|on ear)\b/ },
  { id: "display",
    pattern: /\b(?:televisions?|tvs?|smart tv|monitors?)\b/,
    exclude: /\b(?:baby|heart rate|blood pressure|bp|glucose) monitors?\b/ },
  { id: "smartphone",
    pattern: /\b(?:smartphones?|mobile phones?|cell ?phones?|iphone|android phones?|feature phones?|phones?|mobiles?|redmi|poco|realme|oneplus|iqoo|vivo|oppo|samsung galaxy [a-z]\d+|pixel \d+|nothing phone|\d+ ?gb ram|5g)\b/ },
  { id: "shoes",
    pattern: /\b(?:shoes?|sneakers?|sandals?|slippers?|flip flops?|boots?(?! cut)|loafers?|footwear|heels|floaters?|crocs)\b/ },
  { id: "toys",
    pattern: /\b(?:toys?|puzzles?|lego|board games?|action figures?|dolls?|plush|stuffed|building blocks?|rc car|remote control (?:car|helicopter)|playsets?|card games?|play ?doh|teddy)\b/ },
  { id: "kitchen",
    pattern: /\b(?:cookware|frying pan|fry pan|kadai|kadhai|pressure cookers?|cookers?|mixer grinders?|grinders?|blenders?|juicers?|air fryers?|toasters?|kettles?|induction|cooktops?|non stick|nonstick|tawa|casseroles?|microwave|ovens?|tiffin|lunch box|chimney|gas stove|stoves?|knife set|utensils?|dinner set|woks?|pans?|flask|water bottles?|containers?)\b/ },
  { id: "appliance",
    pattern: /\b(?:refrigerators?|fridge|washing machines?|air conditioners?|ac|air coolers?|coolers?|ceiling fans?|table fans?|fans?|room heaters?|water heaters?|geysers?|vacuum cleaners?|water purifiers?|air purifiers?|purifiers?|steam irons?|dry irons?|irons?|dishwashers?|inverters?|hair dryers?|trimmers?|shavers?|humidifiers?)\b/ },
  { id: "clothing",
    pattern: /\b(?:trousers?|pants?|jeans?|shirts?|tees?|dress(?:es)?|jackets?|hoodies?|sweatshirts?|sweaters?|kurtas?|kurtis?|sarees?|saris?|skirts?|leggings?|joggers?|shorts|blazers?|coats?|apparel|clothing|innerwear|vests?|lehengas?|salwars?|palazzos?|chinos?|cargos?|denim|track ?pants?|tracksuits?|tops|crop tops?|tank tops?|socks?|underwear|boxers?|briefs|bras?|nightwear|pyjamas?|pajamas?|shrugs?|stoles?|dupatta|jumpsuits?|polos?|cardigans?|gloves?)\b/ },
  { id: "skincare",
    pattern: /\b(?:serum|moisturi[sz]ers?|creams?|lotions?|sunscreens?|sunblock|spf|face ?wash|cleansers?|toners?|shampoos?|conditioners?|lip balms?|face masks?|skin ?care|makeup|make up|lipsticks?|foundation|kajal|mascara|eyeliner|perfumes?|deodorants?|body wash|hair oil|face pack|body butter|nail polish|hair mask|aloe vera gel)\b/ },
  { id: "sports",
    pattern: /\b(?:dumbbells?|yoga mats?|yoga|treadmills?|exercise (?:bike|equipment|machine|mat)|gym|cricket (?:bat|ball)|footballs?|badminton|rackets?|racquets?|skipping rope|resistance bands?|shuttlecocks?|bicycles?|cycles?|fitness|kettlebells?|boxing|tennis|basketballs?|volleyballs?|carrom|swimming|swimwear|pull up bar|ab roller|abs roller|hand grippers?)\b/ },
  { id: "furniture",
    pattern: /\b(?:sofas?|couch(?:es)?|beds?|mattress(?:es)?|chairs?|tables?|desks?|wardrobes?|shelf|shelves|bookshelf|bookcase|cabinets?|racks?|stools?|benche?s?|recliners?|curtains?|bed ?sheets?|pillows?|cushions?|carpets?|rugs?|blankets?|comforters?|dressers?|home decor|wall art|lamps?|bean bag|dining set|tv unit|diwan|duvet|quilt)\b/ },
  { id: "books",
    pattern: /\b(?:books?|novels?|paperback|hardcover|hardback|textbooks?|workbooks?|cookbooks?|biography|memoir|anthology|guidebooks?|comics?|manga)\b/ }
];

function eraNormalizeTitle(title, stripBrackets) {
  let text = String(title || "").toLowerCase();
  if (stripBrackets) text = text.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  return text
    .replace(/[\u2010-\u2015\-_\/|,:;+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function eraDetectCategory(title) {
  try {
    const passes = [
      { text: eraNormalizeTitle(title, true), headOnly: true },
      { text: eraNormalizeTitle(title, false), headOnly: false }
    ];

    for (const pass of passes) {
      if (!pass.text) continue;

      for (const rule of ERA_CATEGORY_RULES) {
        if (rule.headOnly && !pass.headOnly) continue;
        if (!rule.pattern.test(pass.text)) continue;
        if (rule.exclude && rule.exclude.test(pass.text)) continue;
        return rule.id;
      }
    }
  } catch (error) {
    console.warn("[ERA] Category detection failed:", error.message);
  }

  return "general";
}

function eraGetCategoryId() {
  if (eraCategoryOverride && ERA_FEATURE_TERMS[eraCategoryOverride]) {
    return eraCategoryOverride;
  }

  return eraDetectCategory(eraProduct);
}

/* ==========================================================================
   FEATURE DICTIONARIES (per category)
   Terms are matched as whole words / phrases. A trailing * allows suffixes
   (e.g. "stitch*" -> stitch, stitching, stitched). Keep terms specific:
   generic words create false matches.
   ========================================================================== */
const ERA_VALUE_TERMS = [
  "value for money", "worth", "price", "priced", "pricey", "overpriced",
  "affordable", "expensive", "costly", "cost", "budget", "bargain", "money",
  "paisa vasool", "reasonable price"
];

const ERA_QUALITY_TERMS = [
  "quality", "well made", "poorly made", "cheaply made", "workmanship",
  "craftsmanship", "finish", "finishing"
];

const ERA_LOOKS_TERMS = [
  "as shown", "as pictured", "as per picture", "as per the picture",
  "in the picture", "in the photos", "in the images", "pictured"
];

const ERA_FEATURE_TERMS = {
  smartphone: {
    "Battery life": ["battery", "battery life", "backup", "drain*", "mah", "standby"],
    "Charging": ["charging", "charger", "fast charge", "full charge", "charges quickly", "charges fast", "to charge", "type c", "usb c"],
    "Display": ["display", "screen", "amoled", "oled", "lcd", "brightness", "refresh rate", "resolution", "touchscreen", "touch screen"],
    "Camera": ["camera*", "selfie*", "photograph*", "photo quality", "photos", "megapixel*", "zoom", "portrait mode", "low light", "night mode", "video recording"],
    "Performance": ["performance", "speed", "lag*", "laggy", "hang*", "smooth*", "processor", "snapdragon", "mediatek", "dimensity", "gaming", "games", "ram", "multitasking", "freez*", "stutter*", "responsive*"],
    "Heating": ["heat*", "overheat*", "gets hot", "getting hot", "too hot", "very hot", "warm up", "warms up", "temperature"],
    "Software & updates": ["software", "update*", "android", "ios", "one ui", "miui", "hyperos", "oxygen os", "coloros", "funtouch", "bug*", "bloatware", "ads", "user interface", "interface", "ui", "os"],
    "Build quality": ["build", "build quality", "design", "plastic", "metal", "glass back", "sturdy", "durab*", "premium", "scratch*", "finish", "slim", "weight"],
    "Network & connectivity": ["network", "wifi", "wi fi", "bluetooth", "signal", "5g", "4g", "sim", "reception", "connectivity", "call drop*", "gps", "nfc", "volte"],
    "Sound quality": ["sound*", "speaker*", "audio", "volume", "call quality", "stereo", "loudspeaker", "earpiece"],
    "Value for money": ERA_VALUE_TERMS
  },

  laptop: {
    "Performance": ["performance", "speed", "lag*", "laggy", "processor", "cpu", "gpu", "graphics", "ram", "ssd", "multitasking", "gaming", "boot time", "startup", "hang*", "freez*", "smooth*", "benchmark*"],
    "Battery life": ["battery", "battery life", "backup", "drain*"],
    "Charger & charging": ["charger", "adapter", "charging", "fast charge", "type c"],
    "Display": ["display", "screen", "resolution", "brightness", "anti glare", "ips", "refresh rate", "viewing angle*", "fhd", "touchscreen", "touch screen"],
    "Keyboard & touchpad": ["keyboard", "keys", "key travel", "touchpad", "trackpad", "backlit", "backlight"],
    "Build quality": ["build", "build quality", "plastic", "metal", "hinge", "sturdy", "durab*", "weight", "portable", "portability", "chassis", "premium"],
    "Heating & fan noise": ["heat*", "overheat*", "gets hot", "too hot", "fan noise", "fan", "thermal*", "temperature"],
    "Sound quality": ["sound*", "speaker*", "audio", "volume"],
    "Webcam & microphone": ["webcam", "camera", "microphone", "mic", "video call*"],
    "Software": ["windows", "ms office", "office", "preinstalled", "bloatware", "software", "driver*", "update*", "macos", "chrome os", "linux"],
    "Ports & connectivity": ["port*", "usb", "hdmi", "wifi", "wi fi", "bluetooth", "connectivity"],
    "Value for money": ERA_VALUE_TERMS
  },

  tablet: {
    "Display": ["display", "screen", "brightness", "resolution", "amoled", "lcd", "touch", "touchscreen"],
    "Performance": ["performance", "speed", "lag*", "laggy", "processor", "ram", "multitasking", "smooth*", "freez*", "hang*", "gaming"],
    "Battery life": ["battery", "battery life", "backup", "drain*"],
    "Charging": ["charging", "charger", "fast charge", "type c", "usb c"],
    "Sound quality": ["sound*", "speaker*", "audio", "volume"],
    "Camera": ["camera*", "selfie*", "photos", "video call*"],
    "Build quality": ["build", "build quality", "design", "weight", "metal", "plastic", "premium", "sturdy", "durab*"],
    "Software": ["software", "update*", "android", "ios", "ipados", "ui", "bug*", "apps"],
    "Storage & expandability": ["storage", "memory card", "sd card", "expandable"],
    "Connectivity": ["wifi", "wi fi", "bluetooth", "sim", "4g", "5g", "network", "signal"],
    "Value for money": ERA_VALUE_TERMS
  },

  headphones: {
    "Sound quality": ["sound", "sounds", "audio", "sound quality", "clarity", "treble", "vocals", "mids", "equaliser", "equalizer", "soundstage"],
    "Bass": ["bass", "bassy"],
    "Battery life": ["battery", "battery life", "playtime", "play time", "backup", "drain*"],
    "Charging": ["charging", "charger", "fast charge", "type c", "usb c", "charges quickly"],
    "Comfort": ["comfort*", "comfy", "ear pain", "ears hurt", "ear tips", "ear cushion*", "earpads", "lightweight", "fit", "fits", "fitting", "stays in"],
    "Microphone & calls": ["mic", "microphone", "call quality", "calls", "voice quality", "voice clarity"],
    "Noise cancellation": ["noise cancellation", "noise canceling", "noise cancelling", "noise cancel*", "anc", "enc", "isolation", "transparency mode", "ambient mode", "background noise"],
    "Connectivity": ["bluetooth", "connectivity", "pairing", "pair*", "connect*", "connection", "latency", "range", "dropout*", "disconnect*", "multipoint", "aux", "wired"],
    "Controls": ["controls", "touch controls", "touch control", "buttons", "button", "volume control", "gesture*", "app"],
    "Build quality": ["build", "build quality", "plastic", "sturdy", "durab*", "design", "finish", "hinge", "cable", "charging case"],
    "Value for money": ERA_VALUE_TERMS
  },

  display: {
    "Picture quality": ["picture*", "display", "screen", "resolution", "4k", "hd", "uhd", "hdr", "brightness", "contrast", "colour*", "color*", "black level*", "viewing angle*", "backlight*", "panel", "pixel*", "clarity", "sharpness"],
    "Sound quality": ["sound*", "speaker*", "audio", "volume", "dolby", "bass"],
    "Smart features & apps": ["smart", "apps", "netflix", "prime video", "youtube", "hotstar", "android tv", "google tv", "fire tv", "webos", "tizen", "interface", "voice control", "alexa", "chromecast", "screen mirroring", "casting", "operating system"],
    "Performance & speed": ["performance", "lag*", "laggy", "hang*", "freez*", "processor", "response time", "refresh rate", "input lag", "responsive*", "smooth*"],
    "Installation & setup": ["installation", "install*", "setup", "set up", "mounting", "wall mount", "demo", "technician", "assembly", "bracket"],
    "Remote & controls": ["remote", "controls", "voice remote", "buttons"],
    "Connectivity & ports": ["hdmi", "usb", "wifi", "wi fi", "bluetooth", "ports", "connectivity", "arc", "optical", "ethernet", "displayport", "type c", "usb c"],
    "Build & design": ["build", "build quality", "design", "bezel*", "slim", "stand", "plastic", "sturdy", "finish", "premium look"],
    "Gaming": ["gaming", "gamer*", "ps5", "xbox", "console", "freesync", "g sync", "144hz", "165hz"],
    "Value for money": ERA_VALUE_TERMS
  },

  smartwatch: {
    "Display": ["display", "screen", "brightness", "amoled", "always on", "readability", "sunlight", "dial"],
    "Battery life": ["battery", "battery life", "backup", "drain*", "standby"],
    "Charging": ["charging", "charger", "magnetic", "charges quickly", "fast charge", "full charge", "to charge"],
    "Fitness & health tracking": ["tracking", "tracker", "step*", "heart rate", "spo2", "oxygen", "sleep", "calorie*", "workout*", "sports modes", "accuracy", "gps", "fitness", "health", "stress", "blood pressure", "ecg", "pedometer"],
    "Calling & notifications": ["calling", "calls", "call quality", "bluetooth calling", "notification*", "message*", "microphone", "speaker", "contacts", "dial pad", "alerts", "vibration"],
    "App & software": ["app", "apps", "software", "update*", "sync*", "companion app", "interface", "ui", "watch faces", "watchface*", "bug*", "firmware"],
    "Strap & comfort": ["strap*", "band", "comfort*", "wrist", "silicone", "fit", "size", "lightweight", "skin", "rash", "irritation", "wearing"],
    "Build quality": ["build", "build quality", "design", "durab*", "scratch*", "water resistan*", "waterproof", "ip68", "ip67", "metal", "plastic", "premium", "finish", "glass", "sturdy"],
    "Connectivity": ["bluetooth", "connectivity", "connection", "pairing", "pair*", "disconnect*", "range", "nfc"],
    "Performance": ["performance", "lag*", "laggy", "hang*", "freez*", "responsive*", "smooth*", "speed", "processor"],
    "Value for money": ERA_VALUE_TERMS
  },

  clothing: {
    "Fit & sizing": ["fit", "fits", "fitting", "fitted", "size*", "sizing", "true to size", "runs small", "runs large", "runs big", "too tight", "too loose", "too small", "too big", "tight", "loose", "baggy", "slim fit", "regular fit", "relaxed fit", "oversized", "snug"],
    "Waist & length": ["waist*", "length", "inseam", "hem*", "rise", "waistband", "hemline", "hip*", "thigh*", "ankle", "knee", "drawstring", "belt loop*", "petite", "too short", "too long"],
    "Fabric & material": ["fabric*", "material*", "cotton", "polyester", "linen", "denim", "wool", "viscose", "rayon", "blend", "texture", "soft", "softness", "thickness", "thin", "thick", "fleece", "knit", "silk", "satin", "breathab*", "see through", "transparent", "sheer", "lining"],
    "Comfort": ["comfort*", "comfy", "cosy", "cozy", "uncomfortable", "skin friendly", "itchy", "itch*", "irritat*", "all day wear", "lightweight", "light weight"],
    "Pocket design & utility": ["pocket*", "cargo pocket*", "side pocket*", "zip pocket*", "deep pocket*", "phone pocket*", "utility", "utility pocket*"],
    "Stitching & durability": ["stitch*", "seam*", "thread*", "durab*", "durability", "lasts", "lasted", "lasting", "long lasting", "wear and tear", "tear*", "tore", "torn", "ripped", "button*", "zip*", "zipper", "hole*", "sturdy", "worn out", "wear out", "fall apart", "fell apart", "fraying", "frayed"],
    "Colour & appearance": ["colour*", "color*", "shade", "looks", "look", "looking", "appearance", "design", "style", "stylish", "pattern", "print", "fashionable", "trendy", "dull", ...ERA_LOOKS_TERMS],
    "Stretch & flexibility": ["stretch*", "stretchy", "elastic*", "flexib*", "four way", "4 way", "freedom of movement", "mobility", "bend", "squat", "spandex", "lycra"],
    "Shrinkage & fading": ["shrink*", "shrunk", "shrinkage", "fad*", "bleed*", "pilling", "wash", "washed", "washing", "washes", "after wash", "wash*"],
    "Overall quality": ERA_QUALITY_TERMS,
    "Value for money": ERA_VALUE_TERMS
  },

  shoes: {
    "Fit & sizing": ["fit", "fits", "fitting", "size*", "sizing", "true to size", "runs small", "runs big", "runs large", "narrow", "wide", "width", "toe box", "half size", "too tight", "too loose", "snug", "tight", "loose", "length"],
    "Comfort": ["comfort*", "comfy", "uncomfortable", "cushion*", "padding", "padded", "insole*", "arch support", "support", "pain", "blister*", "shoe bite", "foot pain", "heel pain", "all day"],
    "Grip": ["grip*", "traction", "slip*", "slippery", "skid*", "non slip", "anti slip", "wet floor", "tiles"],
    "Sole quality": ["sole", "soles", "outsole", "midsole", "rubber", "eva", "pu sole", "sole came off", "peel*", "separat*", "detach*", "came off", "coming off"],
    "Material": ["material*", "leather", "faux leather", "synthetic", "mesh", "canvas", "fabric*", "suede", "upper", "lining", "breathab*", "sweat*", "smell*", "odour", "odor", "knit", "foam"],
    "Durability": ["durab*", "lasts", "lasted", "lasting", "long lasting", "wear and tear", "wore out", "wear out", "tore", "torn", "tear*", "falling apart", "fell apart", "stitch*", "glue", "glued", "broke", "broken", "worn"],
    "Appearance": ["look*", "appearance", "design", "style", "stylish", "colour*", "color*", "shade", "shine", "dull", "trendy", "classy", "sleek", "attractive", "pattern", ...ERA_LOOKS_TERMS],
    "Weight": ["weight", "lightweight", "light weight", "heavy", "heaviness", "feather light"],
    "Overall quality": ERA_QUALITY_TERMS,
    "Value for money": ERA_VALUE_TERMS
  },

  skincare: {
    "Skin compatibility": ["skin type", "skin types", "sensitive skin", "oily skin", "dry skin", "combination skin", "normal skin", "acne prone", "acne", "pimple*", "breakout*", "break out", "suits my skin", "suit my skin", "suitable", "compatible", "skin friendly", "pores", "clogged"],
    "Texture": ["texture", "consistency", "thick", "thin", "runny", "watery", "creamy", "sticky", "greasy", "non greasy", "non sticky", "lightweight", "light weight", "silky", "gritty", "chalky", "white cast", "cakey"],
    "Absorption": ["absorb*", "absorption", "sinks in", "sink in", "soaks in", "soak*", "spread*", "blend*", "residue", "layering"],
    "Fragrance": ["fragrance*", "smell*", "scent*", "perfume*", "aroma", "odour", "odor", "stink*", "fragrance free", "unscented", "perfumed"],
    "Irritation": ["irritat*", "rash*", "itch*", "burn*", "redness", "sting*", "allerg*", "reaction", "reacted", "swelling", "dry patches"],
    "Moisturization": ["moisturi*", "hydrat*", "dryness", "nourish*", "supple", "soft skin", "smooth skin", "dehydrated"],
    "Results & effectiveness": ["results", "effective", "effectiveness", "improvement", "visible difference", "difference", "glow*", "brightening", "dark spots", "pigmentation", "scars", "wrinkles", "anti aging", "dandruff", "hair fall", "hair growth", "dark circles", "sun protection"],
    "Packaging": ["packag*", "packing", "bottle", "pump", "dispenser", "tube", "jar", "cap", "lid", "seal*", "leak*", "leaked", "box", "damaged", "spill*", "dented", "container", "nozzle", "applicator", "bubble wrap"],
    "Authenticity & expiry": ["genuine", "authentic", "fake", "counterfeit", "duplicate", "expiry", "expiration", "expired", "batch", "mfg date", "tamper*", "original product"],
    "Value for money": ERA_VALUE_TERMS
  },

  appliance: {
    "Performance": ["performance", "cooling", "cools", "suction", "powerful", "power output", "speed", "efficien*", "output", "pressure", "spin", "wash quality", "drying", "dries", "heating performance", "hot water", "temperature"],
    "Ease of use": ["ease of use", "easy to use", "easy to operate", "user friendly", "controls", "remote", "operate", "operation", "settings", "button*", "manual", "instructions", "handle", "handling", "setup", "set up", "convenient", "convenience", "portable", "portability"],
    "Build quality": ["build", "build quality", "sturdy", "durab*", "plastic", "metal", "finish", "body", "design", "material*", "weight", "heavy", "lightweight", "premium", "stainless steel"],
    "Power consumption": ["power consumption", "electricity", "electric bill", "bill", "energy", "energy saving", "energy efficient", "star rating", "inverter", "consumption", "power saving", "watts", "wattage", "voltage"],
    "Noise": ["noise", "noisy", "quiet", "silent", "silently", "loud", "vibration*", "decibel*", "humming", "hum", "rattl*", "buzz*"],
    "Cleaning & maintenance": ["clean*", "cleaning", "maintenance", "wash*", "washable", "filter*", "dust", "descaling", "scale", "rust*", "detachable", "dismantle", "dishwasher safe"],
    "Installation & service": ["install*", "installation", "technician", "demo", "warranty", "customer care", "customer service", "after sales", "service centre", "service center", "servicing", "service", "support", "replacement", "repair*"],
    "Reliability": ["reliab*", "stopped working", "not working", "breakdown", "break down", "broke", "broken", "defect*", "faulty", "malfunction*", "failed", "failure", "died", "stops working", "lasts", "lasted", "lasting", "long lasting"],
    "Size & capacity": ["size", "capacity", "compact", "space", "litre*", "liter*", "dimension*", "footprint", "tonne"],
    "Value for money": ERA_VALUE_TERMS
  },

  kitchen: {
    "Performance": ["performance", "cooking", "cooks", "cooked", "grinding", "grinds", "grind", "blending", "blends", "blend", "powerful", "speed", "motor", "juice", "juicing", "pressure", "whistle", "boil*", "frying", "crispy", "baking", "bakes", "toast*"],
    "Heating & heat distribution": ["heat", "heating", "even heating", "hot spots", "gets hot", "heats up", "heats", "heat distribution", "induction", "gas stove", "stove", "base", "bottom", "burn*", "burnt"],
    "Non-stick & coating": ["non stick", "nonstick", "stick*", "stuck", "coating", "coated", "peeling", "peel*", "flaking", "flake*", "scratch*", "teflon", "ceramic coating"],
    "Ease of use": ["easy to use", "ease of use", "user friendly", "handle", "handles", "grip", "lid", "weight", "lightweight", "heavy", "pour*", "portable", "settings", "button*", "operate", "operation", "convenient"],
    "Cleaning & maintenance": ["clean*", "wash*", "washable", "dishwasher", "dishwasher safe", "stain*", "residue", "rust*", "maintenance", "scrub*", "detachable", "grease"],
    "Build quality": ["build", "build quality", "sturdy", "durab*", "material*", "stainless steel", "aluminium", "aluminum", "plastic", "thickness", "thick", "thin", "heavy bottom", "body", "finish", "warp*", "dent*", "bent", "loose handle", "rivet*"],
    "Capacity & size": ["capacity", "size", "litre*", "liter*", "portion*", "serves", "compact", "storage space", "dimension*", "diameter", "depth"],
    "Safety & food-grade": ["safety", "safe", "bpa", "food grade", "food safe", "toxic", "chemical*", "pfoa", "metallic taste", "plastic smell", "odour", "odor", "fumes", "smoke"],
    "Noise": ["noise", "noisy", "loud", "quiet", "silent", "vibration*", "rattl*", "hum"],
    "Power consumption": ["power consumption", "electricity", "wattage", "watts", "energy", "consumption", "electric bill"],
    "Reliability": ["reliab*", "stopped working", "not working", "motor burnt", "motor burned", "burnt out", "broke", "broken", "defect*", "faulty", "malfunction*", "failed", "failure", "died", "warranty", "customer care", "replacement", "leak*"],
    "Value for money": ERA_VALUE_TERMS
  },

  furniture: {
    "Assembly & installation": ["assembl*", "install*", "instructions", "manual", "screws", "screw", "bolts", "tools", "hardware", "carpenter", "technician", "set up", "setup", "drill*", "missing parts", "missing screws", "alignment"],
    "Build quality & stability": ["build", "build quality", "sturdy", "stable", "stability", "wobbl*", "shak*", "solid", "flimsy", "weight capacity", "durab*", "engineered wood", "plywood", "mdf", "particle board", "metal frame", "steel frame", "wood", "wooden", "frame", "legs", "hinge*", "joints", "crack*", "warp*", "scratch*"],
    "Comfort": ["comfort*", "comfy", "uncomfortable", "cushion*", "seat", "seating", "back support", "lumbar", "support", "firm", "firmness", "soft", "sink*", "sag*", "foam", "posture", "sleep*", "back pain", "neck pain", "sitting"],
    "Material & finish": ["material*", "fabric*", "leather", "leatherette", "upholstery", "finish", "polish", "paint", "laminate", "veneer", "varnish", "texture", "smell*", "odour", "odor", "cotton", "polyester", "thread count", "linen", "microfibre", "microfiber", "velvet", "stitch*"],
    "Appearance & design": ["look*", "appearance", "design", "style", "stylish", "colour*", "color*", "shade", "aesthetic*", "elegant", "premium look", "modern", "classy", "decor", ...ERA_LOOKS_TERMS],
    "Size & space": ["size", "dimension*", "height", "width", "depth", "compact", "space", "spacious", "storage", "capacity", "fits", "legroom", "queen", "king"],
    "Delivery & packaging": ["delivery", "delivered", "packag*", "packing", "arrived", "damaged", "damage", "transit", "courier", "carton", "dent*", "delay*"],
    "Value for money": ERA_VALUE_TERMS
  },

  bags: {
    "Capacity & storage": ["capacity", "space", "spacious", "compartment*", "pocket*", "storage", "roomy", "organi*", "litre*", "liter*", "holds", "fits", "size", "laptop compartment", "laptop sleeve", "bottle holder"],
    "Material & build": ["material*", "fabric*", "polyester", "nylon", "leather", "canvas", "faux leather", "stitch*", "seam*", "build", "build quality", "sturdy", "durab*", "thickness", "flimsy"],
    "Zips, straps & wheels": ["zip*", "zipper*", "strap*", "handle*", "buckle*", "clasp*", "lock*", "velcro", "magnet*", "hook*", "wheel*", "trolley", "telescopic", "roller*"],
    "Comfort": ["comfort*", "comfy", "uncomfortable", "padded", "padding", "shoulder", "shoulder pain", "back support", "ergonomic", "weight", "heavy", "lightweight", "light weight", "cushion*"],
    "Water resistance": ["water resistant", "waterproof", "water proof", "water repellent", "rain", "rain cover", "splash", "drizzle", "wet", "raincover"],
    "Appearance & design": ["look*", "appearance", "design", "style", "stylish", "colour*", "color*", "shade", "trendy", "classy", ...ERA_LOOKS_TERMS],
    "Overall quality": ERA_QUALITY_TERMS,
    "Value for money": ERA_VALUE_TERMS
  },

  books: {
    "Content & writing": ["content", "writing", "writing style", "writer", "story", "storyline", "plot", "characters", "character", "narrative", "prose", "author", "chapter*", "insight*", "informative", "information", "examples", "concepts", "explain*", "explanation*", "pacing", "ending", "readable", "engaging", "lessons", "knowledge", "message"],
    "Print & paper quality": ["print*", "printing", "paper", "paper quality", "pages", "page", "font", "text size", "ink", "binding", "bound", "spine", "cover", "hardcover", "paperback", "glossy", "matte", "yellowish", "loose pages", "smudg*"],
    "Condition & packaging": ["packag*", "packing", "damaged", "damage", "condition", "torn", "dent*", "bent", "crumpled", "creased", "wrinkled", "bubble wrap", "box", "delivery", "delivered", "arrived", "seal*", "scratched", "fresh copy", "dog eared", "corner*", "stain*"],
    "Edition & authenticity": ["original", "genuine", "fake", "counterfeit", "pirated", "duplicate", "xerox", "photocopy", "copy", "edition", "version", "unabridged", "abridged", "isbn", "publisher", "latest edition", "revised"],
    "Language & editing": ["language", "translation", "translated", "grammar", "typo*", "error*", "mistake*", "spelling", "proofread*", "vocabulary", "simple english", "easy english", "hindi", "tamil"],
    "Value for money": ERA_VALUE_TERMS
  },

  toys: {
    "Fun & engagement": ["fun", "enjoy*", "play*", "kids love", "child loves", "engaging", "entertaining", "entertain*", "interest*", "bored", "boring", "playtime", "imagination", "creative", "creativity", "challenging", "challenge", "addictive", "gameplay"],
    "Quality & durability": ["durab*", "build quality", "sturdy", "flimsy", "break easily", "breaks easily", "broke", "broken", "plastic", "material*", "well made", "poorly made", "cheaply made", "finish", "paint", "stitch*", "fragile", "lasts", "lasted", "lasting", "long lasting", "quality"],
    "Safety & materials": ["safe", "safety", "non toxic", "toxic", "bpa", "sharp edges", "sharp", "small parts", "choking", "choking hazard", "child safe", "kid safe", "smell*", "chemical*", "smooth edges", "rounded", "certified"],
    "Age suitability": ["age", "age group", "suitable", "suitability", "year old", "years old", "toddler*", "difficulty", "level", "complicated", "rules"],
    "Setup & instructions": ["instructions", "manual", "setup", "set up", "assembly", "assemble", "assembling", "steps", "guide"],
    "Batteries & power": ["battery", "batteries", "charging", "charger", "rechargeable", "usb", "remote control", "runtime", "run time"],
    "Appearance & design": ["look*", "appearance", "design", "colourful", "colorful", "colour*", "color*", "attractive", "cute", "realistic", "detail*", ...ERA_LOOKS_TERMS],
    "Packaging & completeness": ["packag*", "packing", "box", "delivery", "delivered", "gift", "gifting", "wrapped", "damaged", "arrived", "sealed", "missing parts", "missing pieces", "incomplete", "parts missing"],
    "Value for money": ERA_VALUE_TERMS
  },

  sports: {
    "Build quality & durability": ["build", "build quality", "sturdy", "durab*", "material*", "metal", "steel", "rubber", "plastic", "foam", "stitch*", "weld*", "rust*", "peel*", "broke", "broken", "tear*", "torn", "snap*"],
    "Comfort & grip": ["comfort*", "comfy", "grip*", "slip*", "slippery", "non slip", "anti slip", "handle*", "padding", "padded", "cushion*", "sweat*", "hand pain", "blister*", "palm", "ergonomic"],
    "Performance & effectiveness": ["performance", "effective", "effectiveness", "results", "workout*", "exercise*", "training", "resistance", "tension", "stability", "stable", "bounce", "bouncing", "accuracy", "control", "muscle*", "strength", "calories", "cardio", "intensity", "motor", "incline", "belt"],
    "Size, weight & fit": ["size", "sizing", "weight", "weights", "heavy", "lightweight", "light weight", "fit", "fits", "fitting", "adjust*", "length", "width", "thickness", "dimension*", "portable", "foldable", "compact", "storage"],
    "Assembly & setup": ["assembl*", "install*", "setup", "set up", "instructions", "manual", "screws", "tools", "demo", "technician"],
    "Appearance": ["look*", "appearance", "design", "colour*", "color*", "shade", "stylish", "print*", ...ERA_LOOKS_TERMS],
    "Overall quality": ERA_QUALITY_TERMS,
    "Value for money": ERA_VALUE_TERMS
  },

  general: {
    "Quality": ["quality", "build quality", "well made", "poorly made", "cheaply made", "workmanship", "craftsmanship", "finish", "finishing", "material*", "sturdy", "flimsy", "premium feel"],
    "Durability": ["durab*", "lasts", "lasted", "lasting", "long lasting", "wear and tear", "broke", "broken", "stopped working", "not working", "defect*", "faulty", "malfunction*", "failed", "failure", "died"],
    "Performance": ["performance", "works well", "working properly", "effective", "effectiveness", "results", "powerful", "speed", "efficien*", "accuracy"],
    "Ease of use": ["easy to use", "ease of use", "user friendly", "simple to use", "convenient", "convenience", "instructions", "manual", "setup", "set up", "operate", "operation", "handling", "portability", "usability"],
    "Appearance & design": ["look*", "appearance", "design", "style", "stylish", "colour*", "color*", "shade", "finish", "attractive", ...ERA_LOOKS_TERMS],
    "Size & fit": ["size", "sizing", "dimension*", "compact", "fits", "fit", "fitting", "capacity", "weight", "heavy", "lightweight", "light weight"],
    "Packaging & delivery": ["packag*", "packing", "box", "delivery", "delivered", "damaged", "arrived", "sealed", "tamper*", "broken seal", "missing", "incomplete", "bubble wrap", "courier", "late", "delay*"],
    "Customer service & warranty": ["customer service", "customer care", "support", "warranty", "replacement", "refund", "return*", "exchange", "seller", "service", "after sales", "helpline", "responded", "response"],
    "Authenticity": ["genuine", "authentic", "fake", "counterfeit", "duplicate", "imitation", "first copy", "refurbished", "second hand", "not original", "original product"],
    "Value for money": ERA_VALUE_TERMS
  }
};

/* ==========================================================================
   OPINION LEXICON (lightweight, explainable sentence/clause heuristic)
   ========================================================================== */
const ERA_POSITIVE_TERMS = [
  "good", "great", "excellent", "awesome", "amazing", "perfect*", "love*", "best",
  "nice*", "superb", "fantastic", "comfortabl*", "comfy", "soft", "smooth*", "fast",
  "quick*", "sturdy", "durable", "solid", "premium", "crisp", "vibrant", "bright",
  "sharp", "impressive", "impressed", "satisf*", "happy", "worth", "beautiful",
  "lovely", "stylish", "elegant", "snug", "lightweight", "reliable", "responsive",
  "accurate", "brilliant", "outstanding", "flawless", "fabulous", "wonderful",
  "recommend*", "decent", "well", "easy", "easily", "effective", "gentle", "pleasant",
  "quiet", "silent", "affordable", "reasonable", "inexpensive", "balanced", "rich",
  "stable", "spacious", "handy", "cozy", "cosy", "gorgeous", "adorable", "cute",
  "sleek", "enjoy*", "favourite", "favorite", "pleased", "thrilled", "delighted",
  "top notch", "stunning", "genuine", "authentic", "super", "useful", "convenient"
];

const ERA_NEGATIVE_TERMS = [
  "bad", "badly", "poor*", "terrible", "horrible", "worst", "awful", "disappoint*",
  "waste", "useless", "flimsy", "fragile", "torn", "tore", "ripped", "slow", "lag*",
  "laggy", "hang", "hangs", "stutter*", "freez*", "drain*", "overheat*", "defect*",
  "faulty", "broke", "broken", "breaks", "damag*", "scratch*", "peel*", "fade*",
  "faded", "shrunk", "shrink*", "rough", "sticky", "greasy", "itch*", "itchy",
  "irritat*", "rash*", "burning", "burnt", "allerg*", "breakout*", "pimple*",
  "stink*", "foul", "noisy", "annoying", "uncomfortable", "unreliable", "unsatisf*",
  "dissatisf*", "unhappy", "dull", "blurry", "grainy", "pixelat*", "muffled",
  "distort*", "tinny", "weak", "flaky", "lousy", "mediocre", "pathetic", "regret*",
  "overpriced", "expensive", "pricey", "costly", "complaint*", "problem*", "issue*",
  "trouble", "fail*", "malfunction*", "leak*", "rust*", "crack*", "wobbl*", "uneven",
  "fake", "counterfeit", "duplicate", "scam", "fraud", "cheaply", "unusable",
  "rubbish", "junk", "trash", "bulky", "unbearable", "difficult", "complicated",
  "confusing", "bug*", "glitch*", "stuck", "jam*"
];

const ERA_NEUTRAL_TERMS = [
  "okay", "ok", "average", "so so", "fair", "acceptable", "moderate", "normal",
  "fine", "nothing special"
];

const ERA_NEGATORS = new Set([
  "not", "no", "never", "none", "nothing", "without", "hardly", "barely",
  "neither", "nor", "dont", "doesnt", "didnt", "isnt", "wasnt", "arent", "cant",
  "wont", "cannot", "couldnt", "wouldnt", "shouldnt"
]);

const ERA_CONTRAST_SPLIT = new RegExp(
  "\\b(?:but|however|although|though|whereas|except|apart from|other than|" +
  "unfortunately|sadly|on the other hand|nevertheless|nonetheless|yet)\\b"
);

/* [pattern, polarity, negatable]. Order matters. Polarity 0 removes text. */
const ERA_FIXED_PHRASES = [
  [/\bnot as (?:shown|described|expected|pictured|advertised|good|great|per (?:the )?(?:picture|pictures|photo|photos|image|images|description))\b/g, -1, false],
  [/\bwaste of (?:money|time)\b|\bmoney waste\b/g, -1, true],
  [/\b(?:stopped|stops|quit) (?:working|functioning)\b|\bnot (?:working|functioning)\b|\b(?:does|do|did|is|are|was|were) not (?:work|function|last|fit|charge|stay)\b/g, -1, false],
  [/\b(?:drain|drains|drained|draining|dies|died) (?:very |too |really |so )?(?:fast|quickly|quick|soon)\b/g, -1, true],
  [/\b(?:heat|heats|heated|heating) up\b|\bgets? (?:very |too |really |extremely |so )?(?:hot|warm)\b|\bgetting (?:very |too |really |extremely |so )?(?:hot|warm)\b/g, -1, true],
  [/\b(?:fall|falls|falling|fell) apart\b|\b(?:came|comes|coming) off\b|\b(?:wore|wears|wearing) out\b|\bwear out\b|\bpeel(?:s|ed|ing)? off\b/g, -1, true],
  [/\b(?:cheap(?:ly)? (?:quality|material|plastic|fabric|made|build|feel|looking)|feels? cheap|looks? cheap|low quality)\b/g, -1, true],
  [/\b(?:hard|difficult|tough|impossible) to (?:clean|use|wear|assemble|install|operate|open|close|adjust|wash|understand|find|connect|pair|charge|remove|fit)\b/g, -1, true],
  [/\bruns? (?:small|short|tight|large|big|loose)\b/g, -1, true],
  [/\b(?:do not|never) (?:buy|purchase|recommend)\b/g, -1, false],
  [/\bnot too (?:bad|costly|expensive|heavy|tight|loose|small|big|large|hot|loud|noisy|short|long)\b/g, 1, false],
  [/\btrue to size\b/g, 1, true],
  [/\bas (?:shown|described|expected|pictured|advertised|per (?:the )?(?:picture|pictures|photo|photos|image|images|description))\b/g, 1, true],
  [/\b(?:long lasting|lasts? (?:long|all day|very long|really long)|lasts? (?:for )?(?:a|one|two|three|2|3|\d+) (?:day|days|week|weeks))\b/g, 1, true],
  [/\b(?:scratch|stain|water|wrinkle|dust|fade|shrink|crease|tear|rust|slip|skid|odou?r) (?:resistant|proof|free|repellent)\b/g, 1, true],
  [/\bas well\b/g, 0, false],
  [/\btoo (?!(?:good|nice|beautiful|amazing|perfect|great|and|but|i|it|is|was|are|so|as|for|the|a|my|we|you|also|though|however)\b)[a-z]+/g, -1, true]
];

/* Whole lines that are Amazon interface text. Variation lines such as
   "Size: 34 Color: KHAKI" are handled separately (see eraStripVariantPrefix)
   because the review text can sit on the same line as the variation. */
const ERA_META_LINE = new RegExp(
  "^(?:reviewed in .+|verified purchase|vine customer review.*|" +
  "helpful(?:\\s+report(?: abuse)?)?|report(?: abuse)?|" +
  "read more|translate review to english|customer image|" +
  "images in this review|top contributor.*|one person found this helpful|" +
  "[\\d,]+ (?:people|persons?) found this helpful)$",
  "i"
);

const ERA_VARIANT_KEYS =
  "colou?r|size|style|pattern name|pattern|configuration|capacity|material|" +
  "flavou?r|scent|variant|model|edition|storage|set name|item package quantity|" +
  "number of items|shade|team";
const ERA_VARIANT_START = new RegExp(
  "^(?:" + ERA_VARIANT_KEYS + ")(?: name)?\\s*:\\s*", "i"
);
const ERA_RATING_PREFIX = /^\d(?:\.\d)? out of 5 stars?\s*/i;
const ERA_REVIEWED_IN =
  /reviewed in [^\n]*? on (?:\d{1,2} [a-z]+ \d{4}|[a-z]+ \d{1,2}, \d{4})/gi;
const ERA_INLINE_META =
  /\b(?:verified purchase|one person found this helpful|[\d,]+ (?:people|persons?) found this helpful|translate review to english)\b/gi;

/* ==========================================================================
   TEXT HELPERS
   ========================================================================== */
function eraNormalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\r/g, "")
    .replace(/[\u2018\u2019\u00b4`]/g, "'")
    .replace(/\bcan't\b/g, "can not")
    .replace(/\bwon't\b/g, "will not")
    .replace(/n't\b/g, " not")
    .replace(/&/g, " and ")
    .replace(/[\u2010-\u2015\-]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function eraTermToPattern(term) {
  const raw = String(term || "");
  const wildcard = raw.endsWith("*");
  const base = eraNormalizeText(raw.replace(/\*$/, ""));
  if (!base) return "";

  return base
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+") + (wildcard ? "[a-z]*" : "");
}

function eraBuildTermRegex(terms, flags) {
  const parts = [...new Set(terms.map(eraTermToPattern).filter(Boolean))]
    .sort((a, b) => b.length - a.length);

  return new RegExp(
    "(?<![a-z0-9'])(?:" + parts.join("|") + ")(?![a-z0-9'])",
    flags || ""
  );
}

const ERA_POSITIVE_REGEX = eraBuildTermRegex(ERA_POSITIVE_TERMS, "g");
const ERA_NEGATIVE_REGEX = eraBuildTermRegex(ERA_NEGATIVE_TERMS, "g");
const ERA_NEUTRAL_REGEX = eraBuildTermRegex(ERA_NEUTRAL_TERMS, "g");

const eraCompiledFeatureCache = {};

function eraGetCompiledFeatures(categoryId) {
  const id = ERA_FEATURE_TERMS[categoryId] ? categoryId : "general";

  if (!eraCompiledFeatureCache[id]) {
    eraCompiledFeatureCache[id] = Object.entries(ERA_FEATURE_TERMS[id])
      .map(([name, terms]) => ({ name, pattern: eraBuildTermRegex(terms) }));
  }

  return eraCompiledFeatureCache[id];
}

/* Removes a leading "Size: 34 Color: KHAKI" style variation block from a line
   and keeps whatever review text follows it. The first word after each key is
   always part of the variation; further words are only included when they are
   written in capitals (KHAKI, DARK BLUE), so normal sentences are kept. */
function eraStripVariantPrefix(line) {
  let rest = String(line || "");
  let match;

  while ((match = rest.match(ERA_VARIANT_START))) {
    rest = rest.slice(match[0].length);
    const tokens = rest.split(/\s+/).filter(Boolean);
    let used = Math.min(1, tokens.length);

    while (used < tokens.length && /^[A-Z0-9][A-Z0-9\-\/.()]*$/.test(tokens[used])) {
      used++;
    }

    rest = tokens.slice(used).join(" ");
  }

  return rest.trim();
}

/* Splits a collected Amazon review card into a clean { title, body }.
   Removes the author line, star-rating text, "Reviewed in ... on <date>",
   "Verified Purchase", helpful/report labels and size/colour variation text.
   The original review object is never modified. */
function eraCleanReview(review) {
  if (!review) return { title: "", body: "" };

  const cacheable = typeof review === "object";
  if (cacheable && eraCleanCache.has(review)) return eraCleanCache.get(review);

  const author = String(review.author || "").trim().toLowerCase();

  const tidy = value => String(value || "")
    .replace(ERA_REVIEWED_IN, " ")
    .replace(ERA_INLINE_META, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(ERA_RATING_PREFIX, "")
    .trim();

  const title = tidy(review.title);
  const seen = new Set();
  const lines = [];
  let titleDropped = false;

  String(review.text || review.review || "").split(/\n+/).forEach(raw => {
    let line = tidy(
      String(raw).replace(
        /([a-z0-9])((?:Colou?r|Size|Style|Pattern|Configuration|Capacity)\s*:)/g,
        "$1 $2"
      )
    );

    if (!line || ERA_META_LINE.test(line)) return;
    if (author && line.toLowerCase() === author) return;

    line = eraStripVariantPrefix(line);
    if (!line || ERA_META_LINE.test(line)) return;

    if (!titleDropped && title && line.toLowerCase() === title.toLowerCase()) {
      titleDropped = true;
      return;
    }

    const key = line.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    lines.push(line);
  });

  const result = { title, body: lines.join("\n").slice(0, 4000).trim() };
  if (cacheable) eraCleanCache.set(review, result);
  return result;
}

/* Text used for feature analysis: clean title + clean body (never twice). */
function eraGetReviewContent(review) {
  if (!review) return "";

  const cleaned = eraCleanReview(review);
  return [cleaned.title, cleaned.body]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000)
    .trim();
}

function eraSnippet(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > 160 ? clean.slice(0, 157).trimEnd() + "…" : clean;
}

function eraIsNegated(text, index) {
  const scope = text
    .slice(Math.max(0, index - 45), index)
    .split(/[,;:()]|\b(?:and|but|or|because)\b/)
    .pop();

  const tokens = scope.match(/[a-z']+/g) || [];
  return tokens.slice(-3).some(token => ERA_NEGATORS.has(token));
}

/* Returns "positive" | "negative" | "mixed" | "neutral" | "unclear" */
function eraOpinionLabel(text) {
  let working = " " + text + " ";
  let pos = 0;
  let neg = 0;
  let neu = 0;

  for (const [pattern, polarity, negatable] of ERA_FIXED_PHRASES) {
    const source = working;

    working = source.replace(pattern, (match, offset) => {
      if (polarity !== 0) {
        let value = polarity;
        if (negatable && eraIsNegated(source, offset)) value = -value;
        if (value > 0) pos++;
        else neg++;
      }
      return " ";
    });
  }

  for (const match of working.matchAll(ERA_POSITIVE_REGEX)) {
    if (eraIsNegated(working, match.index)) neg++;
    else pos++;
  }

  for (const match of working.matchAll(ERA_NEGATIVE_REGEX)) {
    if (eraIsNegated(working, match.index)) pos++;
    else neg++;
  }

  for (const match of working.matchAll(ERA_NEUTRAL_REGEX)) {
    if (eraIsNegated(working, match.index)) neg++;
    else neu++;
  }

  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  if (pos > 0) return "mixed";
  if (neu > 0) return "neutral";
  return "unclear";
}

function eraMatchFeatures(text, features) {
  return features
    .filter(feature => feature.pattern.test(text))
    .map(feature => feature.name);
}

/* Splits a clause into comma/"and" pieces only when at least two pieces carry
   their own feature AND their own opinion ("great fit, poor stitching").
   Otherwise the whole clause shares one opinion ("battery and camera are good"). */
function eraSplitClause(clause, features) {
  const wholeNames = eraMatchFeatures(clause, features);
  if (!wholeNames.length) return [];

  const pieces = clause
    .split(/,|\band\b|\balso\b/)
    .map(piece => piece.trim())
    .filter(Boolean);

  if (pieces.length > 1) {
    const analysed = pieces.map(piece => ({
      names: eraMatchFeatures(piece, features),
      label: eraOpinionLabel(piece)
    }));

    const hasOpinion = label =>
      label === "positive" || label === "negative" || label === "mixed";

    const qualified = analysed.filter(
      piece => piece.names.length && hasOpinion(piece.label)
    ).length;

    if (qualified >= 2) {
      let carry = null;

      for (let i = analysed.length - 1; i >= 0; i--) {
        const piece = analysed[i];

        if (hasOpinion(piece.label)) {
          carry = piece.label;
        } else if (piece.names.length && piece.label === "unclear" && carry) {
          piece.label = carry;
        }
      }

      return analysed.filter(piece => piece.names.length);
    }
  }

  return [{ names: wholeNames, label: eraOpinionLabel(clause) }];
}

function eraSentenceFeatureOpinions(sentence, features) {
  const results = [];

  for (const clause of sentence.split(ERA_CONTRAST_SPLIT)) {
    if (clause.trim().length < 3) continue;

    for (const piece of eraSplitClause(clause, features)) {
      piece.names.forEach(feature => {
        results.push({ feature, label: piece.label });
      });
    }
  }

  return results;
}

/* Picks the part of a sentence (split at "but", "although"...) that actually
   mentions the feature, so the evidence snippet matches the opinion. */
const ERA_CONTRAST_SPLIT_CI = new RegExp(ERA_CONTRAST_SPLIT.source, "i");

function eraClauseFor(rawSentence, features, featureName) {
  const feature = features.find(item => item.name === featureName);
  if (!feature) return rawSentence;

  const parts = rawSentence
    .split(ERA_CONTRAST_SPLIT_CI)
    .map(part => part.replace(/^[\s,]+|[\s,]+$/g, ""))
    .filter(Boolean);

  const match = parts.find(part => feature.pattern.test(eraNormalizeText(part)));
  return match || rawSentence;
}

/* One entry per feature per review:
   { feature, sentiment: Positive|Negative|Mixed|Neutral|Unclear,
     inferred: true when copied from the overall review prediction,
     snippet: the review sentence the opinion came from } */
function eraAnalyzeReview(review, categoryId) {
  const content = eraGetReviewContent(review);
  if (content.length < 8) return [];

  const features = eraGetCompiledFeatures(categoryId);

  const sentences = content
    .split(/[\n.!?;\u2026]+/)
    .map(raw => raw.trim())
    .filter(Boolean)
    .map(raw => ({ raw, norm: eraNormalizeText(raw) }))
    .filter(item => item.norm.length > 2);

  const normalized = sentences.map(item => item.norm).join(" . ");
  const evidence = new Map();

  for (const sentence of sentences) {
    for (const { feature, label } of eraSentenceFeatureOpinions(sentence.norm, features)) {
      const entry = evidence.get(feature) || {
        positive: false, negative: false, mixed: false, neutral: false,
        snippets: {}
      };

      const evidenceText = eraClauseFor(sentence.raw, features, feature);

      if (label !== "unclear") {
        entry[label] = true;
        if (!entry.snippets[label]) entry.snippets[label] = evidenceText;
      }

      if (!entry.snippets.any) entry.snippets.any = evidenceText;

      evidence.set(feature, entry);
    }
  }

  if (!evidence.size) return [];

  const overall = eraNormalizeSentiment(review.sentiment);
  const confidencePercent = eraConfidencePercent(review);
  const confident = confidencePercent === null || confidencePercent >= 60;

  let canInfer =
    (overall === "Positive" || overall === "Negative") &&
    confident &&
    !ERA_CONTRAST_SPLIT.test(normalized);

  if (canInfer) {
    for (const entry of evidence.values()) {
      const opposite = overall === "Positive" ? entry.negative : entry.positive;
      if (opposite || entry.mixed) canInfer = false;
    }
  }

  return [...evidence.entries()].map(([feature, entry]) => {
    let sentiment = "Unclear";
    let inferred = false;

    if (entry.mixed || (entry.positive && entry.negative)) sentiment = "Mixed";
    else if (entry.positive) sentiment = "Positive";
    else if (entry.negative) sentiment = "Negative";
    else if (entry.neutral) sentiment = "Neutral";
    else if (canInfer) {
      sentiment = overall;
      inferred = true;
    }

    const own = sentiment === "Positive" ? entry.snippets.positive
      : sentiment === "Negative" ? entry.snippets.negative
      : (entry.snippets.mixed || entry.snippets.neutral);

    return {
      feature,
      sentiment,
      inferred,
      snippet: eraSnippet(own || entry.snippets.any)
    };
  });
}

/* ==========================================================================
   CONFIDENCE NORMALISATION
   The API sends confidence on a 0-100 scale in this project (the dashboard
   showed 8266% when 82.66 was multiplied by 100). A value above 1 can only
   be a percentage, so if any prediction in the batch is above 1 the whole
   batch is read as percentages; otherwise it is read as fractions (0-1).
   ========================================================================== */
function eraConfidenceRaw(review) {
  const value = review ? review.confidence : null;

  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function eraConfidenceScale() {
  if (eraConfidenceCache.source === eraPredictions) return eraConfidenceCache.scale;

  let scale = "fraction";

  for (const review of eraPredictions) {
    const raw = eraConfidenceRaw(review);

    if (raw !== null && raw > 1 && raw <= 100) {
      scale = "percent";
      break;
    }
  }

  eraConfidenceCache = { source: eraPredictions, scale };
  return scale;
}

/* Returns a percentage from 0 to 100 (max two decimals) or null. */
function eraConfidencePercent(review) {
  const raw = eraConfidenceRaw(review);
  if (raw === null || raw < 0) return null;

  const percent = eraConfidenceScale() === "percent" ? raw : raw * 100;
  if (percent > 100) return null;

  return Math.round(percent * 100) / 100;
}

function eraFormatConfidence(review) {
  const percent = eraConfidencePercent(review);
  if (percent === null) return "Confidence unavailable";

  return "Model confidence: " + String(Number(percent.toFixed(2))) + "%";
}

/* ==========================================================================
   STATISTICS HELPERS
   ========================================================================== */
function eraPercent(part, total) {
  return total > 0 ? Math.round(part / total * 100) : 0;
}

/* Largest-remainder rounding so displayed percentages always add up to 100. */
function eraPercents(values, total) {
  if (!total) return values.map(() => 0);

  const raw = values.map(value => value / total * 100);
  const floors = raw.map(Math.floor);
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0);

  const order = raw
    .map((value, index) => [value - floors[index], index])
    .sort((a, b) => b[0] - a[0]);

  for (let i = 0; i < order.length && remainder > 0; i++, remainder--) {
    floors[order[i][1]]++;
  }

  return floors;
}

/* Lower bound of the 95% Wilson interval: ranks by evidence strength, so a
   feature with 2/2 positive does not outrank one with 45/50 positive. */
function eraWilsonLower(successes, total) {
  if (!total) return 0;

  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + z * z / total;
  const centre = p + z * z / (2 * total);
  const margin = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total));

  return Math.max(0, (centre - margin) / denominator);
}

function eraEnsureFeatureAnalysis() {
  const categoryId = eraGetCategoryId();

  if (
    eraFeatureCache.source === eraPredictions &&
    eraFeatureCache.categoryId === categoryId
  ) {
    return eraFeatureCache;
  }

  const perReview = [];
  const stats = new Map();
  let reviewsWithFeatures = 0;
  let usable = 0;

  eraPredictions.forEach((review, index) => {
    let analysis = [];

    try {
      if (eraGetReviewContent(review).length >= 8) usable++;
      analysis = eraAnalyzeReview(review, categoryId);
    } catch (error) {
      console.warn("[ERA] Feature analysis failed for a review:", error.message);
    }

    perReview[index] = analysis;
    if (analysis.length) reviewsWithFeatures++;

    for (const item of analysis) {
      const data = stats.get(item.feature) || {
        mentions: 0, positive: 0, negative: 0, mixed: 0,
        neutral: 0, unclear: 0, inferred: 0, explicit: 0,
        explicitPositive: 0, explicitNegative: 0,
        snippets: { positive: [], negative: [] }
      };

      data.mentions++;

      if (item.sentiment === "Positive") data.positive++;
      else if (item.sentiment === "Negative") data.negative++;
      else if (item.sentiment === "Mixed") data.mixed++;
      else if (item.sentiment === "Neutral") data.neutral++;
      else data.unclear++;

      if (item.inferred) {
        data.inferred++;
      } else if (item.sentiment !== "Unclear") {
        data.explicit++;

        if (item.sentiment === "Positive") {
          data.explicitPositive++;
          if (item.snippet && data.snippets.positive.length < 3) {
            data.snippets.positive.push(item.snippet);
          }
        } else if (item.sentiment === "Negative") {
          data.explicitNegative++;
          if (item.snippet && data.snippets.negative.length < 3) {
            data.snippets.negative.push(item.snippet);
          }
        }
      }

      stats.set(item.feature, data);
    }
  });

  const entries = [...stats.entries()]
    .map(([feature, data]) => {
      data.mixedNeutral = data.mixed + data.neutral;

      const [positive, negative, mixedNeutral, unclear] = eraPercents(
        [data.positive, data.negative, data.mixedNeutral, data.unclear],
        data.mentions
      );

      data.percents = { positive, negative, mixedNeutral, unclear };
      return [feature, data];
    })
    .sort((a, b) => b[1].mentions - a[1].mentions || a[0].localeCompare(b[0]));

  eraFeatureCache = {
    source: eraPredictions,
    categoryId,
    perReview,
    stats: entries,
    reviewsWithFeatures,
    usable
  };

  return eraFeatureCache;
}

/* ==========================================================================
   ORIGINAL HELPERS (unchanged)
   ========================================================================== */
function eraGetASIN() {
  const match = location.pathname.match(
    /\/(?:dp|gp\/product|product-reviews|portal\/customer-reviews)\/([A-Z0-9]{10})/i
  );
  return match ? match[1].toUpperCase() : "";
}

function eraGetProductTitle() {
  return document.querySelector("#productTitle")?.innerText.trim()
    || document.querySelector("h1")?.innerText.trim()
    || document.title.replace(/\s*[:|]\s*Amazon.*$/i, "").trim()
    || "Amazon Product";
}

function eraIsReviewPage() {
  return /\/(?:product-reviews|portal\/customer-reviews)\//i.test(location.pathname);
}

function eraIsCollectorTab() {
  try {
    return location.hash.includes("eraCollector=1") ||
      sessionStorage.getItem("eraCollectorMode") === "1";
  } catch (_) {
    return location.hash.includes("eraCollector=1");
  }
}

function eraWait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function eraEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function eraNormalizeSentiment(value) {
  const sentiment = String(value || "").toLowerCase();
  if (sentiment.includes("positive")) return "Positive";
  if (sentiment.includes("negative")) return "Negative";
  if (sentiment.includes("neutral")) return "Neutral";
  return "Unknown";
}

/* REVIEW EXTRACTION */
function eraExtractVisibleReviews() {
  const cards = [
    ...document.querySelectorAll('[data-hook="review"], .review')
  ];

  const reviews = [];
  const seen = new Set();

  for (const card of cards) {
    const text = (card.innerText || card.textContent || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (text.length < 30) continue;

    const titleElement = card.querySelector(
      '[data-hook="reviewTitle"], [data-hook="review-title"]'
    );

    const title = (
      titleElement?.innerText ||
      titleElement?.textContent ||
      ""
    ).replace(/\s+/g, " ").trim();

    const ratingElement = card.querySelector(
      '[data-hook="review-star-rating"], ' +
      '[data-hook="cmps-review-star-rating"], ' +
      'i.a-icon-star, [aria-label*="out of 5 stars"]'
    );

    const ratingText = [
      ratingElement?.innerText,
      ratingElement?.textContent,
      ratingElement?.getAttribute("aria-label")
    ].filter(Boolean).join(" ");

    const ratingMatch =
      ratingText.match(/([1-5](?:\.\d+)?)(?=\s*out of 5 stars|\s*stars?)/i)
      || ratingText.match(/([1-5](?:\.\d+)?)/);

    const author = (
      card.querySelector(".a-profile-name")?.innerText || ""
    ).trim();

    const date = (
      card.querySelector('[data-hook="review-date"]')?.innerText || ""
    ).trim();

    const reviewLink = [
      ...card.querySelectorAll(
        'a[href*="/customer-reviews/"], a[href*="/review/"]'
      )
    ].map(a => a.href || a.getAttribute("href") || "")
      .find(Boolean) || "";

    const idMatch = reviewLink.match(
      /\/(?:portal\/customer-reviews\/srp\/-\/|customer-reviews\/|review\/)([A-Z0-9]+)/i
    );

    const fallbackId = (title + "|" + text)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    const id = idMatch ? idMatch[1].toUpperCase() : fallbackId;

    if (seen.has(id)) continue;
    seen.add(id);

    reviews.push({
      id,
      text,
      review: text,
      title,
      author,
      date,
      rating: ratingMatch ? Number(ratingMatch[1]) : null
    });
  }

  console.log("[ERA] Extraction diagnostic:", {
    url: location.href,
    cardsFound: cards.length,
    reviewsExtracted: reviews.length,
    ids: reviews.map(review => review.id)
  });

  return reviews;
}

function eraVisible(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);

  return rect.width > 0 &&
    rect.height > 0 &&
    style.display !== "none" &&
    style.visibility !== "hidden";
}

function eraFindMoreButton() {
  const elements = [
    ...document.querySelectorAll(
      '#cm_cr-pagination_bar a[data-hook="show-more-button"], ' +
      "a, button, input[type='submit']"
    )
  ];

  return elements.find(element => {
    const label = [
      element.innerText,
      element.textContent,
      element.value,
      element.getAttribute("aria-label"),
      element.getAttribute("title")
    ].filter(Boolean).join(" ").trim();

    return eraVisible(element) &&
      !element.disabled &&
      /show\s+\d+\s+more\s+reviews|see\s+more\s+reviews/i.test(label);
  }) || null;
}

/* AMAZON NEXT-PAGE DETECTION */
function eraFindNextPage() {
  const candidates = [
    ...document.querySelectorAll(
      "li.a-last a, .a-pagination a, " +
      "a[aria-label*='Next page'], " +
      "a[aria-label='Next'], a[rel='next']"
    )
  ];

  for (const link of candidates) {
    const label = [
      link.innerText,
      link.textContent,
      link.getAttribute("aria-label"),
      link.getAttribute("title"),
      link.getAttribute("rel")
    ].filter(Boolean).join(" ").trim();

    const parent = link.closest("li");

    const disabled =
      link.disabled ||
      link.getAttribute("aria-disabled") === "true" ||
      Boolean(link.closest(".a-disabled")) ||
      parent?.classList.contains("a-disabled") ||
      parent?.getAttribute("aria-disabled") === "true";

    if (disabled || !link.href) continue;

    const isNextControl =
      link.matches("li.a-last a, a[rel='next']") ||
      /next(?:\s+page)?/i.test(label);

    if (!isNextControl) continue;

    try {
      const url = new URL(link.href, location.href);

      if (url.origin !== location.origin) continue;
      if (!/\/product-reviews\//i.test(url.pathname)) continue;

      return link;
    } catch (_) {}
  }

  console.warn("[ERA] Next-page link not found.", {
    url: location.href,
    pagination: [
      ...document.querySelectorAll("li.a-last, .a-pagination")
    ].map(element => element.innerText.trim())
  });

  return null;
}

async function eraSendProgress(status, count = 0) {
  try {
    await chrome.runtime.sendMessage({
      type: "ERA_PROGRESS",
      asin: eraASIN,
      status,
      count
    });
  } catch (error) {
    console.warn("[ERA] Progress message failed:", error.message);
  }
}

function eraStorageKey() {
  return "eraReviews_" + eraASIN;
}

function eraLoadSavedReviews() {
  const map = new Map();

  try {
    const saved = JSON.parse(
      sessionStorage.getItem(eraStorageKey()) || "[]"
    );

    if (Array.isArray(saved)) {
      saved.forEach(review => {
        if (review?.id && review?.text) {
          map.set(review.id, review);
        }
      });
    }
  } catch (_) {}

  return map;
}

function eraSaveReviews(map) {
  try {
    sessionStorage.setItem(
      eraStorageKey(),
      JSON.stringify([...map.values()].slice(0, ERA_MAX_REVIEWS))
    );
  } catch (error) {
    console.warn("[ERA] Could not save reviews:", error.message);
  }
}

/* COLLECTION AND PAGINATION */
async function eraCollectReviews() {
  const reviews = eraLoadSavedReviews();
  const visitedKey = "eraVisited_" + eraASIN;
  const visited = new Set();

  try {
    const savedVisited = JSON.parse(
      sessionStorage.getItem(visitedKey) || "[]"
    );

    if (Array.isArray(savedVisited)) {
      savedVisited.forEach(url => visited.add(url));
    }

    sessionStorage.setItem("eraCollectorMode", "1");
  } catch (_) {}

  try {
    await eraWait(ERA_WAIT);

    for (
      let attempt = 0;
      attempt < ERA_MAX_ATTEMPTS &&
      reviews.size < ERA_MAX_REVIEWS;
      attempt++
    ) {
      const currentURL = location.href.split("#")[0];

      const pageReviews = eraExtractVisibleReviews();

      for (const review of pageReviews) {
        if (!reviews.has(review.id)) {
          reviews.set(review.id, review);
        }
      }

      eraSaveReviews(reviews);

      console.log("[ERA] Attempt:", attempt + 1, {
        pageReviews: pageReviews.length,
        totalUniqueReviews: reviews.size,
        currentURL
      });

      await eraSendProgress(
        "Collected " + reviews.size + " unique reviews.",
        reviews.size
      );

      if (reviews.size >= ERA_MAX_REVIEWS) {
        break;
      }

      // Amazon dynamically appends reviews on the same URL.
      const moreButton = eraFindMoreButton();

      if (moreButton) {
        const before = reviews.size;

        console.log("[ERA] Clicking Show More:", {
          buttonText: (
            moreButton.innerText ||
            moreButton.textContent ||
            ""
          ).trim(),
          reviewsBefore: before
        });

        moreButton.scrollIntoView({
          block: "center",
          behavior: "auto"
        });

        await eraWait(300);
        moreButton.click();

        // Wait up to 10 seconds for additional unique reviews.
        const deadline = Date.now() + 10000;

        while (Date.now() < deadline) {
          await eraWait(500);

          const newlyVisibleReviews =
            eraExtractVisibleReviews();

          for (const review of newlyVisibleReviews) {
            if (!reviews.has(review.id)) {
              reviews.set(review.id, review);
            }
          }

          eraSaveReviews(reviews);

          if (reviews.size > before) {
            console.log("[ERA] More reviews loaded:", {
              before,
              after: reviews.size,
              added: reviews.size - before
            });

            await eraSendProgress(
              "Collected " + reviews.size + " reviews.",
              reviews.size
            );

            break;
          }
        }

        // Continue on the same URL if new reviews appeared.
        if (reviews.size > before) {
          continue;
        }

        console.warn(
          "[ERA] Show More did not add unique reviews.",
          {
            before,
            after: reviews.size,
            buttonStillPresent: Boolean(eraFindMoreButton())
          }
        );
      }

      // Mark the current URL only when moving away from it.
      visited.add(currentURL);

      try {
        sessionStorage.setItem(
          visitedKey,
          JSON.stringify([...visited])
        );
      } catch (_) {}

      const nextLink = eraFindNextPage();

      if (!nextLink) {
        console.log(
          "[ERA] No further review page or Show More button found."
        );
        break;
      }

      const nextURL = new URL(
        nextLink.href,
        location.href
      );

      nextURL.hash = "eraCollector=1";

      if (nextURL.origin !== location.origin) {
        break;
      }

      if (visited.has(nextURL.href.split("#")[0])) {
        console.log(
          "[ERA] Next page already visited:",
          nextURL.href
        );
        break;
      }

      try {
        sessionStorage.setItem("eraCollectorMode", "1");
      } catch (_) {}

      eraSaveReviews(reviews);

      await eraSendProgress(
        "Opening next review page. Collected: " +
          reviews.size,
        reviews.size
      );

      console.log(
        "[ERA] Navigating to next page:",
        nextURL.href
      );

      location.href = nextURL.href;
      return;
    }

    const collected = [
      ...reviews.values()
    ].slice(0, ERA_MAX_REVIEWS);

    console.log("[ERA] FINAL TOTAL:", collected.length);

    if (!collected.length) {
      throw new Error(
        "No readable review text found. Check the collector tab Console."
      );
    }

    await eraSendProgress(
      "Sending " + collected.length +
        " reviews to the ML API…",
      collected.length
    );

    const response = await chrome.runtime.sendMessage({
      type: "ERA_REVIEWS_READY",
      asin: eraASIN,
      product: eraProduct,
      reviews: collected
    });

    if (!response?.ok) {
      throw new Error(
        response?.error || "ML analysis failed."
      );
    }
  } catch (error) {
    console.error("[ERA] Collector error:", error);

    try {
      await chrome.runtime.sendMessage({
        type: "ERA_COLLECTION_ERROR",
        asin: eraASIN,
        error: error.message
      });
    } catch (_) {}
  }
}

/* ==========================================================================
   DASHBOARD STYLES
   ========================================================================== */
function eraInjectStyles() {
  if (document.getElementById("era-style")) return;

  const style = document.createElement("style");
  style.id = "era-style";

  style.textContent = `
    #era-panel{--era-ink:#0f172a;--era-text:#1e293b;--era-muted:#526077;--era-line:#e2e8f0;--era-surface:#ffffff;--era-bg:#f4f7fb;--era-navy:#0f2540;--era-teal:#0f766e;--era-pos:#15803d;--era-neg:#b91c1c;--era-neu:#b45309;--era-pos-bg:#dcfce7;--era-neg-bg:#fee2e2;--era-neu-bg:#fef3c7;
      position:fixed;right:16px;bottom:16px;width:420px;max-width:calc(100vw - 24px);max-height:90vh;z-index:2147483647;background:var(--era-bg);color:var(--era-text);border:1px solid var(--era-line);border-radius:20px;box-shadow:0 24px 60px rgba(15,37,64,.28),0 2px 6px rgba(15,37,64,.08);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;display:flex;flex-direction:column;overflow:hidden}
    #era-panel *{box-sizing:border-box}
    #era-panel button,#era-panel select,#era-panel input{font-family:inherit}
    #era-panel :focus-visible{outline:2px solid #2563eb;outline-offset:2px}
    #era-header{background:linear-gradient(135deg,#0f2540,#134e5e);color:#fff;padding:14px 16px;display:flex;align-items:center;gap:12px}
    #era-logo{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#14b8a6,#0d9488);display:grid;place-items:center;font-size:20px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}
    #era-brand{font-size:16px;font-weight:700;letter-spacing:.2px}
    #era-subtitle{font-size:11px;color:#cbd5e1}
    #era-close,#era-min{border:0;background:rgba(255,255,255,.1);color:#fff;width:30px;height:30px;border-radius:9px;font-size:18px;line-height:1;cursor:pointer}
    #era-close{margin-left:auto}
    #era-close:hover,#era-min:hover{background:rgba(255,255,255,.22)}
    #era-body{overflow:auto;padding:14px;display:flex;flex-direction:column;gap:12px;scrollbar-width:thin}
    #era-panel.era-collapsed #era-body,#era-panel.era-collapsed #era-footer{display:none}
    .era-card{background:var(--era-surface);border:1px solid var(--era-line);border-radius:14px;padding:14px;box-shadow:0 1px 2px rgba(15,37,64,.05)}
    .era-label{font-size:10px;letter-spacing:1px;color:var(--era-muted);font-weight:700;text-transform:uppercase}
    #era-product{font-size:15px;font-weight:700;line-height:1.4;margin-top:5px;overflow-wrap:anywhere;color:var(--era-ink)}
    #era-asin{font-size:11px;color:var(--era-muted);margin-top:5px}
    .era-cat-row{display:flex;align-items:center;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid var(--era-line)}
    .era-cat-row .era-label{flex-shrink:0}
    #era-category-select{flex:1;min-width:0;border:1px solid #cbd5e1;border-radius:9px;padding:7px 8px;font-size:12px;background:#fff;color:var(--era-ink)}
    #era-category{font-size:11px;color:var(--era-muted);margin-top:7px}
    .era-heading{font-size:14px;font-weight:700;margin-bottom:10px;color:var(--era-ink)}
    #era-verdict{background:#ecfdf5;border:1px solid #a7f3d0;border-left:5px solid var(--era-teal);border-radius:14px;padding:14px}
    #era-verdict.era-tone-bad{background:#fef2f2;border-color:#fecaca;border-left-color:var(--era-neg)}
    #era-verdict.era-tone-mixed{background:#fffbeb;border-color:#fde68a;border-left-color:var(--era-neu)}
    #era-verdict-title{font-weight:700;color:var(--era-ink);font-size:17px;margin-top:4px}
    #era-verdict-text{color:#334155;font-size:12.5px;margin-top:6px;white-space:pre-line}
    #era-progress-bg{height:8px;background:#e2e8f0;border-radius:9px;overflow:hidden;margin:9px 0}
    #era-progress-bar{height:100%;width:0;background:linear-gradient(90deg,#14b8a6,#0d9488);transition:width .25s}
    #era-status{font-size:12px;color:var(--era-muted);overflow-wrap:anywhere}
    #era-counts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .era-count{border:1px solid var(--era-line);border-radius:12px;padding:10px 6px;text-align:center;background:#fafcff}
    .era-count strong{display:block;font-size:22px;line-height:1.2}
    .era-count span{font-size:11px;color:var(--era-muted)}
    .era-positive{color:var(--era-pos)}.era-negative{color:var(--era-neg)}.era-neutral{color:var(--era-neu)}
    .era-bar-row{display:flex;align-items:center;gap:8px;margin:9px 0;font-size:12px}
    .era-bar-label{width:58px;flex-shrink:0}
    .era-bar-bg{height:8px;background:#e2e8f0;border-radius:8px;overflow:hidden;flex:1}
    .era-bar{height:100%;border-radius:8px}
    .era-bar-value{width:36px;text-align:right;font-size:11px;color:var(--era-muted)}
    .era-chip{display:inline-block;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:700;background:#e2e8f0;color:#334155;white-space:nowrap}
    .era-chip-positive{background:var(--era-pos-bg);color:#166534}
    .era-chip-negative{background:var(--era-neg-bg);color:#991b1b}
    .era-chip-neutral{background:var(--era-neu-bg);color:#92400e}
    .era-list{padding:0;margin:0;list-style:none}
    .era-list li{font-size:12px;padding:9px 0;border-bottom:1px solid #edf0f5;overflow-wrap:anywhere}
    .era-list li:last-child{border-bottom:0;padding-bottom:0}
    .era-list li:first-child{padding-top:0}
    .era-theme-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:5px}
    .era-theme-top strong{color:var(--era-ink);font-size:13px}
    .era-muted{color:var(--era-muted);font-size:11px}
    .era-evidence{font-size:11px;color:#475569;margin-top:6px;padding:5px 8px;border-left:3px solid #cbd5e1;background:#f8fafc;border-radius:0 6px 6px 0;overflow-wrap:anywhere}
    .era-feature{padding:11px 0;border-bottom:1px solid #edf0f5}
    .era-feature:first-of-type{padding-top:2px}
    .era-feature:last-of-type{border-bottom:0}
    .era-feature-top{display:flex;justify-content:space-between;gap:8px;font-size:13px;margin-bottom:6px;align-items:baseline}
    .era-feature-top strong{color:var(--era-ink)}
    .era-feature-top span{color:var(--era-muted);font-size:11px;white-space:nowrap}
    .era-stack{display:flex;height:9px;border-radius:9px;overflow:hidden;background:#e2e8f0}
    .era-seg-pos{background:#16a34a}.era-seg-neg{background:#dc2626}.era-seg-mix{background:#d97706}.era-seg-unk{background:#94a3b8}
    .era-legend{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:6px;font-size:11px}
    .era-insight{font-size:11.5px;color:#334155;margin-top:5px}
    .era-key{font-size:10.5px;color:var(--era-muted);margin-top:8px}
    .era-note{padding:8px 10px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:9px;color:#475569;font-size:11px;margin-top:8px}
    .era-warning{padding:8px 10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;color:#9a3412;font-size:11px;margin-top:8px}
    .era-link-btn{border:0;background:transparent;color:#1d4ed8;font-size:12px;font-weight:600;cursor:pointer;padding:6px 0 0}
    .era-link-btn:hover{text-decoration:underline}
    #era-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .era-btn{border:0;border-radius:10px;padding:11px 8px;font-weight:700;font-size:12px;cursor:pointer;transition:transform .1s,box-shadow .15s}
    .era-btn:hover{box-shadow:0 4px 12px rgba(15,37,64,.15)}
    .era-btn:active{transform:translateY(1px)}
    .era-primary{background:var(--era-navy);color:#fff}
    .era-secondary{background:#fff;border:1px solid #cbd5e1;color:var(--era-navy)}
    .era-toolbar{display:flex;gap:8px;margin-bottom:6px}
    .era-toolbar select,.era-toolbar input{border:1px solid #cbd5e1;border-radius:9px;padding:7px 8px;font-size:12px;background:#fff;color:var(--era-ink);min-width:0}
    .era-toolbar input{flex:1}
    #era-pred-count{font-size:11px;color:var(--era-muted);margin-bottom:8px}
    #era-review-list{display:flex;flex-direction:column;gap:8px}
    .era-review{padding:11px;border:1px solid var(--era-line);border-radius:11px;background:#fcfdff}
    .era-review-title{font-weight:700;font-size:12px;color:var(--era-ink);margin-top:8px;overflow-wrap:anywhere}
    .era-review-text{font-size:12px;line-height:1.5;margin:6px 0 8px;overflow-wrap:anywhere;white-space:pre-line}
    .era-review-meta{font-size:10px;color:var(--era-muted);display:flex;justify-content:space-between;gap:8px}
    .era-review-features{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
    #era-footer{font-size:10px;color:var(--era-muted);text-align:center;padding:0 12px 12px}
    @media(max-width:480px){#era-panel{right:6px;bottom:6px;width:calc(100vw - 12px);max-height:92vh}}
    @media(prefers-reduced-motion:reduce){#era-panel *{transition:none!important}}
  `;

  document.head.appendChild(style);
}

/* DASHBOARD UI */
function eraCreateUI() {
  if (document.getElementById("era-panel")) return;

  eraInjectStyles();

  const panel = document.createElement("section");
  panel.id = "era-panel";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Review Analyzer AI dashboard");

  panel.innerHTML = `
    <div id="era-header">
      <div id="era-logo" aria-hidden="true">✦</div>
      <div>
        <div id="era-brand">Review Analyzer AI</div>
        <div id="era-subtitle">ML-powered shopping insights</div>
      </div>
      <button id="era-close" title="Close panel" aria-label="Close panel">×</button>
      <button id="era-min" title="Collapse or expand panel" aria-label="Collapse or expand panel" aria-expanded="true">–</button>
    </div>
    <div id="era-body">
      <div class="era-card">
        <div class="era-label">Product being analyzed</div>
        <div id="era-product"></div>
        <div id="era-asin"></div>
        <div class="era-cat-row">
          <label class="era-label" for="era-category-select">Category</label>
          <select id="era-category-select"></select>
        </div>
        <div id="era-category"></div>
      </div>
      <div id="era-verdict">
        <div class="era-label">AI buying summary</div>
        <div id="era-verdict-title">Starting analysis…</div>
        <div id="era-verdict-text">Collecting reviews and running the ML model.</div>
      </div>
      <div class="era-card">
        <div class="era-heading">Analysis progress</div>
        <div id="era-progress-bg" role="progressbar" aria-label="Analysis progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="era-progress-bar"></div></div>
        <div id="era-status" role="status" aria-live="polite">Preparing analysis…</div>
      </div>
      <div class="era-card">
        <div class="era-heading">ML sentiment distribution</div>
        <div id="era-counts">
          <div class="era-count"><strong class="era-positive" id="era-pos-count">—</strong><span>Positive</span></div>
          <div class="era-count"><strong class="era-negative" id="era-neg-count">—</strong><span>Negative</span></div>
          <div class="era-count"><strong class="era-neutral" id="era-neu-count">—</strong><span>Neutral</span></div>
        </div>
        <div id="era-sentiment-bars"></div>
      </div>
      <div class="era-card">
        <div class="era-heading">What buyers like</div>
        <ul class="era-list" id="era-pros"><li class="era-muted">Waiting for predictions…</li></ul>
      </div>
      <div class="era-card">
        <div class="era-heading">Main complaints</div>
        <ul class="era-list" id="era-cons"><li class="era-muted">Waiting for predictions…</li></ul>
      </div>
      <div class="era-card">
        <div class="era-heading">Feature insights</div>
        <div id="era-features">Waiting for analysis…</div>
      </div>
      <div class="era-card">
        <div class="era-heading">Review quality checks</div>
        <div id="era-quality">Waiting for analysis…</div>
      </div>
      <div class="era-card">
        <div class="era-heading">Individual predictions</div>
        <div class="era-toolbar">
          <select id="era-filter" aria-label="Filter predictions by sentiment">
            <option value="all">All sentiments</option>
            <option value="Positive">Positive</option>
            <option value="Negative">Negative</option>
            <option value="Neutral">Neutral</option>
          </select>
          <input id="era-search" type="search" placeholder="Search reviews" aria-label="Search reviews">
        </div>
        <div id="era-pred-count"></div>
        <div id="era-review-list">No predictions yet.</div>
        <button class="era-btn era-secondary" id="era-show-more" style="width:100%;margin-top:10px;display:none">Show more predictions</button>
      </div>
      <div id="era-actions">
        <button class="era-btn era-primary" id="era-export">Export report</button>
        <button class="era-btn era-secondary" id="era-copy">Copy summary</button>
      </div>
    </div>
    <div id="era-footer">Only accessible reviews are analyzed. Predictions and feature opinions are estimates.</div>
  `;

  document.body.appendChild(panel);

  document.getElementById("era-close").onclick = () => panel.remove();

  document.getElementById("era-min").onclick = event => {
    const collapsed = panel.classList.toggle("era-collapsed");
    event.currentTarget.setAttribute("aria-expanded", String(!collapsed));
  };

  document.getElementById("era-export").onclick = eraExportReport;
  document.getElementById("era-copy").onclick = eraCopySummary;

  document.getElementById("era-show-more").onclick = () => {
    eraShownPredictions += 10;
    eraRenderPredictions();
  };

  document.getElementById("era-category-select").onchange = event => {
    eraCategoryOverride = event.target.value;
    eraShowAllFeatures = false;
    eraUpdateCategoryUI();

    if (eraPredictions.length) eraRenderResults();
  };

  document.getElementById("era-filter").onchange = event => {
    eraPredictionFilter = event.target.value;
    eraShownPredictions = 5;
    eraRenderPredictions();
  };

  let searchTimer = null;

  document.getElementById("era-search").oninput = event => {
    const value = event.target.value;
    clearTimeout(searchTimer);

    searchTimer = setTimeout(() => {
      eraPredictionQuery = value;
      eraShownPredictions = 5;
      eraRenderPredictions();
    }, 200);
  };

  document.getElementById("era-review-list").onclick = event => {
    const button = event.target.closest("[data-era-toggle]");
    if (!button) return;

    const index = Number(button.getAttribute("data-era-toggle"));

    if (eraExpandedReviews.has(index)) eraExpandedReviews.delete(index);
    else eraExpandedReviews.add(index);

    eraRenderPredictions();
  };

  document.getElementById("era-product").textContent = eraProduct;
  document.getElementById("era-asin").textContent = "ASIN: " + eraASIN;

  eraUpdateCategoryUI();
}

function eraUpdateCategoryUI() {
  const select = document.getElementById("era-category-select");
  const note = document.getElementById("era-category");
  if (!select) return;

  const detected = eraDetectCategory(eraProduct);

  if (!select.options.length) {
    select.add(new Option("", ""));

    Object.entries(ERA_CATEGORY_LABELS).forEach(([id, label]) => {
      select.add(new Option(label, id));
    });
  }

  select.options[0].textContent =
    "Auto-detect (" + ERA_CATEGORY_LABELS[detected] + ")";
  select.value = eraCategoryOverride || "";

  if (!note) return;

  if (eraCategoryOverride) {
    note.textContent = "Category selected manually. Feature analysis uses " +
      ERA_CATEGORY_LABELS[eraCategoryOverride] + " features.";
  } else if (detected === "general") {
    note.textContent = "No specific category was recognised from the title, so " +
      "general features are used. Pick a category above if you prefer.";
  } else {
    note.textContent = "Detected from the product title. Title matching can be " +
      "wrong; change the category if the features look off.";
  }
}

/* ==========================================================================
   FEATURE STATS, THEMES AND RENDERING
   ========================================================================== */
/* Returns [[featureName, data], ...] sorted by mentions. data has:
   mentions (unique reviews mentioning the feature), positive, negative, mixed,
   neutral, mixedNeutral, unclear, inferred, explicit, explicitPositive,
   explicitNegative, snippets, percents. Percentages use `mentions` as the
   denominator. */
function eraFeatureStats() {
  if (!eraPredictions.length) return [];
  return eraEnsureFeatureAnalysis().stats.slice();
}

/* sentiment: "Positive" -> strongest praised features,
              "Negative" -> strongest complaints.
   Only opinions taken from the review's own sentence count here (explicit
   opinions); opinions copied from the overall prediction are left out so a
   feature is never praised or criticised just because the review was.
   Ranked by evidence strength (Wilson lower bound), not raw frequency. */
function eraThemes(sentiment) {
  const target = eraNormalizeSentiment(sentiment);
  if (target !== "Positive" && target !== "Negative") return [];

  const minCount = eraPredictions.length >= 20 ? 2 : 1;
  const positive = target === "Positive";

  return eraFeatureStats()
    .map(([feature, data]) => {
      const count = positive ? data.explicitPositive : data.explicitNegative;
      const opposite = positive ? data.explicitNegative : data.explicitPositive;
      const share = data.mentions ? count / data.mentions : 0;
      const snippets = positive ? data.snippets.positive : data.snippets.negative;

      return {
        feature,
        sentiment: target,
        count,
        opposite,
        mentions: data.mentions,
        percent: eraPercent(count, data.mentions),
        share,
        score: eraWilsonLower(count, data.mentions),
        snippet: snippets[0] || ""
      };
    })
    .filter(item => {
      if (item.count < minCount) return false;

      return positive
        ? item.share >= 0.4 && item.count > item.opposite
        : item.share >= 0.3;
    })
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, 4);
}

function eraCounts() {
  const counts = {
    Positive: 0,
    Negative: 0,
    Neutral: 0,
    Unknown: 0
  };

  eraPredictions.forEach(review => {
    counts[eraNormalizeSentiment(review.sentiment)]++;
  });

  return counts;
}

function eraVerdict(counts) {
  const total = eraPredictions.length;

  if (!total) {
    return [
      "No predictions available",
      "No review predictions are available yet."
    ];
  }

  const positive = counts.Positive / total;
  const negative = counts.Negative / total;
  const sample = total < 10
    ? " This is based on a small sample, so treat it with caution."
    : "";

  if (positive >= 0.65 && negative < 0.2) {
    return [
      "Generally positive feedback",
      "Most analyzed reviews are predicted positive. Check the complaints before deciding." + sample
    ];
  }

  if (negative >= 0.4) {
    return [
      "Several concerns reported",
      "A substantial share of analyzed reviews is predicted negative. Review recurring complaints before buying." + sample
    ];
  }

  if (negative > positive) {
    return [
      "Feedback leans negative",
      "Negative predictions outnumber positive ones." + sample
    ];
  }

  if (Math.abs(positive - negative) < 0.15) {
    return [
      "Mixed customer feedback",
      "Positive and negative predictions are relatively close." + sample
    ];
  }

  return [
    "Generally positive, with some concerns",
    "Positive predictions are more common, but some customers report problems." + sample
  ];
}

function eraVerdictTone(counts) {
  const total = eraPredictions.length;
  if (!total) return "mixed";

  const positive = counts.Positive / total;
  const negative = counts.Negative / total;

  if (positive >= 0.65 && negative < 0.2) return "good";
  if (negative >= 0.4 || negative > positive) return "bad";
  return "mixed";
}

/* Four short parts: overall sentiment, praised features, complaints, limits. */
function eraBuildSummaryText(counts, verdict) {
  const describe = items => items.slice(0, 2).map(item =>
    item.feature + " (" + item.count + " of " + item.mentions + " reviews" +
    (item.mentions < 5 ? ", small sample" : "") + ")"
  ).join(", ");

  const likes = eraThemes("Positive");
  const complaints = eraThemes("Negative");

  return [
    "Overall sentiment: " + verdict[1],
    "Most praised features: " +
      (likes.length ? describe(likes) + "." : "none with enough explicit evidence."),
    "Main complaints: " +
      (complaints.length ? describe(complaints) + "." : "none with enough explicit evidence."),
    "Limits: these are ML predictions and keyword-based feature opinions, " +
      "not a measure of product quality."
  ].join("\n");
}

function eraRenderSentiment(counts) {
  const total = eraPredictions.length;

  document.getElementById("era-pos-count").textContent = counts.Positive;
  document.getElementById("era-neg-count").textContent = counts.Negative;
  document.getElementById("era-neu-count").textContent = counts.Neutral;

  const items = [
    ["Positive", counts.Positive, "#16a34a"],
    ["Negative", counts.Negative, "#dc2626"],
    ["Neutral", counts.Neutral, "#d97706"]
  ];

  const percents = eraPercents(items.map(item => item[1]), total);

  document.getElementById("era-sentiment-bars").innerHTML =
    items.map(([label, count, color], index) => {
      const percent = percents[index];

      return '<div class="era-bar-row"><span class="era-bar-label">' +
        label + '</span><div class="era-bar-bg"><div class="era-bar" style="width:' +
        percent + '%;background:' + color + '"></div></div><span class="era-bar-value">' +
        percent + '%</span></div>';
    }).join("");
}

function eraRenderThemeList(id, items, emptyMessage) {
  const element = document.getElementById(id);
  if (!element) return;

  if (!items.length) {
    element.innerHTML =
      '<li class="era-muted">' + eraEscape(emptyMessage) + "</li>";
    return;
  }

  element.innerHTML = items.map(item => {
    const negative = item.sentiment === "Negative";
    const color = negative ? "#dc2626" : "#16a34a";
    const word = negative ? "negative" : "positive";
    const arrow = negative ? "▼" : "▲";
    const limited = item.mentions < 5
      ? ' <span class="era-muted">· small sample (' + item.mentions + " reviews)</span>"
      : "";
    const evidence = item.snippet
      ? '<div class="era-evidence">“' + eraEscape(item.snippet) + "”</div>"
      : "";

    return '<li><div class="era-theme-top"><strong>' + eraEscape(item.feature) +
      '</strong><span class="era-chip ' +
      (negative ? "era-chip-negative" : "era-chip-positive") + '">' +
      arrow + " " + item.percent + "% " + word + '</span></div>' +
      '<div class="era-bar-bg"><div class="era-bar" style="width:' +
      Math.max(2, item.percent) + "%;background:" + color + '"></div></div>' +
      '<div class="era-muted" style="margin-top:5px">' + item.count +
      " of " + item.mentions + " mentioning reviews are " + word + limited +
      "</div>" + evidence + "</li>";
  }).join("");
}

function eraFeatureInsight(data) {
  const n = data.mentions;

  if (n < 3) {
    return "Only " + n + " review" + (n === 1 ? "" : "s") +
      " mention this, which is too few for a firm conclusion.";
  }

  const known = data.positive + data.negative + data.mixedNeutral;

  if (!known) {
    return "Mentioned often, but the reviewers' opinion could not be determined.";
  }

  const p = data.positive / n;
  const q = data.negative / n;

  if (data.unclear / n >= 0.5) return "Frequently mentioned without a clear opinion.";
  if (p >= 0.6 && q <= 0.15) return "Mostly praised.";
  if (q >= 0.5 && p <= 0.2) return "Mostly criticised.";
  if (p >= 0.25 && q >= 0.25) return "Opinions are divided.";
  if (q >= 0.3) return "A recurring concern for a notable share of reviewers.";
  if (p > q) return "Leans positive.";
  if (q > p) return "Leans negative.";
  return "Mostly neutral or mixed opinions.";
}

function eraRenderFeatures() {
  const container = document.getElementById("era-features");
  if (!container) return;

  const features = eraFeatureStats();
  const categoryId = eraGetCategoryId();
  const label = ERA_CATEGORY_LABELS[categoryId] || "General product";

  if (!features.length) {
    container.innerHTML =
      '<div class="era-muted">No recognisable ' + eraEscape(label.toLowerCase()) +
      " feature mentions were found in the analysed reviews.</div>";
    return;
  }

  const cache = eraEnsureFeatureAnalysis();
  const visible = eraShowAllFeatures ? features : features.slice(0, 8);

  const rows = visible.map(([name, data]) => {
    const p = data.percents;
    const seg = (value, cls) => value
      ? '<span class="era-seg-' + cls + '" style="width:' +
        (value / data.mentions * 100) + '%"></span>'
      : "";

    const aria = name + ": " + data.positive + " positive, " + data.negative +
      " negative, " + data.mixedNeutral + " mixed or neutral, " +
      data.unclear + " unclear, out of " + data.mentions + " reviews";

    const legend = [
      '<span class="era-positive">▲ ' + data.positive + " positive (" + p.positive + "%)</span>",
      '<span class="era-negative">▼ ' + data.negative + " negative (" + p.negative + "%)</span>"
    ];

    if (data.mixedNeutral) {
      legend.push('<span class="era-neutral">◆ ' + data.mixedNeutral +
        " mixed/neutral (" + p.mixedNeutral + "%)</span>");
    }

    if (data.unclear) {
      legend.push('<span class="era-muted">? ' + data.unclear +
        " unclear (" + p.unclear + "%)</span>");
    }

    const sourceNote = '<div class="era-muted" style="margin-top:3px">' +
      data.explicit + " explicit opinion" + (data.explicit === 1 ? "" : "s") +
      " from the review's own sentence" +
      (data.inferred
        ? " · " + data.inferred + " fallback opinion" + (data.inferred === 1 ? "" : "s") +
          " copied from the overall review prediction (~)"
        : "") +
      "</div>";

    return '<div class="era-feature"><div class="era-feature-top"><strong>' +
      eraEscape(name) + "</strong><span>" + data.mentions + " review" +
      (data.mentions === 1 ? "" : "s") + '</span></div>' +
      '<div class="era-stack" role="img" aria-label="' + eraEscape(aria) + '">' +
      seg(data.positive, "pos") + seg(data.negative, "neg") +
      seg(data.mixedNeutral, "mix") + seg(data.unclear, "unk") + "</div>" +
      '<div class="era-legend">' + legend.join("") + "</div>" +
      '<div class="era-insight">' + eraEscape(eraFeatureInsight(data)) + "</div>" +
      sourceNote + "</div>";
  }).join("");

  const toggle = features.length > 8
    ? '<button class="era-link-btn" id="era-features-toggle">' +
      (eraShowAllFeatures ? "Show fewer features" : "Show all " + features.length + " features") +
      "</button>"
    : "";

  container.innerHTML =
    '<div class="era-muted" style="margin-bottom:8px">' + eraEscape(label) +
    " features · " + cache.reviewsWithFeatures + " of " + eraPredictions.length +
    " reviews mention at least one. Percentages are shares of the reviews that mention each feature.</div>" +
    rows + toggle +
    '<div class="era-key">▲ positive · ▼ negative · ◆ mixed/neutral · ? unclear · ~ fallback from overall sentiment. ' +
    "Feature opinions are keyword-based estimates.</div>";

  const button = document.getElementById("era-features-toggle");

  if (button) {
    button.onclick = () => {
      eraShowAllFeatures = !eraShowAllFeatures;
      eraRenderFeatures();
    };
  }
}

/* Data-quality checks. These describe the collected data and the heuristic;
   they are not a measure of ML model accuracy. */
function eraQualityItems() {
  const total = eraPredictions.length;
  if (!total) return [];

  const cache = eraEnsureFeatureAnalysis();
  const label = ERA_CATEGORY_LABELS[eraGetCategoryId()].toLowerCase();
  const items = [];

  items.push({
    text: eraReviews.length + " reviews collected; " + total + " analyzed."
  });

  items.push({
    text: cache.usable + " of " + total +
      " analyzed reviews have usable text after removing Amazon labels and metadata.",
    warn: cache.usable < total
  });

  items.push({
    text: cache.reviewsWithFeatures + " of " + total + " reviews mention at least one " +
      label + " feature (none detected in " + (total - cache.reviewsWithFeatures) + ")."
  });

  let withConfidence = 0;
  let lowConfidence = 0;

  eraPredictions.forEach(review => {
    const percent = eraConfidencePercent(review);
    if (percent === null) return;

    withConfidence++;
    if (percent < 55) lowConfidence++;
  });

  if (total - withConfidence) {
    items.push({
      warn: true,
      text: (total - withConfidence) + " of " + total +
        " predictions have no usable confidence value."
    });
  }

  if (lowConfidence) {
    items.push({
      warn: true,
      text: lowConfidence + " of " + withConfidence +
        " predictions with a confidence value are below 55%."
    });
  }

  const rated = eraPredictions.filter(review => review.rating);
  const conflicts = rated.filter(review => {
    const sentiment = eraNormalizeSentiment(review.sentiment);
    return (review.rating >= 4 && sentiment === "Negative") ||
      (review.rating <= 2 && sentiment === "Positive");
  });

  if (conflicts.length) {
    items.push({
      warn: true,
      text: conflicts.length + " of " + rated.length +
        " rated reviews have a prediction that disagrees with the star rating " +
        "(4-5 stars predicted negative, or 1-2 stars predicted positive). " +
        "This does not prove the prediction is wrong."
    });
  }

  let mentionTotal = 0;
  let explicit = 0;
  let fallback = 0;
  let unclear = 0;

  cache.stats.forEach(([, data]) => {
    mentionTotal += data.mentions;
    explicit += data.explicit;
    fallback += data.inferred;
    unclear += data.unclear;
  });

  if (mentionTotal) {
    items.push({
      text: "Feature opinions: " + mentionTotal + " in total, " + explicit +
        " explicit (from the review's own sentence), " + fallback +
        " fallback (copied from the overall prediction), " + unclear + " unclear."
    });

    if (unclear / mentionTotal >= 0.3) {
      items.push({
        warn: true,
        text: eraPercent(unclear, mentionTotal) +
          "% of feature opinions were unclear, so feature percentages may be less reliable."
      });
    }
  } else {
    items.push({ text: "No feature opinions were detected." });
  }

  items.push({
    text: "These are data-quality checks, not a measure of model accuracy."
  });

  items.push({
    text: "Feature opinions come from a keyword-and-sentence heuristic, not from the ML model, so they are estimates."
  });

  return items;
}

function eraRenderQuality() {
  const container = document.getElementById("era-quality");
  if (!container) return;

  const items = eraQualityItems();

  if (!items.length) {
    container.textContent = "No analyzed reviews yet.";
    return;
  }

  container.innerHTML = items.map((item, index) =>
    '<div class="' + (item.warn ? "era-warning" : index ? "era-note" : "era-muted") +
    '"' + (index ? "" : ' style="margin-bottom:2px"') + ">" +
    eraEscape(item.text) + "</div>"
  ).join("");
}

function eraRenderPredictions() {
  const container = document.getElementById("era-review-list");
  if (!container) return;

  const counter = document.getElementById("era-pred-count");
  const query = eraPredictionQuery.trim().toLowerCase();

  const matching = eraPredictions
    .map((review, index) => ({ review, index }))
    .filter(({ review }) => {
      if (
        eraPredictionFilter !== "all" &&
        eraNormalizeSentiment(review.sentiment) !== eraPredictionFilter
      ) {
        return false;
      }

      if (!query) return true;

      const cleaned = eraCleanReview(review);
      return (cleaned.title + " " + cleaned.body + " " + (review.author || ""))
        .toLowerCase()
        .includes(query);
    });

  const items = matching.slice(0, eraShownPredictions);

  if (counter) {
    counter.textContent = eraPredictions.length
      ? "Showing " + items.length + " of " + matching.length + " matching (" +
        eraPredictions.length + " analyzed)"
      : "";
  }

  if (!items.length) {
    container.innerHTML = '<div class="era-muted">' +
      (eraPredictions.length ? "No predictions match the current filter." : "No predictions yet.") +
      "</div>";
  } else {
    const analysis = eraEnsureFeatureAnalysis().perReview;

    container.innerHTML = items.map(({ review, index }) => {
      const sentiment = eraNormalizeSentiment(review.sentiment);

      const chip = sentiment === "Positive" ? "era-chip-positive"
        : sentiment === "Negative" ? "era-chip-negative"
        : "era-chip-neutral";

      const cleaned = eraCleanReview(review);
      let body = cleaned.body;
      let limitation = "";

      if (!cleaned.title && !body) {
        body = String(review.text || review.review || "").trim();
        limitation = '<div class="era-muted">Amazon labels could not be separated for this review, so the original text is shown.</div>';
      }

      const long = body.length > 320;
      const expanded = eraExpandedReviews.has(index);
      const shown = long && !expanded ? body.slice(0, 320).trimEnd() + "…" : body;

      const toggle = long
        ? '<button class="era-link-btn" style="padding:0 0 6px" data-era-toggle="' + index + '">' +
          (expanded ? "Show less" : "Read more") + "</button>"
        : "";

      const featureChips = (analysis[index] || []).slice(0, 6).map(item => {
        const cls = item.sentiment === "Positive" ? "era-chip-positive"
          : item.sentiment === "Negative" ? "era-chip-negative"
          : item.sentiment === "Unclear" ? ""
          : "era-chip-neutral";

        const mark = item.sentiment === "Positive" ? "▲"
          : item.sentiment === "Negative" ? "▼"
          : item.sentiment === "Unclear" ? "?"
          : "◆";

        const title = item.inferred
          ? "Fallback: copied from the overall review prediction"
          : "From this sentence: " + (item.snippet || "");

        return '<span class="era-chip ' + cls + '" title="' + eraEscape(title) + '">' +
          eraEscape(item.feature) + " " + mark + (item.inferred ? "~" : "") + "</span>";
      }).join("");

      return '<div class="era-review"><div class="era-review-meta"><span>' +
        eraEscape(review.author || "Amazon reviewer") + '</span><span>' +
        eraEscape(review.date || "") + "</span></div>" +
        (cleaned.title
          ? '<div class="era-review-title">' + eraEscape(cleaned.title) + "</div>"
          : "") +
        (shown
          ? '<div class="era-review-text">' + eraEscape(shown) + "</div>"
          : '<div class="era-review-text era-muted">No review text beyond the title.</div>') +
        toggle + limitation +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="era-chip ' +
        chip + '">' + eraEscape(sentiment) +
        '</span><span class="era-muted">' + eraEscape(eraFormatConfidence(review)) +
        "</span></div>" +
        (featureChips ? '<div class="era-review-features">' + featureChips + "</div>" : "") +
        "</div>";
    }).join("");
  }

  const button = document.getElementById("era-show-more");

  if (button) {
    button.style.display = matching.length > eraShownPredictions ? "block" : "none";
  }
}

function eraSetStatus(status) {
  const element = document.getElementById("era-status");
  if (element) element.textContent = status;
}

function eraSetProgress(done, total) {
  const bar = document.getElementById("era-progress-bar");
  const percent = Math.min(100, total ? done / total * 100 : 0);

  if (bar) {
    bar.style.width = percent + "%";
  }

  document.getElementById("era-progress-bg")
    ?.setAttribute("aria-valuenow", String(Math.round(percent)));
}

function eraRenderResults() {
  const counts = eraCounts();
  const verdict = eraVerdict(counts);

  document.getElementById("era-product").textContent = eraProduct;
  document.getElementById("era-asin").textContent =
    "ASIN: " + eraASIN + " · " + eraReviews.length +
    " collected · " + eraPredictions.length + " analyzed";

  eraUpdateCategoryUI();

  const likes = eraThemes("Positive");
  const complaints = eraThemes("Negative");

  const verdictBox = document.getElementById("era-verdict");
  verdictBox.classList.remove("era-tone-bad", "era-tone-mixed");

  const tone = eraVerdictTone(counts);
  if (tone === "bad") verdictBox.classList.add("era-tone-bad");
  if (tone === "mixed") verdictBox.classList.add("era-tone-mixed");

  document.getElementById("era-verdict-title").textContent = verdict[0];
  document.getElementById("era-verdict-text").textContent =
    eraBuildSummaryText(counts, verdict);

  eraRenderSentiment(counts);

  eraRenderThemeList(
    "era-pros",
    likes,
    "No feature has enough clear positive evidence yet."
  );

  eraRenderThemeList(
    "era-cons",
    complaints,
    "No feature has enough clear negative evidence yet."
  );

  eraRenderFeatures();
  eraRenderQuality();

  eraShownPredictions = 5;
  eraRenderPredictions();

  eraSetProgress(eraPredictions.length, eraPredictions.length);
  eraSetStatus(
    "Complete: " + eraReviews.length + " collected, " +
    eraPredictions.length + " analyzed."
  );
}

function eraBuildReport() {
  const counts = eraCounts();
  const verdict = eraVerdict(counts);
  const categoryId = eraGetCategoryId();

  const lines = [
    "E-COMMERCE REVIEW ANALYZER REPORT",
    "Product: " + eraProduct,
    "ASIN: " + eraASIN,
    "Category: " + ERA_CATEGORY_LABELS[categoryId] +
      (eraCategoryOverride ? " (selected manually)" : " (detected from the product title)"),
    "Reviews collected: " + eraReviews.length,
    "Reviews analyzed: " + eraPredictions.length,
    "",
    "BUYING SUMMARY",
    verdict[0],
    eraBuildSummaryText(counts, verdict),
    "",
    "SENTIMENT DISTRIBUTION (ML predictions)"
  ];

  const sentiments = ["Positive", "Negative", "Neutral"];
  const percents = eraPercents(
    sentiments.map(sentiment => counts[sentiment]),
    eraPredictions.length
  );

  sentiments.forEach((sentiment, index) => {
    lines.push(
      sentiment + ": " + counts[sentiment] + " (" + percents[index] + "%)"
    );
  });

  const themeLines = item => {
    const result = [
      "- " + item.feature + ": " + item.count + " of " + item.mentions +
      " mentioning reviews (" + item.percent + "%)" +
      (item.mentions < 5 ? " [small sample]" : "")
    ];

    if (item.snippet) result.push('    Example: "' + item.snippet + '"');
    return result;
  };

  const likes = eraThemes("Positive");
  const complaints = eraThemes("Negative");

  lines.push("", "WHAT BUYERS LIKE (explicit feature opinions only)");
  if (likes.length) likes.forEach(item => lines.push(...themeLines(item)));
  else lines.push("No feature has enough clear positive evidence.");

  lines.push("", "MAIN COMPLAINTS (explicit feature opinions only)");
  if (complaints.length) complaints.forEach(item => lines.push(...themeLines(item)));
  else lines.push("No feature has enough clear negative evidence.");

  lines.push("", "FEATURE INSIGHTS");

  const features = eraFeatureStats();

  if (features.length) {
    features.forEach(([name, data]) => {
      lines.push(
        "- " + name + ": " + data.mentions + " reviews | positive " +
        data.positive + " (" + data.percents.positive + "%) | negative " +
        data.negative + " (" + data.percents.negative + "%) | mixed/neutral " +
        data.mixedNeutral + " (" + data.percents.mixedNeutral + "%) | unclear " +
        data.unclear + " (" + data.percents.unclear + "%) | explicit " +
        data.explicit + " | fallback from overall sentiment " + data.inferred
      );
    });
  } else {
    lines.push("No recognisable feature mentions were found.");
  }

  lines.push("", "QUALITY CHECKS");
  eraQualityItems().forEach(item => {
    lines.push("- " + (item.warn ? "Warning: " : "") + item.text);
  });

  lines.push("", "INDIVIDUAL PREDICTIONS");

  eraPredictions.forEach(review => {
    const cleaned = eraCleanReview(review);
    const text = [cleaned.title, cleaned.body].filter(Boolean).join(" - ")
      .replace(/\s+/g, " ") || String(review.text || review.review || "");

    lines.push(
      "[" + review.sentiment + " | " + eraFormatConfidence(review) + "] " + text
    );
  });

  lines.push(
    "",
    "Predictions are ML estimates based on accessible reviews.",
    "Feature opinions are heuristic estimates from review text, not ML output."
  );

  return lines.join("\n");
}

function eraExportReport() {
  if (!eraPredictions.length) {
    eraSetStatus("No report is available yet.");
    return;
  }

  const blob = new Blob(
    [eraBuildReport()],
    { type: "text/plain;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = "review-analysis-" + eraASIN + ".txt";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function eraCopySummary() {
  if (!eraPredictions.length) {
    eraSetStatus("No report is available yet.");
    return;
  }

  try {
    await navigator.clipboard.writeText(eraBuildReport());
    eraSetStatus("Report copied.");
  } catch (_) {
    eraSetStatus("Copy failed. Use Export report.");
  }
}

/* PRODUCT PAGE STARTUP */
async function eraStartAutomaticAnalysis() {
  if (eraStartedASIN === eraASIN) return;

  eraStartedASIN = eraASIN;

  try {
    const result = await chrome.runtime.sendMessage({
      type: "ERA_START_PRODUCT",
      asin: eraASIN,
      product: eraProduct
    });

    if (!result?.ok) {
      throw new Error(result?.error || "Could not start analysis.");
    }

    eraSetStatus("Opening reviews and collecting accessible reviews…");
  } catch (error) {
    eraSetStatus("Could not start: " + error.message);
  }
}

chrome.runtime.onMessage.addListener(message => {
  if (message.type === "ERA_PROGRESS_UPDATE") {
    if (message.asin && message.asin !== eraASIN) return;

    eraSetStatus(message.status || "Working…");

    if (message.count) {
      eraSetProgress(message.count, Math.max(message.count, 100));
    }
  }

  if (message.type === "ERA_ANALYSIS_COMPLETE") {
    if (message.asin && message.asin !== eraASIN) return;

    eraReviews = Array.isArray(message.reviews) ? message.reviews : [];

    eraPredictions = Array.isArray(message.predictions)
      ? message.predictions.map(item => ({
          ...item,
          sentiment: eraNormalizeSentiment(item.sentiment)
        }))
      : [];

    eraExpandedReviews = new Set();

    if (message.product) eraProduct = message.product;

    eraRenderResults();
  }

  if (
    message.type === "ERA_ANALYSIS_ERROR" ||
    message.type === "ERA_COLLECTION_ERROR"
  ) {
    if (message.asin && message.asin !== eraASIN) return;

    eraSetStatus(
      "Analysis issue: " + (message.error || "Unknown error")
    );

    const title = document.getElementById("era-verdict-title");
    const description = document.getElementById("era-verdict-text");

    if (title) title.textContent = "Analysis incomplete";

    if (description) {
      description.textContent =
        message.error || "Please try again.";
    }
  }
});

async function eraInitialize() {
  eraASIN = eraGetASIN();

  if (eraIsCollectorTab() && eraIsReviewPage()) {
    eraProduct = "Amazon product " + eraASIN;
    await eraCollectReviews();
    return;
  }

  if (!eraASIN || eraIsReviewPage()) return;

  eraProduct = eraGetProductTitle();
  eraCreateUI();

  await eraStartAutomaticAnalysis();
}

let eraLastURL = location.href;

setInterval(() => {
  if (location.href === eraLastURL) return;

  eraLastURL = location.href;

  if (eraIsCollectorTab() || eraIsReviewPage()) return;

  const newASIN = eraGetASIN();

  if (!newASIN || newASIN === eraASIN) return;

  eraASIN = newASIN;
  eraProduct = eraGetProductTitle();
  eraReviews = [];
  eraPredictions = [];
  eraStartedASIN = "";
  eraCategoryOverride = "";
  eraShowAllFeatures = false;
  eraPredictionFilter = "all";
  eraPredictionQuery = "";
  eraExpandedReviews = new Set();
  eraShownPredictions = 5;
  eraConfidenceCache = { source: null, scale: "fraction" };
  eraFeatureCache = {
    source: null,
    categoryId: "",
    perReview: [],
    stats: [],
    reviewsWithFeatures: 0,
    usable: 0
  };

  document.getElementById("era-panel")?.remove();

  eraInitialize();
}, 1000);

eraInitialize();