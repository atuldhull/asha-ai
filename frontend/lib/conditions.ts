/**
 * Pre-fed condition knowledge base.
 *
 * Each entry pairs the hallmark *symptoms* a patient might describe with
 * practical *self-care / treatment* guidance and an escalation watch-list,
 * grounded in WHO IMCI, India MoHFW/ICMR standard-treatment guidelines and
 * common rural-PHC practice.
 *
 * IMPORTANT — this is decision-support, NOT a diagnosis and NOT a prescription.
 *   • `typicalCare` is informational only. It NEVER sets the triage verdict —
 *     the deterministic red-flag + severity engine in `api.ts` stays the sole
 *     authority on care level. A matched condition can only *add* education.
 *   • No drug doses. OTC mentions defer to a doctor/pharmacist by design.
 *
 * Covers (a) conditions already implied in the codebase — the 9 red-flag
 * rules (R1–R9) and the demo-seed cases (dengue/chikungunya/bronchiolitis) —
 * and (b) the most common rural-India presentations layered on top.
 */

import type { CareLevel, ConditionGuidance } from './types';

export type { ConditionGuidance };

interface ConditionEntry extends ConditionGuidance {
  /** Lower-cased phrases that suggest this condition. */
  match: string[];
  /** Phrases that strongly point here (weighted ×3 in scoring). */
  strong?: string[];
}

/* ─────────────────────────────────────────────────────────────────────────
   The knowledge base. Order is irrelevant — selection is by match score.
   ───────────────────────────────────────────────────────────────────────── */
