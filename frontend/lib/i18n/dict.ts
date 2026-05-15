/**
 * Lightweight i18n dictionaries.
 *
 * Hindi translations are draft (Google Translate baseline + manual cleanup).
 * Plan 4.0 task: native-speaker QA pass.
 *
 * HARD RULE: Care-level strings ("Home Care" / "Clinic Visit" / "Emergency Room")
 * stay ENGLISH in DB and API. Hindi UI shows them as a SUBTITLE under the
 * English title — never as a replacement. This keeps the API contract stable
 * and avoids ambiguity when a doctor reads the audit log.
 */

export const SUPPORTED_LOCALES = ['en', 'hi', 'kn'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  hi: 'हिंदी',
  kn: 'ಕನ್ನಡ',
};

type Dict = Record<string, string>;

export const DICTIONARIES: Record<Locale, Dict> = {
  en: {
    /* navbar */
    'nav.signIn': 'Sign in',
    'nav.signOut': 'Sign out',
    'nav.triage': 'Triage',
    'nav.history': 'History',
    'nav.cockpit': 'Cockpit',

    /* landing */
    'landing.heroBadge': 'Decision support · Not a diagnosis',
    'landing.h1': "Triage support, where doctors aren't.",
    'landing.sub':
      "AI-assisted preliminary triage in your language. Built for India's rural last mile.",
    'landing.ctaStart': 'Start triage',
    'landing.ctaHow': 'Read how it works',
    'landing.howTitle': 'How it works',
    'landing.step1Title': 'Describe your symptoms',
    'landing.step1Body': 'In Hindi or English — type or speak. We listen.',
    'landing.step2Title': 'Get a triage suggestion',
    'landing.step2Body':
      'Home Care · Clinic Visit · Emergency Room — mapped to ESI v5 protocol.',
    'landing.step3Title': 'See the reasoning',
    'landing.step3Body': 'Every recommendation explains which symptoms drove the decision.',
    'landing.disclaimer':
      'ASHA-AI is decision support, not a medical device. Per India Telemedicine Practice Guidelines 2020, AI assists registered medical practitioners — it does not diagnose or prescribe.',

    /* triage */
    'triage.greeting':
      "Hi. I'm ASHA-AI. Tell me what's bothering you — symptoms, when they started, anything you've noticed. I'll help you decide where to go next.",
    'triage.placeholder':
      'Describe your symptoms — when they started, severity, anything else…',
    'triage.send': 'Send',
    'triage.sending': 'Sending',
    'triage.holdToTalk': 'Hold to speak',
    'triage.startVoice': 'Start voice input',
    'triage.stopVoice': 'Stop recording',
    'triage.voiceUnavailable': 'Voice not available on this device',
    'triage.signInBanner':
      "You're not signed in — this triage won't be saved to history.",
    'triage.signInLink': 'Sign in',
    'triage.signInBannerSuffix': 'to keep a record.',

    /* verdict */
    'verdict.homeCare.subtitle': 'Care at home',
    'verdict.clinicVisit.subtitle': 'Visit a clinic',
    'verdict.emergencyRoom.subtitle': 'Go to the emergency room',
    'verdict.sources': 'Sources',
    'verdict.notDiagnosis': 'Not a diagnosis. Decision support only.',

    /* mental health */
    'mh.title': "Please reach out — you're not alone.",
    'mh.body':
      "If you're thinking about ending your life or hurting yourself, please call one of these free, confidential helplines now.",
    'mh.icall': 'iCall (English / Hindi / Kannada)',
    'mh.vandrevala': 'Vandrevala Foundation (24×7)',
    'mh.emergency': 'If this is an immediate emergency, call 108 (ambulance) or 112.',
    'mh.safeBack': "I'm safe — take me back",

    /* sign-in */
    'signin.title': 'Sign in',
    'signin.sub': 'Phone-based one-time password. No email, no social login.',
    'signin.demoMode': 'Demo mode: any phone works. The OTP is',
    'signin.phoneLabel': 'Phone number',
    'signin.phonePlaceholder': '+91XXXXXXXXXX',
    'signin.sendOtp': 'Send OTP',
    'signin.sendingOtp': 'Sending OTP…',
    'signin.otpLabel': 'One-time password',
    'signin.otpSent': 'We sent a 6-digit code to',
    'signin.verify': 'Verify and sign in',
    'signin.verifying': 'Verifying…',
    'signin.changePhone': 'Change phone number',
    'signin.dpdp':
      'Triage support only — not a diagnosis. Phone number used for session continuity. Per India DPDP Act 2023.',

    /* history */
    'history.title': 'Your triage history',
    'history.sub': 'Sessions you ran on ASHA-AI. Stored locally on this device.',
    'history.empty': 'No sessions yet',
    'history.emptyBody': 'Start your first triage to see it appear here.',
    'history.startCta': 'Start triage',

    /* doctor cockpit */
    'doctor.title': 'Doctor cockpit',
    'doctor.empty': 'No active cases',
    'doctor.emptyBody': 'Patient triages will appear here in real time.',
    'doctor.markReviewed': 'Mark reviewed',
    'doctor.reviewed': 'Reviewed',
    'doctor.refresh': 'Refresh',
    'doctor.showReviewed': 'Show reviewed',
    'doctor.selectCase': 'Select a case from the queue',

    /* common */
    'common.back': 'Back',
    'common.loading': 'Loading…',
    'common.notReplacement': 'Not a replacement for professional medical diagnosis.',
  },

  /* Draft Hindi — review with native speaker before Plan 4.0 final cut */
  hi: {
    'nav.signIn': 'साइन इन',
    'nav.signOut': 'साइन आउट',
    'nav.triage': 'ट्रायाज',
    'nav.history': 'इतिहास',
    'nav.cockpit': 'कॉकपिट',

    'landing.heroBadge': 'सहायता मात्र · निदान नहीं',
    'landing.h1': 'जहाँ डॉक्टर नहीं हैं, वहाँ ट्रायाज सपोर्ट।',
    'landing.sub':
      'आपकी भाषा में AI-आधारित प्रारंभिक ट्रायाज। भारत के ग्रामीण क्षेत्रों के लिए बनाया गया।',
    'landing.ctaStart': 'ट्रायाज शुरू करें',
    'landing.ctaHow': 'यह कैसे काम करता है',
    'landing.howTitle': 'यह कैसे काम करता है',
    'landing.step1Title': 'अपने लक्षण बताएँ',
    'landing.step1Body': 'हिंदी या अंग्रेज़ी में — टाइप करें या बोलें।',
    'landing.step2Title': 'ट्रायाज सुझाव पाएँ',
    'landing.step2Body':
      'Home Care · Clinic Visit · Emergency Room — ESI v5 प्रोटोकॉल के अनुसार।',
    'landing.step3Title': 'कारण देखें',
    'landing.step3Body': 'हर सुझाव बताता है कि किन लक्षणों के कारण निर्णय हुआ।',
    'landing.disclaimer':
      'ASHA-AI सहायता है, चिकित्सा उपकरण नहीं। भारत की टेलीमेडिसिन प्रैक्टिस गाइडलाइन्स 2020 के अनुसार, AI केवल पंजीकृत चिकित्सक की सहायता करता है — निदान या नुस्ख़ा नहीं देता।',

    'triage.greeting':
      'नमस्ते। मैं ASHA-AI हूँ। बताइए क्या हो रहा है — कौन से लक्षण, कब से, और क्या नज़र आया। मैं तय करने में मदद करूँगा कि आगे कहाँ जाना है।',
    'triage.placeholder': 'अपने लक्षण बताएँ — कब से, कितने तेज़, और क्या-क्या…',
    'triage.send': 'भेजें',
    'triage.sending': 'भेज रहे हैं',
    'triage.holdToTalk': 'बोलने के लिए दबाएँ',
    'triage.startVoice': 'आवाज़ शुरू करें',
    'triage.stopVoice': 'रिकॉर्डिंग रोकें',
    'triage.voiceUnavailable': 'इस डिवाइस पर आवाज़ उपलब्ध नहीं',
    'triage.signInBanner':
      'आप साइन इन नहीं हैं — यह ट्रायाज इतिहास में सहेजा नहीं जाएगा।',
    'triage.signInLink': 'साइन इन',
    'triage.signInBannerSuffix': 'करें ताकि रिकॉर्ड रहे।',

    'verdict.homeCare.subtitle': 'घर पर देखभाल',
    'verdict.clinicVisit.subtitle': 'क्लिनिक जाएँ',
    'verdict.emergencyRoom.subtitle': 'तुरंत अस्पताल जाएँ',
    'verdict.sources': 'स्रोत',
    'verdict.notDiagnosis': 'निदान नहीं — केवल सहायता।',

    'mh.title': 'कृपया मदद लें — आप अकेले नहीं हैं।',
    'mh.body':
      'अगर आप अपनी जान लेने या ख़ुद को नुक़सान पहुँचाने के बारे में सोच रहे हैं, तो कृपया अभी इन निःशुल्क, गोपनीय हेल्पलाइन में से किसी एक पर कॉल करें।',
    'mh.icall': 'iCall (अंग्रेज़ी / हिंदी / कन्नड़)',
    'mh.vandrevala': 'वंद्रेवाला फाउंडेशन (24×7)',
    'mh.emergency': 'यदि यह तत्काल आपात स्थिति है, तो 108 (एम्बुलेंस) या 112 पर कॉल करें।',
    'mh.safeBack': 'मैं ठीक हूँ — वापस ले चलें',

    'signin.title': 'साइन इन',
    'signin.sub': 'फ़ोन OTP। कोई ईमेल या सोशल लॉगिन नहीं।',
    'signin.demoMode': 'डेमो मोड: कोई भी फ़ोन चलेगा। OTP है',
    'signin.phoneLabel': 'फ़ोन नंबर',
    'signin.phonePlaceholder': '+91XXXXXXXXXX',
    'signin.sendOtp': 'OTP भेजें',
    'signin.sendingOtp': 'OTP भेज रहे हैं…',
    'signin.otpLabel': 'वन-टाइम पासवर्ड',
    'signin.otpSent': 'हमने 6-अंकों का कोड भेजा है',
    'signin.verify': 'सत्यापित करें और साइन इन करें',
    'signin.verifying': 'सत्यापित कर रहे हैं…',
    'signin.changePhone': 'फ़ोन नंबर बदलें',
    'signin.dpdp':
      'सहायता मात्र — निदान नहीं। फ़ोन नंबर सत्र निरंतरता के लिए। DPDP अधिनियम 2023 के अनुसार।',

    'history.title': 'आपका ट्रायाज इतिहास',
    'history.sub': 'आपने ASHA-AI पर जो सत्र चलाए। इस डिवाइस पर सहेजे गए।',
    'history.empty': 'अभी कोई सत्र नहीं',
    'history.emptyBody': 'पहला ट्रायाज शुरू करें ताकि यहाँ दिखाई दे।',
    'history.startCta': 'ट्रायाज शुरू करें',

    'doctor.title': 'डॉक्टर कॉकपिट',
    'doctor.empty': 'कोई सक्रिय केस नहीं',
    'doctor.emptyBody': 'मरीज़ों के ट्रायाज वास्तविक समय में यहाँ दिखेंगे।',
    'doctor.markReviewed': 'समीक्षित मार्क करें',
    'doctor.reviewed': 'समीक्षित',
    'doctor.refresh': 'रीफ़्रेश',
    'doctor.showReviewed': 'समीक्षित दिखाएँ',
    'doctor.selectCase': 'क़तार से एक केस चुनें',

    'common.back': 'वापस',
    'common.loading': 'लोड हो रहा है…',
    'common.notReplacement': 'पेशेवर चिकित्सा निदान का विकल्प नहीं।',
  },

  /* Draft Kannada — review with native speaker before final submission.
   * Care-level strings stay ENGLISH per the API-contract rule. */
  kn: {
    'nav.signIn': 'ಸೈನ್ ಇನ್',
    'nav.signOut': 'ಸೈನ್ ಔಟ್',
    'nav.triage': 'ಟ್ರಿಯಾಜ್',
    'nav.history': 'ಇತಿಹಾಸ',
    'nav.cockpit': 'ಕಾಕ್‌ಪಿಟ್',

    'landing.heroBadge': 'ಸಹಾಯ ಮಾತ್ರ · ನಿಧಾನ ಅಲ್ಲ',
    'landing.h1': 'ವೈದ್ಯರು ಇಲ್ಲದ ಕಡೆ ಟ್ರಿಯಾಜ್ ಬೆಂಬಲ.',
    'landing.sub':
      'ನಿಮ್ಮ ಭಾಷೆಯಲ್ಲಿ AI-ಆಧಾರಿತ ಪ್ರಾಥಮಿಕ ಟ್ರಿಯಾಜ್. ಭಾರತದ ಗ್ರಾಮೀಣ ಕೊನೆಯ ಮೈಲಿಗಾಗಿ ನಿರ್ಮಿಸಲಾಗಿದೆ.',
    'landing.ctaStart': 'ಟ್ರಿಯಾಜ್ ಪ್ರಾರಂಭಿಸಿ',
    'landing.ctaHow': 'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ',
    'landing.howTitle': 'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ',
    'landing.step1Title': 'ನಿಮ್ಮ ಲಕ್ಷಣಗಳನ್ನು ವಿವರಿಸಿ',
    'landing.step1Body': 'ಹಿಂದಿ, ಕನ್ನಡ ಅಥವಾ ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ — ಟೈಪ್ ಮಾಡಿ ಅಥವಾ ಮಾತನಾಡಿ.',
    'landing.step2Title': 'ಟ್ರಿಯಾಜ್ ಸಲಹೆ ಪಡೆಯಿರಿ',
    'landing.step2Body':
      'Home Care · Clinic Visit · Emergency Room — ESI v5 ಪ್ರೋಟೋಕಾಲ್ ಪ್ರಕಾರ.',
    'landing.step3Title': 'ಕಾರಣವನ್ನು ನೋಡಿ',
    'landing.step3Body': 'ಪ್ರತಿಯೊಂದು ಸಲಹೆಯು ಯಾವ ಲಕ್ಷಣಗಳಿಂದ ತೀರ್ಮಾನ ಬಂದಿತು ಎಂದು ತೋರಿಸುತ್ತದೆ.',
    'landing.disclaimer':
      'ASHA-AI ಸಹಾಯ, ವೈದ್ಯಕೀಯ ಸಾಧನ ಅಲ್ಲ. ಭಾರತದ ಟೆಲಿಮೆಡಿಸಿನ್ ಪ್ರಾಕ್ಟೀಸ್ ಮಾರ್ಗಸೂಚಿಗಳ ಪ್ರಕಾರ AI ಕೇವಲ ನೋಂದಾಯಿತ ವೈದ್ಯರಿಗೆ ಸಹಾಯ ಮಾಡುತ್ತದೆ — ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಅಥವಾ ರೋಗನಿರ್ಣಯ ಮಾಡುವುದಿಲ್ಲ.',

    'triage.greeting':
      'ನಮಸ್ಕಾರ. ನಾನು ASHA-AI. ನಿಮಗೇನು ಆಗುತ್ತಿದೆ ಎಂದು ತಿಳಿಸಿ — ಯಾವ ಲಕ್ಷಣಗಳು, ಯಾವಾಗಿನಿಂದ, ಮತ್ತು ಏನು ಗಮನಿಸಿದಿರಿ. ಮುಂದೆ ಎಲ್ಲಿ ಹೋಗಬೇಕು ಎಂಬುದನ್ನು ನಿರ್ಧರಿಸಲು ನಾನು ಸಹಾಯ ಮಾಡುತ್ತೇನೆ.',
    'triage.placeholder': 'ನಿಮ್ಮ ಲಕ್ಷಣಗಳನ್ನು ವಿವರಿಸಿ — ಯಾವಾಗಿನಿಂದ, ಎಷ್ಟು ತೀವ್ರ…',
    'triage.send': 'ಕಳುಹಿಸಿ',
    'triage.sending': 'ಕಳುಹಿಸುತ್ತಿದೆ',
    'triage.holdToTalk': 'ಮಾತನಾಡಲು ಒತ್ತಿ ಹಿಡಿಯಿರಿ',
    'triage.startVoice': 'ಧ್ವನಿ ಪ್ರಾರಂಭಿಸಿ',
    'triage.stopVoice': 'ರೆಕಾರ್ಡಿಂಗ್ ನಿಲ್ಲಿಸಿ',
    'triage.voiceUnavailable': 'ಈ ಸಾಧನದಲ್ಲಿ ಧ್ವನಿ ಲಭ್ಯವಿಲ್ಲ',
    'triage.signInBanner': 'ನೀವು ಸೈನ್ ಇನ್ ಮಾಡಿಲ್ಲ — ಈ ಟ್ರಿಯಾಜ್ ಇತಿಹಾಸದಲ್ಲಿ ಉಳಿಯುವುದಿಲ್ಲ.',
    'triage.signInLink': 'ಸೈನ್ ಇನ್',
    'triage.signInBannerSuffix': 'ಮಾಡಿ ರೆಕಾರ್ಡ್ ಇರಲು.',

    'verdict.homeCare.subtitle': 'ಮನೆಯಲ್ಲಿ ಆರೈಕೆ',
    'verdict.clinicVisit.subtitle': 'ಕ್ಲಿನಿಕ್‌ಗೆ ಭೇಟಿ',
    'verdict.emergencyRoom.subtitle': 'ತಕ್ಷಣ ಆಸ್ಪತ್ರೆಗೆ',
    'verdict.sources': 'ಮೂಲಗಳು',
    'verdict.notDiagnosis': 'ರೋಗನಿರ್ಣಯ ಅಲ್ಲ — ಕೇವಲ ಸಹಾಯ.',

    'mh.title': 'ದಯವಿಟ್ಟು ಸಹಾಯ ಪಡೆಯಿರಿ — ನೀವು ಒಬ್ಬಂಟಿಗಲ್ಲ.',
    'mh.body':
      'ನೀವು ನಿಮ್ಮ ಜೀವನವನ್ನು ಕೊನೆಗೊಳಿಸುವ ಅಥವಾ ನಿಮಗೆ ಹಾನಿ ಮಾಡಿಕೊಳ್ಳುವ ಬಗ್ಗೆ ಯೋಚಿಸುತ್ತಿದ್ದರೆ, ದಯವಿಟ್ಟು ಈಗಲೇ ಈ ಉಚಿತ, ಗೋಪ್ಯ ಸಹಾಯವಾಣಿಗಳಿಗೆ ಕರೆ ಮಾಡಿ.',
    'mh.icall': 'iCall (ಇಂಗ್ಲಿಷ್ / ಹಿಂದಿ / ಕನ್ನಡ)',
    'mh.vandrevala': 'ವಂದ್ರೆವಾಲಾ ಫೌಂಡೇಶನ್ (24×7)',
    'mh.emergency': 'ಇದು ತಕ್ಷಣ ತುರ್ತು ಪರಿಸ್ಥಿತಿಯಾಗಿದ್ದರೆ, 108 (ಆಂಬ್ಯುಲೆನ್ಸ್) ಅಥವಾ 112 ಗೆ ಕರೆ ಮಾಡಿ.',
    'mh.safeBack': 'ನಾನು ಸುರಕ್ಷಿತ — ಹಿಂದೆ ಕರೆದೊಯ್ಯಿರಿ',

    'signin.title': 'ಸೈನ್ ಇನ್',
    'signin.sub': 'ಫೋನ್ OTP. ಯಾವುದೇ ಇಮೇಲ್ ಅಥವಾ ಸಾಮಾಜಿಕ ಲಾಗಿನ್ ಇಲ್ಲ.',
    'signin.demoMode': 'ಡೆಮೋ ಮೋಡ್: ಯಾವುದೇ ಫೋನ್ ಕೆಲಸ ಮಾಡುತ್ತದೆ. OTP',
    'signin.phoneLabel': 'ಫೋನ್ ಸಂಖ್ಯೆ',
    'signin.phonePlaceholder': '+91XXXXXXXXXX',
    'signin.sendOtp': 'OTP ಕಳುಹಿಸಿ',
    'signin.sendingOtp': 'OTP ಕಳುಹಿಸುತ್ತಿದೆ…',
    'signin.otpLabel': 'ಒಂದು ಬಾರಿಯ ಪಾಸ್‌ವರ್ಡ್',
    'signin.otpSent': 'ನಾವು 6-ಅಂಕಿಯ ಕೋಡ್ ಕಳುಹಿಸಿದ್ದೇವೆ',
    'signin.verify': 'ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಸೈನ್ ಇನ್ ಮಾಡಿ',
    'signin.verifying': 'ಪರಿಶೀಲಿಸುತ್ತಿದೆ…',
    'signin.changePhone': 'ಫೋನ್ ಸಂಖ್ಯೆಯನ್ನು ಬದಲಾಯಿಸಿ',
    'signin.dpdp':
      'ಸಹಾಯ ಮಾತ್ರ — ರೋಗನಿರ್ಣಯ ಅಲ್ಲ. ಫೋನ್ ಸಂಖ್ಯೆಯನ್ನು ಸೆಷನ್ ನಿರಂತರತೆಗಾಗಿ ಬಳಸಲಾಗಿದೆ. DPDP ಕಾಯಿದೆ 2023 ಪ್ರಕಾರ.',

    'history.title': 'ನಿಮ್ಮ ಟ್ರಿಯಾಜ್ ಇತಿಹಾಸ',
    'history.sub': 'ASHA-AI ನಲ್ಲಿ ನೀವು ನಡೆಸಿದ ಸೆಷನ್‌ಗಳು. ಈ ಸಾಧನದಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ.',
    'history.empty': 'ಇನ್ನೂ ಸೆಷನ್‌ಗಳಿಲ್ಲ',
    'history.emptyBody': 'ನಿಮ್ಮ ಮೊದಲ ಟ್ರಿಯಾಜ್ ಪ್ರಾರಂಭಿಸಿ ಇಲ್ಲಿ ಕಾಣಲು.',
    'history.startCta': 'ಟ್ರಿಯಾಜ್ ಪ್ರಾರಂಭಿಸಿ',

    'doctor.title': 'ವೈದ್ಯ ಕಾಕ್‌ಪಿಟ್',
    'doctor.empty': 'ಯಾವುದೇ ಸಕ್ರಿಯ ಪ್ರಕರಣಗಳಿಲ್ಲ',
    'doctor.emptyBody': 'ರೋಗಿಗಳ ಟ್ರಿಯಾಜ್ ಇಲ್ಲಿ ನೈಜ ಸಮಯದಲ್ಲಿ ಕಾಣಿಸಿಕೊಳ್ಳುತ್ತದೆ.',
    'doctor.markReviewed': 'ಪರಿಶೀಲಿಸಿದ ಎಂದು ಗುರುತಿಸಿ',
    'doctor.reviewed': 'ಪರಿಶೀಲಿಸಲಾಗಿದೆ',
    'doctor.refresh': 'ರಿಫ್ರೆಶ್',
    'doctor.showReviewed': 'ಪರಿಶೀಲಿಸಿದನ್ನು ತೋರಿಸಿ',
    'doctor.selectCase': 'ಕ್ಯೂನಿಂದ ಒಂದು ಪ್ರಕರಣ ಆಯ್ಕೆಮಾಡಿ',

    'common.back': 'ಹಿಂದೆ',
    'common.loading': 'ಲೋಡ್ ಆಗುತ್ತಿದೆ…',
    'common.notReplacement': 'ವೃತ್ತಿಪರ ವೈದ್ಯಕೀಯ ರೋಗನಿರ್ಣಯಕ್ಕೆ ಬದಲಿ ಅಲ್ಲ.',
  },
};
