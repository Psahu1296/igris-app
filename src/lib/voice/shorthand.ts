/**
 * Chat shorthand, spelled out before it is spoken. Screen text is never changed.
 *
 * Messages read from the shade are full of it ("idk", "mtlb", "kl aa rha h"), and a
 * voice reads "idk" as a word. English acronyms become English words (Alan says
 * them); Hindi shorthand becomes the full romanized word, which language.ts then
 * recognises as Hindi and hinglish.ts turns into Devanagari for the Hindi voice.
 *
 * Whole words only, case-insensitive. Deliberately missing: "bc" (Hindi abuse),
 * "lol" (people say it as a word), and bare numbers like "2" or "4" (prices).
 */
const SHORTHAND: Record<string, string> = {
  // English
  idk: "I don't know", idc: "I don't care", fyi: 'for your information', btw: 'by the way',
  asap: 'as soon as possible', omw: 'on my way', ttyl: 'talk to you later', brb: 'be right back',
  tbh: 'to be honest', imo: 'in my opinion', imho: 'in my honest opinion', afaik: 'as far as I know',
  np: 'no problem', nvm: 'never mind', lmk: 'let me know', hbd: 'happy birthday', hru: 'how are you',
  wbu: 'what about you', wyd: 'what are you doing', omg: 'oh my god', ily: 'I love you',
  rn: 'right now', gn: 'good night', gm: 'good morning', tc: 'take care', pls: 'please',
  plz: 'please', plss: 'please', thx: 'thanks', thnx: 'thanks', thanx: 'thanks', ty: 'thank you',
  tysm: 'thank you so much', u: 'you', ur: 'your', msg: 'message', msgs: 'messages',
  tmrw: 'tomorrow', tmr: 'tomorrow', tmrow: 'tomorrow', bday: 'birthday', coz: 'because',
  cuz: 'because', bcoz: 'because', bcz: 'because', abt: 'about', b4: 'before', gr8: 'great',
  sry: 'sorry', gud: 'good', frnd: 'friend', frnds: 'friends', pic: 'picture', pics: 'pictures',
  kk: 'okay', k: 'okay', wfh: 'work from home', eod: 'end of day',
  // Hindi
  mtlb: 'matlab', h: 'hai', hn: 'haan', hnji: 'haanji', nhi: 'nahi', nai: 'nahi', ni: 'nahi',
  kr: 'kar', kro: 'karo', krna: 'karna', krne: 'karne', krke: 'karke', krta: 'karta',
  krti: 'karti', krte: 'karte', rha: 'raha', rhi: 'rahi', rhe: 'rahe', bht: 'bahut',
  bhot: 'bahut', bhut: 'bahut', pta: 'pata', sb: 'sab', bs: 'bas', yr: 'yaar', kl: 'kal',
  aj: 'aaj', mjhe: 'mujhe', mko: 'mujhe', tmko: 'tumko', tme: 'tumhe', abi: 'abhi',
  bta: 'bata', btao: 'batao', dkh: 'dekh', kyu: 'kyun', ku: 'kyun', q: 'kyun',
  acha: 'accha', thik: 'theek', tk: 'theek', kaha: 'kahan',
  gya: 'gaya', gyi: 'gayi', hogya: 'ho gaya', hogyi: 'ho gayi', krdo: 'kar do',
  krdia: 'kar diya', krdiya: 'kar diya', vo: 'woh', wo: 'woh', ye: 'yeh',
};

// Single letters mean something only in chat, and "h" or "q" in a plain English
// sentence ("plan B", "Q3") must survive — so those expand only in lowercase.
const CASE_SENSITIVE = new Set(['h', 'k', 'q', 'u']);

export function spellOut(text: string): string {
  return text.replace(/[A-Za-z0-9]+/g, (word) => {
    const key = word.toLowerCase();
    if (CASE_SENSITIVE.has(key) && word !== key) return word;
    return SHORTHAND[key] ?? word;
  });
}
