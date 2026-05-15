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
    'nav.privacy': 'Privacy & data',
    'nav.outbreak': 'Outbreak surveillance',
    'nav.settings': 'Settings',
    'nav.asha': 'ASHA Co-Pilot',

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
    'triage.activeProfile': 'Triaging on behalf of {name} · age {age}',

    /* verdict */
    'verdict.homeCare.subtitle': 'Care at home',
    'verdict.clinicVisit.subtitle': 'Visit a clinic',
    'verdict.emergencyRoom.subtitle': 'Go to the emergency room',
    'verdict.sources': 'Sources',
    'verdict.notDiagnosis': 'Not a diagnosis. Decision support only.',
    'verdict.listen': 'Listen',
    'verdict.stop': 'Stop',

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

    /* Plan 6.1 — Symptom Cinema 3D body map */
    'bodymap.title': 'Symptom Cinema · 3D body',
    'bodymap.subtitleHint': 'Tap where it hurts. Up to {max} spots.',
    'bodymap.openButton': 'Open 3D body map',
    'bodymap.openButtonTitle': 'Tap where it hurts on a 3D body',
    'bodymap.useChat': 'Use chat instead',
    'bodymap.placedOf': '{n} of {max} placed',
    'bodymap.clear': 'Clear',
    'bodymap.clearAria': 'Clear all pins',
    'bodymap.hint': 'Drag to rotate. Tap any body part to mark it.',
    'bodymap.submitOne': 'Submit 1 pin',
    'bodymap.submitMany': 'Submit {n} pins',
    'bodymap.submitAria': 'Submit pins for triage',
    'bodymap.reviewing': 'Reviewing…',
    'bodymap.startOver': 'Start over',
    'bodymap.continueChat': 'Continue in chat',
    'bodymap.fallbackNoWebgl':
      "Your browser doesn't support the 3D body map. Chat works fine — describe your symptoms below.",
    'bodymap.fallbackReducedMotion':
      'Reduced-motion is on, so the 3D body is paused. Use chat or turn off reduced-motion in your OS to try the 3D view.',
    'bodymap.checkingDevice': 'Checking device capabilities…',
    'bodymap.redirecting': 'Redirecting to chat triage…',
    'bodymap.noscriptFallback':
      'The 3D body map needs JavaScript. Use the chat triage instead.',
    'bodymap.backToChat': 'Back to chat triage',

    /* PainPanel — pin authoring sheet */
    'pain.pinNumber': 'Pin {n} of {max}',
    'pain.intensityTitle': 'How intense?',
    'pain.intensityHelp': '1 mild · 5 moderate · 10 worst',
    'pain.intensityAria': 'Pain intensity, 1 to 10',
    'pain.qualityTitle': 'What does it feel like?',
    'pain.qualityHelp': '(pick at least 1)',
    'pain.quality.burning': 'Burning',
    'pain.quality.stabbing': 'Stabbing',
    'pain.quality.throbbing': 'Throbbing',
    'pain.quality.pressure': 'Pressure',
    'pain.quality.cramping': 'Cramping',
    'pain.durationTitle': 'How long has it been?',
    'pain.duration.just_started': 'Just started',
    'pain.duration.few_hours': 'Few hours',
    'pain.duration.since_yesterday': 'Since yesterday',
    'pain.duration.days_or_weeks': 'Days / weeks',
    'pain.aggravatorsTitle': 'What makes it worse?',
    'pain.agg.moving': 'Moving',
    'pain.agg.eating': 'Eating',
    'pain.agg.breathing': 'Breathing',
    'pain.agg.pressing': 'Pressing',
    'pain.agg.standing_up': 'Standing up',
    'pain.agg.nothing': 'Nothing',
    'pain.savePinPrompt': 'Pick at least 1 quality to save',
    'pain.savePin': 'Save pin',
    'pain.saveAria': 'Save pin and return to body view',
    'pain.closeAria': 'Close pain panel',
    'pain.dialogAria': 'Describe pain in {region}',

    /* Plan 6.2 — RiskOrb headline + trajectory */
    'riskorb.aria': '{careLevel} · risk score {score} of 100 · trajectory {trajectory}',
    'risk.trajectory.rapidly_worsening': 'Rapidly worsening',
    'risk.trajectory.worsening': 'Worsening',
    'risk.trajectory.stable': 'Stable',
    'risk.trajectory.improving': 'Improving',
    'risk.trajectory.insufficient_data': 'New patient',

    /* Plan 6.2 — VoiceWaveform live mic visualizer */
    'voice.recordingPill': 'Recording — tap to stop',
    'voice.recordingAria': 'Voice recording in progress',

    /* Plan 6.2 — NeuralNet AI-thinking visualizer */
    'neural.analyzing': 'Analyzing your symptoms…',
    'neural.honestCaveat': 'Visual only · not the actual model graph',
    'neural.aria': 'AI is analyzing your symptoms',

    /* Plan 6.6 Phase B (frontend) — DPDP consent sheet + privacy settings */
    'consent.kicker': 'Privacy & consent',
    'consent.title': 'Choose what ASHA-AI can do with your data',
    'consent.intro':
      'Per India DPDP Act 2023, we ask for specific consent before processing health data. You can change any of these later in Privacy & data.',
    'consent.required': 'Required',
    'consent.accept': 'Save & continue',
    'consent.acceptAria': 'Save consent choices and continue',
    'consent.decline': 'Not now',
    'consent.closeAria': 'Close consent sheet',
    'consent.legalPending':
      'This policy is pending legal review. The technical controls below are live; the wording may tighten before launch.',
    'consent.readFullPolicy': 'Read the full privacy policy',
    'consent.disclaimer':
      'Decision support — not a medical diagnosis. India Telemedicine Practice Guidelines 2020.',
    'consent.error.networkBackup':
      "Saved on this device. We'll sync to the server when it's reachable.",
    'consent.error.unknown': 'Something went wrong. Try once more.',

    'consent.scope.triage_processing.title': 'Process my symptoms for triage',
    'consent.scope.triage_processing.body':
      'Required to use ASHA-AI. We extract symptoms from your text/voice/body-map input to suggest one of three care levels.',
    'consent.scope.session_history.title': 'Save my sessions',
    'consent.scope.session_history.body':
      'So you can review past triages from /history on this device.',
    'consent.scope.longitudinal_memory.title': 'Remember past visits',
    'consent.scope.longitudinal_memory.body':
      'When you triage again, the AI recalls relevant past visits to give better suggestions. Stored under a hashed patient_id, not your phone number.',
    'consent.scope.abdm_health_locker.title': 'Push verdicts to my ABHA Health Locker',
    'consent.scope.abdm_health_locker.body':
      'When ABDM integration ships, your triage verdicts can sync to your ABHA Health Locker so any ABHA-linked doctor can see them.',
    'consent.scope.analytics_aggregate.title': 'Anonymous district-level analytics',
    'consent.scope.analytics_aggregate.body':
      'Help detect outbreaks: your symptom + approximate district contributes to anonymous district-level patterns. No phone, no name, no exact location.',
    'consent.scope.research_pseudonymized.title': 'Pseudonymized research dataset',
    'consent.scope.research_pseudonymized.body':
      'Optional: contribute to academic + ICMR collaborations. Pseudonymized — no PII shared with researchers.',

    'privacy.kicker': 'Settings',
    'privacy.title': 'Privacy & data',
    'privacy.subtitle':
      'Control what ASHA-AI does with your data. Per DPDP Act 2023, every consent is specific, informed, and withdrawable.',
    'privacy.scopesTitle': 'Your consent posture',
    'privacy.policyVersion': 'Policy version',
    'privacy.lastGranted': 'last granted',
    'privacy.toggleOn': 'enabled',
    'privacy.toggleOff': 'disabled',

    'privacy.deleteTitle': 'Delete all my data',
    'privacy.deleteBody':
      'Per DPDP §13, you have the right to erasure. Soft-delete is immediate; hard-delete completes within 72 hours and removes every row tied to your account.',
    'privacy.deleteCta': 'Delete all my data',
    'privacy.deleteSignInRequired':
      'Sign in to delete your account data. Anonymous local sessions can be cleared from your browser settings.',
    'privacy.deleteConfirmIntro':
      'This cannot be undone. Every triage session, voice recording, consent record, and audit log tied to your account will be queued for hard-deletion within 72 hours.',
    'privacy.deleteConfirmLabel': 'Type {phrase} to confirm',
    'privacy.deleteConfirmButton': "I'm sure — delete",
    'privacy.deleteWrongPhrase':
      'The confirm phrase must be typed exactly. Try again.',
    'privacy.deleteSuccess':
      'Your data is queued for hard-deletion. Final removal by:',
    'privacy.deletePending': 'Deletion in progress',
    'privacy.deletePendingBody':
      'Your data is soft-deleted. Hard-delete completes by:',
    'privacy.cancel': 'Cancel',
    'privacy.dpdpFooter':
      'India DPDP Act 2023 §6 (consent) + §13 (right to erasure). Audit trail of every consent + deletion event is retained per DPDP §28.',

    /* Plan 7.x — Plain Diagnosis layer */
    'plainDiagnosis.on': 'Plain English',
    'plainDiagnosis.off': 'Plain English',
    'plainDiagnosis.toggleOn': 'Show in plain English (replace medical jargon)',
    'plainDiagnosis.toggleOff': 'Show original wording with medical terms',

    /* Plan 7.x — Family Health Graph */
    'family.title': 'Family',
    'family.subtitle':
      'One account, multiple family members. Switch profiles before triaging on behalf of someone else. All profiles stay on this device — never shared.',
    'family.you': 'You',
    'family.addPerson': 'Add a person',
    'family.editPerson': 'Edit person',
    'family.manage': 'Manage all',
    'family.cap': 'max 8',
    'family.optional': 'optional',
    'family.save': 'Save',
    'family.edit': 'Edit',
    'family.remove': 'Remove',
    'family.removeConfirm': 'Remove this person from your family list?',
    'family.signInRequired': 'Sign in to manage family profiles.',
    'family.errorName': 'Please enter a first name.',
    'family.errorAge': 'Age must be between 0 and 120.',
    'family.switcherAria': 'Switch active family member',
    'family.privacyFooter':
      'Stored locally on this device. Per DPDP §6 minimization, we keep first name + age + sex + relationship only — no full names, addresses, ABHA IDs, or photos.',
    'family.field.name': 'First name',
    'family.field.age': 'Age',
    'family.field.sex': 'Sex',
    'family.field.relationship': 'Relationship',
    'family.field.comorbidities': 'Long-term conditions',
    'family.sex.f': 'Female',
    'family.sex.m': 'Male',
    'family.sex.other': 'Other / prefer not to say',
    'family.relationship.self': 'Self',
    'family.relationship.spouse': 'Spouse',
    'family.relationship.parent': 'Parent',
    'family.relationship.child': 'Child',
    'family.relationship.sibling': 'Sibling',
    'family.relationship.grandparent': 'Grandparent',
    'family.relationship.grandchild': 'Grandchild',
    'family.relationship.in_law': 'In-law',
    'family.relationship.other': 'Other',

    /* Plan 7.x — Chronicle Mode daily check-in */
    'chronicle.title': 'How are you today?',
    'chronicle.daily': 'Daily check-in',
    'chronicle.prompt':
      'Compared to yesterday — better, the same, or worse?',
    'chronicle.status.better': 'Better',
    'chronicle.status.same': 'Same',
    'chronicle.status.worse': 'Worse',
    'chronicle.noteOptional': 'Add a quick note (optional)',
    'chronicle.notePlaceholder': 'e.g. fever down, still coughing',
    'chronicle.skipNote': 'Skip note',
    'chronicle.save': 'Save',
    'chronicle.thankYou': 'Saved — you marked today as',
    'chronicle.checkInsCount': 'check-ins',

    /* Plan 6.3 — OutbreakGlobe + admin outbreak page */
    'outbreak.kicker': 'Public health',
    'outbreak.title': 'Outbreak surveillance',
    'outbreak.subtitle':
      'Districts where 15+ patients reported similar symptom clusters in the last 72 hours. Anonymous district-level signal — no individual records.',
    'outbreak.doctorOnly': 'Doctor only',
    'outbreak.demoSeed': 'Demo data — backend cluster endpoint pending',
    'outbreak.backToCockpit': 'Back to cockpit',
    'outbreak.globeAria': '3D globe of active outbreak clusters across India',
    'outbreak.mapAria': '2D geographic map of active outbreak clusters',
    'outbreak.listAria': 'List of active outbreak clusters',
    'outbreak.viewToggleAria': 'Switch between 3D globe and 2D map view',
    'outbreak.viewGlobe': '3D globe',
    'outbreak.viewMap': '2D map',
    'outbreak.activeClusters': 'Active clusters',
    'outbreak.totalCases': 'cases',
    'outbreak.dominantSymptoms': 'Dominant symptoms',
    'outbreak.field.kind': 'Type',
    'outbreak.field.cases': 'Cases',
    'outbreak.field.confidence': 'HDBSCAN confidence',
    'outbreak.field.firstSeen': 'First seen',
    'outbreak.privacyFooter':
      'Cluster aggregation uses 500m grid-snapping + age bucketing. No phone, no name, no exact location is stored or rendered. Per DPDP §6 minimization.',

    /* Plan 6.5 step 10 — Image / Vision triage */
    'vision.kicker': 'Image triage',
    'vision.title': 'Send a photo for triage',
    'vision.openButton': 'Upload an image for triage',
    'vision.openButtonTitle': 'Photo of a rash, wound, or pill bottle',
    'vision.dialogAria': 'Upload an image for triage',
    'vision.dropHint': 'Drop an image here, or tap to pick',
    'vision.fileTypes': 'JPEG, PNG, or WebP · max 8 MB',
    'vision.useCamera': 'Use camera',
    'vision.contextLabel': 'What is in the image?',
    'vision.contextPlaceholder': 'e.g. rash on left forearm, started yesterday',
    'vision.optional': 'optional',
    'vision.previewAlt': 'Selected image preview',
    'vision.previewBanner':
      'Visual model is being trained. For now, this returns a careful default verdict — use chat or 3D body map for the strongest triage today.',
    'vision.changeImage': 'Change image',
    'vision.submit': 'Get triage',
    'vision.analyzing': 'Analyzing…',
    'vision.error.too_large': 'Image is too large. Maximum 8 MB.',
    'vision.error.wrong_type': 'Unsupported image type. Use JPEG, PNG, or WebP.',
    'vision.error.http': 'Server returned an error. Try again in a moment.',
    'vision.error.unknown': 'Something went wrong. Try once more.',

    /* Plan 6.6 Phase H (frontend stubs) — verdict actions: clinic finder + share */
    'actions.aria': 'Quick actions for this verdict',
    'actions.clinic.find': 'Find nearby clinic',
    'actions.clinic.locating': 'Finding…',
    'actions.clinic.opened': 'Opened Google Maps',
    'actions.clinic.openedWithoutLocation': 'Opened Google Maps (without your exact location)',
    'actions.clinic.locationDenied':
      'Location permission was denied — search opened without coordinates.',
    'actions.clinic.locationFailed':
      "Couldn't get your location — search opened without coordinates.",
    'actions.share.intro': 'Triage result from',
    'actions.share.careLevel': 'Care level',
    'actions.share.risk': 'Risk',
    'actions.share.disclaimer':
      'Decision support — not a medical diagnosis. Per India Telemedicine Practice Guidelines 2020.',
    'actions.share.whatsapp': 'Share to WhatsApp',
    'actions.share.whatsappOpened': 'Opened WhatsApp',
    'actions.share.native': 'Share',
    'actions.share.nativeAria': 'Share verdict via system share sheet',
    'actions.share.shared': 'Shared successfully',
    'actions.share.failed': 'Sharing failed — try WhatsApp instead',

    /* Toast confirmations across the app */
    'consent.toast.saved': 'Privacy choices saved',
    'consent.toast.scopesGranted': 'scopes granted',
    'family.toast.added': 'Family profile added',
    'family.toast.updated': 'Profile updated',
    'family.toast.removed': 'Profile removed',
    'family.toast.switched': 'Active profile switched',

    /* Settings landing page */
    'settings.kicker': 'Account',
    'settings.title': 'Settings',
    'settings.subtitle':
      'Manage your family profiles + privacy + data controls. Everything stays on this device unless you sign in.',
    'settings.footer':
      'Per DPDP Act 2023: every consent is specific, informed, and withdrawable. Right to erasure within 72h.',
    'settings.family.title': 'Family profiles',
    'settings.family.body':
      'Up to 8 patient profiles per account. Switch before triaging on behalf of a parent or child.',
    'settings.privacy.title': 'Privacy & data',
    'settings.privacy.body':
      'Granular consent toggles + the right-to-delete button. DPDP §6 + §13 compliant.',
  },

  /* Draft Hindi — review with native speaker before Plan 4.0 final cut */
  hi: {
    'nav.signIn': 'साइन इन',
    'nav.signOut': 'साइन आउट',
    'nav.triage': 'ट्रायाज',
    'nav.history': 'इतिहास',
    'nav.cockpit': 'कॉकपिट',
    'nav.privacy': 'गोपनीयता और डेटा',
    'nav.outbreak': 'प्रकोप निगरानी',
    'nav.settings': 'सेटिंग्स',

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
    'triage.activeProfile': '{name} की ओर से ट्रायाज · आयु {age}',

    'verdict.homeCare.subtitle': 'घर पर देखभाल',
    'verdict.clinicVisit.subtitle': 'क्लिनिक जाएँ',
    'verdict.emergencyRoom.subtitle': 'तुरंत अस्पताल जाएँ',
    'verdict.sources': 'स्रोत',
    'verdict.notDiagnosis': 'निदान नहीं — केवल सहायता।',
    'verdict.listen': 'सुनें',
    'verdict.stop': 'रोकें',

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

    /* Plan 6.1 — Symptom Cinema 3D body map */
    'bodymap.title': 'लक्षण सिनेमा · 3डी शरीर',
    'bodymap.subtitleHint': 'जहाँ दर्द है, वहाँ छुएँ। अधिकतम {max} जगह।',
    'bodymap.openButton': '3डी शरीर मानचित्र खोलें',
    'bodymap.openButtonTitle': '3डी शरीर पर जहाँ दर्द है, वहाँ छुएँ',
    'bodymap.useChat': 'इसके बजाय चैट का उपयोग करें',
    'bodymap.placedOf': '{n} में से {max} रखे गए',
    'bodymap.clear': 'साफ़ करें',
    'bodymap.clearAria': 'सभी पिन हटाएँ',
    'bodymap.hint': 'घुमाने के लिए खींचें। चिह्नित करने के लिए शरीर के किसी भी हिस्से पर छुएँ।',
    'bodymap.submitOne': '1 पिन भेजें',
    'bodymap.submitMany': '{n} पिन भेजें',
    'bodymap.submitAria': 'ट्रायाज के लिए पिन भेजें',
    'bodymap.reviewing': 'समीक्षा हो रही है…',
    'bodymap.startOver': 'फिर से शुरू करें',
    'bodymap.continueChat': 'चैट में जारी रखें',
    'bodymap.fallbackNoWebgl':
      'आपका ब्राउज़र 3डी शरीर मानचित्र का समर्थन नहीं करता। चैट ठीक से काम करती है — नीचे अपने लक्षण बताएँ।',
    'bodymap.fallbackReducedMotion':
      'रिड्यूस्ड-मोशन चालू है, इसलिए 3डी शरीर रुक गया है। चैट का उपयोग करें या 3डी देखने के लिए OS में रिड्यूस्ड-मोशन बंद करें।',
    'bodymap.checkingDevice': 'डिवाइस क्षमताएँ जाँच रहे हैं…',
    'bodymap.redirecting': 'चैट ट्रायाज पर भेज रहे हैं…',
    'bodymap.noscriptFallback':
      '3डी शरीर मानचित्र के लिए JavaScript चाहिए। इसके बजाय चैट ट्रायाज का उपयोग करें।',
    'bodymap.backToChat': 'चैट ट्रायाज पर वापस',

    /* PainPanel — pin authoring sheet */
    'pain.pinNumber': '{n} में से पिन {max}',
    'pain.intensityTitle': 'कितना तेज़?',
    'pain.intensityHelp': '1 हल्का · 5 मध्यम · 10 सबसे ज़्यादा',
    'pain.intensityAria': 'दर्द की तीव्रता, 1 से 10',
    'pain.qualityTitle': 'कैसा महसूस होता है?',
    'pain.qualityHelp': '(कम से कम 1 चुनें)',
    'pain.quality.burning': 'जलन',
    'pain.quality.stabbing': 'चुभन',
    'pain.quality.throbbing': 'धड़कन',
    'pain.quality.pressure': 'दबाव',
    'pain.quality.cramping': 'ऐंठन',
    'pain.durationTitle': 'कब से है?',
    'pain.duration.just_started': 'अभी शुरू हुआ',
    'pain.duration.few_hours': 'कुछ घंटों से',
    'pain.duration.since_yesterday': 'कल से',
    'pain.duration.days_or_weeks': 'कई दिनों / हफ्तों से',
    'pain.aggravatorsTitle': 'क्या इसे बदतर बनाता है?',
    'pain.agg.moving': 'हिलना',
    'pain.agg.eating': 'खाना',
    'pain.agg.breathing': 'साँस लेना',
    'pain.agg.pressing': 'दबाना',
    'pain.agg.standing_up': 'खड़े होना',
    'pain.agg.nothing': 'कुछ नहीं',
    'pain.savePinPrompt': 'सहेजने के लिए कम से कम 1 गुण चुनें',
    'pain.savePin': 'पिन सहेजें',
    'pain.saveAria': 'पिन सहेजें और शरीर दृश्य पर लौटें',
    'pain.closeAria': 'दर्द पैनल बंद करें',
    'pain.dialogAria': '{region} में दर्द का वर्णन करें',

    /* Plan 6.2 — RiskOrb */
    'riskorb.aria': '{careLevel} · जोखिम स्कोर {score}/100 · प्रवृत्ति {trajectory}',
    'risk.trajectory.rapidly_worsening': 'तेज़ी से बिगड़ रहा है',
    'risk.trajectory.worsening': 'बिगड़ रहा है',
    'risk.trajectory.stable': 'स्थिर',
    'risk.trajectory.improving': 'सुधर रहा है',
    'risk.trajectory.insufficient_data': 'नया मरीज़',

    /* Plan 6.2 — VoiceWaveform */
    'voice.recordingPill': 'रिकॉर्डिंग — रोकने के लिए छुएँ',
    'voice.recordingAria': 'आवाज़ रिकॉर्डिंग चल रही है',

    /* Plan 6.2 — NeuralNet */
    'neural.analyzing': 'आपके लक्षणों का विश्लेषण…',
    'neural.honestCaveat': 'केवल विज़ुअल · असली मॉडल ग्राफ़ नहीं',
    'neural.aria': 'AI आपके लक्षणों का विश्लेषण कर रहा है',

    /* Plan 6.6 Phase B — DPDP consent + privacy */
    'consent.kicker': 'गोपनीयता और सहमति',
    'consent.title': 'चुनें कि ASHA-AI आपके डेटा के साथ क्या कर सकता है',
    'consent.intro':
      'भारत के DPDP अधिनियम 2023 के अनुसार, हम स्वास्थ्य डेटा संसाधित करने से पहले विशिष्ट सहमति माँगते हैं। आप इन्हें बाद में गोपनीयता और डेटा में बदल सकते हैं।',
    'consent.required': 'आवश्यक',
    'consent.accept': 'सहेजें और जारी रखें',
    'consent.acceptAria': 'सहमति विकल्प सहेजें और जारी रखें',
    'consent.decline': 'अभी नहीं',
    'consent.closeAria': 'सहमति शीट बंद करें',
    'consent.legalPending':
      'यह नीति कानूनी समीक्षा के लिए लंबित है। नीचे दिए गए तकनीकी नियंत्रण सक्रिय हैं; शब्द-रचना लॉन्च से पहले परिष्कृत हो सकती है।',
    'consent.readFullPolicy': 'पूरी गोपनीयता नीति पढ़ें',
    'consent.disclaimer':
      'सहायता मात्र — चिकित्सीय निदान नहीं। भारत टेलीमेडिसिन प्रैक्टिस गाइडलाइन्स 2020।',
    'consent.error.networkBackup':
      'इस डिवाइस पर सहेज लिया। सर्वर उपलब्ध होते ही सिंक करेंगे।',
    'consent.error.unknown': 'कुछ गड़बड़ हुई। एक बार और कोशिश करें।',

    'consent.scope.triage_processing.title': 'ट्रायाज के लिए मेरे लक्षण संसाधित करें',
    'consent.scope.triage_processing.body':
      'ASHA-AI का उपयोग करने के लिए आवश्यक। हम आपके टेक्स्ट/आवाज़/शरीर-मानचित्र इनपुट से लक्षण निकालकर तीन देखभाल स्तरों में से एक सुझाते हैं।',
    'consent.scope.session_history.title': 'मेरे सत्र सहेजें',
    'consent.scope.session_history.body':
      'ताकि आप इस डिवाइस पर /history से पिछले ट्रायाज की समीक्षा कर सकें।',
    'consent.scope.longitudinal_memory.title': 'पिछली यात्राएँ याद रखें',
    'consent.scope.longitudinal_memory.body':
      'जब आप फिर ट्रायाज करें, AI प्रासंगिक पिछली यात्राओं को याद करता है ताकि बेहतर सुझाव दे सके। हैश किए गए patient_id में संग्रहीत, आपके फ़ोन नंबर के साथ नहीं।',
    'consent.scope.abdm_health_locker.title': 'मेरे ABHA हेल्थ लॉकर में निर्णय भेजें',
    'consent.scope.abdm_health_locker.body':
      'जब ABDM एकीकरण आएगा, आपके ट्रायाज निर्णय आपके ABHA हेल्थ लॉकर में सिंक हो सकते हैं ताकि कोई भी ABHA-लिंक्ड डॉक्टर देख सके।',
    'consent.scope.analytics_aggregate.title': 'अनाम जिला-स्तर विश्लेषण',
    'consent.scope.analytics_aggregate.body':
      'प्रकोप का पता लगाने में मदद करें: आपका लक्षण + अनुमानित जिला अनाम जिला-स्तर पैटर्न में योगदान देता है। कोई फ़ोन, नाम, या सटीक स्थान नहीं।',
    'consent.scope.research_pseudonymized.title': 'छद्म-नाम वाला अनुसंधान डेटासेट',
    'consent.scope.research_pseudonymized.body':
      'वैकल्पिक: शैक्षणिक + ICMR सहयोग में योगदान दें। छद्म-नाम के साथ — शोधकर्ताओं के साथ कोई PII साझा नहीं।',

    'privacy.kicker': 'सेटिंग्स',
    'privacy.title': 'गोपनीयता और डेटा',
    'privacy.subtitle':
      'नियंत्रित करें कि ASHA-AI आपके डेटा के साथ क्या करता है। DPDP अधिनियम 2023 के अनुसार, हर सहमति विशिष्ट, सूचित और वापस ली जा सकती है।',
    'privacy.scopesTitle': 'आपकी सहमति की स्थिति',
    'privacy.policyVersion': 'नीति संस्करण',
    'privacy.lastGranted': 'अंतिम बार दी गई',
    'privacy.toggleOn': 'सक्षम',
    'privacy.toggleOff': 'अक्षम',

    'privacy.deleteTitle': 'मेरा सारा डेटा मिटाएँ',
    'privacy.deleteBody':
      'DPDP §13 के अनुसार, आपको मिटाने का अधिकार है। सॉफ्ट-डिलीट तत्काल है; हार्ड-डिलीट 72 घंटों में पूरा होता है और आपके खाते से जुड़ी हर पंक्ति हटाता है।',
    'privacy.deleteCta': 'मेरा सारा डेटा मिटाएँ',
    'privacy.deleteSignInRequired':
      'अपने खाते का डेटा मिटाने के लिए साइन इन करें। अनाम स्थानीय सत्र आपकी ब्राउज़र सेटिंग्स से साफ़ किए जा सकते हैं।',
    'privacy.deleteConfirmIntro':
      'यह पूर्ववत नहीं किया जा सकता। आपके खाते से जुड़े हर ट्रायाज सत्र, आवाज़ रिकॉर्डिंग, सहमति रिकॉर्ड, और ऑडिट लॉग 72 घंटों में हार्ड-डिलीशन के लिए कतारबद्ध होंगे।',
    'privacy.deleteConfirmLabel': 'पुष्टि के लिए {phrase} टाइप करें',
    'privacy.deleteConfirmButton': 'मुझे यक़ीन है — मिटाएँ',
    'privacy.deleteWrongPhrase':
      'पुष्टि वाक्यांश ठीक वैसे ही टाइप करना होगा। फिर कोशिश करें।',
    'privacy.deleteSuccess':
      'आपका डेटा हार्ड-डिलीशन के लिए कतारबद्ध है। अंतिम निष्कासन तक:',
    'privacy.deletePending': 'मिटाना जारी है',
    'privacy.deletePendingBody':
      'आपका डेटा सॉफ्ट-डिलीट हो गया है। हार्ड-डिलीट इस तक पूरा होगा:',
    'privacy.cancel': 'रद्द करें',
    'privacy.dpdpFooter':
      'भारत DPDP अधिनियम 2023 §6 (सहमति) + §13 (मिटाने का अधिकार)। हर सहमति + मिटाने की घटना का ऑडिट लॉग DPDP §28 के अनुसार रखा जाता है।',

    /* Plan 7.x — Plain Diagnosis */
    'plainDiagnosis.on': 'सरल भाषा',
    'plainDiagnosis.off': 'सरल भाषा',
    'plainDiagnosis.toggleOn': 'सरल भाषा में दिखाएँ (तकनीकी शब्द हटाएँ)',
    'plainDiagnosis.toggleOff': 'मूल शब्द दिखाएँ',

    /* Plan 7.x — Family Health Graph */
    'family.title': 'परिवार',
    'family.subtitle':
      'एक खाता, कई परिवारजन। किसी और के लिए ट्रायाज करने से पहले प्रोफ़ाइल बदलें। सभी प्रोफ़ाइल इस डिवाइस पर रहती हैं — कभी साझा नहीं।',
    'family.you': 'आप',
    'family.addPerson': 'व्यक्ति जोड़ें',
    'family.editPerson': 'व्यक्ति संपादित करें',
    'family.manage': 'सब प्रबंधित करें',
    'family.cap': 'अधिकतम 8',
    'family.optional': 'वैकल्पिक',
    'family.save': 'सहेजें',
    'family.edit': 'संपादित करें',
    'family.remove': 'हटाएँ',
    'family.removeConfirm': 'इस व्यक्ति को परिवार सूची से हटाएँ?',
    'family.signInRequired': 'परिवार प्रोफ़ाइल प्रबंधित करने के लिए साइन इन करें।',
    'family.errorName': 'कृपया पहला नाम दर्ज करें।',
    'family.errorAge': 'आयु 0 और 120 के बीच होनी चाहिए।',
    'family.switcherAria': 'सक्रिय परिवारजन बदलें',
    'family.privacyFooter':
      'इस डिवाइस पर स्थानीय रूप से संग्रहीत। DPDP §6 के अनुसार केवल पहला नाम + आयु + लिंग + संबंध रखते हैं — कोई पूरा नाम, पता, ABHA ID, या फ़ोटो नहीं।',
    'family.field.name': 'पहला नाम',
    'family.field.age': 'आयु',
    'family.field.sex': 'लिंग',
    'family.field.relationship': 'संबंध',
    'family.field.comorbidities': 'दीर्घकालिक स्थितियाँ',
    'family.sex.f': 'महिला',
    'family.sex.m': 'पुरुष',
    'family.sex.other': 'अन्य / नहीं बताना चाहते',
    'family.relationship.self': 'स्वयं',
    'family.relationship.spouse': 'जीवनसाथी',
    'family.relationship.parent': 'माता-पिता',
    'family.relationship.child': 'बच्चा',
    'family.relationship.sibling': 'भाई-बहन',
    'family.relationship.grandparent': 'दादा-दादी / नाना-नानी',
    'family.relationship.grandchild': 'पोता-पोती',
    'family.relationship.in_law': 'सास-ससुर',
    'family.relationship.other': 'अन्य',

    /* Plan 7.x — Chronicle Mode */
    'chronicle.title': 'आज कैसे हैं?',
    'chronicle.daily': 'रोज़ाना जाँच',
    'chronicle.prompt': 'कल के मुक़ाबले — बेहतर, वैसे ही, या ख़राब?',
    'chronicle.status.better': 'बेहतर',
    'chronicle.status.same': 'वैसे ही',
    'chronicle.status.worse': 'ख़राब',
    'chronicle.noteOptional': 'एक छोटी टिप्पणी जोड़ें (वैकल्पिक)',
    'chronicle.notePlaceholder': 'जैसे: बुखार कम हुआ, खाँसी अब भी',
    'chronicle.skipNote': 'टिप्पणी छोड़ें',
    'chronicle.save': 'सहेजें',
    'chronicle.thankYou': 'सहेजा गया — आज को आपने मार्क किया',
    'chronicle.checkInsCount': 'जाँच',

    /* Plan 6.3 — OutbreakGlobe */
    'outbreak.kicker': 'सार्वजनिक स्वास्थ्य',
    'outbreak.title': 'प्रकोप निगरानी',
    'outbreak.subtitle':
      'जिले जहाँ पिछले 72 घंटों में 15+ मरीज़ों ने समान लक्षण-समूह बताए। अनाम जिला-स्तर संकेत — कोई व्यक्तिगत रिकॉर्ड नहीं।',
    'outbreak.doctorOnly': 'केवल डॉक्टर',
    'outbreak.demoSeed': 'डेमो डेटा — बैकएंड क्लस्टर एंडपॉइंट लंबित',
    'outbreak.backToCockpit': 'कॉकपिट पर वापस',
    'outbreak.globeAria': 'भारत भर में सक्रिय प्रकोप क्लस्टर्स का 3D ग्लोब',
    'outbreak.mapAria': 'सक्रिय प्रकोप क्लस्टर्स का 2D भौगोलिक मानचित्र',
    'outbreak.listAria': 'सक्रिय प्रकोप क्लस्टर्स की सूची',
    'outbreak.viewToggleAria': '3D ग्लोब और 2D मानचित्र दृश्य के बीच स्विच करें',
    'outbreak.viewGlobe': '3D ग्लोब',
    'outbreak.viewMap': '2D मानचित्र',
    'outbreak.activeClusters': 'सक्रिय क्लस्टर',
    'outbreak.totalCases': 'मामले',
    'outbreak.dominantSymptoms': 'प्रमुख लक्षण',
    'outbreak.field.kind': 'प्रकार',
    'outbreak.field.cases': 'मामले',
    'outbreak.field.confidence': 'HDBSCAN विश्वास',
    'outbreak.field.firstSeen': 'पहली बार देखा',
    'outbreak.privacyFooter':
      'क्लस्टर एकत्रीकरण 500m ग्रिड-स्नैपिंग + आयु बकेटिंग का उपयोग करता है। कोई फ़ोन, नाम, या सटीक स्थान संग्रहीत या प्रदर्शित नहीं। DPDP §6 के अनुसार।',

    /* Plan 6.5 step 10 — Image / Vision triage */
    'vision.kicker': 'छवि ट्रायाज',
    'vision.title': 'ट्रायाज के लिए फ़ोटो भेजें',
    'vision.openButton': 'ट्रायाज के लिए छवि अपलोड करें',
    'vision.openButtonTitle': 'चकत्ता, घाव, या दवा की बोतल की फ़ोटो',
    'vision.dialogAria': 'ट्रायाज के लिए छवि अपलोड करें',
    'vision.dropHint': 'यहाँ छवि छोड़ें, या चुनने के लिए छुएँ',
    'vision.fileTypes': 'JPEG, PNG, या WebP · अधिकतम 8 MB',
    'vision.useCamera': 'कैमरा का उपयोग करें',
    'vision.contextLabel': 'छवि में क्या है?',
    'vision.contextPlaceholder': 'जैसे: बायीं बाँह पर चकत्ता, कल से शुरू',
    'vision.optional': 'वैकल्पिक',
    'vision.previewAlt': 'चयनित छवि पूर्वावलोकन',
    'vision.previewBanner':
      'विज़ुअल मॉडल प्रशिक्षण में है। अभी यह सावधान डिफ़ॉल्ट सुझाव देता है — आज के लिए चैट या 3D शरीर-मानचित्र सबसे मज़बूत ट्रायाज है।',
    'vision.changeImage': 'छवि बदलें',
    'vision.submit': 'ट्रायाज पाएँ',
    'vision.analyzing': 'विश्लेषण…',
    'vision.error.too_large': 'छवि बहुत बड़ी है। अधिकतम 8 MB।',
    'vision.error.wrong_type': 'असमर्थित छवि प्रकार। JPEG, PNG, या WebP का उपयोग करें।',
    'vision.error.http': 'सर्वर ने त्रुटि लौटाई। एक क्षण में फिर कोशिश करें।',
    'vision.error.unknown': 'कुछ गड़बड़ हुई। एक बार और कोशिश करें।',

    /* Plan 6.6 Phase H — verdict actions */
    'actions.aria': 'इस सुझाव के लिए त्वरित क्रियाएँ',
    'actions.clinic.find': 'पास का क्लिनिक ढूँढें',
    'actions.clinic.locating': 'खोज रहे हैं…',
    'actions.clinic.opened': 'Google Maps खोला',
    'actions.clinic.openedWithoutLocation': 'Google Maps खोला (आपके सटीक स्थान के बिना)',
    'actions.clinic.locationDenied':
      'स्थान अनुमति अस्वीकार की गई — निर्देशांक के बिना खोज खोली।',
    'actions.clinic.locationFailed':
      'आपका स्थान नहीं मिल सका — निर्देशांक के बिना खोज खोली।',
    'actions.share.intro': 'से ट्रायाज परिणाम:',
    'actions.share.careLevel': 'देखभाल स्तर',
    'actions.share.risk': 'जोखिम',
    'actions.share.disclaimer':
      'सहायता — निदान नहीं। भारत टेलीमेडिसिन प्रैक्टिस गाइडलाइन्स 2020 के अनुसार।',
    'actions.share.whatsapp': 'WhatsApp पर साझा करें',
    'actions.share.whatsappOpened': 'WhatsApp खोला',
    'actions.share.native': 'साझा करें',
    'actions.share.nativeAria': 'सिस्टम शेयर शीट के माध्यम से सुझाव साझा करें',
    'actions.share.shared': 'सफलतापूर्वक साझा किया',
    'actions.share.failed': 'साझा करना विफल — इसके बजाय WhatsApp आज़माएँ',

    'consent.toast.saved': 'गोपनीयता विकल्प सहेजे गए',
    'consent.toast.scopesGranted': 'अनुमतियाँ दीं',
    'family.toast.added': 'परिवार प्रोफ़ाइल जोड़ी',
    'family.toast.updated': 'प्रोफ़ाइल अपडेट की',
    'family.toast.removed': 'प्रोफ़ाइल हटाई',
    'family.toast.switched': 'सक्रिय प्रोफ़ाइल बदली',

    'settings.kicker': 'खाता',
    'settings.title': 'सेटिंग्स',
    'settings.subtitle':
      'अपनी परिवार प्रोफ़ाइल + गोपनीयता + डेटा नियंत्रण प्रबंधित करें। साइन इन न करने तक सब कुछ इस डिवाइस पर रहता है।',
    'settings.footer':
      'DPDP अधिनियम 2023 के अनुसार: हर सहमति विशिष्ट, सूचित और वापस ली जा सकती है। 72 घंटों में मिटाने का अधिकार।',
    'settings.family.title': 'परिवार प्रोफ़ाइल',
    'settings.family.body':
      'प्रति खाता 8 प्रोफ़ाइल तक। माता-पिता या बच्चे की ओर से ट्रायाज करने से पहले बदलें।',
    'settings.privacy.title': 'गोपनीयता और डेटा',
    'settings.privacy.body':
      'विस्तृत सहमति टॉगल + मिटाने का अधिकार बटन। DPDP §6 + §13 अनुपालन।',
  },

  /* Draft Kannada — review with native speaker before final submission.
   * Care-level strings stay ENGLISH per the API-contract rule. */
  kn: {
    'nav.signIn': 'ಸೈನ್ ಇನ್',
    'nav.signOut': 'ಸೈನ್ ಔಟ್',
    'nav.triage': 'ಟ್ರಿಯಾಜ್',
    'nav.history': 'ಇತಿಹಾಸ',
    'nav.cockpit': 'ಕಾಕ್‌ಪಿಟ್',
    'nav.privacy': 'ಗೌಪ್ಯತೆ ಮತ್ತು ಡೇಟಾ',
    'nav.outbreak': 'ಪ್ರಕೋಪ ಮೇಲ್ವಿಚಾರಣೆ',
    'nav.settings': 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು',

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
    'triage.activeProfile': '{name} ಪರವಾಗಿ ಟ್ರಿಯಾಜ್ · ವಯಸ್ಸು {age}',

    'verdict.homeCare.subtitle': 'ಮನೆಯಲ್ಲಿ ಆರೈಕೆ',
    'verdict.clinicVisit.subtitle': 'ಕ್ಲಿನಿಕ್‌ಗೆ ಭೇಟಿ',
    'verdict.emergencyRoom.subtitle': 'ತಕ್ಷಣ ಆಸ್ಪತ್ರೆಗೆ',
    'verdict.sources': 'ಮೂಲಗಳು',
    'verdict.notDiagnosis': 'ರೋಗನಿರ್ಣಯ ಅಲ್ಲ — ಕೇವಲ ಸಹಾಯ.',
    'verdict.listen': 'ಕೇಳಿ',
    'verdict.stop': 'ನಿಲ್ಲಿಸಿ',

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

    /* Plan 6.1 — Symptom Cinema 3D body map */
    'bodymap.title': 'ಲಕ್ಷಣ ಸಿನಿಮಾ · 3D ದೇಹ',
    'bodymap.subtitleHint': 'ನೋವಿರುವ ಕಡೆ ಮುಟ್ಟಿ. ಗರಿಷ್ಠ {max} ಸ್ಥಳಗಳು.',
    'bodymap.openButton': '3D ದೇಹ ನಕ್ಷೆ ತೆರೆಯಿರಿ',
    'bodymap.openButtonTitle': '3D ದೇಹದ ಮೇಲೆ ನೋವಿರುವ ಕಡೆ ಮುಟ್ಟಿ',
    'bodymap.useChat': 'ಬದಲಿಗೆ ಚಾಟ್ ಬಳಸಿ',
    'bodymap.placedOf': '{max} ರಲ್ಲಿ {n} ಇರಿಸಲಾಗಿದೆ',
    'bodymap.clear': 'ಅಳಿಸಿ',
    'bodymap.clearAria': 'ಎಲ್ಲಾ ಪಿನ್‌ಗಳನ್ನು ಅಳಿಸಿ',
    'bodymap.hint': 'ತಿರುಗಿಸಲು ಎಳೆಯಿರಿ. ಗುರುತಿಸಲು ಯಾವುದೇ ದೇಹ ಭಾಗವನ್ನು ಮುಟ್ಟಿ.',
    'bodymap.submitOne': '1 ಪಿನ್ ಕಳುಹಿಸಿ',
    'bodymap.submitMany': '{n} ಪಿನ್‌ಗಳನ್ನು ಕಳುಹಿಸಿ',
    'bodymap.submitAria': 'ಟ್ರಿಯಾಜ್‌ಗಾಗಿ ಪಿನ್‌ಗಳನ್ನು ಕಳುಹಿಸಿ',
    'bodymap.reviewing': 'ಪರಿಶೀಲಿಸುತ್ತಿದೆ…',
    'bodymap.startOver': 'ಮತ್ತೆ ಪ್ರಾರಂಭಿಸಿ',
    'bodymap.continueChat': 'ಚಾಟ್‌ನಲ್ಲಿ ಮುಂದುವರಿಸಿ',
    'bodymap.fallbackNoWebgl':
      'ನಿಮ್ಮ ಬ್ರೌಸರ್ 3D ದೇಹ ನಕ್ಷೆಯನ್ನು ಬೆಂಬಲಿಸುವುದಿಲ್ಲ. ಚಾಟ್ ಸರಿಯಾಗಿ ಕೆಲಸ ಮಾಡುತ್ತದೆ — ಕೆಳಗೆ ನಿಮ್ಮ ಲಕ್ಷಣಗಳನ್ನು ವಿವರಿಸಿ.',
    'bodymap.fallbackReducedMotion':
      'ರಿಡ್ಯೂಸ್ಡ್-ಮೋಷನ್ ಆನ್ ಆಗಿದೆ, ಆದ್ದರಿಂದ 3D ದೇಹ ವಿರಾಮಗೊಂಡಿದೆ. ಚಾಟ್ ಬಳಸಿ ಅಥವಾ 3D ನೋಡಲು OS ನಲ್ಲಿ ರಿಡ್ಯೂಸ್ಡ್-ಮೋಷನ್ ಆಫ್ ಮಾಡಿ.',
    'bodymap.checkingDevice': 'ಸಾಧನ ಸಾಮರ್ಥ್ಯಗಳನ್ನು ಪರಿಶೀಲಿಸುತ್ತಿದೆ…',
    'bodymap.redirecting': 'ಚಾಟ್ ಟ್ರಿಯಾಜ್‌ಗೆ ಮರುನಿರ್ದೇಶಿಸುತ್ತಿದೆ…',
    'bodymap.noscriptFallback':
      '3D ದೇಹ ನಕ್ಷೆಗೆ JavaScript ಬೇಕು. ಬದಲಿಗೆ ಚಾಟ್ ಟ್ರಿಯಾಜ್ ಬಳಸಿ.',
    'bodymap.backToChat': 'ಚಾಟ್ ಟ್ರಿಯಾಜ್‌ಗೆ ಹಿಂದಿರುಗಿ',

    /* PainPanel — pin authoring sheet */
    'pain.pinNumber': '{max} ರಲ್ಲಿ ಪಿನ್ {n}',
    'pain.intensityTitle': 'ಎಷ್ಟು ತೀವ್ರ?',
    'pain.intensityHelp': '1 ಸೌಮ್ಯ · 5 ಮಧ್ಯಮ · 10 ಅತಿ ಹೆಚ್ಚು',
    'pain.intensityAria': 'ನೋವಿನ ತೀವ್ರತೆ, 1 ರಿಂದ 10',
    'pain.qualityTitle': 'ಹೇಗೆ ಅನಿಸುತ್ತದೆ?',
    'pain.qualityHelp': '(ಕನಿಷ್ಠ 1 ಆಯ್ಕೆಮಾಡಿ)',
    'pain.quality.burning': 'ಉರಿ',
    'pain.quality.stabbing': 'ಚುಚ್ಚು',
    'pain.quality.throbbing': 'ಬಡಿತ',
    'pain.quality.pressure': 'ಒತ್ತಡ',
    'pain.quality.cramping': 'ಸೆಳೆತ',
    'pain.durationTitle': 'ಎಷ್ಟು ಸಮಯದಿಂದ?',
    'pain.duration.just_started': 'ಈಗ ಪ್ರಾರಂಭವಾಯಿತು',
    'pain.duration.few_hours': 'ಕೆಲವು ಗಂಟೆಗಳಿಂದ',
    'pain.duration.since_yesterday': 'ನಿನ್ನೆಯಿಂದ',
    'pain.duration.days_or_weeks': 'ಹಲವಾರು ದಿನಗಳು / ವಾರಗಳು',
    'pain.aggravatorsTitle': 'ಯಾವುದು ಇದನ್ನು ಕೆಟ್ಟದಾಗಿ ಮಾಡುತ್ತದೆ?',
    'pain.agg.moving': 'ಚಲಿಸುವುದು',
    'pain.agg.eating': 'ತಿನ್ನುವುದು',
    'pain.agg.breathing': 'ಉಸಿರಾಡುವುದು',
    'pain.agg.pressing': 'ಒತ್ತುವುದು',
    'pain.agg.standing_up': 'ಎದ್ದು ನಿಲ್ಲುವುದು',
    'pain.agg.nothing': 'ಏನೂ ಇಲ್ಲ',
    'pain.savePinPrompt': 'ಉಳಿಸಲು ಕನಿಷ್ಠ 1 ಗುಣವನ್ನು ಆಯ್ಕೆಮಾಡಿ',
    'pain.savePin': 'ಪಿನ್ ಉಳಿಸಿ',
    'pain.saveAria': 'ಪಿನ್ ಉಳಿಸಿ ಮತ್ತು ದೇಹ ನೋಟಕ್ಕೆ ಹಿಂದಿರುಗಿ',
    'pain.closeAria': 'ನೋವು ಫಲಕವನ್ನು ಮುಚ್ಚಿ',
    'pain.dialogAria': '{region} ನಲ್ಲಿ ನೋವನ್ನು ವಿವರಿಸಿ',

    /* Plan 6.2 — RiskOrb */
    'riskorb.aria': '{careLevel} · ಅಪಾಯ ಸ್ಕೋರ್ {score}/100 · ಪ್ರವೃತ್ತಿ {trajectory}',
    'risk.trajectory.rapidly_worsening': 'ವೇಗವಾಗಿ ಹದಗೆಡುತ್ತಿದೆ',
    'risk.trajectory.worsening': 'ಹದಗೆಡುತ್ತಿದೆ',
    'risk.trajectory.stable': 'ಸ್ಥಿರ',
    'risk.trajectory.improving': 'ಸುಧಾರಿಸುತ್ತಿದೆ',
    'risk.trajectory.insufficient_data': 'ಹೊಸ ರೋಗಿ',

    /* Plan 6.2 — VoiceWaveform */
    'voice.recordingPill': 'ರೆಕಾರ್ಡಿಂಗ್ — ನಿಲ್ಲಿಸಲು ಮುಟ್ಟಿ',
    'voice.recordingAria': 'ಧ್ವನಿ ರೆಕಾರ್ಡಿಂಗ್ ನಡೆಯುತ್ತಿದೆ',

    /* Plan 6.2 — NeuralNet */
    'neural.analyzing': 'ನಿಮ್ಮ ಲಕ್ಷಣಗಳನ್ನು ವಿಶ್ಲೇಷಿಸುತ್ತಿದೆ…',
    'neural.honestCaveat': 'ಕೇವಲ ದೃಶ್ಯ · ನಿಜವಾದ ಮಾದರಿ ಗ್ರಾಫ್ ಅಲ್ಲ',
    'neural.aria': 'AI ನಿಮ್ಮ ಲಕ್ಷಣಗಳನ್ನು ವಿಶ್ಲೇಷಿಸುತ್ತಿದೆ',

    /* Plan 6.6 Phase B — DPDP consent + privacy */
    'consent.kicker': 'ಗೌಪ್ಯತೆ ಮತ್ತು ಸಮ್ಮತಿ',
    'consent.title': 'ASHA-AI ನಿಮ್ಮ ಡೇಟಾದೊಂದಿಗೆ ಏನು ಮಾಡಬಹುದು ಎಂಬುದನ್ನು ಆಯ್ಕೆಮಾಡಿ',
    'consent.intro':
      'ಭಾರತದ DPDP ಕಾಯಿದೆ 2023 ಪ್ರಕಾರ, ಆರೋಗ್ಯ ಡೇಟಾವನ್ನು ಪ್ರಕ್ರಿಯೆಗೊಳಿಸುವ ಮೊದಲು ನಾವು ನಿರ್ದಿಷ್ಟ ಸಮ್ಮತಿಯನ್ನು ಕೇಳುತ್ತೇವೆ. ಗೌಪ್ಯತೆ ಮತ್ತು ಡೇಟಾದಲ್ಲಿ ನೀವು ಇವುಗಳನ್ನು ನಂತರ ಬದಲಾಯಿಸಬಹುದು.',
    'consent.required': 'ಅಗತ್ಯ',
    'consent.accept': 'ಉಳಿಸಿ ಮತ್ತು ಮುಂದುವರಿಸಿ',
    'consent.acceptAria': 'ಸಮ್ಮತಿ ಆಯ್ಕೆಗಳನ್ನು ಉಳಿಸಿ ಮುಂದುವರಿಸಿ',
    'consent.decline': 'ಈಗಲ್ಲ',
    'consent.closeAria': 'ಸಮ್ಮತಿ ಶೀಟ್ ಮುಚ್ಚಿ',
    'consent.legalPending':
      'ಈ ನೀತಿ ಕಾನೂನು ಪರಿಶೀಲನೆಗೆ ಬಾಕಿಯಿದೆ. ಕೆಳಗಿನ ತಾಂತ್ರಿಕ ನಿಯಂತ್ರಣಗಳು ಲೈವ್ ಆಗಿವೆ; ಪದಗಳನ್ನು ಲಾಂಚ್‌ಗೆ ಮೊದಲು ಪರಿಷ್ಕರಿಸಬಹುದು.',
    'consent.readFullPolicy': 'ಪೂರ್ಣ ಗೌಪ್ಯತಾ ನೀತಿಯನ್ನು ಓದಿ',
    'consent.disclaimer':
      'ಸಹಾಯ ಮಾತ್ರ — ವೈದ್ಯಕೀಯ ರೋಗನಿರ್ಣಯ ಅಲ್ಲ. ಭಾರತ ಟೆಲಿಮೆಡಿಸಿನ್ ಪ್ರಾಕ್ಟೀಸ್ ಮಾರ್ಗಸೂಚಿಗಳು 2020.',
    'consent.error.networkBackup':
      'ಈ ಸಾಧನದಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ. ಸರ್ವರ್ ಲಭ್ಯವಾದಾಗ ಸಿಂಕ್ ಮಾಡುತ್ತೇವೆ.',
    'consent.error.unknown': 'ಏನೋ ತಪ್ಪಾಯಿತು. ಇನ್ನೊಮ್ಮೆ ಪ್ರಯತ್ನಿಸಿ.',

    'consent.scope.triage_processing.title': 'ಟ್ರಿಯಾಜ್‌ಗಾಗಿ ನನ್ನ ಲಕ್ಷಣಗಳನ್ನು ಪ್ರಕ್ರಿಯೆಗೊಳಿಸಿ',
    'consent.scope.triage_processing.body':
      'ASHA-AI ಬಳಸಲು ಅಗತ್ಯ. ನಾವು ನಿಮ್ಮ ಪಠ್ಯ/ಧ್ವನಿ/ದೇಹ-ನಕ್ಷೆ ಇನ್‌ಪುಟ್‌ನಿಂದ ಲಕ್ಷಣಗಳನ್ನು ಹೊರತೆಗೆದು ಮೂರು ಆರೈಕೆ ಹಂತಗಳಲ್ಲಿ ಒಂದನ್ನು ಸೂಚಿಸುತ್ತೇವೆ.',
    'consent.scope.session_history.title': 'ನನ್ನ ಸೆಷನ್‌ಗಳನ್ನು ಉಳಿಸಿ',
    'consent.scope.session_history.body':
      'ಇದರಿಂದ ನೀವು ಈ ಸಾಧನದಲ್ಲಿ /history ನಿಂದ ಹಿಂದಿನ ಟ್ರಿಯಾಜ್‌ಗಳನ್ನು ಪರಿಶೀಲಿಸಬಹುದು.',
    'consent.scope.longitudinal_memory.title': 'ಹಿಂದಿನ ಭೇಟಿಗಳನ್ನು ನೆನಪಿಡಿ',
    'consent.scope.longitudinal_memory.body':
      'ನೀವು ಮತ್ತೆ ಟ್ರಿಯಾಜ್ ಮಾಡಿದಾಗ, AI ಸಂಬಂಧಿತ ಹಿಂದಿನ ಭೇಟಿಗಳನ್ನು ನೆನಪಿಸಿಕೊಂಡು ಉತ್ತಮ ಸಲಹೆಗಳನ್ನು ನೀಡುತ್ತದೆ. ಹ್ಯಾಶ್ ಮಾಡಿದ patient_id ನಲ್ಲಿ ಸಂಗ್ರಹಿಸಲಾಗಿದೆ, ನಿಮ್ಮ ಫೋನ್ ಸಂಖ್ಯೆಯೊಂದಿಗೆ ಅಲ್ಲ.',
    'consent.scope.abdm_health_locker.title': 'ನನ್ನ ABHA ಹೆಲ್ತ್ ಲಾಕರ್‌ಗೆ ತೀರ್ಪುಗಳನ್ನು ಕಳುಹಿಸಿ',
    'consent.scope.abdm_health_locker.body':
      'ABDM ಏಕೀಕರಣ ಬಂದಾಗ, ನಿಮ್ಮ ಟ್ರಿಯಾಜ್ ತೀರ್ಪುಗಳು ನಿಮ್ಮ ABHA ಹೆಲ್ತ್ ಲಾಕರ್‌ಗೆ ಸಿಂಕ್ ಆಗಬಹುದು ಮತ್ತು ಯಾವುದೇ ABHA-ಲಿಂಕ್ಡ್ ವೈದ್ಯರು ಅವುಗಳನ್ನು ನೋಡಬಹುದು.',
    'consent.scope.analytics_aggregate.title': 'ಅನಾಮಧೇಯ ಜಿಲ್ಲಾ-ಮಟ್ಟದ ವಿಶ್ಲೇಷಣೆ',
    'consent.scope.analytics_aggregate.body':
      'ಪ್ರಕೋಪವನ್ನು ಪತ್ತೆಹಚ್ಚಲು ಸಹಾಯ ಮಾಡಿ: ನಿಮ್ಮ ಲಕ್ಷಣ + ಅಂದಾಜು ಜಿಲ್ಲೆ ಅನಾಮಧೇಯ ಜಿಲ್ಲಾ-ಮಟ್ಟದ ಮಾದರಿಗಳಿಗೆ ಕೊಡುಗೆ ನೀಡುತ್ತದೆ. ಯಾವುದೇ ಫೋನ್, ಹೆಸರು, ಅಥವಾ ನಿಖರ ಸ್ಥಳವಿಲ್ಲ.',
    'consent.scope.research_pseudonymized.title': 'ಗುಪ್ತ-ನಾಮ ಸಂಶೋಧನಾ ಡೇಟಾಸೆಟ್',
    'consent.scope.research_pseudonymized.body':
      'ಐಚ್ಛಿಕ: ಶೈಕ್ಷಣಿಕ + ICMR ಸಹಯೋಗಗಳಿಗೆ ಕೊಡುಗೆ ನೀಡಿ. ಗುಪ್ತ-ನಾಮದೊಂದಿಗೆ — ಸಂಶೋಧಕರೊಂದಿಗೆ ಯಾವುದೇ PII ಹಂಚಿಕೆಯಿಲ್ಲ.',

    'privacy.kicker': 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
    'privacy.title': 'ಗೌಪ್ಯತೆ ಮತ್ತು ಡೇಟಾ',
    'privacy.subtitle':
      'ASHA-AI ನಿಮ್ಮ ಡೇಟಾದೊಂದಿಗೆ ಏನು ಮಾಡುತ್ತದೆ ಎಂಬುದನ್ನು ನಿಯಂತ್ರಿಸಿ. DPDP ಕಾಯಿದೆ 2023 ಪ್ರಕಾರ, ಪ್ರತಿ ಸಮ್ಮತಿಯು ನಿರ್ದಿಷ್ಟ, ಮಾಹಿತಿಯುಕ್ತ, ಮತ್ತು ಹಿಂಪಡೆಯಬಹುದಾದದ್ದು.',
    'privacy.scopesTitle': 'ನಿಮ್ಮ ಸಮ್ಮತಿ ಸ್ಥಿತಿ',
    'privacy.policyVersion': 'ನೀತಿ ಆವೃತ್ತಿ',
    'privacy.lastGranted': 'ಕೊನೆಯ ಬಾರಿ ನೀಡಲಾಗಿದೆ',
    'privacy.toggleOn': 'ಸಕ್ರಿಯ',
    'privacy.toggleOff': 'ನಿಷ್ಕ್ರಿಯ',

    'privacy.deleteTitle': 'ನನ್ನ ಎಲ್ಲಾ ಡೇಟಾ ಅಳಿಸಿ',
    'privacy.deleteBody':
      'DPDP §13 ಪ್ರಕಾರ, ನಿಮಗೆ ಅಳಿಸುವ ಹಕ್ಕು ಇದೆ. ಸಾಫ್ಟ್-ಡಿಲೀಟ್ ತಕ್ಷಣ; ಹಾರ್ಡ್-ಡಿಲೀಟ್ 72 ಗಂಟೆಗಳಲ್ಲಿ ಪೂರ್ಣಗೊಂಡು ನಿಮ್ಮ ಖಾತೆಗೆ ಸಂಬಂಧಿಸಿದ ಪ್ರತಿ ಸಾಲನ್ನು ತೆಗೆದುಹಾಕುತ್ತದೆ.',
    'privacy.deleteCta': 'ನನ್ನ ಎಲ್ಲಾ ಡೇಟಾ ಅಳಿಸಿ',
    'privacy.deleteSignInRequired':
      'ನಿಮ್ಮ ಖಾತೆಯ ಡೇಟಾವನ್ನು ಅಳಿಸಲು ಸೈನ್ ಇನ್ ಮಾಡಿ. ಅನಾಮಧೇಯ ಸ್ಥಳೀಯ ಸೆಷನ್‌ಗಳನ್ನು ನಿಮ್ಮ ಬ್ರೌಸರ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳಿಂದ ಅಳಿಸಬಹುದು.',
    'privacy.deleteConfirmIntro':
      'ಇದನ್ನು ರದ್ದುಗೊಳಿಸಲಾಗದು. ನಿಮ್ಮ ಖಾತೆಗೆ ಸಂಬಂಧಿಸಿದ ಪ್ರತಿ ಟ್ರಿಯಾಜ್ ಸೆಷನ್, ಧ್ವನಿ ರೆಕಾರ್ಡಿಂಗ್, ಸಮ್ಮತಿ ದಾಖಲೆ ಮತ್ತು ಆಡಿಟ್ ಲಾಗ್ 72 ಗಂಟೆಗಳಲ್ಲಿ ಹಾರ್ಡ್-ಡಿಲೀಷನ್‌ಗೆ ಸಾಲಿನಲ್ಲಿರುತ್ತದೆ.',
    'privacy.deleteConfirmLabel': 'ಖಚಿತಪಡಿಸಲು {phrase} ಟೈಪ್ ಮಾಡಿ',
    'privacy.deleteConfirmButton': 'ನನಗೆ ಖಚಿತ — ಅಳಿಸಿ',
    'privacy.deleteWrongPhrase':
      'ಖಚಿತಪಡಿಸುವ ನುಡಿಗಟ್ಟನ್ನು ಸರಿಯಾಗಿ ಟೈಪ್ ಮಾಡಬೇಕು. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    'privacy.deleteSuccess':
      'ನಿಮ್ಮ ಡೇಟಾ ಹಾರ್ಡ್-ಡಿಲೀಷನ್‌ಗೆ ಸಾಲಿನಲ್ಲಿದೆ. ಅಂತಿಮ ತೆಗೆಯುವಿಕೆ:',
    'privacy.deletePending': 'ಅಳಿಸುವಿಕೆ ಪ್ರಗತಿಯಲ್ಲಿದೆ',
    'privacy.deletePendingBody':
      'ನಿಮ್ಮ ಡೇಟಾ ಸಾಫ್ಟ್-ಡಿಲೀಟ್ ಆಗಿದೆ. ಹಾರ್ಡ್-ಡಿಲೀಟ್ ಇದರೊಳಗೆ ಪೂರ್ಣಗೊಳ್ಳುತ್ತದೆ:',
    'privacy.cancel': 'ರದ್ದುಮಾಡಿ',
    'privacy.dpdpFooter':
      'ಭಾರತ DPDP ಕಾಯಿದೆ 2023 §6 (ಸಮ್ಮತಿ) + §13 (ಅಳಿಸುವ ಹಕ್ಕು). ಪ್ರತಿ ಸಮ್ಮತಿ + ಅಳಿಸುವ ಘಟನೆಯ ಆಡಿಟ್ ಲಾಗ್ DPDP §28 ಪ್ರಕಾರ ಉಳಿಸಲಾಗಿದೆ.',

    /* Plan 7.x — Plain Diagnosis */
    'plainDiagnosis.on': 'ಸರಳ ಭಾಷೆ',
    'plainDiagnosis.off': 'ಸರಳ ಭಾಷೆ',
    'plainDiagnosis.toggleOn': 'ಸರಳ ಭಾಷೆಯಲ್ಲಿ ತೋರಿಸಿ (ತಾಂತ್ರಿಕ ಪದಗಳನ್ನು ತೆಗೆದುಹಾಕಿ)',
    'plainDiagnosis.toggleOff': 'ಮೂಲ ಪದಗಳನ್ನು ತೋರಿಸಿ',

    /* Plan 7.x — Family Health Graph */
    'family.title': 'ಕುಟುಂಬ',
    'family.subtitle':
      'ಒಂದು ಖಾತೆ, ಹಲವು ಕುಟುಂಬ ಸದಸ್ಯರು. ಬೇರೆಯವರಿಗಾಗಿ ಟ್ರಿಯಾಜ್ ಮಾಡುವ ಮೊದಲು ಪ್ರೊಫೈಲ್ ಬದಲಿಸಿ. ಎಲ್ಲಾ ಪ್ರೊಫೈಲ್‌ಗಳು ಈ ಸಾಧನದಲ್ಲಿ ಉಳಿಯುತ್ತವೆ — ಎಂದಿಗೂ ಹಂಚಿಕೆಯಾಗುವುದಿಲ್ಲ.',
    'family.you': 'ನೀವು',
    'family.addPerson': 'ವ್ಯಕ್ತಿಯನ್ನು ಸೇರಿಸಿ',
    'family.editPerson': 'ವ್ಯಕ್ತಿಯನ್ನು ಸಂಪಾದಿಸಿ',
    'family.manage': 'ಎಲ್ಲವನ್ನೂ ನಿರ್ವಹಿಸಿ',
    'family.cap': 'ಗರಿಷ್ಠ 8',
    'family.optional': 'ಐಚ್ಛಿಕ',
    'family.save': 'ಉಳಿಸಿ',
    'family.edit': 'ಸಂಪಾದಿಸಿ',
    'family.remove': 'ತೆಗೆಯಿರಿ',
    'family.removeConfirm': 'ಈ ವ್ಯಕ್ತಿಯನ್ನು ನಿಮ್ಮ ಕುಟುಂಬ ಪಟ್ಟಿಯಿಂದ ತೆಗೆಯಬೇಕೇ?',
    'family.signInRequired': 'ಕುಟುಂಬ ಪ್ರೊಫೈಲ್‌ಗಳನ್ನು ನಿರ್ವಹಿಸಲು ಸೈನ್ ಇನ್ ಮಾಡಿ.',
    'family.errorName': 'ದಯವಿಟ್ಟು ಮೊದಲ ಹೆಸರನ್ನು ನಮೂದಿಸಿ.',
    'family.errorAge': 'ವಯಸ್ಸು 0 ಮತ್ತು 120 ರ ನಡುವೆ ಇರಬೇಕು.',
    'family.switcherAria': 'ಸಕ್ರಿಯ ಕುಟುಂಬ ಸದಸ್ಯರನ್ನು ಬದಲಿಸಿ',
    'family.privacyFooter':
      'ಈ ಸಾಧನದಲ್ಲಿ ಸ್ಥಳೀಯವಾಗಿ ಉಳಿಸಲಾಗಿದೆ. DPDP §6 ಪ್ರಕಾರ ಮೊದಲ ಹೆಸರು + ವಯಸ್ಸು + ಲಿಂಗ + ಸಂಬಂಧ ಮಾತ್ರ ಇಡುತ್ತೇವೆ — ಪೂರ್ಣ ಹೆಸರು, ವಿಳಾಸ, ABHA ID, ಫೋಟೋ ಇಲ್ಲ.',
    'family.field.name': 'ಮೊದಲ ಹೆಸರು',
    'family.field.age': 'ವಯಸ್ಸು',
    'family.field.sex': 'ಲಿಂಗ',
    'family.field.relationship': 'ಸಂಬಂಧ',
    'family.field.comorbidities': 'ದೀರ್ಘಕಾಲೀನ ಸ್ಥಿತಿಗಳು',
    'family.sex.f': 'ಸ್ತ್ರೀ',
    'family.sex.m': 'ಪುರುಷ',
    'family.sex.other': 'ಇತರ / ಹೇಳಲು ಬಯಸುವುದಿಲ್ಲ',
    'family.relationship.self': 'ಸ್ವಯಂ',
    'family.relationship.spouse': 'ಸಂಗಾತಿ',
    'family.relationship.parent': 'ಪೋಷಕ',
    'family.relationship.child': 'ಮಗು',
    'family.relationship.sibling': 'ಒಡಹುಟ್ಟಿದವರು',
    'family.relationship.grandparent': 'ಅಜ್ಜ-ಅಜ್ಜಿ',
    'family.relationship.grandchild': 'ಮೊಮ್ಮಗ-ಮೊಮ್ಮಗಳು',
    'family.relationship.in_law': 'ಮಾವ-ಅತ್ತೆ',
    'family.relationship.other': 'ಇತರ',

    /* Plan 7.x — Chronicle Mode */
    'chronicle.title': 'ಇಂದು ಹೇಗಿದ್ದೀರಿ?',
    'chronicle.daily': 'ದೈನಂದಿನ ತಪಾಸಣೆ',
    'chronicle.prompt': 'ನಿನ್ನೆಗೆ ಹೋಲಿಸಿದರೆ — ಉತ್ತಮ, ಅದೇ, ಅಥವಾ ಕೆಟ್ಟ?',
    'chronicle.status.better': 'ಉತ್ತಮ',
    'chronicle.status.same': 'ಅದೇ',
    'chronicle.status.worse': 'ಕೆಟ್ಟ',
    'chronicle.noteOptional': 'ಸಣ್ಣ ಟಿಪ್ಪಣಿ ಸೇರಿಸಿ (ಐಚ್ಛಿಕ)',
    'chronicle.notePlaceholder': 'ಉದಾ: ಜ್ವರ ಕಡಿಮೆ, ಕೆಮ್ಮು ಇನ್ನೂ',
    'chronicle.skipNote': 'ಟಿಪ್ಪಣಿ ಬಿಟ್ಟುಬಿಡಿ',
    'chronicle.save': 'ಉಳಿಸಿ',
    'chronicle.thankYou': 'ಉಳಿಸಲಾಗಿದೆ — ಇಂದನ್ನು ನೀವು ಗುರುತಿಸಿದ್ದೀರಿ',
    'chronicle.checkInsCount': 'ತಪಾಸಣೆಗಳು',

    /* Plan 6.3 — OutbreakGlobe */
    'outbreak.kicker': 'ಸಾರ್ವಜನಿಕ ಆರೋಗ್ಯ',
    'outbreak.title': 'ಪ್ರಕೋಪ ಮೇಲ್ವಿಚಾರಣೆ',
    'outbreak.subtitle':
      'ಕಳೆದ 72 ಗಂಟೆಗಳಲ್ಲಿ 15+ ರೋಗಿಗಳು ಸಮಾನ ಲಕ್ಷಣ-ಸಮೂಹಗಳನ್ನು ವರದಿ ಮಾಡಿದ ಜಿಲ್ಲೆಗಳು. ಅನಾಮಧೇಯ ಜಿಲ್ಲಾ-ಮಟ್ಟದ ಸಂಕೇತ — ಯಾವುದೇ ವೈಯಕ್ತಿಕ ದಾಖಲೆಗಳಿಲ್ಲ.',
    'outbreak.doctorOnly': 'ವೈದ್ಯ ಮಾತ್ರ',
    'outbreak.demoSeed': 'ಡೆಮೋ ಡೇಟಾ — ಬ್ಯಾಕೆಂಡ್ ಕ್ಲಸ್ಟರ್ ಎಂಡ್‌ಪಾಯಿಂಟ್ ಬಾಕಿ',
    'outbreak.backToCockpit': 'ಕಾಕ್‌ಪಿಟ್‌ಗೆ ಹಿಂದಿರುಗಿ',
    'outbreak.globeAria': 'ಭಾರತದಾದ್ಯಂತ ಸಕ್ರಿಯ ಪ್ರಕೋಪ ಕ್ಲಸ್ಟರ್‌ಗಳ 3D ಗೋಳ',
    'outbreak.mapAria': 'ಸಕ್ರಿಯ ಪ್ರಕೋಪ ಕ್ಲಸ್ಟರ್‌ಗಳ 2D ಭೌಗೋಳಿಕ ನಕ್ಷೆ',
    'outbreak.listAria': 'ಸಕ್ರಿಯ ಪ್ರಕೋಪ ಕ್ಲಸ್ಟರ್‌ಗಳ ಪಟ್ಟಿ',
    'outbreak.viewToggleAria': '3D ಗೋಳ ಮತ್ತು 2D ನಕ್ಷೆ ನೋಟದ ನಡುವೆ ಬದಲಿಸಿ',
    'outbreak.viewGlobe': '3D ಗೋಳ',
    'outbreak.viewMap': '2D ನಕ್ಷೆ',
    'outbreak.activeClusters': 'ಸಕ್ರಿಯ ಕ್ಲಸ್ಟರ್‌ಗಳು',
    'outbreak.totalCases': 'ಪ್ರಕರಣಗಳು',
    'outbreak.dominantSymptoms': 'ಪ್ರಮುಖ ಲಕ್ಷಣಗಳು',
    'outbreak.field.kind': 'ಪ್ರಕಾರ',
    'outbreak.field.cases': 'ಪ್ರಕರಣಗಳು',
    'outbreak.field.confidence': 'HDBSCAN ವಿಶ್ವಾಸ',
    'outbreak.field.firstSeen': 'ಮೊದಲು ಕಂಡದ್ದು',
    'outbreak.privacyFooter':
      'ಕ್ಲಸ್ಟರ್ ಒಟ್ಟುಗೂಡಿಸುವಿಕೆ 500m ಗ್ರಿಡ್-ಸ್ನ್ಯಾಪಿಂಗ್ + ವಯಸ್ಸಿನ ಬಕೆಟಿಂಗ್ ಬಳಸುತ್ತದೆ. ಯಾವುದೇ ಫೋನ್, ಹೆಸರು ಅಥವಾ ನಿಖರ ಸ್ಥಳ ಸಂಗ್ರಹಿಸುವುದಿಲ್ಲ ಅಥವಾ ತೋರಿಸುವುದಿಲ್ಲ. DPDP §6 ಪ್ರಕಾರ.',

    /* Plan 6.5 step 10 — Image / Vision triage */
    'vision.kicker': 'ಚಿತ್ರ ಟ್ರಿಯಾಜ್',
    'vision.title': 'ಟ್ರಿಯಾಜ್‌ಗಾಗಿ ಫೋಟೋ ಕಳುಹಿಸಿ',
    'vision.openButton': 'ಟ್ರಿಯಾಜ್‌ಗಾಗಿ ಚಿತ್ರ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ',
    'vision.openButtonTitle': 'ದದ್ದು, ಗಾಯ ಅಥವಾ ಔಷಧ ಬಾಟಲಿಯ ಫೋಟೋ',
    'vision.dialogAria': 'ಟ್ರಿಯಾಜ್‌ಗಾಗಿ ಚಿತ್ರ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ',
    'vision.dropHint': 'ಇಲ್ಲಿ ಚಿತ್ರವನ್ನು ಬಿಡಿ, ಅಥವಾ ಆಯ್ಕೆ ಮಾಡಲು ಮುಟ್ಟಿ',
    'vision.fileTypes': 'JPEG, PNG, ಅಥವಾ WebP · ಗರಿಷ್ಠ 8 MB',
    'vision.useCamera': 'ಕ್ಯಾಮೆರಾ ಬಳಸಿ',
    'vision.contextLabel': 'ಚಿತ್ರದಲ್ಲಿ ಏನಿದೆ?',
    'vision.contextPlaceholder': 'ಉದಾ: ಎಡ ತೋಳಿನ ಮೇಲೆ ದದ್ದು, ನಿನ್ನೆಯಿಂದ ಪ್ರಾರಂಭ',
    'vision.optional': 'ಐಚ್ಛಿಕ',
    'vision.previewAlt': 'ಆಯ್ಕೆಮಾಡಿದ ಚಿತ್ರ ಪೂರ್ವವೀಕ್ಷಣೆ',
    'vision.previewBanner':
      'ದೃಶ್ಯ ಮಾದರಿ ತರಬೇತಿಯಲ್ಲಿದೆ. ಇದೀಗ ಎಚ್ಚರಿಕೆಯ ಡೀಫಾಲ್ಟ್ ತೀರ್ಪು ನೀಡುತ್ತದೆ — ಇಂದಿಗೆ ಚಾಟ್ ಅಥವಾ 3D ದೇಹ ನಕ್ಷೆಯು ಬಲವಾದ ಟ್ರಿಯಾಜ್.',
    'vision.changeImage': 'ಚಿತ್ರವನ್ನು ಬದಲಿಸಿ',
    'vision.submit': 'ಟ್ರಿಯಾಜ್ ಪಡೆಯಿರಿ',
    'vision.analyzing': 'ವಿಶ್ಲೇಷಿಸುತ್ತಿದೆ…',
    'vision.error.too_large': 'ಚಿತ್ರ ತುಂಬಾ ದೊಡ್ಡದು. ಗರಿಷ್ಠ 8 MB.',
    'vision.error.wrong_type': 'ಬೆಂಬಲಿಸದ ಚಿತ್ರ ಪ್ರಕಾರ. JPEG, PNG ಅಥವಾ WebP ಬಳಸಿ.',
    'vision.error.http': 'ಸರ್ವರ್ ದೋಷವನ್ನು ಹಿಂದಿರುಗಿಸಿತು. ಸ್ವಲ್ಪ ಸಮಯದಲ್ಲಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    'vision.error.unknown': 'ಏನೋ ತಪ್ಪಾಯಿತು. ಇನ್ನೊಮ್ಮೆ ಪ್ರಯತ್ನಿಸಿ.',

    /* Plan 6.6 Phase H — verdict actions */
    'actions.aria': 'ಈ ತೀರ್ಪಿಗಾಗಿ ತ್ವರಿತ ಕ್ರಿಯೆಗಳು',
    'actions.clinic.find': 'ಹತ್ತಿರದ ಕ್ಲಿನಿಕ್ ಹುಡುಕಿ',
    'actions.clinic.locating': 'ಹುಡುಕುತ್ತಿದೆ…',
    'actions.clinic.opened': 'Google Maps ತೆರೆಯಲಾಗಿದೆ',
    'actions.clinic.openedWithoutLocation': 'Google Maps ತೆರೆಯಲಾಗಿದೆ (ನಿಮ್ಮ ನಿಖರ ಸ್ಥಳವಿಲ್ಲದೆ)',
    'actions.clinic.locationDenied':
      'ಸ್ಥಳ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ — ನಿರ್ದೇಶಾಂಕಗಳಿಲ್ಲದೆ ಹುಡುಕಾಟ ತೆರೆಯಲಾಗಿದೆ.',
    'actions.clinic.locationFailed':
      'ನಿಮ್ಮ ಸ್ಥಳ ಸಿಗಲಿಲ್ಲ — ನಿರ್ದೇಶಾಂಕಗಳಿಲ್ಲದೆ ಹುಡುಕಾಟ ತೆರೆಯಲಾಗಿದೆ.',
    'actions.share.intro': 'ಇಂದ ಟ್ರಿಯಾಜ್ ಫಲಿತಾಂಶ:',
    'actions.share.careLevel': 'ಆರೈಕೆ ಮಟ್ಟ',
    'actions.share.risk': 'ಅಪಾಯ',
    'actions.share.disclaimer':
      'ಸಹಾಯ — ರೋಗನಿರ್ಣಯ ಅಲ್ಲ. ಭಾರತ ಟೆಲಿಮೆಡಿಸಿನ್ ಮಾರ್ಗಸೂಚಿಗಳು 2020 ಪ್ರಕಾರ.',
    'actions.share.whatsapp': 'WhatsApp ಗೆ ಹಂಚಿಕೊಳ್ಳಿ',
    'actions.share.whatsappOpened': 'WhatsApp ತೆರೆಯಲಾಗಿದೆ',
    'actions.share.native': 'ಹಂಚಿಕೊಳ್ಳಿ',
    'actions.share.nativeAria': 'ಸಿಸ್ಟಮ್ ಹಂಚಿಕೆ ಶೀಟ್ ಮೂಲಕ ತೀರ್ಪು ಹಂಚಿಕೊಳ್ಳಿ',
    'actions.share.shared': 'ಯಶಸ್ವಿಯಾಗಿ ಹಂಚಿಕೊಳ್ಳಲಾಗಿದೆ',
    'actions.share.failed': 'ಹಂಚಿಕೆ ವಿಫಲ — ಬದಲಿಗೆ WhatsApp ಪ್ರಯತ್ನಿಸಿ',

    'consent.toast.saved': 'ಗೌಪ್ಯತಾ ಆಯ್ಕೆಗಳನ್ನು ಉಳಿಸಲಾಗಿದೆ',
    'consent.toast.scopesGranted': 'ಅನುಮತಿಗಳು ನೀಡಲಾಗಿದೆ',
    'family.toast.added': 'ಕುಟುಂಬ ಪ್ರೊಫೈಲ್ ಸೇರಿಸಲಾಗಿದೆ',
    'family.toast.updated': 'ಪ್ರೊಫೈಲ್ ನವೀಕರಿಸಲಾಗಿದೆ',
    'family.toast.removed': 'ಪ್ರೊಫೈಲ್ ತೆಗೆದುಹಾಕಲಾಗಿದೆ',
    'family.toast.switched': 'ಸಕ್ರಿಯ ಪ್ರೊಫೈಲ್ ಬದಲಾಯಿಸಲಾಗಿದೆ',

    'settings.kicker': 'ಖಾತೆ',
    'settings.title': 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
    'settings.subtitle':
      'ನಿಮ್ಮ ಕುಟುಂಬ ಪ್ರೊಫೈಲ್‌ಗಳು + ಗೌಪ್ಯತೆ + ಡೇಟಾ ನಿಯಂತ್ರಣಗಳನ್ನು ನಿರ್ವಹಿಸಿ. ಸೈನ್ ಇನ್ ಮಾಡದ ಹೊರತು ಎಲ್ಲವೂ ಈ ಸಾಧನದಲ್ಲಿ ಉಳಿಯುತ್ತದೆ.',
    'settings.footer':
      'DPDP ಕಾಯಿದೆ 2023 ಪ್ರಕಾರ: ಪ್ರತಿ ಸಮ್ಮತಿಯು ನಿರ್ದಿಷ್ಟ, ಮಾಹಿತಿಯುಕ್ತ, ಮತ್ತು ಹಿಂಪಡೆಯಬಹುದಾದದ್ದು. 72 ಗಂಟೆಗಳಲ್ಲಿ ಅಳಿಸುವ ಹಕ್ಕು.',
    'settings.family.title': 'ಕುಟುಂಬ ಪ್ರೊಫೈಲ್‌ಗಳು',
    'settings.family.body':
      'ಪ್ರತಿ ಖಾತೆಗೆ 8 ಪ್ರೊಫೈಲ್‌ಗಳವರೆಗೆ. ಪೋಷಕ ಅಥವಾ ಮಗುವಿನ ಪರವಾಗಿ ಟ್ರಿಯಾಜ್ ಮಾಡುವ ಮೊದಲು ಬದಲಿಸಿ.',
    'settings.privacy.title': 'ಗೌಪ್ಯತೆ ಮತ್ತು ಡೇಟಾ',
    'settings.privacy.body':
      'ವಿವರವಾದ ಸಮ್ಮತಿ ಸ್ವಿಚ್‌ಗಳು + ಅಳಿಸುವ ಹಕ್ಕು ಬಟನ್. DPDP §6 + §13 ಅನುಸರಣೆ.',
  },
};

/**
 * Tiny placeholder interpolator: replaces `{key}` tokens with values.
 * Example: `interp(t('bodymap.placedOf'), { n: 2, max: 5 })`
 */
export function interp(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{${k}}`,
  );
}