const CONDITIONS: ConditionEntry[] = [
  /* ── Emergencies (mirror red-flag rules R1–R9) — first-aid WHILE waiting ── */
  {
    id: 'acs',
    name: 'Possible heart attack (acute coronary syndrome)',
    aka: 'cardiac chest pain',
    summary:
      'Chest pain/pressure — especially with sweating, breathlessness, or pain spreading to the arm or jaw — can be the heart’s blood supply being blocked. This is time-critical.',
    symptoms: [
      'Crushing/tight chest pain or pressure, often central',
      'Pain spreading to left arm, jaw, neck or back',
      'Cold sweat, nausea, breathlessness, sense of doom',
    ],
    self_care: [
      'Call 108 for an ambulance NOW — do not drive yourself.',
      'Sit down, stay calm, loosen tight clothing.',
      'If not allergic and no active bleeding, chew one regular aspirin (300 mg) while waiting.',
      'If the person collapses and is not breathing, start hands-only CPR.',
    ],
    watch_for: ['Collapse', 'No breathing', 'Bluish lips', 'Severe worsening pain'],
    typicalCare: 'Emergency Room',
    match: ['chest pain', 'chest pressure', 'chest tightness', 'tight chest', 'left arm', 'jaw pain', 'heart attack', 'crushing'],
    strong: ['heart attack', 'crushing chest', 'chest pain left arm'],
  },
  {
    id: 'stroke',
    name: 'Possible stroke (brain attack)',
    aka: 'brain stroke / paralysis',
    summary:
      'Sudden face droop, arm weakness or slurred speech means the brain may be losing blood supply. Every minute counts — clot-busting works only in a short window.',
    symptoms: [
      'Face drooping on one side',
      'Arm/leg weakness or numbness on one side',
      'Slurred or jumbled speech, sudden confusion',
      'Sudden “worst-ever” headache or vision loss',
    ],
    self_care: [
      'Call 108 immediately and note the exact time symptoms started.',
      'Lay the person on their side, head slightly raised.',
      'Give nothing to eat or drink (choking risk).',
      'Do not wait to “see if it passes” — go now.',
    ],
    watch_for: ['Unconsciousness', 'Seizure', 'No breathing'],
    typicalCare: 'Emergency Room',
    match: ['face droop', 'facial droop', 'slurred speech', 'arm weak', 'one side weak', 'sudden numbness', 'cannot speak', 'worst headache of my life', 'thunderclap'],
    strong: ['face droop', 'slurred speech', 'one side weak'],
  },
  {
    id: 'anaphylaxis',
    name: 'Severe allergic reaction (anaphylaxis)',
    aka: 'allergic shock',
    summary:
      'Throat/tongue swelling, widespread hives and breathing difficulty after a food, drug or sting is a life-threatening allergy.',
    symptoms: [
      'Swelling of lips, tongue or throat',
      'Difficulty breathing, wheeze, tight throat',
      'Hives spreading over the body, dizziness/faintness',
    ],
    self_care: [
      'Call 108 now.',
      'If an adrenaline auto-injector (EpiPen) is available, use it into the outer thigh.',
      'Lie flat with legs raised; if vomiting, turn to the side.',
      'Remove the trigger (e.g., stop the drug, remove the sting).',
    ],
    watch_for: ['Collapse', 'No breathing', 'Bluish lips'],
    typicalCare: 'Emergency Room',
    match: ['throat closing', 'throat swelling', 'tongue swelling', 'lips swelling', 'hives all over', 'anaphylaxis', 'allergic reaction'],
    strong: ['throat closing', 'tongue swelling', 'anaphylaxis'],
  },
  {
    id: 'sepsis',
    name: 'Severe infection / possible sepsis',
    aka: 'blood infection',
    summary:
      'A fever with confusion, very fast breathing, cold/mottled skin or shaking chills can mean an infection is overwhelming the body.',
    symptoms: [
      'High fever or very low temperature with rigors',
      'Confusion, drowsiness, hard to wake',
      'Fast breathing, fast heartbeat, cold/clammy or mottled skin',
    ],
    self_care: [
      'Call 108 — this needs IV antibiotics and fluids urgently.',
      'Keep the person lying down and warm; sip fluids only if fully alert.',
      'Bring any medicines and note when the fever started.',
    ],
    watch_for: ['Unresponsive', 'No urine', 'Bluish lips', 'No breathing'],
    typicalCare: 'Emergency Room',
    match: ['high fever', 'shaking chills', 'rigors', 'confused', 'confusion', 'cold hands', 'mottled', 'rapid breathing', 'cant stay awake'],
    strong: ['fever confusion', 'shaking chills', 'mottled'],
  },
  {
    id: 'pediatric-danger',
    name: 'Child danger signs (WHO IMCI)',
    aka: 'sick infant / baby',
    summary:
      'In a baby or young child, not feeding, lethargy, fast/laboured breathing, fits or a sunken/floppy look are emergency danger signs.',
    symptoms: [
      'Not feeding or unable to drink',
      'Lethargic, floppy, hard to wake, or convulsing',
      'Fast or laboured breathing, chest indrawing, bluish colour',
    ],
    self_care: [
      'Call 108 / go to the nearest facility immediately.',
      'Keep the child warm and airway clear; continue breastfeeding if able to suckle.',
      'Do not delay for home remedies.',
    ],
    watch_for: ['Not breathing', 'Blue/limp', 'Continuous fits', 'Sunken eyes + no urine'],
    typicalCare: 'Emergency Room',
    match: ['baby', 'infant', 'newborn', 'child not feeding', 'not waking', 'floppy', 'convulsion', 'ribs sucking', 'months old', 'gasping'],
    strong: ['baby not feeding', 'infant limp', 'child convulsion'],
  },
  {
    id: 'gi-bleed',
    name: 'Gastrointestinal bleed / acute abdomen',
    aka: 'bleeding in stomach',
    summary:
      'Vomiting blood, black tarry stools, or a rigid “board-like” very painful belly points to internal bleeding or a surgical emergency.',
    symptoms: [
      'Vomiting blood or coffee-ground material',
      'Black, tarry, or bloody stools',
      'Rigid, board-like, severely tender abdomen',
    ],
    self_care: [
      'Call 108 — nothing to eat or drink.',
      'Lie down with knees bent to ease abdominal pain.',
      'Carry any blood-thinner or painkiller medicines to show the doctor.',
    ],
    watch_for: ['Fainting', 'Cold clammy skin', 'Rapid pulse', 'Confusion'],
    typicalCare: 'Emergency Room',
    match: ['vomiting blood', 'blood in vomit', 'black stool', 'tarry stool', 'blood in stool', 'rigid abdomen', 'board like abdomen'],
    strong: ['vomiting blood', 'black tarry stool', 'rigid abdomen'],
  },
  {
    id: 'meningitis',
    name: 'Possible meningitis',
    aka: 'brain fever',
    summary:
      'Fever with a stiff neck, severe headache, light hurting the eyes, or a non-fading rash can be infection of the brain’s lining.',
    symptoms: [
      'Fever + severe headache + neck stiffness',
      'Light hurts the eyes (photophobia), vomiting',
      'Drowsiness, confusion, or a rash that doesn’t fade on pressure',
    ],
    self_care: [
      'Call 108 — this needs urgent antibiotics.',
      'Dim the lights, keep the person calm and still.',
      'Note when fever and neck stiffness began.',
    ],
    watch_for: ['Seizure', 'Unresponsive', 'Spreading purple rash'],
    typicalCare: 'Emergency Room',
    match: ['stiff neck', 'neck stiffness', 'neck rigid', 'cant touch chin to chest', 'light hurts', 'photophobia'],
    strong: ['stiff neck fever', 'neck stiffness headache'],
  },
  {
    id: 'trauma',
    name: 'Major injury / trauma',
    aka: 'accident / heavy bleeding',
    summary:
      'Head injury with unconsciousness, uncontrolled bleeding, inability to move limbs, drowning or electric shock are emergencies.',
    symptoms: [
      'Knocked out / not fully conscious after a head injury',
      'Bleeding that won’t stop, deep wound',
      'Cannot move arms or legs after a fall/accident',
    ],
    self_care: [
      'Call 108. Press firmly on bleeding with a clean cloth.',
      'Do not move the neck/back if a spinal injury is possible.',
      'Keep the person warm; do not give food or water.',
    ],
    watch_for: ['Unconsciousness', 'No breathing', 'Massive bleeding'],
    typicalCare: 'Emergency Room',
    match: ['head injury', 'knocked out', 'road accident', 'fell from', 'heavy bleeding', 'bleeding wont stop', 'cannot move legs', 'electric shock', 'drowning'],
    strong: ['head injury unconscious', 'bleeding wont stop'],
  },
  {
    id: 'snakebite',
    name: 'Snakebite',
    aka: 'saap ka kaata',
    summary:
      'Any snakebite is a medical emergency in India — venomous bites can be fatal and antivenom works best early.',
    symptoms: [
      'Fang marks, swelling/pain at the bite',
      'Drooping eyelids, difficulty breathing or swallowing',
      'Bleeding from gums, dark urine, fainting',
    ],
    self_care: [
      'Call 108 and get to a facility with antivenom fast.',
      'Keep the bitten limb still and below heart level; remove rings/bangles.',
      'Do NOT cut, suck, apply a tight tourniquet, or use herbal remedies.',
      'Reassure the person and note the time of the bite.',
    ],
    watch_for: ['Difficulty breathing', 'Drooping eyelids', 'Uncontrolled bleeding'],
    typicalCare: 'Emergency Room',
    match: ['snake bite', 'snakebite', 'saap', 'bitten by snake'],
    strong: ['snake bite', 'snakebite'],
  },

  /* ── Common rural-India presentations ── */
  {
    id: 'common-cold',
    name: 'Common cold (upper respiratory infection)',
    aka: 'zukaam / sardi',
    summary:
      'A mild viral infection of the nose and throat. It clears on its own in about a week; antibiotics do not help.',
    symptoms: ['Runny/blocked nose, sneezing', 'Sore or scratchy throat', 'Mild cough, low or no fever'],
    self_care: [
      'Rest and drink plenty of warm fluids.',
      'Steam inhalation and warm salt-water gargles for throat relief.',
      'Honey + ginger/tulsi soothes cough (not for infants under 1 year).',
    ],
    watch_for: ['Fever above 3 days', 'Breathlessness', 'Chest pain', 'Symptoms beyond 10 days'],
    otc: ['Paracetamol for aches/fever', 'Saline nasal drops — ask a pharmacist'],
    typicalCare: 'Home Care',
    match: ['cold', 'zukaam', 'sardi', 'runny nose', 'blocked nose', 'sneezing', 'sore throat', 'stuffy nose'],
    strong: ['runny nose sneezing', 'zukaam'],
  },
  {
    id: 'influenza',
    name: 'Influenza (flu)',
    aka: 'seasonal flu',
    summary:
      'A viral illness with sudden fever, body aches and exhaustion — usually self-limiting but can be serious in the very young, old, pregnant, or those with chronic disease.',
    symptoms: ['Sudden high fever and chills', 'Severe body and muscle aches', 'Dry cough, sore throat, marked fatigue'],
    self_care: [
      'Rest, isolate to avoid spreading, and drink fluids.',
      'Paracetamol for fever and aches.',
      'Cover coughs/sneezes and wash hands often.',
    ],
    watch_for: ['Breathlessness', 'Chest pain', 'Persistent high fever', 'Confusion', 'Bluish lips'],
    otc: ['Paracetamol — avoid aspirin in children'],
    typicalCare: 'Home Care',
    match: ['flu', 'influenza', 'body ache', 'body pain', 'muscle ache', 'high fever and weakness', 'fever and body pain'],
    strong: ['flu', 'fever body ache'],
  },
  {
    id: 'viral-fever',
    name: 'Undifferentiated viral fever',
    aka: 'viral bukhar',
    summary:
      'A short, self-limiting fever without localising or danger signs — common and usually viral. Watch for dengue/malaria/typhoid features in endemic areas.',
    symptoms: ['Fever with mild body ache or headache', 'Tiredness, reduced appetite', 'No breathlessness, no bleeding, no confusion'],
    self_care: [
      'Rest and plenty of oral fluids/ORS.',
      'Paracetamol for fever; tepid sponging if very hot.',
      'Recheck if fever lasts beyond 3 days or new symptoms appear.',
    ],
    watch_for: ['Fever > 3–4 days', 'Bleeding spots', 'Severe headache/eye pain', 'Persistent vomiting', 'Reduced urine'],
    otc: ['Paracetamol — avoid ibuprofen/aspirin if dengue is possible'],
    typicalCare: 'Home Care',
    match: ['fever', 'bukhar', 'temperature', 'feeling feverish', 'mild fever'],
    strong: [],
  },
  {
    id: 'dengue',
    name: 'Dengue fever',
    aka: 'breakbone fever',
    summary:
      'A mosquito-borne viral fever with severe body/eye pain and rash. Most recover, but the “warning” phase as fever drops can be dangerous.',
    symptoms: ['High fever with pain behind the eyes', 'Severe joint/muscle (“breakbone”) pain', 'Skin rash, easy bruising or gum bleeding'],
    self_care: [
      'Plenty of fluids/ORS and rest; monitor temperature.',
      'Use ONLY paracetamol for fever — avoid aspirin/ibuprofen (bleeding risk).',
      'Get a blood test (platelets) and stay near care during the critical phase.',
    ],
    watch_for: ['Bleeding (nose/gums/skin)', 'Severe abdominal pain', 'Persistent vomiting', 'Cold clammy skin', 'Restlessness'],
    otc: ['Paracetamol only — NOT aspirin/NSAIDs'],
    typicalCare: 'Clinic Visit',
    match: ['dengue', 'pain behind eyes', 'breakbone', 'joint pain fever', 'rash and fever', 'bleeding gums fever'],
    strong: ['dengue', 'pain behind the eyes'],
  },
  {
    id: 'chikungunya',
    name: 'Chikungunya',
    aka: 'mosquito joint fever',
    summary:
      'A mosquito-borne viral illness with high fever and intense, often prolonged joint pain. Rarely life-threatening but debilitating.',
    symptoms: ['Sudden high fever', 'Severe, often symmetrical joint pain/swelling', 'Headache, rash, fatigue'],
    self_care: [
      'Rest, fluids, and paracetamol for fever/pain.',
      'Gentle joint movement and cool compresses for stiffness.',
      'Joint pain may linger weeks — keep moving gently.',
    ],
    watch_for: ['Persistent high fever', 'Bleeding', 'Severe dehydration', 'Neurological symptoms'],
    otc: ['Paracetamol; NSAIDs only after dengue is ruled out'],
    typicalCare: 'Clinic Visit',
    match: ['chikungunya', 'joint swelling fever', 'severe joint pain'],
    strong: ['chikungunya'],
  },
  {
    id: 'malaria',
    name: 'Malaria',
    aka: 'mosquito fever / cyclical fever',
    summary:
      'A mosquito-borne parasitic infection with cyclical fever and shaking chills. Needs a blood test and prompt anti-malarial treatment.',
    symptoms: ['Fever with shaking chills then sweating, often cyclical', 'Headache, body ache, weakness', 'Sometimes vomiting; spleen discomfort'],
    self_care: [
      'Get a malaria blood test (RDT/smear) the same day.',
      'Fluids and paracetamol for fever while arranging testing.',
      'Take the full prescribed anti-malarial course exactly as directed.',
    ],
    watch_for: ['Drowsiness/confusion', 'Yellow eyes', 'Dark urine', 'Breathlessness', 'Fits'],
    otc: ['Paracetamol for fever — anti-malarials require a prescription'],
    typicalCare: 'Clinic Visit',
    match: ['malaria', 'chills and fever', 'shivering fever', 'fever every other day', 'cyclical fever', 'fever with rigors'],
    strong: ['malaria', 'shivering fever'],
  },
  {
    id: 'typhoid',
    name: 'Typhoid fever (enteric fever)',
    aka: 'motijhara',
    summary:
      'A bacterial infection from contaminated food/water causing a step-ladder rising fever over a week, with abdominal discomfort.',
    symptoms: ['Sustained fever rising over days', 'Abdominal pain, poor appetite, headache', 'Constipation or loose stools; sometimes rose-coloured spots'],
    self_care: [
      'See a clinician for a blood test; complete the full antibiotic course.',
      'Soft diet, fluids/ORS, and rest.',
      'Use safe drinking water and hand hygiene to prevent spread.',
    ],
    watch_for: ['Severe abdominal pain', 'Blood in stool', 'Confusion', 'Persistent vomiting'],
    otc: ['Paracetamol for fever — antibiotics require a prescription'],
    typicalCare: 'Clinic Visit',
    match: ['typhoid', 'motijhara', 'fever for a week', 'sustained fever', 'fever and stomach pain'],
    strong: ['typhoid', 'fever for a week'],
  },
  {
    id: 'gastroenteritis',
    name: 'Acute gastroenteritis / food poisoning',
    aka: 'loose motions / dast-ulti',
    summary:
      'Inflammation of the gut from infected food/water causing diarrhoea and vomiting. The main danger is dehydration, especially in children and the elderly.',
    symptoms: ['Loose, watery stools (often with cramps)', 'Vomiting, nausea', 'Low-grade fever, weakness'],
    self_care: [
      'Start ORS after every loose stool — small frequent sips.',
      'Continue eating bland food; keep breastfeeding infants.',
      'Zinc for 14 days helps children recover (as advised).',
      'Maintain hand and food hygiene.',
    ],
    watch_for: ['Sunken eyes / no urine / no tears', 'Blood in stool', 'Persistent vomiting', 'Drowsiness', 'High fever'],
    otc: ['ORS and zinc (children) — avoid anti-diarrhoeals in kids'],
    typicalCare: 'Home Care',
    match: ['diarrhea', 'diarrhoea', 'loose motion', 'loose motions', 'dast', 'food poisoning', 'vomiting and loose', 'stomach upset', 'ulti'],
    strong: ['loose motions', 'food poisoning', 'diarrhoea'],
  },
  {
    id: 'dehydration',
    name: 'Dehydration',
    aka: 'paani ki kami',
    summary:
      'Too much fluid loss (from diarrhoea, vomiting, heat or poor intake). Mild–moderate is reversible with ORS; severe is an emergency.',
    symptoms: ['Dry mouth, intense thirst, reduced/dark urine', 'Tiredness, dizziness on standing', 'In children: sunken eyes, no tears, lethargy'],
    self_care: [
      'ORS frequently; continue normal feeds in children.',
      'Rest in a cool place; treat the underlying cause (diarrhoea/heat).',
    ],
    watch_for: ['No urine for 6–8 h', 'Very drowsy/unresponsive', 'Sunken eyes', 'Fast breathing', 'No tears in a child'],
    otc: ['ORS — the single most important treatment'],
    typicalCare: 'Clinic Visit',
    match: ['dehydrated', 'dehydration', 'not urinating', 'no urine', 'very thirsty', 'sunken eyes', 'cant keep fluids'],
    strong: ['dehydration', 'no urine'],
  },
  {
    id: 'uti',
    name: 'Urinary tract infection',
    aka: 'peshab mein jalan',
    summary:
      'A bacterial infection of the bladder/urinary tract causing burning urination and frequency. Usually treatable; can spread to kidneys if ignored.',
    symptoms: ['Burning or pain on passing urine', 'Frequent, urgent urination', 'Lower abdominal discomfort, cloudy/smelly urine'],
    self_care: [
      'Drink plenty of water to flush the bladder.',
      'See a clinician for a urine test; complete prescribed antibiotics.',
      'Maintain genital hygiene; don’t hold urine for long.',
    ],
    watch_for: ['Fever with back/flank pain', 'Blood in urine', 'Vomiting', 'Pregnancy with UTI'],
    otc: ['Paracetamol for pain — antibiotics need a prescription'],
    typicalCare: 'Clinic Visit',
    match: ['burning urine', 'burning urination', 'painful urination', 'uti', 'peshab', 'frequent urination', 'urinary'],
    strong: ['burning urination', 'uti'],
  },
  {
    id: 'migraine',
    name: 'Migraine / tension headache',
    aka: 'sir dard',
    summary:
      'A common primary headache. Migraine is often one-sided and throbbing with nausea/light sensitivity; tension headache is a dull band-like ache.',
    symptoms: ['Throbbing or pressing headache', 'Nausea, sensitivity to light/sound (migraine)', 'Triggered by stress, missed meals, poor sleep'],
    self_care: [
      'Rest in a quiet, dark room; cold compress on the head.',
      'Hydrate, eat regularly, sleep well, manage stress.',
      'Track and avoid personal triggers.',
    ],
    watch_for: ['“Worst-ever” sudden headache', 'Fever + stiff neck', 'Weakness/slurred speech', 'Headache after head injury', 'New headache over age 50'],
    otc: ['Paracetamol or ibuprofen early in the attack — avoid daily overuse'],
    typicalCare: 'Home Care',
    match: ['headache', 'migraine', 'sir dard', 'head pain', 'throbbing head'],
    strong: ['migraine'],
  },
  {
    id: 'acid-reflux',
    name: 'Acidity / acid reflux (GERD)',
    aka: 'gas / khatti dakar',
    summary:
      'Stomach acid irritating the food pipe causing burning behind the chest and sour belching — common and usually manageable with diet and antacids.',
    symptoms: ['Burning behind the breastbone, worse after meals/lying down', 'Sour taste, belching, bloating', 'Relieved by sitting up or antacids'],
    self_care: [
      'Smaller meals; avoid spicy/oily/late-night food, tea, alcohol, smoking.',
      'Don’t lie down for 2–3 h after eating; raise the head of the bed.',
      'Lose excess weight if relevant.',
    ],
    watch_for: ['Chest pain with sweating/breathlessness (rule out heart)', 'Difficulty swallowing', 'Weight loss', 'Black stools', 'Vomiting blood'],
    otc: ['Antacids; a short course of acid reducers — ask a pharmacist'],
    typicalCare: 'Home Care',
    match: ['acidity', 'acid reflux', 'heartburn', 'gas', 'gerd', 'sour belching', 'burning in stomach', 'khatti dakar'],
    strong: ['acidity', 'heartburn', 'acid reflux'],
  },
  {
    id: 'asthma',
    name: 'Asthma flare-up',
    aka: 'breathing problem / dama',
    summary:
      'Narrowing of the airways causing wheeze, cough and breathlessness, often triggered by infection, dust, smoke or cold air.',
    symptoms: ['Wheezing, chest tightness', 'Cough (often at night), breathlessness', 'Worse with triggers/exertion'],
    self_care: [
      'Use the reliever inhaler (e.g., salbutamol) as prescribed; sit upright and stay calm.',
      'Move away from triggers (smoke, dust, cold air).',
      'If no relief after reliever use, seek care urgently.',
    ],
    watch_for: ['Cannot speak full sentences', 'Lips/fingertips blue', 'Reliever not working', 'Exhaustion/drowsiness'],
    otc: ['Inhalers require a prescription — do not rely on cough syrup'],
    typicalCare: 'Clinic Visit',
    match: ['asthma', 'wheezing', 'wheeze', 'breathing problem', 'dama', 'shortness of breath', 'cant breathe properly'],
    strong: ['asthma', 'wheezing'],
  },
  {
    id: 'pneumonia',
    name: 'Pneumonia / chest infection',
    aka: 'lung infection',
    summary:
      'Infection of the lungs causing fever, productive cough and fast/difficult breathing. Can be serious, especially in children and the elderly.',
    symptoms: ['Fever with cough producing phlegm', 'Fast or laboured breathing, chest pain on breathing', 'Weakness; in children, chest indrawing'],
    self_care: [
      'See a clinician promptly — likely needs antibiotics and a chest exam.',
      'Fluids, rest, paracetamol for fever while arranging care.',
      'In children, count breaths — fast breathing is a key danger sign.',
    ],
    watch_for: ['Bluish lips', 'Severe breathlessness', 'Confusion', 'Chest indrawing in a child', 'Unable to drink'],
    otc: ['Paracetamol for fever — antibiotics require a prescription'],
    typicalCare: 'Clinic Visit',
    match: ['pneumonia', 'chest infection', 'cough with phlegm', 'productive cough fever', 'fast breathing fever', 'cough and breathlessness'],
    strong: ['pneumonia', 'cough with phlegm and fever'],
  },
  {
    id: 'tuberculosis',
    name: 'Possible tuberculosis (TB)',
    aka: 'TB / khansi 2 hafte se',
    summary:
      'A cough lasting more than 2 weeks — especially with weight loss, night sweats or blood in sputum — must be evaluated for TB. Treatment is free under India’s national programme.',
    symptoms: ['Cough for 2+ weeks', 'Evening fever, night sweats', 'Weight loss, loss of appetite, sometimes blood in sputum'],
    self_care: [
      'Get a sputum test / chest X-ray at the nearest health centre (free under NTEP).',
      'If diagnosed, take the FULL course — never stop early (resistance risk).',
      'Cover coughs and ensure household contacts are screened.',
    ],
    watch_for: ['Coughing blood', 'Severe breathlessness', 'Rapid weight loss', 'High persistent fever'],
    otc: ['No OTC fix — TB needs a confirmed diagnosis and supervised treatment'],
    typicalCare: 'Clinic Visit',
    match: ['tuberculosis', 'tb', 'cough for two weeks', 'cough for 2 weeks', 'chronic cough', 'night sweats', 'coughing blood', 'weight loss cough'],
    strong: ['tuberculosis', 'cough for 2 weeks', 'night sweats weight loss'],
  },
  {
    id: 'hypertension',
    name: 'High blood pressure (hypertension)',
    aka: 'BP high',
    summary:
      'Often symptomless (“silent”) but a major cause of stroke and heart disease. Found on a BP check; managed with lifestyle and medication.',
    symptoms: ['Usually no symptoms', 'Sometimes headache, dizziness', 'Found as a high reading on a BP machine'],
    self_care: [
      'Reduce salt, lose excess weight, walk daily, avoid tobacco/alcohol.',
      'Get BP checked regularly; take prescribed medicines daily without stopping.',
    ],
    watch_for: ['Very high BP with chest pain/breathlessness', 'Severe headache + vision change', 'Weakness/slurred speech'],
    otc: ['BP medicines require a prescription — do not self-medicate'],
    typicalCare: 'Clinic Visit',
    match: ['high blood pressure', 'hypertension', 'bp high', 'high bp', 'blood pressure'],
    strong: ['high blood pressure', 'hypertension'],
  },
  {
    id: 'diabetes',
    name: 'High blood sugar (diabetes)',
    aka: 'sugar / madhumeha',
    summary:
      'A chronic condition of high blood glucose. Classic clues are excessive thirst, urination and weight loss. Needs testing and ongoing care.',
    symptoms: ['Frequent urination, excessive thirst/hunger', 'Unexplained weight loss, tiredness', 'Slow-healing wounds, blurred vision'],
    self_care: [
      'Get a blood sugar test; follow diet, activity and medication advice.',
      'Foot care and regular check-ups prevent complications.',
    ],
    watch_for: ['Very drowsy/confused', 'Fruity-smelling breath + vomiting', 'Fast deep breathing', 'Unresponsive (very high/low sugar)'],
    otc: ['Diabetes medicines require a prescription and monitoring'],
    typicalCare: 'Clinic Visit',
    match: ['diabetes', 'high sugar', 'blood sugar', 'sugar problem', 'frequent urination thirst', 'madhumeha'],
    strong: ['diabetes', 'high blood sugar'],
  },
  {
    id: 'conjunctivitis',
    name: 'Conjunctivitis (eye flu)',
    aka: 'aankh aana',
    summary:
      'Inflammation of the eye surface — usually viral, very contagious, and self-limiting. Bacterial cases have sticky pus discharge.',
    symptoms: ['Red, watery, gritty eyes', 'Sticky discharge, lids stuck on waking', 'Often spreads to the other eye / household'],
    self_care: [
      'Clean discharge with a clean wet cloth (separate for each eye).',
      'Wash hands often; don’t share towels; avoid touching eyes.',
      'Cool compresses for comfort; most viral cases clear in 1–2 weeks.',
    ],
    watch_for: ['Severe eye pain', 'Vision loss', 'Light sensitivity', 'No improvement in a week'],
    otc: ['Lubricant drops for comfort — antibiotic drops need advice'],
    typicalCare: 'Home Care',
    match: ['conjunctivitis', 'eye flu', 'red eye', 'pink eye', 'eyes watering', 'aankh aana'],
    strong: ['conjunctivitis', 'eye flu'],
  },
  {
    id: 'skin-infection',
    name: 'Skin infection / rash',
    aka: 'khujli / phoda',
    summary:
      'Bacterial or fungal skin infections and itchy rashes (scabies, ringworm) are common with heat and poor sanitation. Most respond to hygiene and topical treatment.',
    symptoms: ['Itchy rash, redness, scaling, or pus-filled spots', 'Ring-shaped patches (fungal) or night-time itch (scabies)', 'Sometimes spreading or painful'],
    self_care: [
      'Keep the area clean and dry; don’t scratch.',
      'Wash clothes/bedding in hot water; treat close contacts for scabies.',
      'Apply prescribed antifungal/antibacterial cream as directed.',
    ],
    watch_for: ['Spreading redness with fever', 'Rapidly enlarging painful swelling', 'Red streaks from the area'],
    otc: ['Antifungal cream / calamine — ask a pharmacist; antibiotics need a prescription'],
    typicalCare: 'Clinic Visit',
    match: ['rash', 'itching', 'itchy skin', 'skin infection', 'ringworm', 'scabies', 'boil', 'khujli', 'phoda', 'skin'],
    strong: ['ringworm', 'scabies', 'skin infection'],
  },
  {
    id: 'toothache',
    name: 'Toothache / dental infection',
    aka: 'daant dard',
    summary:
      'Tooth decay or a dental abscess causing pain and sometimes facial swelling. Pain relief helps temporarily; the tooth needs a dentist.',
    symptoms: ['Throbbing tooth pain, worse with hot/cold/chewing', 'Gum swelling, bad taste', 'Sometimes facial swelling or fever (abscess)'],
    self_care: [
      'Warm salt-water rinses; keep the mouth clean.',
      'Avoid very hot/cold/sweet foods on that side.',
      'See a dentist — decay/abscess won’t resolve on its own.',
    ],
    watch_for: ['Spreading facial/neck swelling', 'Difficulty swallowing or breathing', 'High fever'],
    otc: ['Paracetamol/ibuprofen for pain — clove oil gives short relief'],
    typicalCare: 'Clinic Visit',
    match: ['toothache', 'tooth pain', 'dental', 'daant dard', 'gum swelling', 'tooth infection'],
    strong: ['toothache', 'tooth pain'],
  },
  {
    id: 'back-pain',
    name: 'Low back / musculoskeletal pain',
    aka: 'kamar dard',
    summary:
      'Mechanical back or muscle pain from strain, posture or lifting. Most improves within a few weeks with movement and simple analgesia.',
    symptoms: ['Dull or sharp lower-back/muscle ache', 'Worse with certain movements; stiffness', 'No fever; often follows lifting/strain'],
    self_care: [
      'Stay gently active — avoid prolonged bed rest.',
      'Hot/cold packs; correct lifting posture; light stretching.',
      'Gradually return to normal activity.',
    ],
    watch_for: ['Leg weakness/numbness', 'Loss of bladder/bowel control', 'Fever with back pain', 'Pain after major injury', 'Unexplained weight loss'],
    otc: ['Paracetamol or ibuprofen short-term — ask a pharmacist'],
    typicalCare: 'Home Care',
    match: ['back pain', 'low back pain', 'kamar dard', 'muscle pain', 'sprain', 'twisted', 'body strain', 'pulled muscle'],
    strong: ['back pain', 'kamar dard'],
  },
  {
    id: 'heat-illness',
    name: 'Heat exhaustion / heat stroke',
    aka: 'loo lagna',
    summary:
      'Heat exhaustion (heavy sweating, weakness) can progress to heat stroke (hot dry skin, confusion) — a life-threatening emergency in Indian summers.',
    symptoms: ['Heavy sweating, weakness, dizziness, cramps (exhaustion)', 'Hot dry skin, confusion, fainting, very high temperature (stroke)', 'Headache, nausea'],
    self_care: [
      'Move to shade/cool place; loosen clothing.',
      'Cool the body with wet cloths/fanning; sip ORS or water if alert.',
      'For confusion/collapse (heat stroke): cool aggressively and call 108.',
    ],
    watch_for: ['Confusion/unconsciousness', 'Hot dry skin, no sweating', 'Seizure', 'Vomiting unable to drink'],
    otc: ['ORS/water — no medicine substitutes for cooling'],
    typicalCare: 'Clinic Visit',
    match: ['heat stroke', 'heat exhaustion', 'loo lagna', 'too much heat', 'fainted in sun', 'overheated', 'sunstroke'],
    strong: ['heat stroke', 'sunstroke'],
  },
  {
    id: 'anemia',
    name: 'Anaemia',
    aka: 'khoon ki kami',
    summary:
      'Low haemoglobin (often iron deficiency) causing tiredness and pallor — very common in women and children in India. Confirmed by a blood test.',
    symptoms: ['Tiredness, weakness, breathlessness on exertion', 'Pale skin, lips, nails', 'Dizziness, poor concentration'],
    self_care: [
      'Iron-rich foods (green leafy veg, jaggery, pulses, eggs) + vitamin C.',
      'Get haemoglobin tested; take iron-folic acid as advised.',
      'Deworming and treating the cause (e.g., heavy periods) helps.',
    ],
    watch_for: ['Severe breathlessness', 'Chest pain', 'Fainting', 'Black stools (bleeding source)'],
    otc: ['Iron-folic acid tablets — dosing/duration on medical advice'],
    typicalCare: 'Clinic Visit',
    match: ['anemia', 'anaemia', 'low hemoglobin', 'low haemoglobin', 'khoon ki kami', 'always tired and pale', 'weakness pale'],
    strong: ['anaemia', 'low haemoglobin'],
  },
  {
    id: 'mental-health',
    name: 'Emotional distress / mental health',
    aka: 'stress / sadness',
    summary:
      'Persistent low mood, anxiety, or hopelessness is a health issue that deserves support. Help is available and effective.',
    symptoms: ['Persistent sadness, loss of interest, hopelessness', 'Sleep/appetite changes, constant worry', 'Difficulty coping with daily life'],
    self_care: [
      'You are not alone — talk to someone you trust.',
      'Tele-MANAS helpline: 14416 (24×7, free, confidential).',
      'Maintain routine, sleep, light activity; reduce alcohol.',
    ],
    watch_for: ['Thoughts of self-harm or suicide', 'Hearing voices / losing touch with reality', 'Unable to care for self'],
    otc: ['No OTC — counselling/clinical care is the right path'],
    typicalCare: 'Clinic Visit',
    match: ['depressed', 'depression', 'anxiety', 'stressed', 'hopeless', 'cant cope', 'feeling low', 'panic'],
    strong: ['depression', 'anxiety'],
  },
];

