/**
 * Satark Comprehensive Scenario Corpus
 * Mapped 100% to the 10+5 Partition & Benign Controls from Slide 6 of Satark PRD
 */

export const SCENARIOS = [
  // ==================== 10 TRAINED FRAUD TYPOLOGIES ====================
  {
    id: 'digital_arrest_cbi',
    title: '1. CBI Digital Arrest Impersonation',
    category: 'Digital Arrest',
    partition: 'Trained',
    severity: 'Critical',
    caller: {
      name: 'Inspector Vikram Singh (CBI Headquarters)',
      number: '+91 98102 43109',
      isFlagged: true,
      flagReason: 'Known SIM farm number linked to I4C advisory #2408'
    },
    suggestedPayment: {
      payeeName: 'RBI Escrow Verification A/c',
      payeeVPA: 'rbi.gov.verify91@okhdfcbank',
      amount: 480000,
      userMedian: 3500,
      isFirstTimePayee: true
    },
    targetNudge: 'Police and CBI never arrest citizens over a Skype or WhatsApp video call.',
    targetQuestion: 'Did the caller claim to be law enforcement and demand you move your savings to a "safe" or "verification" account?',
    chunks: [
      { text: 'Greetings Mrs. Meena, I am Inspector Vikram Singh calling from CBI Headquarters New Delhi.', duration: 3, riskScore: 0.35 },
      { text: 'A parcel addressed to you was intercepted at Mumbai Customs containing 14 fake passports and contraband.', duration: 3, riskScore: 0.68 },
      { text: 'An urgent FIR under Section 420 and PMLA has been registered. You are under immediate Digital Arrest.', duration: 3, riskScore: 0.94 },
      { text: 'Do not disconnect this call or talk to your family. This is a matter of strict national security.', duration: 3, riskScore: 0.96 },
      { text: 'To prove innocence, your bank balance must be temporarily moved to the RBI Escrow Account for forensic clearance.', duration: 3, riskScore: 0.98 },
      { text: 'Open your UPI application right now. Send 4 lakh 80 thousand to rbi.gov.verify91@okhdfcbank immediately.', duration: 3, riskScore: 0.99 }
    ]
  },
  {
    id: 'customs_parcel_fedex',
    title: '2. FedEx / Customs Narcotics Parcel',
    category: 'Customs Seizure',
    partition: 'Trained',
    severity: 'High',
    caller: {
      name: 'FedEx Customs Security Desk',
      number: '+91 88201 99312',
      isFlagged: true,
      flagReason: 'Flagged in NPCI FRM telecom feed'
    },
    suggestedPayment: {
      payeeName: 'Customs Clearance Escrow',
      payeeVPA: 'customs.duty.clearance@icici',
      amount: 85000,
      userMedian: 3500,
      isFirstTimePayee: true
    },
    targetNudge: 'Customs departments never accept penalty payments via personal UPI VPAs.',
    targetQuestion: 'Did the caller state an international package in your name contains narcotics and ask for a clearance deposit?',
    chunks: [
      { text: 'This is automated customer notice from FedEx courier services, pressing 9 connects you to enforcement.', duration: 3, riskScore: 0.40 },
      { text: 'A consignment destined for Taiwan has been seized under your Aadhaar number containing synthetic narcotics.', duration: 3, riskScore: 0.72 },
      { text: 'Narcotics Control Bureau Mumbai has issued a non-bailable warrant for your immediate custody.', duration: 3, riskScore: 0.89 },
      { text: 'Remain isolated in your room, do not discuss this investigation with any third party.', duration: 3, riskScore: 0.92 },
      { text: 'Transfer refundable clearance duty of 85,000 rupees to customs clearance portal via UPI.', duration: 3, riskScore: 0.97 }
    ]
  },
  {
    id: 'electricity_disconnection',
    title: '3. Electricity Bill Disconnection Threat',
    category: 'Utility Bill Scams',
    partition: 'Trained',
    severity: 'High',
    caller: {
      name: 'Discom Power Billing Officer',
      number: '+91 74011 20034',
      isFlagged: false,
      flagReason: null
    },
    suggestedPayment: {
      payeeName: 'Power Grid Quick Update',
      payeeVPA: 'power.discom.bill89@paytm',
      amount: 14850,
      userMedian: 3500,
      isFirstTimePayee: true
    },
    targetNudge: 'Power utility companies never demand urgent UPI transfers to personal handles to stop power cuts.',
    targetQuestion: 'Did an unknown caller claim your electricity will be disconnected tonight unless you pay immediately via a personal link?',
    chunks: [
      { text: 'Dear consumer, your electricity power supply will be permanently disconnected tonight at 9:30 PM.', duration: 3, riskScore: 0.65 },
      { text: 'Our central server shows previous month payment update failed. You must update via billing desk.', duration: 3, riskScore: 0.78 },
      { text: 'Call this helpline number immediately or power grid lineman will cut your fuse wire.', duration: 3, riskScore: 0.88 },
      { text: 'Open your UPI app and pay overdue charges 14,850 rupees right now to power.discom.bill89.', duration: 3, riskScore: 0.95 }
    ]
  },
  {
    id: 'bank_kyc_sim_expiry',
    title: '4. Bank KYC / SIM Card Expiry Block',
    category: 'KYC Suspension',
    partition: 'Trained',
    severity: 'High',
    caller: {
      name: 'Customer Support Dept (SBI KYC)',
      number: '+91 91100 88210',
      isFlagged: true,
      flagReason: 'Reported 14 times on 1930 portal'
    },
    suggestedPayment: {
      payeeName: 'KYC Fast Revalidation',
      payeeVPA: 'sbi.kyc.portal@axisbank',
      amount: 25000,
      userMedian: 3500,
      isFirstTimePayee: true
    },
    targetNudge: 'Banks never ask you to perform UPI transactions to update your KYC documents.',
    targetQuestion: 'Did someone call stating your bank account or SIM card will be deactivated within 2 hours without a verification payment?',
    chunks: [
      { text: 'Sir your bank account KYC has expired as per RBI guidelines. Netbanking and ATM blocked.', duration: 3, riskScore: 0.60 },
      { text: 'To prevent permanent freezing of all debit cards, quick re-verification mandate must be filed.', duration: 3, riskScore: 0.75 },
      { text: 'We are sending a security token link, you must authenticate through a 25,000 rupee security transfer.', duration: 3, riskScore: 0.91 },
      { text: 'Do not delay, failure will lead to Aadhaar link cancellation within 10 minutes.', duration: 3, riskScore: 0.94 }
    ]
  },
  {
    id: 'telegram_wfh_task',
    title: '5. Work-From-Home / Telegram Task Scheme',
    category: 'Task Fraud',
    partition: 'Trained',
    severity: 'Medium',
    caller: {
      name: 'HR Global Recruitment (Priya)',
      number: '+91 93450 11982',
      isFlagged: false,
      flagReason: null
    },
    suggestedPayment: {
      payeeName: 'Global Task Wallet',
      payeeVPA: 'merchant.task.payout@ybl',
      amount: 50000,
      userMedian: 3500,
      isFirstTimePayee: true
    },
    targetNudge: 'Legitimate employers never ask you to pay deposits to release earnings from simple tasks.',
    targetQuestion: 'Did this transaction follow promises of high returns for liking YouTube videos or completing online rating tasks?',
    chunks: [
      { text: 'Congratulations on completing task round 1, your earnings of 1,500 rupees are ready.', duration: 3, riskScore: 0.50 },
      { text: 'To unlock VIP merchant level 3 and earn 40% guaranteed commission, pre-deposit is mandatory.', duration: 3, riskScore: 0.79 },
      { text: 'Deposit 50,000 rupees into the task merchant wallet, return payout of 75,000 released in 5 minutes.', duration: 3, riskScore: 0.93 }
    ]
  },
  {
    id: 'kbc_lottery_winner',
    title: '6. KBC / Lottery Prize Tax Advance',
    category: 'Lottery Scam',
    partition: 'Trained',
    severity: 'Medium',
    caller: {
      name: 'KBC Lottery Officer Rana Pratap',
      number: '+92 301 229104',
      isFlagged: true,
      flagReason: 'Known fraudulent spoofing prefix'
    },
    suggestedPayment: {
      payeeName: 'Prize Distribution Cell',
      payeeVPA: 'kbc.tax.clearance@sbi',
      amount: 32000,
      userMedian: 3500,
      isFirstTimePayee: true
    },
    targetNudge: 'Lottery prizes never require the winner to pay taxes or fees through UPI beforehand.',
    targetQuestion: 'Did someone congratulate you on winning a lottery and ask for tax clearance fees via UPI?',
    chunks: [
      { text: 'Namaskar, congratulations your mobile number won 25 Lakh rupees in the All-India Lucky Draw.', duration: 3, riskScore: 0.65 },
      { text: 'Cheque is ready with State Bank manager, but 32,000 GST tax registration must be deposited first.', duration: 3, riskScore: 0.88 },
      { text: 'Pay immediately via UPI to lottery desk, prize money will be credited within 15 minutes.', duration: 3, riskScore: 0.96 }
    ]
  },
  {
    id: 'fake_loan_approval',
    title: '7. Instant Fake Loan Disbursal Fee',
    category: 'Loan Scam',
    partition: 'Trained',
    severity: 'Medium',
    caller: {
      name: 'Dhani Finance Fast Disbursal',
      number: '+91 80112 34900',
      isFlagged: false,
      flagReason: null
    },
    suggestedPayment: {
      payeeName: 'Loan Processing Desk',
      payeeVPA: 'loan.approval.desk@hdfcbank',
      amount: 18500,
      userMedian: 3500,
      isFirstTimePayee: true
    },
    targetNudge: 'Legitimate lenders never ask for upfront insurance or processing fees transferred to personal UPI VPAs.',
    targetQuestion: 'Did a caller promise pre-approved instant loan disbursal upon payment of an upfront processing fee?',
    chunks: [
      { text: 'Your 5 Lakh instant personal loan with zero documents has been approved at 2% annual interest.', duration: 3, riskScore: 0.55 },
      { text: 'RBI loan insurance and documentation charge of 18,500 rupees is needed to disburse loan to your account.', duration: 3, riskScore: 0.85 },
      { text: 'Once you transfer the insurance fee, the complete 5 Lakh will reflect in your bank account in 2 minutes.', duration: 3, riskScore: 0.95 }
    ]
  },
  {
    id: 'reward_points_expiry',
    title: '8. Credit Card Reward Points Expiry',
    category: 'Reward Scam',
    partition: 'Trained',
    severity: 'Medium',
    caller: {
      name: 'HDFC Rewards Desk',
      number: '+91 97711 02844',
      isFlagged: false,
      flagReason: null
    },
    suggestedPayment: {
      payeeName: 'Card Cash Redemption',
      payeeVPA: 'redeem.cash.points@kotak',
      amount: 9999,
      userMedian: 3500,
      isFirstTimePayee: true
    },
    targetNudge: 'Bank reward points are never converted to cash by sending a reverse UPI authorization.',
    targetQuestion: 'Did the caller state your credit card points will expire today and ask for an activation transaction?',
    chunks: [
      { text: 'You have 18,400 unused reward points worth 9,200 rupees expiring at midnight.', duration: 3, riskScore: 0.58 },
      { text: 'To convert these points into direct cash back into your savings account, an authentication payment is required.', duration: 3, riskScore: 0.82 },
      { text: 'Pay 9,999 to the gateway; your account will instantly receive the double refund plus bonus.', duration: 3, riskScore: 0.92 }
    ]
  },
  {
    id: 'ananydesk_screen_share',
    title: '9. Remote Access Screen Share Takeover',
    category: 'Remote Access / APK',
    partition: 'Trained',
    severity: 'Critical',
    caller: {
      name: 'Technical Support Executive',
      number: '+91 87002 91823',
      isFlagged: true,
      flagReason: 'Known technical assistance lure'
    },
    suggestedPayment: {
      payeeName: 'Remote System Fix',
      payeeVPA: 'sys.diagnostics.token@okaxis',
      amount: 75000,
      userMedian: 3500,
      isFirstTimePayee: true
    },
    targetNudge: 'Never enter your UPI PIN or pay money while sharing your screen via AnyDesk or TeamViewer.',
    targetQuestion: 'Did a technical support person ask you to install a screen-sharing app and make a payment on your phone?',
    chunks: [
      { text: 'Your phone has a critical malware vulnerability draining bank data. Install QuickSupport from Play Store.', duration: 3, riskScore: 0.62 },
      { text: 'Share the 9-digit code on your screen so our certified technician can patch your device security.', duration: 3, riskScore: 0.89 },
      { text: 'Now open your Google Pay app to verify connection token, do not touch the screen while we calibrate.', duration: 3, riskScore: 0.98 }
    ]
  },
  {
    id: 'distressed_relative',
    title: '10. Distressed Relative Accident Impersonation',
    category: 'Impersonation',
    partition: 'Trained',
    severity: 'High',
    caller: {
      name: 'City Hospital Emergency ICU',
      number: '+91 99203 14892',
      isFlagged: false,
      flagReason: null
    },
    suggestedPayment: {
      payeeName: 'Emergency Trauma Fund',
      payeeVPA: 'dr.sharma.icuemergency@icici',
      amount: 60000,
      userMedian: 3500,
      isFirstTimePayee: true
    },
    targetNudge: 'Always verify claims of family medical emergencies by calling their personal phone directly.',
    targetQuestion: 'Did an unknown caller claim your child or relative had an accident and urgently requires hospital deposits?',
    chunks: [
      { text: 'Aunty Ji, your nephew Rohit has met with a severe road accident on the highway, condition critical.', duration: 3, riskScore: 0.70 },
      { text: 'He is in surgery now, doctors need immediate 60,000 deposit before arranging blood units.', duration: 3, riskScore: 0.88 },
      { text: 'His phone is broken so do not call him. Transfer money immediately to the surgeon UPI ID to save his life.', duration: 3, riskScore: 0.96 }
    ]
  },

  // ==================== 5 HELD-OUT UNSEEN FRAUD TYPOLOGIES ====================
  {
    id: 'unseen_ai_voice_kidnap',
    title: '11. [UNSEEN] AI Voice Clone Ransom Kidnapping',
    category: 'AI Voice Cloning',
    partition: 'Unseen (Zero-Day)',
    severity: 'Critical',
    caller: {
      name: 'Unknown Coercive Caller',
      number: '+91 94119 22019',
      isFlagged: false,
      flagReason: null
    },
    suggestedPayment: {
      payeeName: 'Ransom Settlement Escrow',
      payeeVPA: 'safedeposit.release99@paytm',
      amount: 250000,
      userMedian: 3500,
      isFirstTimePayee: true
    },
    targetNudge: 'Scammers use AI audio clones of loved ones crying. Hang up and call your family member directly.',
    targetQuestion: 'Did you hear a voice sounding like your relative crying or screaming followed by an immediate demand for cash?',
    chunks: [
      { text: '[Simulated AI voice of son crying]: "Mummy help me! These men have locked me in a van, please give them what they want!"', duration: 3, riskScore: 0.78 },
      { text: '[Harsh kidnapper voice]: Listen carefully woman, we have your boy. If you dial 100 or disconnect, you will never see him.', duration: 3, riskScore: 0.95 },
      { text: 'Send 2 lakh 50 thousand rupees to this UPI handle within 10 minutes or we take him across the border.', duration: 3, riskScore: 0.98 }
    ]
  },
  {
    id: 'unseen_sebi_ipo_scheme',
    title: '12. [UNSEEN] Fake SEBI Institutional IPO Investment',
    category: 'Investment Fraud',
    partition: 'Unseen (Zero-Day)',
    severity: 'High',
    caller: {
      name: 'Institutional Equity Advisor (Morgan Stanley India Desk)',
      number: '+91 96500 11200',
      isFlagged: false,
      flagReason: null
    },
    suggestedPayment: {
      payeeName: 'Institutional Allotment Account',
      payeeVPA: 'institutional.ipo.fii@yesbank',
      amount: 150000,
      userMedian: 3500,
      isFirstTimePayee: true
    },
    targetNudge: 'SEBI registered institutional IPO quotas are never allotted via personal UPI transfers to private VPAs.',
    targetQuestion: 'Did someone promise guaranteed institutional allotment in an oversubscribed IPO via private UPI transfer?',
    chunks: [
      { text: 'Hello Madam, we are offering exclusive FII institutional quota in the upcoming mega tech IPO at 50% discount.', duration: 3, riskScore: 0.60 },
      { text: 'SEBI approved institutional window closes in 20 minutes, guaranteed 300% listing gains on Monday.', duration: 3, riskScore: 0.82 },
      { text: 'Transfer your subscription amount 1,50,000 to the institutional escrow handle before market close.', duration: 3, riskScore: 0.93 }
    ]
  },
  {
    id: 'unseen_sextortion_blackmail',
    title: '13. [UNSEEN] Video Call Sextortion & Defamation',
    category: 'Sextortion',
    partition: 'Unseen (Zero-Day)',
    severity: 'Critical',
    caller: {
      name: 'Crime Intelligence Cell Blackmailer',
      number: '+91 78901 22334',
      isFlagged: false,
      flagReason: null
    },
    suggestedPayment: {
      payeeName: 'Defamation Case Settlement',
      payeeVPA: 'settlement.case.closure@okaxis',
      amount: 80000,
      userMedian: 3500,
      isFirstTimePayee: true
    },
    targetNudge: 'Never pay blackmailers or extortionists. Report directly to National Cybercrime Helpline 1930.',
    targetQuestion: 'Did someone threaten to leak an edited video or photos to your contacts unless you pay money right now?',
    chunks: [
      { text: 'We have recorded full video of you from last night. We have your entire contact list and Facebook friends.', duration: 3, riskScore: 0.85 },
      { text: 'If 80,000 rupees is not transferred in 5 minutes, this compromising clip will be uploaded to YouTube and sent to your children.', duration: 3, riskScore: 0.97 },
      { text: 'Pay right now to settlement.case.closure and we permanently wipe the cloud storage.', duration: 3, riskScore: 0.98 }
    ]
  },
  {
    id: 'unseen_tax_audit_seizure',
    title: '14. [UNSEEN] Income Tax Audit Asset Freeze Notice',
    category: 'Tax Authority Impersonation',
    partition: 'Unseen (Zero-Day)',
    severity: 'High',
    caller: {
      name: 'Commissioner of Income Tax (Investigation Wing)',
      number: '+91 99112 00331',
      isFlagged: false,
      flagReason: null
    },
    suggestedPayment: {
      payeeName: 'Tax Audit Deposit',
      payeeVPA: 'it.dept.audit.mandate@sbi',
      amount: 110000,
      userMedian: 3500,
      isFirstTimePayee: true
    },
    targetNudge: 'The Income Tax Department conducts assessments through the e-Filing portal, never through instant UPI demands.',
    targetQuestion: 'Did a caller claiming to be an Income Tax officer threaten immediate bank account freezing for undeclared wealth?',
    chunks: [
      { text: 'Notice from Income Tax Department Investigation Wing. Discrepancy of 42 Lakhs detected in your annual return.', duration: 3, riskScore: 0.65 },
      { text: 'A freeze order on all your fixed deposits and real estate properties will be executed within 1 hour.', duration: 3, riskScore: 0.88 },
      { text: 'To file an interim stay and avoid criminal search raid, submit compliance fee of 1,10,000 rupees via UPI.', duration: 3, riskScore: 0.94 }
    ]
  },
  {
    id: 'unseen_visa_deportation',
    title: '15. [UNSEEN] Foreign Embassy Visa Violation Arrest',
    category: 'Immigration Scam',
    partition: 'Unseen (Zero-Day)',
    severity: 'High',
    caller: {
      name: 'Bureau of Immigration / Canadian Embassy Desk',
      number: '+91 80221 99881',
      isFlagged: false,
      flagReason: null
    },
    suggestedPayment: {
      payeeName: 'Consular Visa Fine',
      payeeVPA: 'embassy.consular.fine@kotak',
      amount: 95000,
      userMedian: 3500,
      isFirstTimePayee: true
    },
    targetNudge: 'Embassies and Immigration Bureaus never accept visa penalties or bond fees via domestic UPI payments.',
    targetQuestion: 'Did an immigration officer claim your child’s student visa is cancelled and demand immediate fines?',
    chunks: [
      { text: 'Calling from Bureau of Immigration. Your daughter studying in Toronto has violated student visa section 14B.', duration: 3, riskScore: 0.68 },
      { text: 'Canadian border security has detained her at airport, deportation proceedings initiated.', duration: 3, riskScore: 0.86 },
      { text: 'Immediate legal clearance fee of 95,000 rupees must be submitted via consular wire on UPI to cancel detention.', duration: 3, riskScore: 0.96 }
    ]
  },

  // ==================== 3 BENIGN CONTROL SCENARIOS ====================
  {
    id: 'benign_son_tuition',
    title: '16. [BENIGN] College Tuition Transfer to Son',
    category: 'Legitimate Transfer',
    partition: 'Benign Control',
    severity: 'None',
    caller: {
      name: 'Aman (Son)',
      number: '+91 98112 33445',
      isFlagged: false,
      flagReason: null
    },
    suggestedPayment: {
      payeeName: 'Aman Sharma',
      payeeVPA: 'aman.sharma02@okicici',
      amount: 45000,
      userMedian: 3500,
      isFirstTimePayee: false // Regular known payee!
    },
    targetNudge: null,
    targetQuestion: null,
    chunks: [
      { text: 'Hi Mom, I am at the university administrative block right now.', duration: 3, riskScore: 0.05 },
      { text: 'The semester registration portal closes at 4 PM today and card payment is failing on their machine.', duration: 3, riskScore: 0.12 },
      { text: 'Can you please transfer 45,000 to my UPI account? I will pay the cashier directly.', duration: 3, riskScore: 0.15 },
      { text: 'Thanks Mom, will call you after my lecture!', duration: 3, riskScore: 0.04 }
    ]
  },
  {
    id: 'benign_contractor_dispute',
    title: '17. [BENIGN] Stressful Argument with Home Contractor',
    category: 'Legitimate Transfer',
    partition: 'Benign Control',
    severity: 'Low',
    caller: {
      name: 'Ramesh Contractor (Renovation)',
      number: '+91 98450 67812',
      isFlagged: false,
      flagReason: null
    },
    suggestedPayment: {
      payeeName: 'Ramesh Carpenter & Interiors',
      payeeVPA: 'ramesh.woodcraft@paytm',
      amount: 18000,
      userMedian: 3500,
      isFirstTimePayee: false
    },
    targetNudge: null,
    targetQuestion: null,
    chunks: [
      { text: 'Madam, my laborers are sitting idle on the site since 8 AM today!', duration: 3, riskScore: 0.20 },
      { text: 'You promised to clear the timber raw material bill yesterday, why is it delayed?', duration: 3, riskScore: 0.25 },
      { text: 'If you do not send the 18,000 rupees right now, we will pack our tools and stop the painting work.', duration: 3, riskScore: 0.35 },
      { text: 'Send it to my Paytm number right now, otherwise do not expect work tomorrow.', duration: 3, riskScore: 0.38 }
    ]
  },
  {
    id: 'benign_grocery_vendor',
    title: '18. [BENIGN] Routine Neighborhood Grocery Payment',
    category: 'Legitimate Transfer',
    partition: 'Benign Control',
    severity: 'None',
    caller: {
      name: 'Gupta General Store',
      number: '+91 98100 55667',
      isFlagged: false,
      flagReason: null
    },
    suggestedPayment: {
      payeeName: 'Gupta Provision Store',
      payeeVPA: 'guptastore.delhi@upi',
      amount: 850,
      userMedian: 3500,
      isFirstTimePayee: false
    },
    targetNudge: null,
    targetQuestion: null,
    chunks: [
      { text: 'Namaste Bhabhi Ji, your monthly grocery delivery has been sent with Chhotu.', duration: 3, riskScore: 0.02 },
      { text: 'Total bill is 850 rupees including the Aashirvaad atta and Fortune oil.', duration: 3, riskScore: 0.03 },
      { text: 'Whenever convenient you can send on our shop UPI scanner.', duration: 3, riskScore: 0.01 }
    ]
  }
];
