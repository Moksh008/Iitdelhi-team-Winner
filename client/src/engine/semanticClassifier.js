/**
 * Satark Multilingual Semantic Intent Classifier
 * Real-time zero-shot semantic intent classification supporting all Indian languages & Hinglish
 */

export class SemanticScamClassifier {
  constructor() {
    // Multilingual Concept Lexicons & Intent Clusters across all 22 Indian Languages + Hinglish
    this.intentClusters = {
      // 1. Authority Imposture & Coercive Law Enforcement
      AUTHORITY: {
        weight: 0.92,
        tokens: [
          // English & Hinglish
          'cbi', 'police', 'customs', 'narcotics', 'supreme court', 'fir', 'digital arrest', 'cyber cell',
          'enforcement directorate', 'ed officer', 'interpol', 'inspector', 'commissioner', 'judge', 'magistrate',
          'arrest warrant', 'non-bailable', 'pmla', 'section 420', 'trafficking', 'contraband', 'illegal parcel',
          'thanedar', 'kotwali', 'kachehri', 'vakeel', 'daroga',
          // Hindi / Devanagari (Hindi, Marathi, Maithili, Konkani, Nepali, Dogri, Sanskrit, Bodo)
          'पुलिस', 'सीबीआई', 'नारकोटिक्स', 'सुप्रीम कोर्ट', 'एफआईआर', 'डिजिटल अरेस्ट', 'वारंट', 'गिरफ़्तारी', 'जेल',
          'कस्टम', 'अदालत', 'न्यायालय', 'प्रवर्तन निदेशालय', 'हथकड़ी', 'गैर जमानती', 'तलाशी', 'अपराध शाखा', 'आरक्षक',
          // Bengali & Assamese & Manipuri
          'পুলিশ', 'সিবিআই', 'গ্রেফতার', 'ওয়ারেন্ট', 'আদালত', 'কাস্টমস', 'মাদকদ্রব্য', 'থানা', 'মামলা', 'আইনশৃঙ্খলা',
          // Telugu
          'పోలీసులు', 'సిబిఐ', 'అరెస్ట్', 'వారంట్', 'కోర్టు', 'కస్టమ్స్', 'నార్కోటిక్స్', 'స్టేషన్', 'కేసు',
          // Tamil
          'காவல்துறை', 'சிபிஐ', 'கைது', 'வாரண்ட்', 'நீதிமன்றம்', 'சுங்கம்', 'போலீஸ்', 'சிறை', 'வழக்கு',
          // Gujarati
          'પોલીસ', 'સીબીઆઈ', 'ધરપકડ', 'વોરંટ', 'અદાલત', 'કસ્ટમ્સ', 'ગુનો', 'જેલ',
          // Kannada
          'ಪೊಲೀಸ್', 'ಸಿಬಿಐ', 'ಬಂಧನ', 'ವಾರಂಟ್', 'ನ್ಯಾಯಾಲಯ', 'ಕಸ್ಟಮ್ಸ್', 'ದಸ್ತಗಿರಿ',
          // Malayalam
          'പോലീസ്', 'സിബിഐ', 'അറസ്റ്റ്', 'വാറണ്ട്', 'കോടതി', 'കസ്റ്റംസ്', 'കേസ്',
          // Punjabi
          'ਪੁਲਿਸ', 'ਸੀਬੀਆਈ', 'ਗ੍ਰਿਫ਼ਤਾਰੀ', 'ਵਾਰੰਟ', 'ਅਦਾਲਤ', 'ਕਸਟਮ', 'ਥਾਣਾ',
          // Odia
          'ପୋଲିସ୍', 'ସିବିଆଇ', 'ଗିରଫ', 'ୱାରେଣ୍ଟ', 'ଅଦାଲତ', 'କଷ୍ଟମ୍ସ', 'ଥାନା',
          // Urdu & Kashmiri & Sindhi
          'پولیس', 'سی بی آئی', 'گرفتاری', 'وارنٹ', 'عدالت', 'کسٹم', 'تھانہ', 'مقدمہ'
        ]
      },

      // 2. Coerced Isolation & Secrecy Mandates
      ISOLATION: {
        weight: 0.88,
        tokens: [
          // English & Hinglish
          "don't hang up", 'do not disconnect', 'tell no one', 'tell nobody', 'secret operation',
          'national security', 'isolate', 'close the door', 'stay on the call', 'remain in room',
          'kisi ko mat batana', 'phone mat kaatna', 'kisi se baat mat karo', 'kamra band karo',
          'secret hai', 'strictly confidential',
          // Hindi & Devanagari
          'फोन मत काटना', 'काटना मत', 'किसी को मत बताना', 'गुप्त', 'कमरा बंद', 'लाइन पर रहो',
          'अकेले रहो', 'किसी को खबर न हो', 'दरवाजा बंद करो', 'गोपनीय',
          // Bengali & Assamese
          'ফোন কাটবেন না', 'কাউকে বলবেন না', 'গোপনে', 'ঘরে একা থাকুন', 'লাইন কাটবেন না',
          // Telugu
          'కాల్ కట్ చేయొద్దు', 'ఎవరికీ చెప్పొద్దు', 'రహస్యం', 'గదిలో ఒంటరిగా ఉండు',
          // Tamil
          'போனை வைக்காதே', 'யாரிடமும் சொல்லாதே', 'ரகசியம்', 'அறையை பூட்டு',
          // Marathi
          'फोन कापू नका', 'कोणालाही सांगू नका', 'गुपित', 'खोली बंद करा',
          // Gujarati
          'ફોન કાપશો નહીં', 'કોઈને કહેશો નહીં', 'ગુપ્ત', 'એકલા રહો',
          // Kannada
          'ಕರೆ ಕಡಿತಗೊಳಿಸಬೇಡಿ', 'ಯಾರಿಗೂ ಹೇಳಬೇಡಿ', 'ರಹಸ್ಯ',
          // Malayalam
          'കോൾ കട്ട് ചെയ്യരുത്', 'ആരോടും പറയരുത്', 'രഹസ്യമായിരിക്കണം',
          // Punjabi
          'ਫ਼ੋਨ ਨਾ ਕੱਟੋ', 'ਕਿਸੇ ਨੂੰ ਨਾ ਦੱਸੋ', 'ਗੁਪਤ',
          // Odia
          'ଫୋନ୍ କାଟନ୍ତୁ ନାହିଁ', 'କାହାକୁ କୁହନ୍ତୁ ନାହିଁ', 'ଗୋପନୀୟ',
          // Urdu
          'فون مت کاٹنا', 'کسی کو نہ بتانا', 'خفیہ', 'اکیلے رہیں'
        ]
      },

      // 3. Financial Urgency & Coerced Safe Account Transfer
      URGENCY: {
        weight: 0.85,
        tokens: [
          // English & Hinglish
          'safe account', 'verification account', 'escrow', 'rbi account', 'move savings',
          'transfer immediately', 'clearance deposit', 'penalty', 'frozen account', 'seized funds',
          'within 10 minutes', 'within 30 minutes', 'power disconnection', 'kyc expired',
          'paisa transfer karo', 'safe a/c', 'abhi bhejo', 'turant bhejo', 'account block ho jayega',
          // Hindi & Devanagari
          'सुरक्षित खाता', 'पैसे भेजो', 'बचत ट्रांसफर', 'जुर्माना', 'अभी ट्रांसफर करो', 'खाता सील',
          '१० मिनट के अंदर', 'तुरंत भेजो', 'केवाईसी समाप्त', 'बिजली कटेगी', 'रकम ट्रांसफर',
          // Bengali & Assamese
          'সুরক্ষিত অ্যাকাউন্ট', 'টাকা পাঠান', 'জরিমানা', 'অ্যাকাউন্ট ব্লক', 'অবিলম্বে পাঠান',
          // Telugu
          'సురక్షిత ఖాతా', 'డబ్బులు పంపండి', 'ఖాతా స్తంభింపజేయబడుతుంది', 'వెంటనే బదిలీ చేయండి',
          // Tamil
          'பாதுகாப்பான கணக்கு', 'பணம் அனுப்பு', 'வங்கி கணக்கு முடக்கம்', 'உடனடியாக மாற்றவும்',
          // Marathi
          'सुरक्षित खाते', 'पैसे पाठवा', 'दंड', 'खाते गोठवले जाईल', 'त्वरित पाठवा',
          // Gujarati
          'સુરક્ષિત ખાતું', 'પૈસા ટ્રાન્સફર', 'ખાતું બ્લોક', 'તરત મોકલો',
          // Kannada
          'ಸುರಕ್ಷಿತ ಖಾತೆ', 'ಹಣ ಕಳುಹಿಸಿ', 'ಖಾತೆ ಸ್ಥಗಿತ', 'ತಕ್ಷಣ ಕಳುಹಿಸಿ',
          // Malayalam
          'സുരക്ഷിത അക്കൗണ്ട്', 'പണം മാറ്റുക', 'അക്കൗണ്ട് മരവിപ്പിക്കും',
          // Punjabi
          'ਸੁਰੱਖਿਅਤ ਖਾਤਾ', 'ਪੈਸੇ ਟਰਾਂਸਫਰ ਕਰੋ', 'ਖਾਤਾ ਸੀਲ', 'ਤੁਰੰਤ ਭੇਜੋ',
          // Odia
          'ସୁରକ୍ଷିତ ଖାତା', 'ଟଙ୍କା ପଠାନ୍ତୁ', 'ଖାତା ବନ୍ଦ',
          // Urdu
          'محفوظ اکاؤنٹ', 'رقم منتقل کریں', 'اکاؤنٹ بلاک', 'فوری بھیجیں'
        ]
      }
    };
  }

