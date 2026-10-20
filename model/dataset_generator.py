"""
Satark Multilingual ICFD-31k Dataset Generator
Generates realistic 3-second streaming conversation chunks for Indian fraud detection
Languages: Hindi, Gujarati, Marathi, Bengali, Tamil, Telugu, Punjabi, Hinglish, English
Derived from: ICFD-31k Benchmark & Indian Multilingual Scam Corpora (Slide 6 & 14 of PRD)
"""

import json
import random
import os

def generate_icfd31k_synthetic_dataset(output_file="model/icfd31k_chunks.json", total_samples=1200):
    print(f"Generating Multilingual ICFD-31k Dataset ({total_samples} streaming chunks)...")

    # Multilingual Templates: Scam (Label 1) & Benign (Label 0)
    scam_templates = {
        "hi": [
            "मैं सीबीआई हेडक्वार्टर नई दिल्ली से इंस्पेक्टर बोल रहा हूँ, आपके नाम पर गैर-कानूनी पार्सल मिला है।",
            "मुंबई कस्टम्स में आपके आधार कार्ड से 14 फर्जी पासपोर्ट और नशीले पदार्थ जब्त किए गए हैं।",
            "आपके खिलाफ गैर-जमानती गिरफ्तारी वारंट और मनी लॉन्ड्रिंग की एफआईआर दर्ज हुई है।",
            "फोन डिस्कनेक्ट मत करना, किसी को मत बताना, यह राष्ट्रीय सुरक्षा का मामला है।",
            "जांच पूरी होने तक अपनी सारी बचत तुरंत सरकारी सुरक्षित सत्यापन खाते में ट्रांसफर करें।",
            "बिजली विभाग: आज रात 9:30 बजे बिजली काट दी जाएगी, तुरंत बिल का भुगतान करें।",
            "आपका बैंक खाता और सिम कार्ड 2 घंटे में बंद हो जाएगा, तुरंत सत्यापन भुगतान करें।"
        ],
        "gu": [
            "હું સીબીઆઈ હેડક્વાર્ટર દિલ્હીથી ઇન્સ્પેક્ટર બોલું છું, તમારા નામનું પાર્સલ પકડાયું છે.",
            "કસ્ટમ્સ વિભાગે તમારા આધાર સાથે જોડાયેલ પ્રતિબંધિત સામાન જપ્ત કર્યો છે.",
            "તમારી સામે બિનજામીનપાત્ર ધરપકડ વોરંટ ઇશ્યૂ કરવામાં આવ્યું છે, રૂમમાં એકલા રહો.",
            "કોઈને પણ આ વાત કહેશો નહીં, કૉલ કટ કર્યો તો સીધા જેલમાં ધકેલી દેવામાં આવશે.",
            "તમારી તમામ બચત તાત્કાલિક આરબીઆઈ સુરક્ષિત વેરિફિકેશન ખાતામાં ટ્રાન્સફર કરો.",
            "તમારું બેંક ખાતું 1 કલાકમાં ફ્રીઝ થઈ જશે, અનબ્લોક કરવા માટે પેનલ્ટી ભરો.",
            "વીજળી કચેરી: બિલ બાકી હોવાથી આજે સાંજે લાઈટ કાપી નાખવામાં આવશે."
        ],
        "mr": [
            "मी सीबीआय मुख्यालय नवी दिल्ली येथून पोलीस अधिकारी बोलत आहे, तुमच्या नावावर गुन्हा दाखल आहे.",
            "कस्टम्स विभागाने तुमच्या पार्सलमध्ये बेकायदेशीर अमली पदार्थ पकडले आहेत.",
            "तुमच्यावर सेक्शन 420 आणि पीएमएलए अंतर्गत अटक वॉरंट जारी करण्यात आले आहे.",
            "फोन कापू नका, खोलीचा दरवाजा बंद करा आणि कोणालाही सांगू नका.",
            "फॉरेन्सिक तपासणीसाठी तुमची सर्व रक्कम तात्काळ सरकारी सुरक्षित खात्यात ट्रान्सफर करा.",
            "तुमचे वीज बिल थकल्यामुळे आज रात्री पुरवठा कायमचा खंडित करण्यात येईल.",
            "बँक केवायसी एक्सपायर झाले आहे, खाते ब्लॉक होण्यापासून वाचवण्यासाठी पडताळणी शुल्क भरा."
        ],
        "bn": [
            "আমি সিবিআই সদর দফতর থেকে ইন্সপেক্টর বলছি, আপনার নামে একটি অবৈধ পার্সেল আটক করা হয়েছে।",
            "মুম্বাই কাস্টমসে আপনার আধার দিয়ে নিষিদ্ধ মাদকদ্রব্য বাজেয়াপ্ত করা হয়েছে।",
            "আপনার নামে অজামিনযোগ্য গ্রেফতারি পরোয়ানা জারি করা হয়েছে, ঘরে একা থাকুন।",
            "ফোন কাটবেন না, কাউকে কিছু জানাবেন না, লাইন চালু রাখুন।",
            "তদন্ত শেষ না হওয়া পর্যন্ত টাকা সরকারি আরবিআই সুরক্ষিত অ্যাকাউন্টে পাঠান।",
            "আপনার বিদ্যুৎ সংযোগ আজ রাতেই বিচ্ছিন্ন করা হবে, জরিমানা তৎক্ষণাৎ জমা দিন।"
        ],
        "ta": [
            "தில்லி சிபிஐ தலைமையகத்தில் இருந்து பேசுகிறேன், உங்கள் பெயரில் தடைசெய்யப்பட்ட பார்சல் பிடிபட்டுள்ளது.",
            "சுங்கத்துறை உங்கள் ஆதார் எண்ணில் போதைப்பொருள் கொண்ட பார்சலை பறிமுதல் செய்துள்ளது.",
            "உங்களுக்கு எதிராக பிணையில் வரமுடியாத கைது வாரண்ட் பிறப்பிக்கப்பட்டுள்ளது.",
            "போனை துண்டிக்காதீர்கள், யாரிடமும் சொல்லாதீர்கள், அறையில் தனியாக இருங்கள்.",
            "பரிசோதனைக்காக உங்கள் சேமிப்புப் பணத்தை உடனடியாக ரிசர்வ் வங்கி பாதுகாப்பு கணக்கிற்கு மாற்றவும்.",
            "மின்சார கட்டணம் செலுத்தாததால் இன்றிரவு மின் இணைப்பு துண்டிக்கப்படும்."
        ],
        "te": [
            "నేను ఢిల్లీ సిబిఐ ప్రధాన కార్యాలయం నుండి మాట్లాడుతున్నాను, మీ పేరుతో చట్టవిరుద్ధమైన పార్శిల్ దొరికింది.",
            "కస్టమ్స్ శాఖ మీ ఆధార్‌తో లింక్ అయిన డ్రగ్స్ పార్శిల్‌ను సీజ్ చేసింది.",
            "మీపై నాన్-బెయిలబుల్ అరెస్ట్ వారెంట్ జారీ చేయబడింది, తలుపులు మూసి ఒంటరిగా ఉండండి.",
            "కాల్ కట్ చేయవద్దు, ఎవరికీ చెప్పవద్దు, ఇది నేషనల్ సెక్యూరిటీ కేస్.",
            "విచారణ పూర్తయ్యే వరకు మీ డబ్బును తక్షణమే సురక్షిత ఖాతాకు బదిలీ చేయండి.",
            "ఈ రాత్రికి మీ విద్యుత్ కనెక్షన్ కట్ చేయబడుతుంది, వెంటనే యుపిఐ ద్వారా చెల్లించండి."
        ],
        "pa": [
            "ਮੈਂ ਸੀਬੀਆਈ ਹੈੱਡਕੁਆਰਟਰ ਦਿੱਲੀ ਤੋਂ ਬੋਲ ਰਿਹਾ ਹਾਂ, ਤੁਹਾਡੇ ਨਾਮ ਤੇ ਗੈਰ-ਕਾਨੂੰਨੀ ਪਾਰਸਲ ਫੜਿਆ ਗਿਆ ਹੈ।",
            "ਕਸਟਮ ਵਿਭਾਗ ਨੇ ਤੁਹਾਡੇ ਆਧਾਰ ਕਾਰਡ ਨਾਲ ਨਸ਼ੀਲੇ ਪਦਾਰਥ ਜ਼ਬਤ ਕੀਤੇ ਹਨ।",
            "ਤੁਹਾਡੇ ਖਿਲਾਫ ਗੈਰ-ਜ਼ਮਾਨਤੀ ਗ੍ਰਿਫਤਾਰੀ ਵਾਰੰਟ ਜਾਰੀ ਕੀਤਾ ਗਿਆ ਹੈ, ਫੋਨ ਨਾ ਕੱਟੋ।",
            "ਕਿਸੇ ਨੂੰ ਨਾ ਦੱਸੋ, ਆਪਣੀ ਸਾਰੀ ਰਕਮ ਤੁਰੰਤ ਸਰਕਾਰੀ ਸੁਰੱਖਿਅਤ ਖਾਤੇ ਵਿੱਚ ਟਰਾਂਸਫਰ ਕਰੋ।",
            "ਤੁਹਾਡਾ ਬਿਜਲੀ ਦਾ ਮੀਟਰ ਅੱਜ ਰਾਤ ਕੱਟ ਦਿੱਤਾ ਜਾਵੇਗਾ, ਤੁਰੰਤ ਬਿੱਲ ਭਰੋ।"
        ],
        "hinglish": [
            "Inspector Vikram calling from CBI Headquarters Delhi, aapke naam pe illegal parcel pakda gaya hai.",
            "Mumbai Customs mein 14 fake passports aur narcotics seize huye hain aapke Aadhaar card pe.",
            "Non-bailable arrest warrant issue ho gaya hai, phone mat kaatna aur kisi ko mat batana.",
            "National security investigation hai, immediately saari savings RBI safe account mein move karo.",
            "Aapka bank account aur SIM block ho jayega, 25,000 verification penalty transfer karo UPI se.",
            "Electricity department notice: Aaj raat fuse kaat diya jayega agar overdue bill nahi bhara."
        ],
        "en": [
            "This is Inspector Vikram from CBI Headquarters, an illegal parcel under your name was seized.",
            "Customs narcotics branch has issued a non-bailable arrest warrant under PMLA Section 420.",
            "You are under active Digital Arrest. Do not disconnect this call or talk to your family.",
            "Transfer your savings to the RBI Escrow Verification account immediately for clearance.",
            "Your power connection will be permanently disconnected tonight at 9:30 PM due to overdue dues.",
            "Bank KYC expired. Net banking blocked unless 18,500 security deposit is authenticated via UPI."
        ]
    }

    benign_templates = {
        "hi": [
            "नमस्ते मम्मी, मैं कॉलेज पहुंच गया हूँ, आज शाम की क्लास 4 बजे खत्म होगी।",
            "बाजार से सब्जी और दूध ले लिया है, शाम को घर लौटते समय मिठाई भी ले आऊंगा।",
            "ठेकेदार जी, आपने काम पूरा नहीं किया, पहले काम खत्म करो फिर पेमेंट दूंगा।",
            "बेटा कॉलेज फीस की आखिरी तारीख आज है, कृपया लिंक पर 45,000 भेज दीजिए।",
            "अरे भाई कल की शादी में क्या पहन रहे हो? कुर्ता या फॉर्मल सूट?",
            "दुकानदार भैया, आपका महीने का राशन का 850 रुपये फोनपे कर दिया है, चेक कर लें।"
        ],
        "gu": [
            "નમસ્તે મમ્મી, હું ઓફિસે પહોંચી ગયો છું, આજે મીટિંગ મોડી પૂરી થશે.",
            "શાકભાજી અને કરિયાણું લઈ લીધું છે, સાંજે ઘરે આવતી વખતે ફ્રૂટ્સ લેતો આવીશ.",
            "કોલેજ ફી ભરવાની છેલ્લી તારીખ આજે છે, ખાતામાં 40,000 રૂપિયા મોકલી આપો.",
            "કરિયાણાવાળા ભાઈ, તમારા મહિનાના કરિયાણાના 850 રૂપિયા ગૂગલ પે કરી દીધા છે.",
            "આવતીકાલે આપણે બધા બહાર જમવા જઈશું, ટેબલ બુક કરી રાખ્યું છે."
        ],
        "mr": [
            "नमस्कार आई, मी ऑफिसमध्ये पोहोचलो आहे, आज संध्याकाळी थोडा उशीर होईल.",
            "बाजारातून भाजीपाला आणि किराणा सामान आणले आहे, संध्याकाळी घरी येतो.",
            "मुलगा कॉलेजच्या फीची आज शेवटची तारीख आहे, खात्यावर 45,000 रुपये पाठवा.",
            "किराणा दुकानदाराला 850 रुपयांचे पेमेंट युपीआय द्वारे केले आहे, तपासून घ्या.",
            "उद्या आपण सगळे मिळून गावाला जाणार आहोत, गाडीची तिकिटे काढली आहेत."
        ],
        "bn": [
            "নমস্কার মা, আমি ঠিক সময়ে অফিসে পৌঁছে গেছি, আজ সন্ধ্যায় তাড়াতাড়ি ফিরব।",
            "বাজার থেকে টাটকা মাছ আর শাকসবজি কিনেছি, রান্নার জন্য রেখে দিয়েছি।",
            "কলেজের পরীক্ষার ফি জমা দেওয়ার শেষ তারিখ আজ, অনুগ্রহ করে টাকা পাঠিয়ে দাও।",
            "দোকানদার দাদা, আপনার দোকানের ৮৫০ টাকা গুগল পে করে দিয়েছি, দেখে নিন।"
        ],
        "ta": [
            "அம்மா நான் அலுவலகம் வந்துவிட்டேன், மாலை நேரம் சீக்கிரம் வீட்டிற்கு வருகிறேன்.",
            "காய்கறிகள் மற்றும் பால் வாங்கிவிட்டேன், மாலையில் பழங்கள் வாங்கி வருகிறேன்.",
            "கல்லூரி கட்டணம் செலுத்த கடைசி நாள் இன்று, தயவுசெய்து பணம் அனுப்பவும்.",
            "மளிகைக் கடைக்கு 850 ரூபாய் கூகுள் பே மூலம் அனுப்பிவிட்டேன், சரிபார்க்கவும்."
        ],
        "te": [
            "నమస్కారం అమ్మ, నేను కాలేజీకి చేరుకున్నాను, ఈరోజు సాయంత్రం త్వరగా వస్తాను.",
            "కూరగాయలు మరియు సరుకులు తీసుకున్నాను, సాయంత్రం పండ్లు తీసుకొస్తాను.",
            "కాలేజీ ఫీజు చెల్లించడానికి చివరి తేదీ నేడు, దయచేసి ఖాతాకు డబ్బులు పంపండి.",
            "కిరాణా దుకాణానికి 850 రూపాయలు యూపీఐ ద్వారా చెల్లించాను, సరిచూసుకోండి."
        ],
        "pa": [
            "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਮੰਮੀ ਜੀ, ਮੈਂ ਕਾਲਜ ਪਹੁੰਚ ਗਿਆ ਹਾਂ, ਅੱਜ ਸ਼ਾਮ ਨੂੰ ਜਲਦੀ ਆਵਾਂਗਾ।",
            "ਸਬਜ਼ੀਆਂ ਅਤੇ ਰਾਸ਼ਨ ਲੈ ਲਿਆ ਹੈ, ਸ਼ਾਮ ਨੂੰ ਫਲ ਵੀ ਲੈ ਆਵਾਂਗਾ।",
            "ਕਾਲਜ ਦੀ ਫੀਸ ਭਰਨ ਦੀ ਅੱਜ ਆਖਰੀ ਤਾਰੀਖ ਹੈ, ਕਿਰਪਾ ਕਰਕੇ ਪੈਸੇ ਭੇਜ ਦਿਓ।",
            "ਦੁਕਾਨਦਾਰ ਨੂੰ ਰਾਸ਼ਨ ਦੇ 850 ਰੁਪਏ ਯੂਪੀਆਈ ਰਾਹੀਂ ਭੇਜ ਦਿੱਤੇ ਹਨ।"
        ],
        "hinglish": [
            "Hi Mom, college administrative office mein hoon, semester fee ka receipt mil gaya hai.",
            "Bhai market se Aashirvaad atta aur vegetables le liya hai, shaam ko milte hain.",
            "Contractor bhaiya renovation ka kaam kal subah tak finish kar dena please.",
            "Grocery shop uncle ko 850 rupees PhonePe kar diya hai, check kar lijiye.",
            "Kal movie dekhne ka plan final hai, ticket book kar li hai maine."
        ],
        "en": [
            "Hello Mom, I reached the university block safely, exams finish by 4 PM.",
            "Bought the groceries and fresh fruits from supermarket, heading back home.",
            "Semester tuition fee payment deadline is today, transferring 45,000 to registrar.",
            "Cleared the monthly grocery bill of 850 rupees via UPI to store scanner.",
            "Discussing the upcoming weekend road trip plan with college friends."
        ]
    }

    data = []
    languages = list(scam_templates.keys())
    samples_per_lang = total_samples // len(languages)

    for lang in languages:
        scams = scam_templates[lang]
        benigns = benign_templates[lang]

        # Generate positive (scam) samples
        for _ in range(samples_per_lang // 2):
            text = random.choice(scams)
            data.append({
                "language": lang,
                "text": text,
                "label": 1,
                "urgency": random.choice(["high", "critical"]),
                "intent": "scam_coercion"
            })

        # Generate negative (benign) samples
        for _ in range(samples_per_lang // 2):
            text = random.choice(benigns)
            data.append({
                "language": lang,
                "text": text,
                "label": 0,
                "urgency": "none",
                "intent": "benign_conversation"
            })

    random.shuffle(data)
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Successfully generated {len(data)} multilingual streaming chunks at '{output_file}'.")
    return data

if __name__ == "__main__":
    generate_icfd31k_synthetic_dataset()
