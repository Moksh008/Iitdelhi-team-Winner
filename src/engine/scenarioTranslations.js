/**
 * Hindi (Devanagari) and Hinglish (romanised, the way Whisper Hinglish writes
 * it) versions of every scripted call in scenarios.js, used for the
 * per-language results in tools/eval/run-metrics.mjs.
 *
 * Written as natural speech, not tuned to the rule lexicon, so the gap between
 * languages is measured honestly. Same meaning as the English script; the
 * number of utterances may differ slightly.
 */

export const SCENARIO_TRANSLATIONS = {
  digital_arrest_cbi: {
    hi: [
      'नमस्ते मीना जी, मैं इंस्पेक्टर विक्रम सिंह, सीबीआई मुख्यालय नई दिल्ली से बोल रहा हूँ।',
      'आपके नाम का एक पार्सल मुंबई कस्टम्स में पकड़ा गया है, उसमें चौदह नकली पासपोर्ट और ड्रग्स हैं।',
      'आपके खिलाफ एफआईआर दर्ज हो चुकी है। आप अभी से डिजिटल अरेस्ट में हैं।',
      'यह कॉल मत काटिए और अपने परिवार में किसी को कुछ मत बताइए। यह राष्ट्रीय सुरक्षा का मामला है।',
      'अपनी बेगुनाही साबित करने के लिए आपको अपनी सारी जमा राशि आरबीआई के सुरक्षित खाते में डालनी होगी।',
      'अभी अपना यूपीआई ऐप खोलिए और चार लाख अस्सी हज़ार रुपये तुरंत भेजिए।',
    ],
    hinglish: [
      'namaste meena ji main inspector vikram singh cbi headquarters new delhi se bol raha hoon',
      'aapke naam ka ek parcel mumbai customs mein pakda gaya hai usme 14 fake passport aur drugs hain',
      'aapke khilaf fir darj ho chuki hai aap abhi se digital arrest mein hain',
      'ye call mat kaatiye aur family mein kisi ko kuch mat bataiye ye national security ka matter hai',
      'apni innocence prove karne ke liye aapko apne saare paise rbi ke safe account mein daalne honge',
      'abhi apna upi app kholiye aur 4 lakh 80 hazaar turant bhejiye',
    ],
  },
  customs_parcel_fedex: {
    hi: [
      'यह फेडएक्स कूरियर की ओर से सूचना है, नौ दबाने पर आपकी बात एनफोर्समेंट से होगी।',
      'ताइवान जा रहा एक पार्सल आपके आधार नंबर पर पकड़ा गया है, उसमें नशीले पदार्थ मिले हैं।',
      'नारकोटिक्स कंट्रोल ब्यूरो मुंबई ने आपकी गिरफ़्तारी का गैर-ज़मानती वारंट जारी किया है।',
      'अपने कमरे में अकेले रहिए, इस जाँच के बारे में किसी से बात मत कीजिए।',
      'पचासी हज़ार रुपये क्लीयरेंस ड्यूटी यूपीआई से कस्टम्स पोर्टल पर ट्रांसफर कीजिए, बाद में वापस मिल जाएगी।',
    ],
    hinglish: [
      'ye fedex courier ki taraf se notice hai 9 dabane par aapki baat enforcement se hogi',
      'taiwan ja raha ek parcel aapke aadhaar number par pakda gaya hai usme drugs mile hain',
      'narcotics control bureau mumbai ne aapke against non bailable warrant jaari kiya hai',
      'apne kamre mein akele rahiye is investigation ke baare mein kisi se baat mat kijiye',
      '85 hazaar clearance duty upi se customs portal par transfer kijiye baad mein refund ho jayega',
    ],
  },
  electricity_disconnection: {
    hi: [
      'प्रिय उपभोक्ता, आपकी बिजली आज रात साढ़े नौ बजे स्थायी रूप से काट दी जाएगी।',
      'हमारे सर्वर में पिछले महीने का भुगतान अपडेट नहीं हुआ है, बिलिंग डेस्क से अपडेट करना होगा।',
      'तुरंत इस हेल्पलाइन पर बात कीजिए वरना लाइनमैन आकर आपका कनेक्शन काट देगा।',
      'अपना यूपीआई ऐप खोलिए और चौदह हज़ार आठ सौ पचास रुपये अभी जमा कीजिए।',
    ],
    hinglish: [
      'dear consumer aapki bijli aaj raat saade nau baje permanently kaat di jayegi',
      'hamare server mein pichle mahine ka payment update nahi hua hai billing desk se update karna padega',
      'turant is helpline par baat kijiye warna lineman aakar aapka connection kaat dega',
      'apna upi app kholiye aur 14850 rupaye abhi jama kijiye',
    ],
  },
  bank_kyc_sim_expiry: {
    hi: [
      'सर, आरबीआई के नियम के अनुसार आपके बैंक खाते की केवाईसी खत्म हो गई है, नेटबैंकिंग और एटीएम बंद हैं।',
      'सभी डेबिट कार्ड हमेशा के लिए बंद होने से बचाने के लिए दोबारा सत्यापन करना होगा।',
      'हम आपको एक लिंक भेज रहे हैं, पच्चीस हज़ार रुपये का सिक्योरिटी ट्रांसफर करके सत्यापन कीजिए।',
      'देर मत कीजिए, दस मिनट में आपका आधार लिंक रद्द हो जाएगा।',
    ],
    hinglish: [
      'sir rbi guidelines ke hisaab se aapke bank account ka kyc expire ho gaya hai netbanking aur atm band hai',
      'saare debit card permanently block hone se bachane ke liye re verification karna hoga',
      'hum aapko ek link bhej rahe hain 25 hazaar ka security transfer karke verify kijiye',
      'der mat kijiye 10 minute mein aapka aadhaar link cancel ho jayega',
    ],
  },
  telegram_wfh_task: {
    hi: [
      'बधाई हो, टास्क राउंड एक पूरा हुआ, आपकी पंद्रह सौ रुपये की कमाई तैयार है।',
      'वीआईपी लेवल तीन खोलने और चालीस प्रतिशत पक्का कमीशन पाने के लिए पहले जमा करना ज़रूरी है।',
      'पचास हज़ार रुपये टास्क वॉलेट में जमा कीजिए, पाँच मिनट में पचहत्तर हज़ार वापस मिलेंगे।',
    ],
    hinglish: [
      'congratulations task round 1 complete ho gaya aapki 1500 rupaye ki earning ready hai',
      'vip level 3 unlock karne aur 40 percent guaranteed commission ke liye pehle deposit karna zaroori hai',
      '50 hazaar task wallet mein deposit kijiye 5 minute mein 75 hazaar wapas milenge',
    ],
  },
  kbc_lottery_winner: {
    hi: [
      'नमस्कार, बधाई हो, आपके मोबाइल नंबर ने ऑल इंडिया लकी ड्रॉ में पच्चीस लाख रुपये जीते हैं।',
      'चेक स्टेट बैंक मैनेजर के पास तैयार है, पर पहले बत्तीस हज़ार जीएसटी टैक्स जमा करना होगा।',
      'तुरंत यूपीआई से लॉटरी डेस्क को भुगतान कीजिए, पंद्रह मिनट में इनाम की राशि आ जाएगी।',
    ],
    hinglish: [
      'namaskar congratulations aapke mobile number ne all india lucky draw mein 25 lakh jeete hain',
      'cheque state bank manager ke paas ready hai par pehle 32 hazaar gst tax jama karna hoga',
      'turant upi se lottery desk ko payment kijiye 15 minute mein prize money aa jayegi',
    ],
  },
  fake_loan_approval: {
    hi: [
      'आपका पाँच लाख का इंस्टेंट पर्सनल लोन बिना कागज़ात के दो प्रतिशत ब्याज पर मंज़ूर हो गया है।',
      'लोन आपके खाते में भेजने के लिए अठारह हज़ार पाँच सौ रुपये बीमा और दस्तावेज़ शुल्क लगेगा।',
      'जैसे ही आप बीमा फीस भेजेंगे, पूरे पाँच लाख दो मिनट में आपके खाते में दिखेंगे।',
    ],
    hinglish: [
      'aapka 5 lakh ka instant personal loan bina documents ke 2 percent interest par approve ho gaya hai',
      'loan aapke account mein bhejne ke liye 18500 rupaye insurance aur documentation charge lagega',
      'jaise hi aap insurance fee bhejenge poore 5 lakh 2 minute mein aapke account mein dikhenge',
    ],
  },
  reward_points_expiry: {
    hi: [
      'आपके अठारह हज़ार चार सौ रिवॉर्ड पॉइंट, जिनकी कीमत नौ हज़ार दो सौ रुपये है, आज आधी रात को खत्म हो रहे हैं।',
      'इन पॉइंट्स को सीधे कैशबैक में बदलने के लिए एक ऑथेंटिकेशन पेमेंट करना होगा।',
      'गेटवे पर नौ हज़ार नौ सौ निन्यानवे भेजिए, आपको तुरंत दोगुना रिफंड और बोनस मिलेगा।',
    ],
    hinglish: [
      'aapke 18400 reward points jinki value 9200 rupaye hai aaj midnight ko expire ho rahe hain',
      'in points ko seedha cashback mein convert karne ke liye ek authentication payment karna hoga',
      'gateway par 9999 bhejiye aapko turant double refund aur bonus milega',
    ],
  },
  ananydesk_screen_share: {
    hi: [
      'आपके फ़ोन में खतरनाक मैलवेयर है जो बैंक की जानकारी चुरा रहा है। प्ले स्टोर से क्विकसपोर्ट इंस्टॉल कीजिए।',
      'स्क्रीन पर दिख रहा नौ अंकों का कोड बताइए ताकि हमारा टेक्नीशियन आपका फ़ोन ठीक कर सके।',
      'अब अपना गूगल पे खोलिए और जब तक हम सेटिंग करें, स्क्रीन को मत छूइए।',
    ],
    hinglish: [
      'aapke phone mein khatarnak malware hai jo bank data chura raha hai play store se quicksupport install kijiye',
      'screen par dikh raha 9 digit ka code bataiye taaki hamara technician aapka phone theek kar sake',
      'ab apna google pay kholiye aur jab tak hum setting karein screen ko mat chhuiye',
    ],
  },
  distressed_relative: {
    hi: [
      'आंटी जी, आपके भतीजे रोहित का हाईवे पर बहुत बड़ा एक्सीडेंट हो गया है, हालत गंभीर है।',
      'उसका अभी ऑपरेशन चल रहा है, डॉक्टरों को खून का इंतज़ाम करने से पहले साठ हज़ार तुरंत चाहिए।',
      'उसका फ़ोन टूट गया है इसलिए उसे फ़ोन मत कीजिए। उसकी जान बचाने के लिए तुरंत सर्जन के यूपीआई पर पैसे भेजिए।',
    ],
    hinglish: [
      'aunty ji aapke bhatije rohit ka highway par bahut bada accident ho gaya hai halat serious hai',
      'uska abhi operation chal raha hai doctors ko blood ka intezaam karne se pehle 60 hazaar turant chahiye',
      'uska phone toot gaya hai isliye use call mat kijiye uski jaan bachane ke liye turant surgeon ke upi par paise bhejiye',
    ],
  },
  unseen_ai_voice_kidnap: {
    hi: [
      'मम्मी मुझे बचाओ! इन लोगों ने मुझे एक वैन में बंद कर दिया है, ये जो माँगें दे दो!',
      'ध्यान से सुनो, तुम्हारा बेटा हमारे पास है। सौ नंबर पर फ़ोन किया या कॉल काटा तो उसे कभी नहीं देखोगी।',
      'दस मिनट के अंदर इस यूपीआई पर ढाई लाख रुपये भेजो वरना हम उसे बॉर्डर पार ले जाएँगे।',
    ],
    hinglish: [
      'mummy mujhe bachao in logon ne mujhe ek van mein band kar diya hai ye jo maange de do',
      'dhyan se suno tumhara beta hamare paas hai 100 number par phone kiya ya call kaata to use kabhi nahi dekhogi',
      '10 minute ke andar is upi par dhai lakh rupaye bhejo warna hum use border paar le jayenge',
    ],
  },
  unseen_sebi_ipo_scheme: {
    hi: [
      'नमस्ते मैडम, हम आने वाले बड़े टेक आईपीओ में पचास प्रतिशत छूट पर खास संस्थागत कोटा दे रहे हैं।',
      'सेबी से मंज़ूर यह विंडो बीस मिनट में बंद हो जाएगी, सोमवार को तीन सौ प्रतिशत लिस्टिंग मुनाफ़ा पक्का है।',
      'मार्केट बंद होने से पहले एक लाख पचास हज़ार की सब्सक्रिप्शन राशि एस्क्रो हैंडल पर भेज दीजिए।',
    ],
    hinglish: [
      'hello madam hum aane wale bade tech ipo mein 50 percent discount par exclusive institutional quota de rahe hain',
      'sebi approved ye window 20 minute mein band ho jayegi monday ko 300 percent listing gain guaranteed hai',
      'market band hone se pehle 1 lakh 50 hazaar subscription amount escrow handle par bhej dijiye',
    ],
  },
  unseen_sextortion_blackmail: {
    hi: [
      'कल रात का तुम्हारा पूरा वीडियो हमारे पास है। तुम्हारी पूरी कॉन्टैक्ट लिस्ट और फेसबुक दोस्त भी हमारे पास हैं।',
      'पाँच मिनट में अस्सी हज़ार रुपये नहीं भेजे तो यह वीडियो यूट्यूब पर डाल देंगे और तुम्हारे बच्चों को भेज देंगे।',
      'अभी पैसे भेजो, हम क्लाउड से सब कुछ हमेशा के लिए मिटा देंगे।',
    ],
    hinglish: [
      'kal raat ka tumhara poora video hamare paas hai tumhari poori contact list aur facebook friends bhi hamare paas hain',
      '5 minute mein 80 hazaar nahi bheje to ye video youtube par daal denge aur tumhare bachchon ko bhej denge',
      'abhi paise bhejo hum cloud se sab kuch hamesha ke liye mita denge',
    ],
  },
  unseen_tax_audit_seizure: {
    hi: [
      'आयकर विभाग की जाँच शाखा से नोटिस है। आपके सालाना रिटर्न में बयालीस लाख का अंतर पाया गया है।',
      'एक घंटे के अंदर आपकी सारी एफडी और प्रॉपर्टी पर रोक का आदेश लागू हो जाएगा।',
      'रोक हटवाने और छापे से बचने के लिए एक लाख दस हज़ार रुपये अनुपालन शुल्क यूपीआई से जमा कीजिए।',
    ],
    hinglish: [
      'income tax department investigation wing se notice hai aapke annual return mein 42 lakh ka difference mila hai',
      'ek ghante ke andar aapki saari fd aur property par freeze order lag jayega',
      'stay lene aur raid se bachne ke liye 1 lakh 10 hazaar compliance fee upi se jama kijiye',
    ],
  },
  unseen_visa_deportation: {
    hi: [
      'ब्यूरो ऑफ़ इमिग्रेशन से बोल रहे हैं। टोरंटो में पढ़ रही आपकी बेटी ने स्टूडेंट वीज़ा का उल्लंघन किया है।',
      'कनाडा बॉर्डर सिक्योरिटी ने उसे एयरपोर्ट पर रोक लिया है, उसे वापस भेजने की कार्रवाई शुरू हो गई है।',
      'हिरासत रद्द करवाने के लिए पचानवे हज़ार रुपये कानूनी फीस तुरंत यूपीआई से जमा कीजिए।',
    ],
    hinglish: [
      'bureau of immigration se bol rahe hain toronto mein padh rahi aapki beti ne student visa violate kiya hai',
      'canada border security ne use airport par rok liya hai deportation ki karwai shuru ho gayi hai',
      'detention cancel karwane ke liye 95 hazaar legal fee turant upi se jama kijiye',
    ],
  },
  benign_son_tuition: {
    hi: [
      'हाय मम्मी, मैं अभी यूनिवर्सिटी के एडमिन ब्लॉक में हूँ।',
      'सेमेस्टर रजिस्ट्रेशन आज चार बजे बंद हो जाएगा और उनकी मशीन पर कार्ड नहीं चल रहा।',
      'क्या आप मेरे यूपीआई पर पैंतालीस हज़ार भेज सकती हैं? मैं कैशियर को खुद दे दूँगा।',
      'थैंक यू मम्मी, लेक्चर के बाद फ़ोन करता हूँ!',
    ],
    hinglish: [
      'hi mummy main abhi university ke admin block mein hoon',
      'semester registration aaj 4 baje band ho jayega aur unki machine par card nahi chal raha',
      'kya aap mere upi par 45 hazaar bhej sakti ho main cashier ko khud de dunga',
      'thank you mummy lecture ke baad call karta hoon',
    ],
  },
  benign_contractor_dispute: {
    hi: [
      'मैडम, मेरे मज़दूर सुबह आठ बजे से साइट पर खाली बैठे हैं!',
      'आपने कल लकड़ी के माल का बिल देने का वादा किया था, देर क्यों हो रही है?',
      'अगर अभी अठारह हज़ार नहीं भेजे तो हम औज़ार समेटकर पेंटिंग का काम बंद कर देंगे।',
      'मेरे पेटीएम नंबर पर अभी भेज दीजिए, वरना कल काम की उम्मीद मत रखिए।',
    ],
    hinglish: [
      'madam mere mazdoor subah 8 baje se site par khaali baithe hain',
      'aapne kal lakdi ke maal ka bill dene ka promise kiya tha der kyon ho rahi hai',
      'agar abhi 18 hazaar nahi bheje to hum auzaar samet kar painting ka kaam band kar denge',
      'mere paytm number par abhi bhej dijiye warna kal kaam ki ummeed mat rakhiye',
    ],
  },
  benign_grocery_vendor: {
    hi: [
      'नमस्ते भाभी जी, आपका महीने का राशन छोटू के हाथ भेज दिया है।',
      'कुल बिल आठ सौ पचास रुपये है, आशीर्वाद आटा और फॉर्च्यून तेल मिलाकर।',
      'जब सुविधा हो, दुकान के यूपीआई स्कैनर पर भेज दीजिएगा।',
    ],
    hinglish: [
      'namaste bhabhi ji aapka mahine ka ration chhotu ke haath bhej diya hai',
      'total bill 850 rupaye hai aashirvaad atta aur fortune tel milakar',
      'jab suvidha ho dukaan ke upi scanner par bhej dijiyega',
    ],
  },
};

export const EVAL_LANGUAGES = ['en', 'hi', 'hinglish'];

/** Utterances for one scenario in one language ('en' uses the original script). */
export function scenarioUtterances(scenario, language) {
  if (language === 'en') return scenario.chunks.map(chunk => chunk.text);
  const translated = SCENARIO_TRANSLATIONS[scenario.id]?.[language];
  if (!translated) throw new Error(`No ${language} translation for ${scenario.id}`);
  return translated;
}
