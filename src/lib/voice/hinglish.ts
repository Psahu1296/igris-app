/**
 * Romanized Hindi → Devanagari, word by word, for the Hindi voice.
 *
 * Google's Hindi voice reads Latin script with English spelling rules: "kal aa jana"
 * comes out as an English speaker sounding it out. Given Devanagari it is fluent. So a
 * sentence already judged Hindi (language.ts) has its Hindi words swapped for their
 * Devanagari spelling before it is spoken; English words in it ("meeting cancel ho
 * gayi") stay Latin, which the Hindi voice says well.
 *
 * A dictionary, not a transliteration algorithm: Hinglish spelling is loose ("jana" is
 * जाना, "kal" is कल — the same letter a, two sounds), and rules guess wrong in ways
 * that sound worse than leaving the word alone. An unknown word is left as typed.
 * Spelling variants are listed separately because people type all of them.
 */
export const DEVANAGARI: Record<string, string> = {
  // pronouns
  main: 'मैं', mai: 'मैं', mein: 'में', me: 'में', hum: 'हम', ham: 'हम', tum: 'तुम', tu: 'तू',
  aap: 'आप', ap: 'आप', woh: 'वो', wo: 'वो', vo: 'वो', yeh: 'ये', ye: 'ये', yah: 'यह',
  mera: 'मेरा', meri: 'मेरी', mere: 'मेरे', tera: 'तेरा', teri: 'तेरी', tere: 'तेरे',
  tumhara: 'तुम्हारा', tumhari: 'तुम्हारी', tumhare: 'तुम्हारे', apna: 'अपना', apni: 'अपनी',
  apne: 'अपने', aapka: 'आपका', aapki: 'आपकी', aapke: 'आपके', hamara: 'हमारा', humara: 'हमारा',
  hamari: 'हमारी', humari: 'हमारी', hamare: 'हमारे', humare: 'हमारे', uska: 'उसका', uski: 'उसकी',
  uske: 'उसके', iska: 'इसका', iski: 'इसकी', iske: 'इसके', unka: 'उनका', unki: 'उनकी', unke: 'उनके',
  mujhe: 'मुझे', mujhko: 'मुझको', tujhe: 'तुझे', tumhe: 'तुम्हें', tumko: 'तुमको', humko: 'हमको',
  hume: 'हमें', hamein: 'हमें', usko: 'उसको', isko: 'इसको', unko: 'उनको', inko: 'इनको',
  kisi: 'किसी', koi: 'कोई', kuch: 'कुछ', kuchh: 'कुछ', sab: 'सब', sabko: 'सबको', sabhi: 'सभी',
  // postpositions
  ka: 'का', ki: 'की', ke: 'के', ko: 'को', se: 'से', par: 'पर', pe: 'पे', tak: 'तक', liye: 'लिए',
  lie: 'लिए', wala: 'वाला', wali: 'वाली', wale: 'वाले', saath: 'साथ', sath: 'साथ', baad: 'बाद',
  pehle: 'पहले', pahle: 'पहले', andar: 'अंदर', bahar: 'बाहर', upar: 'ऊपर', niche: 'नीचे',
  paas: 'पास', pas: 'पास',
  // joining words, adverbs, questions
  aur: 'और', bhi: 'भी', toh: 'तो', to: 'तो', hi: 'ही', na: 'ना', nahi: 'नहीं', nahin: 'नहीं',
  mat: 'मत', lekin: 'लेकिन', magar: 'मगर', phir: 'फिर', fir: 'फिर', kyunki: 'क्योंकि',
  kyuki: 'क्योंकि', agar: 'अगर', jab: 'जब', abhi: 'अभी', kabhi: 'कभी', bas: 'बस', sirf: 'सिर्फ',
  bahut: 'बहुत', bohot: 'बहुत', bohut: 'बहुत', bahot: 'बहुत', zyada: 'ज़्यादा', jyada: 'ज़्यादा',
  thoda: 'थोड़ा', thodi: 'थोड़ी', thode: 'थोड़े', kam: 'कम', jaldi: 'जल्दी', dheere: 'धीरे',
  aaj: 'आज', kal: 'कल', parson: 'परसों', yahan: 'यहाँ', yaha: 'यहाँ', wahan: 'वहाँ', waha: 'वहाँ',
  idhar: 'इधर', udhar: 'उधर', kahan: 'कहाँ', kaha: 'कहाँ', kab: 'कब', kya: 'क्या', kyu: 'क्यों',
  kyun: 'क्यों', kyon: 'क्यों', kaise: 'कैसे', kaisa: 'कैसा', kaisi: 'कैसी', kaun: 'कौन', kon: 'कौन',
  kitna: 'कितना', kitni: 'कितनी', kitne: 'कितने', haan: 'हाँ', han: 'हाँ', ji: 'जी', haanji: 'हाँजी',
  accha: 'अच्छा', acha: 'अच्छा', achha: 'अच्छा', achhi: 'अच्छी', acchi: 'अच्छी', theek: 'ठीक',
  thik: 'ठीक', sahi: 'सही', galat: 'गलत', matlab: 'मतलब', shayad: 'शायद', zaroor: 'ज़रूर',
  jarur: 'ज़रूर', pakka: 'पक्का', bilkul: 'बिल्कुल', sach: 'सच', arre: 'अरे', arey: 'अरे',
  // people
  yaar: 'यार', yar: 'यार', bhai: 'भाई', bhaiya: 'भैया', didi: 'दीदी', mummy: 'मम्मी', dost: 'दोस्त',
  log: 'लोग',
  // to be
  hai: 'है', hain: 'हैं', ho: 'हो', hoon: 'हूँ', hun: 'हूँ', hu: 'हूँ', tha: 'था', thi: 'थी', the: 'थे',
  hoga: 'होगा', hogi: 'होगी', honge: 'होंगे', hua: 'हुआ', hui: 'हुई', hue: 'हुए',
  // verbs
  kar: 'कर', karo: 'करो', karna: 'करना', karni: 'करनी', karne: 'करने', karke: 'करके',
  karta: 'करता', karti: 'करती', karte: 'करते', kiya: 'किया', kiye: 'किए', raha: 'रहा', rahi: 'रही',
  rahe: 'रहे', gaya: 'गया', gayi: 'गई', gaye: 'गए', jana: 'जाना', jaana: 'जाना', jao: 'जाओ',
  ja: 'जा', jaa: 'जा', jaunga: 'जाऊँगा', jayega: 'जाएगा', aana: 'आना', ana: 'आना', aao: 'आओ',
  aa: 'आ', aaja: 'आजा', aaya: 'आया', aayi: 'आई', aaye: 'आए', aya: 'आया', ayi: 'आई',
  aunga: 'आऊँगा', aayega: 'आएगा', chal: 'चल', chalo: 'चलो', chala: 'चला', dekh: 'देख',
  dekho: 'देखो', dekha: 'देखा', bol: 'बोल', bolo: 'बोलो', bola: 'बोला', bata: 'बता',
  batao: 'बताओ', bataya: 'बताया', suno: 'सुनो', suna: 'सुना', de: 'दे', do: 'दो', dena: 'देना',
  diya: 'दिया', di: 'दी', le: 'ले', lo: 'लो', lena: 'लेना', liya: 'लिया', mil: 'मिल',
  milna: 'मिलना', mila: 'मिला', milte: 'मिलते', milenge: 'मिलेंगे', sakta: 'सकता', sakti: 'सकती',
  sakte: 'सकते', chahiye: 'चाहिए', chahta: 'चाहता', pata: 'पता', samajh: 'समझ', samjha: 'समझा',
  samjho: 'समझो', laga: 'लगा', lagao: 'लगाओ', lagta: 'लगता', lagti: 'लगती', rakh: 'रख',
  rakho: 'रखो', bhej: 'भेज', bhejo: 'भेजो', bheja: 'भेजा', khana: 'खाना', kha: 'खा', khaa: 'खा', khaya: 'खाया',
  piya: 'पिया', sona: 'सोना', utho: 'उठो', baitho: 'बैठो', ruko: 'रुको', ruk: 'रुक', soch: 'सोच',
  socha: 'सोचा',
  // things, time, numbers
  kaam: 'काम', ghar: 'घर', dukaan: 'दुकान', dukan: 'दुकान', paisa: 'पैसा', paise: 'पैसे',
  rupaye: 'रुपये', rupay: 'रुपये', pani: 'पानी', raat: 'रात', subah: 'सुबह', shaam: 'शाम',
  sham: 'शाम', baje: 'बजे', ghanta: 'घंटा', ghante: 'घंटे', baat: 'बात', baatein: 'बातें',
  sawal: 'सवाल', jawab: 'जवाब', khush: 'खुश', pyaar: 'प्यार', pyar: 'प्यार', naya: 'नया',
  nayi: 'नई', naye: 'नए', purana: 'पुराना', bada: 'बड़ा', badi: 'बड़ी', bade: 'बड़े', chota: 'छोटा',
  choti: 'छोटी', chhota: 'छोटा', ek: 'एक', teen: 'तीन', char: 'चार', paanch: 'पाँच', das: 'दस',
  sau: 'सौ', hazaar: 'हज़ार', hazar: 'हज़ार', lakh: 'लाख',
};

/**
 * Hindi spellings that are also everyday English words. They are transliterated
 * inside a sentence already judged Hindi, but never count as evidence that a
 * sentence IS Hindi — "go to the main menu" must stay with Alan.
 */
export const AMBIGUOUS = new Set([
  'main', 'me', 'to', 'hi', 'na', 'the', 'do', 'lo', 'par', 'log', 'ho', 'pe', 'de', 'le', 'di',
  'ki', 'han', 'kam', 'bas', 'char', 'das', 'mil', 'ja', 'aa', 'ana', 'pas', 'mat', 'chal',
  'bol', 'ruk', 'hum', 'ham', 'bade', 'bada', 'jab', 'tak',
]);

export function toDevanagari(sentence: string): string {
  return sentence.replace(/[A-Za-z]+/g, (word) => DEVANAGARI[word.toLowerCase()] ?? word);
}