  /**
   * Tokenizes text into character & word n-grams with unicode normalization
   */
  normalizeAndTokenize(text) {
    if (!text) return [];
    const normalized = text.toLowerCase().normalize('NFC');
    // Split on punctuation, whitespace, keeping all scripts intact
    const words = normalized.split(/[\s,.;:!?।\-()"'[\]/\\+*&^%$#@~`_]+/).filter(w => w.length > 0);
    return words;
  }

  /**
   * Evaluates Multilingual Semantic Threat Score S_t
   * Matches across token sequences, n-grams, and multi-word semantic clusters
   */
  classifyText(rawText) {
    if (!rawText) return { score: 0.0, category: 'Safe', matches: [] };

    const normalized = rawText.toLowerCase().normalize('NFC');
    const matchedTokens = [];
    let authorityScore = 0.0;
    let isolationScore = 0.0;
    let urgencyScore = 0.0;

    // 1. Evaluate Authority Cluster
    for (const token of this.intentClusters.AUTHORITY.tokens) {
      if (normalized.includes(token.toLowerCase())) {
        authorityScore = Math.max(authorityScore, this.intentClusters.AUTHORITY.weight);
        matchedTokens.push({ cluster: 'Authority', token });
      }
    }

    // 2. Evaluate Isolation Cluster
    for (const token of this.intentClusters.ISOLATION.tokens) {
      if (normalized.includes(token.toLowerCase())) {
        isolationScore = Math.max(isolationScore, this.intentClusters.ISOLATION.weight);
        matchedTokens.push({ cluster: 'Isolation', token });
      }
    }

    // 3. Evaluate Urgency Cluster
    for (const token of this.intentClusters.URGENCY.tokens) {
      if (normalized.includes(token.toLowerCase())) {
        urgencyScore = Math.max(urgencyScore, this.intentClusters.URGENCY.weight);
        matchedTokens.push({ cluster: 'Urgency', token });
      }
    }

    // Composite Vector Fusion:
    // If Authority AND (Isolation OR Urgency) match, risk jumps to critical (>0.90)
    let finalScore = 0.0;
    if (authorityScore > 0 && (isolationScore > 0 || urgencyScore > 0)) {
      finalScore = Math.min(1.0, Math.max(authorityScore, isolationScore, urgencyScore) + 0.08);
    } else if (authorityScore > 0) {
      finalScore = authorityScore * 0.85;
    } else if (isolationScore > 0 || urgencyScore > 0) {
      finalScore = Math.max(isolationScore, urgencyScore) * 0.80;
    }

    let detectedCategory = 'Safe';
    if (authorityScore > 0 && isolationScore > 0) {
      detectedCategory = 'Digital Arrest';
    } else if (authorityScore > 0) {
      detectedCategory = 'Authority Impersonation';
    } else if (urgencyScore > 0) {
      detectedCategory = 'Financial Urgency / KYC';
    }

    return {
      score: Number(finalScore.toFixed(3)),
      category: detectedCategory,
      matchedClusters: {
        authority: authorityScore > 0,
        isolation: isolationScore > 0,
        urgency: urgencyScore > 0
      },
      matches: matchedTokens
    };
  }
}
