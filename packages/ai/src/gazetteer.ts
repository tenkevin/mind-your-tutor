// Small synthetic word lists for the rule recognizer (A7). They are a stand-in for the
// on-device NER model (ARCHITECTURE.md §12 q12), which sits behind `EntityRecognizer`.

/** Common given names and nicknames; matched in any case unless also in AMBIGUOUS. */
export const FIRST_NAMES: ReadonlySet<string> = new Set(
  `aaliyah aaron abby abigail adam adrian aiden alex alexander alexis alice alicia amanda amelia amir amy ana andrea andrew angel anna anthony ariana arjun aria arthur ashley ava ayesha ben benjamin beth bella blake brandon brian brooke caleb camila carlos carmen caroline charlie charlotte chloe chris christian claire daniel danny david diego dylan eli elijah elena ella ellie emily emma ethan eva evan fatima felix finn gabriel gabby gavin george gianna hannah harry henry hugo ian isaac isabel isabella isla jacob jaden jake james jamal jasmine jason jayden jenna jenny jessica jim joe joel johnny jonah jordan jose joseph joshua josie juan julia julian kai kayla kevin kyle laila lara laura layla leah leo leon liam lily lina linda liz logan lola lucas lucia lucy luis luke luna lydia maddie madison maria mariam mason matt matthew maya mia michael michelle mike miguel mila mohammed muhammad nadia naomi natalie nate nathan nicholas nick noah nora olivia omar oscar owen paul peter priya rachel rafael rebecca ricardo rosa ryan sam samantha samir samuel sara sarah sasha sean sebastian sofia sophia sophie stella stephanie steve tara thomas tim tina toby tom tommy tyler valeria victor victoria vivian xavier yara zach zachary zoe zoey`.split(
    /\s+/,
  ),
);

/** Names that are also everyday words: only blurred when capitalised. */
export const AMBIGUOUS: ReadonlySet<string> = new Set(
  `angel aria bella blake brooke chase drew eli ella finn hope jordan joy kai mason may mia nick nate rose sasha sky stella summer will mark grace art jack bill pat sue bob rob don jean dawn faith ray frank april june ivy iris violet daisy pearl ruby amber jade pepper rich max cat luna lily josie kyle lola nora`.split(
    /\s+/,
  ),
);

const PLACE_WORDS = `london paris madrid barcelona berlin rome lisbon dublin edinburgh manchester liverpool birmingham glasgow cardiff leeds bristol amsterdam brussels vienna zurich geneva stockholm oslo copenhagen helsinki warsaw prague budapest athens istanbul moscow cairo lagos nairobi johannesburg mumbai delhi bangalore karachi dhaka beijing shanghai tokyo osaka seoul bangkok singapore jakarta manila sydney melbourne brisbane perth auckland toronto vancouver montreal ottawa calgary chicago boston houston dallas austin denver seattle portland phoenix miami atlanta detroit philadelphia baltimore brooklyn queens manhattan oakland sacramento orlando tampa memphis nashville texas california florida ohio ontario quebec alberta england scotland wales ireland france spain italy germany portugal mexico brazil argentina chile peru colombia canada australia india pakistan china japan korea egypt nigeria kenya ghana turkey greece russia ukraine poland sweden norway denmark finland`;

const PLACE_PHRASES = [
  'new york city',
  'new york',
  'los angeles',
  'san francisco',
  'san diego',
  'san jose',
  'san antonio',
  'las vegas',
  'new jersey',
  'new orleans',
  'new mexico',
  'new zealand',
  'new delhi',
  'hong kong',
  'south africa',
  'saudi arabia',
  'united states',
  'united kingdom',
  'north carolina',
  'south carolina',
  'rio de janeiro',
  'buenos aires',
  'mexico city',
  'kuala lumpur',
  'tel aviv',
  'abu dhabi',
  'sao paulo',
  'salt lake city',
  'kansas city',
  'cape town',
  'el paso',
  'fort worth',
  'santa monica',
  'palo alto',
];

/** Cities, regions and countries (lower case); phrases are matched as a whole. */
export const PLACES: ReadonlySet<string> = new Set([...PLACE_WORDS.split(/\s+/), ...PLACE_PHRASES]);
/** Longest phrase first, so "new york city" wins over "new york". */
export const PLACE_PHRASES_LONGEST_FIRST: readonly string[] = [...PLACE_PHRASES].sort(
  (a, b) => b.length - a.length,
);
