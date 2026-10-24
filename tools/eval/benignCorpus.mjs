/**
 * Everyday (non-scam) call snippets for the simulated user-weeks in
 * run-metrics.mjs. "tricky" calls are legitimate but mention banks, police,
 * OTPs, urgency or payments, the things a scam detector is most likely to
 * trip on. Synthetic, written by the team.
 */

export const BENIGN_CALLS = {
  en: {
    everyday: [
      ['Hi, are you coming for dinner tonight?', 'Bring the kids, mum is making biryani.', 'Okay see you at eight.'],
      ['The plumber will come tomorrow morning around ten.', 'He said the pipe needs to be replaced.', 'I will be home to let him in.'],
      ['Did you watch the match yesterday?', 'What a finish in the last over.', 'Let us go to the stadium next time.'],
      ['Your parcel from the online store is out for delivery.', 'Will someone be at home after two?', 'Fine, I will leave it with the guard.'],
      ['Doctor said the reports are normal.', 'Just keep taking the medicine for one more week.', 'I will book the follow up appointment.'],
      ['Can you pick up vegetables on your way back?', 'Tomatoes, onions and some coriander.', 'And milk if the shop is open.'],
      ['The school meeting is on Saturday at eleven.', 'Teacher wants to discuss the project.', 'I will take leave from office.'],
      ['Happy birthday beta, may god bless you.', 'Did you get the gift we sent?', 'Call us in the evening when everyone is home.'],
    ],
    tricky: [
      ['This is your bank branch, your fixed deposit matures next week.', 'Please visit the branch with your passbook to renew it.', 'We never ask for your PIN on the phone.'],
      ['My cousin is a police inspector in Pune now.', 'He got transferred from the crime branch last month.', 'We are meeting at his house on Sunday.'],
      ['I am sending the OTP for the gas booking, do not share it with anyone.', 'Actually just book it from the app yourself.', 'Okay done.'],
      ['Rent is due on the fifth, please send it to the usual account.', 'Same amount as last month.', 'Thanks, I will send the receipt.'],
      ['Hurry up, the train leaves in twenty minutes.', 'Bring the tickets and the charger.', 'I am waiting at platform three.'],
      ['The court hearing for the property case is next month.', 'Our lawyer will handle the papers.', 'Nothing to pay right now.'],
      ['Your electricity bill is generated, you can pay any time before the due date.', 'This is an automated reminder from the board.', 'Thank you.'],
      ['Please transfer my share for the trip, it is four thousand each.', 'Send it whenever you get time.', 'I booked the hotel already.'],
    ],
  },
  hi: {
    everyday: [
      ['आज रात खाने पर आ रहे हो?', 'बच्चों को भी लाना, मम्मी बिरयानी बना रही हैं।', 'ठीक है, आठ बजे मिलते हैं।'],
      ['प्लंबर कल सुबह दस बजे आएगा।', 'उसने कहा पाइप बदलना पड़ेगा।', 'मैं घर पर रहूँगा।'],
      ['डॉक्टर ने कहा रिपोर्ट नॉर्मल है।', 'बस एक हफ़्ता और दवाई लेते रहो।', 'मैं अगला अपॉइंटमेंट बुक कर दूँगा।'],
      ['लौटते समय सब्ज़ी ले आना।', 'टमाटर, प्याज़ और थोड़ा धनिया।', 'दुकान खुली हो तो दूध भी।'],
      ['जन्मदिन मुबारक हो बेटा, भगवान तुम्हें खुश रखे।', 'हमारा भेजा हुआ तोहफ़ा मिला?', 'शाम को सब घर पर हों तब फ़ोन करना।'],
      ['स्कूल की मीटिंग शनिवार ग्यारह बजे है।', 'टीचर प्रोजेक्ट के बारे में बात करना चाहती हैं।', 'मैं ऑफिस से छुट्टी ले लूँगा।'],
    ],
    tricky: [
      ['बैंक शाखा से बोल रहे हैं, आपकी एफडी अगले हफ़्ते पूरी हो रही है।', 'नवीनीकरण के लिए पासबुक लेकर शाखा आइए।', 'हम फ़ोन पर कभी पिन नहीं माँगते।'],
      ['मेरा भाई अब पुणे में पुलिस इंस्पेक्टर है।', 'पिछले महीने उसका तबादला हुआ।', 'रविवार को उसके घर मिल रहे हैं।'],
      ['किराया पाँच तारीख को देना है, उसी खाते में भेज देना।', 'पिछले महीने जितना ही।', 'रसीद भेज दूँगा।'],
      ['जल्दी करो, ट्रेन बीस मिनट में छूट जाएगी।', 'टिकट और चार्जर ले आना।', 'मैं प्लेटफॉर्म तीन पर हूँ।'],
      ['ज़मीन के केस की सुनवाई अगले महीने है।', 'वकील साहब कागज़ देख लेंगे।', 'अभी कुछ देना नहीं है।'],
      ['ट्रिप का अपना हिस्सा भेज देना, चार हज़ार हर एक का है।', 'जब समय मिले तब भेज देना।', 'होटल बुक हो गया है।'],
    ],
  },
  hinglish: {
    everyday: [
      ['aaj raat khane par aa rahe ho', 'bachchon ko bhi lana mummy biryani bana rahi hain', 'theek hai 8 baje milte hain'],
      ['plumber kal subah 10 baje aayega', 'usne kaha pipe badalna padega', 'main ghar par rahunga'],
      ['doctor ne kaha report normal hai', 'bas ek hafta aur dawai lete raho', 'main next appointment book kar dunga'],
      ['wapas aate time sabzi le aana', 'tamatar pyaaz aur thoda dhaniya', 'dukaan khuli ho to doodh bhi'],
      ['happy birthday beta bhagwan tumhe khush rakhe', 'hamara bheja hua gift mila', 'shaam ko sab ghar par hon tab call karna'],
      ['school ki meeting saturday 11 baje hai', 'teacher project ke baare mein baat karna chahti hain', 'main office se chhutti le lunga'],
    ],
    tricky: [
      ['bank branch se bol rahe hain aapki fd agle hafte mature ho rahi hai', 'renew ke liye passbook lekar branch aaiye', 'hum phone par kabhi pin nahi maangte'],
      ['mera bhai ab pune mein police inspector hai', 'pichle mahine uska transfer hua', 'sunday ko uske ghar mil rahe hain'],
      ['gas booking ka otp aaya hai kisi ko mat batana', 'actually app se khud book kar lo', 'ok ho gaya'],
      ['kiraya 5 tareekh ko dena hai usi account mein bhej dena', 'pichle mahine jitna hi', 'receipt bhej dunga'],
      ['jaldi karo train 20 minute mein chhoot jayegi', 'ticket aur charger le aana', 'main platform 3 par hoon'],
      ['trip ka apna share bhej dena 4 hazaar har ek ka hai', 'jab time mile tab bhej dena', 'hotel book ho gaya hai'],
    ],
  },
};