/* ─────────────────────────────────────────────────────────────────────────
   Matching
   ───────────────────────────────────────────────────────────────────────── */

/** Same normalisation as the deterministic engine in `api.ts`. */
function normalise(raw: string): string {
  return ` ${raw.toLowerCase().replace(/[^\w\s']/g, ' ').replace(/\s+/g, ' ')} `;
}

function phraseHit(haystack: string, phrase: string): boolean {
  return (
    haystack.includes(` ${phrase} `) ||
    haystack.includes(`${phrase} `) ||
    haystack.includes(` ${phrase}`)
  );
}

/**
 * Pick the single best-matching condition for free-text symptoms.
 *
 * `careHint` is the verdict already decided by the authoritative engine. It
 * only breaks ties / filters implausible matches — it never *creates* a match
 * and the returned guidance never changes the care level.
 *
 * Returns `null` when nothing scores above the confidence floor (better to
 * show no condition than a wrong one).
 */
export function identifyCondition(
  symptoms: string,
  careHint?: CareLevel,
): ConditionGuidance | null {
  const text = normalise(symptoms);
  if (text.trim().length < 2) return null;

  let best: { entry: ConditionEntry; score: number } | null = null;

  for (const entry of CONDITIONS) {
    let score = 0;
    for (const p of entry.match) if (phraseHit(text, p)) score += 1;
    for (const p of entry.strong ?? []) if (phraseHit(text, p)) score += 3;
    if (score === 0) continue;

    // Care alignment nudges: an emergency verdict should surface the matching
    // emergency condition, not a mild look-alike, and vice-versa.
    if (careHint) {
      if (careHint === 'Emergency Room' && entry.typicalCare === 'Emergency Room') score += 2;
      if (careHint !== 'Emergency Room' && entry.typicalCare === 'Emergency Room') score -= 2;
      if (careHint === 'Home Care' && entry.typicalCare === 'Home Care') score += 1;
    }

    if (!best || score > best.score) best = { entry, score };
  }

  // Confidence floor: a single weak keyword (score 1) is not enough on its own
  // unless it was a strong/hallmark phrase (which alone scores ≥3).
  if (!best || best.score < 2) return null;

  const { entry } = best;
  // Strip internal-only fields before handing to the UI.
  const { match: _m, strong: _s, ...guidance } = entry;
  return guidance;
}

/** Full read-only KB — for a future "conditions reference" page if needed. */
export function allConditions(): ConditionGuidance[] {
  return CONDITIONS.map(({ match: _m, strong: _s, ...g }) => g);
}
