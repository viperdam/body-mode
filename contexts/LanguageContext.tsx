
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language } from '../types';

type Translations = {
  [key: string]: {
    [key in Language]: string;
  };
};

// HELPER: To ensure all languages are covered without repeating type definition heavily
const dictionary: Translations = {
  // Navigation & General
  'nav.home': { 
      en: 'Home', ar: 'الرئيسية', fr: 'Accueil', es: 'Inicio', hi: 'होम',
      de: 'Start', nl: 'Home', zh: '首页', ja: 'ホーム', ko: '홈', tr: 'Anasayfa', sw: 'Nyumbani', pt: 'Início'
  },
  'nav.coach': { 
      en: 'Coach', ar: 'المدرب', fr: 'Coach', es: 'Entrenador', hi: 'कोच',
      de: 'Coach', nl: 'Coach', zh: '教练', ja: 'コーチ', ko: '코치', tr: 'Koç', sw: 'Kocha', pt: 'Treinador'
  },
  'nav.profile': { 
      en: 'Profile', ar: 'الملف', fr: 'Profil', es: 'Perfil', hi: 'प्रोफ़ाइल',
      de: 'Profil', nl: 'Profiel', zh: '个人资料', ja: 'プロフィール', ko: '프로필', tr: 'Profil', sw: 'Wasifu', pt: 'Perfil'
  },
  'nav.settings': { 
      en: 'Settings', ar: 'الإعدادات', fr: 'Paramètres', es: 'Ajustes', hi: 'सेटिंग्स',
      de: 'Einst.', nl: 'Instell.', zh: '设置', ja: '設定', ko: '설정', tr: 'Ayarlar', sw: 'Mipangilio', pt: 'Config.'
  },
  'continue': { 
      en: 'Continue', ar: 'متابعة', fr: 'Continuer', es: 'Continuar', hi: 'जारी रखें',
      de: 'Weiter', nl: 'Doorgaan', zh: '继续', ja: '次へ', ko: '계속', tr: 'Devam', sw: 'Endelea', pt: 'Continuar'
  },
  
  // Welcome & Language
  'select_language': { 
      en: 'Choose Language', ar: 'اختر اللغة', fr: 'Choisir la langue', es: 'Elegir idioma', hi: 'भाषा चुनें',
      de: 'Sprache wählen', nl: 'Kies taal', zh: '选择语言', ja: '言語を選択', ko: '언어 선택', tr: 'Dil Seçin', sw: 'Chagua Lugha', pt: 'Escolha o Idioma'
  },
  'welcome_subtitle': { 
      en: 'AI-Powered Living', ar: 'حياة ذكية بالذكاء الاصطناعي', fr: 'Vie alimentée par IA', es: 'Vida impulsada por IA', hi: 'AI-संचालित जीवन',
      de: 'KI-gesteuertes Leben', nl: 'Leven met AI', zh: 'AI 驱动的生活', ja: 'AIによる生活', ko: 'AI 기반 라이프', tr: 'YZ Destekli Yaşam', sw: 'Maisha ya AI', pt: 'Vida com IA'
  },
  'terms_agree': { 
      en: 'By continuing, you agree to our Terms.', ar: 'بالمتابعة، أنت توافق على الشروط.', fr: 'En continuant, vous acceptez nos conditions.', es: 'Al continuar, aceptas nuestros términos.', hi: 'जारी रखकर, आप हमारी शर्तों से सहमत हैं।',
      de: 'Durch Fortfahren stimmen Sie zu.', nl: 'U gaat akkoord met de voorwaarden.', zh: '继续即表示您同意条款。', ja: '続行することで利用規約に同意します。', ko: '계속하면 약관에 동의합니다.', tr: 'Devam ederek şartları kabul edersiniz.', sw: 'Kwa kuendelea, unakubali masharti.', pt: 'Ao continuar, aceita os termos.'
  },

  // Onboarding - Step 1 (Basics)
  'basics_title': { 
      en: 'The Basics', ar: 'الأساسيات', fr: 'Les Bases', es: 'Lo Básico', hi: 'मूल बातें',
      de: 'Die Grundlagen', nl: 'De Basis', zh: '基础信息', ja: '基本情報', ko: '기본 정보', tr: 'Temeller', sw: 'Misingi', pt: 'O Básico'
  },
  'basics_subtitle': { 
      en: 'Who are we designing for?', ar: 'لمن نصمم هذا البرنامج؟', fr: 'Pour qui concevons-nous ?', es: '¿Para quién diseñamos?', hi: 'हम किसके लिए डिजाइन कर रहे हैं?',
      de: 'Für wen entwerfen wir?', nl: 'Voor wie ontwerpen we?', zh: '我们为谁设计？', ja: '誰のために設計しますか？', ko: '누구를 위한 설계인가요?', tr: 'Kimin için tasarlıyoruz?', sw: 'Tunamtengenezea nani?', pt: 'Para quem projetamos?'
  },
  'placeholder_name': { 
      en: 'Your Name', ar: 'اسمك', fr: 'Votre Nom', es: 'Tu Nombre', hi: 'आपका नाम',
      de: 'Dein Name', nl: 'Je Naam', zh: '你的名字', ja: 'あなたの名前', ko: '이름', tr: 'Adınız', sw: 'Jina Lako', pt: 'Seu Nome'
  },
  'label_age': { 
      en: 'Age', ar: 'العمر', fr: 'Âge', es: 'Edad', hi: 'आयु',
      de: 'Alter', nl: 'Leeftijd', zh: '年龄', ja: '年齢', ko: '나이', tr: 'Yaş', sw: 'Umri', pt: 'Idade'
  },
  'label_weight': { 
      en: 'Weight (kg)', ar: 'الوزن (كجم)', fr: 'Poids (kg)', es: 'Peso (kg)', hi: 'वजन (किग्रा)',
      de: 'Gewicht (kg)', nl: 'Gewicht (kg)', zh: '体重 (kg)', ja: '体重 (kg)', ko: '체중 (kg)', tr: 'Kilo (kg)', sw: 'Uzito (kg)', pt: 'Peso (kg)'
  },
  'label_height': { 
      en: 'Height (cm)', ar: 'الطول (سم)', fr: 'Taille (cm)', es: 'Altura (cm)', hi: 'ऊंचाई (सेमी)',
      de: 'Größe (cm)', nl: 'Lengte (cm)', zh: '身高 (cm)', ja: '身長 (cm)', ko: '키 (cm)', tr: 'Boy (cm)', sw: 'Urefu (cm)', pt: 'Altura (cm)'
  },

  // Onboarding - Culinary Identity
  'identity_title': {
      en: 'Culinary Identity', ar: 'الهوية الغذائية', fr: 'Identité Culinaire', es: 'Identidad Culinaria', hi: 'पाक पहचान',
      de: 'Kulinarische Identität', nl: 'Culinaire Identiteit', zh: '饮食特征', ja: '食のアイデンティティ', ko: '식문화 정체성', tr: 'Mutfak Kimliği', sw: 'Utambulisho wa Upishi', pt: 'Identidade Culinária'
  },
  'identity_subtitle': {
      en: 'Bridge your heritage with your location.', ar: 'اربط تراثك بمكان إقامتك.', fr: 'Reliez votre héritage à votre lieu.', es: 'Une tu herencia con tu ubicación.', hi: 'अपनी विरासत को अपने स्थान से जोड़ें।',
      de: 'Verbinde Erbe mit Standort.', nl: 'Verbind erfgoed met locatie.', zh: '连接传统与现居地。', ja: '伝統と現在地をつなぐ。', ko: '전통과 현재 위치를 연결하세요.', tr: 'Mirasını konumunla birleştir.', sw: 'Unganisha asili na eneo.', pt: 'Una sua herança ao local.'
  },
  'origin_label': {
      en: 'Origin / Heritage', ar: 'الأصل / التراث', fr: 'Origine / Héritage', es: 'Origen / Herencia', hi: 'मूल / विरासत',
      de: 'Herkunft / Erbe', nl: 'Afkomst / Erfgoed', zh: '籍贯 / 传统', ja: '出身 / 伝統', ko: '출신 / 전통', tr: 'Köken / Miras', sw: 'Asili / Urithi', pt: 'Origem / Herança'
  },
  'origin_placeholder': {
      en: 'e.g. Lebanese, Mexican...', ar: 'مثلاً: لبناني، مكسيكي...', fr: 'ex. Libanais, Mexicain...', es: 'ej. Libanés, Mexicano...', hi: 'जैसे लेबनानी, मैक्सिकन...',
      de: 'z.B. Libanesisch, Mexikanisch...', nl: 'bijv. Libanees, Mexicaans...', zh: '例如：黎巴嫩，墨西哥...', ja: '例：レバノン、メキシコ...', ko: '예: 레바논, 멕시코...', tr: 'ör. Lübnan, Meksika...', sw: 'mfano Lebanoni, Mexico...', pt: 'ex. Libanês, Mexicano...'
  },
  'residence_label': {
      en: 'Current Residence', ar: 'مكان الإقامة الحالي', fr: 'Résidence Actuelle', es: 'Residencia Actual', hi: 'वर्तमान निवास',
      de: 'Aktueller Wohnort', nl: 'Huidige Woonplaats', zh: '现居地', ja: '現在の居住地', ko: '현재 거주지', tr: 'Mevcut İkamet', sw: 'Makazi ya Sasa', pt: 'Residência Atual'
  },
  'residence_placeholder': {
      en: 'e.g. Berlin, Dubai...', ar: 'مثلاً: برلين، دبي...', fr: 'ex. Berlin, Dubaï...', es: 'ej. Berlín, Dubái...', hi: 'जैसे बर्लिन, दुबई...',
      de: 'z.B. Berlin, Dubai...', nl: 'bijv. Berlijn, Dubai...', zh: '例如：柏林，迪拜...', ja: '例：ベルリン、ドバイ...', ko: '예: 베를린, 두바이...', tr: 'ör. Berlin, Dubai...', sw: 'mfano Berlin, Dubai...', pt: 'ex. Berlim, Dubai...'
  },

  // Onboarding - Step 2 (Avatar)
  'avatar_title': { 
      en: 'Choose Persona', ar: 'اختر شخصيتك', fr: 'Choisir Avatar', es: 'Elige Personaje', hi: 'पात्र चुनें',
      de: 'Persona wählen', nl: 'Kies Persona', zh: '选择角色', ja: 'ペルソナを選択', ko: '페르소나 선택', tr: 'Karakter Seç', sw: 'Chagua Wasifu', pt: 'Escolha Persona'
  },
  'avatar_subtitle': { 
      en: 'Which vibe matches you?', ar: 'أي نمط يناسبك؟', fr: 'Quelle ambiance vous correspond ?', es: '¿Qué estilo te va?', hi: 'कौन सा वाइब आपसे मेल खाता है?',
      de: 'Welcher Vibe passt zu dir?', nl: 'Welke vibe past bij jou?', zh: '哪种风格适合你？', ja: 'どの雰囲気が合いますか？', ko: '어떤 스타일인가요?', tr: 'Hangi tarz sensin?', sw: 'Mtindo gani unakufaa?', pt: 'Qual vibe combina com você?'
  },
  'avatar_titan': { en: 'The Titan', ar: 'العملاق', fr: 'Le Titan', es: 'El Titán', hi: 'द टाइटन', de: 'Der Titan', nl: 'De Titaan', zh: '泰坦', ja: 'タイタン', ko: '타이탄', tr: 'Titan', sw: 'Jitu', pt: 'O Titã' },
  'avatar_zen': { en: 'The Zen', ar: 'المتزن', fr: 'Le Zen', es: 'El Zen', hi: 'द ज़ेन', de: 'Der Zen', nl: 'De Zen', zh: '禅', ja: '禅', ko: '젠', tr: 'Zen', sw: 'Zen', pt: 'O Zen' },
  'avatar_cyborg': { en: 'The Cyborg', ar: 'السايبورغ', fr: 'Le Cyborg', es: 'El Cyborg', hi: 'द साइबोर्ग', de: 'Der Cyborg', nl: 'De Cyborg', zh: '赛博格', ja: 'サイボーグ', ko: '사이보그', tr: 'Cyborg', sw: 'Cyborg', pt: 'O Ciborgue' },
  'avatar_sprinter': { en: 'The Sprinter', ar: 'العداء', fr: 'Le Sprinter', es: 'El Velocista', hi: 'द स्प्रिंटर', de: 'Der Sprinter', nl: 'De Sprinter', zh: '短跑者', ja: 'スプリンター', ko: '스프린터', tr: 'Sprinter', sw: 'Mwanariadha', pt: 'O Velocista' },

  // Onboarding - Step 3 (Activity)
  'activity_title': { 
      en: 'Activity', ar: 'النشاط', fr: 'Activité', es: 'Actividad', hi: 'गतिविधि',
      de: 'Aktivität', nl: 'Activiteit', zh: '活动量', ja: '活動量', ko: '활동량', tr: 'Aktivite', sw: 'Shughuli', pt: 'Atividade'
  },
  'activity_subtitle': { 
      en: 'How much do you move?', ar: 'ما معدل حركتك؟', fr: 'Combien bougez-vous ?', es: '¿Cuánto te mueves?', hi: 'आप कितना चलते हैं?',
      de: 'Wie viel bewegst du dich?', nl: 'Hoeveel beweeg je?', zh: '你的运动量如何？', ja: 'どれくらい動きますか？', ko: '얼마나 움직이나요?', tr: 'Ne kadar hareketlisin?', sw: 'Unatembea kiasi gani?', pt: 'Quanto você se move?'
  },

  // Onboarding - Medical & Health
  'health_context': { 
      en: 'Health Context', ar: 'السياق الصحي', fr: 'Contexte Santé', es: 'Contexto de Salud', hi: 'स्वास्थ्य संदर्भ',
      de: 'Gesundheitskontext', nl: 'Gezondheid', zh: '健康背景', ja: '健康状態', ko: '건강 상태', tr: 'Sağlık Durumu', sw: 'Hali ya Afya', pt: 'Contexto Saúde'
  },
  'health_subtitle': { 
      en: 'AI will adjust metabolism based on this.', ar: 'الذكاء الاصطناعي سيضبط الحرق بناءً على هذا.', fr: 'L\'IA ajustera le métabolisme.', es: 'La IA ajustará el metabolismo.', hi: 'AI इसके आधार पर मेटाबॉलिज्म समायोजित करेगा।',
      de: 'KI passt den Stoffwechsel an.', nl: 'AI past metabolisme aan.', zh: 'AI 将据此调整代谢。', ja: 'AIが代謝を調整します。', ko: 'AI가 대사를 조정합니다.', tr: 'YZ metabolizmayı ayarlayacak.', sw: 'AI itarekebisha umetaboli.', pt: 'IA ajustará o metabolismo.'
  },
  'conditions_injuries': { 
      en: 'Conditions / Injuries', ar: 'أمراض / إصابات', fr: 'Conditions / Blessures', es: 'Condiciones / Lesiones', hi: 'स्थितियां / चोटें',
      de: 'Krankheiten / Verletzungen', nl: 'Aandoeningen / Blessures', zh: '疾病 / 受伤', ja: '病気 / 怪我', ko: '질환 / 부상', tr: 'Hastalık / Yaralanma', sw: 'Magonjwa / Majeraha', pt: 'Condições / Lesões'
  },
  'medications': { 
      en: 'Medications', ar: 'الأدوية', fr: 'Médicaments', es: 'Medicamentos', hi: 'दवाएं',
      de: 'Medikamente', nl: 'Medicijnen', zh: '药物', ja: '薬', ko: '약물', tr: 'İlaçlar', sw: 'Dawa', pt: 'Medicamentos'
  },
  'current_status': { 
      en: 'Current Status', ar: 'الحالة الحالية', fr: 'Statut Actuel', es: 'Estado Actual', hi: 'वर्तमान स्थिति',
      de: 'Aktueller Status', nl: 'Huidige Status', zh: '当前状态', ja: '現在の状態', ko: '현재 상태', tr: 'Mevcut Durum', sw: 'Hali ya Sasa', pt: 'Estado Atual'
  },
  'status_healthy': { 
      en: 'Healthy', ar: 'بصحة جيدة', fr: 'En bonne santé', es: 'Saludable', hi: 'स्वस्थ',
      de: 'Gesund', nl: 'Gezond', zh: '健康', ja: '健康', ko: '건강함', tr: 'Sağlıklı', sw: 'Afya Njema', pt: 'Saudável'
  },
  'status_sick': { 
      en: 'Sick', ar: 'مريض', fr: 'Malade', es: 'Enfermo', hi: 'बीमार',
      de: 'Krank', nl: 'Ziek', zh: '生病', ja: '病気', ko: '아픔', tr: 'Hasta', sw: 'Mgonjwa', pt: 'Doente'
  },
  'status_recovering': { 
      en: 'Recovering', ar: 'في نقاهة', fr: 'En convalescence', es: 'Recuperándose', hi: 'सुधर रहा',
      de: 'Erholend', nl: 'Herstellend', zh: '康复中', ja: '回復中', ko: '회복 중', tr: 'İyileşiyor', sw: 'Anapona', pt: 'Recuperando'
  },
  'symptoms_question': { 
      en: 'What are your symptoms?', ar: 'ما هي أعراضك؟', fr: 'Quels sont vos symptômes ?', es: '¿Cuáles son tus síntomas?', hi: 'आपके लक्षण क्या हैं?',
      de: 'Was sind deine Symptome?', nl: 'Wat zijn je symptomen?', zh: '你有什么症状？', ja: '症状は何ですか？', ko: '증상이 무엇인가요?', tr: 'Belirtilerin neler?', sw: 'Dalili zako ni zipi?', pt: 'Quais seus sintomas?'
  },
  'symptoms_placeholder': { 
      en: 'e.g. Flu, Fever...', ar: 'مثلاً: انفلونزا، حمى...', fr: 'ex. Grippe, Fièvre...', es: 'ej. Gripe, Fiebre...', hi: 'जैसे फ्लू, बुखार...',
      de: 'z.B. Grippe, Fieber...', nl: 'bijv. Griep, Koorts...', zh: '例如：流感，发烧...', ja: '例：インフルエンザ、熱...', ko: '예: 독감, 열...', tr: 'ör. Grip, Ateş...', sw: 'mfano Homa...', pt: 'ex. Gripe, Febre...'
  },
  'chronic_conditions': { 
      en: 'Chronic Conditions', ar: 'أمراض مزمنة', fr: 'Maladies chroniques', es: 'Enfermedades crónicas', hi: 'दीर्घकालिक स्थितियां',
      de: 'Chronische Erkrankungen', nl: 'Chronische aandoeningen', zh: '慢性病', ja: '慢性疾患', ko: '만성 질환', tr: 'Kronik Hastalıklar', sw: 'Magonjwa Sugu', pt: 'Condições Crônicas'
  },
  'injuries_placeholder': { 
      en: 'e.g. Bad knee...', ar: 'مثلاً: ألم ركبة...', fr: 'ex. Genou douloureux...', es: 'ej. Dolor de rodilla...', hi: 'जैसे घुटने का दर्द...',
      de: 'z.B. Schlechtes Knie...', nl: 'bijv. Slechte knie...', zh: '例如：膝盖不好...', ja: '例：膝が痛い...', ko: '예: 무릎 통증...', tr: 'ör. Diz ağrısı...', sw: 'mfano Goti baya...', pt: 'ex. Joelho ruim...'
  },
  'meds_placeholder': { 
      en: 'e.g. Insulin...', ar: 'مثلاً: أنسولين...', fr: 'ex. Insuline...', es: 'ej. Insulina...', hi: 'जैसे इंसुलिन...',
      de: 'z.B. Insulin...', nl: 'bijv. Insuline...', zh: '例如：胰岛素...', ja: '例：インスリン...', ko: '예: 인슐린...', tr: 'ör. İnsülin...', sw: 'mfano Insulini...', pt: 'ex. Insulina...'
  },

  // Onboarding - Step 5 (Goal)
  'goal_title': { 
      en: 'Your Goal', ar: 'هدفك', fr: 'Votre Objectif', es: 'Tu Meta', hi: 'आपका लक्ष्य',
      de: 'Dein Ziel', nl: 'Jouw Doel', zh: '你的目标', ja: 'あなたの目標', ko: '목표', tr: 'Hedefin', sw: 'Lengo Lako', pt: 'Sua Meta'
  },
  'goal_subtitle': { 
      en: 'What is the mission?', ar: 'ما هي المهمة؟', fr: 'Quelle est la mission ?', es: '¿Cuál es la misión?', hi: 'मिशन क्या है?',
      de: 'Was ist die Mission?', nl: 'Wat is de missie?', zh: '任务是什么？', ja: 'ミッションは何ですか？', ko: '미션은 무엇인가요?', tr: 'Görev nedir?', sw: 'Dhamira ni nini?', pt: 'Qual a missão?'
  },
  'lose_weight': { 
      en: 'Lose Weight', ar: 'خسارة وزن', fr: 'Perdre du poids', es: 'Perder Peso', hi: 'वजन कम करें',
      de: 'Abnehmen', nl: 'Afvallen', zh: '减肥', ja: '減量', ko: '체중 감량', tr: 'Kilo Ver', sw: 'Punguza Uzito', pt: 'Perder Peso'
  },
  'maintain': { 
      en: 'Maintain', ar: 'حفاظ', fr: 'Maintenir', es: 'Mantener', hi: 'बनाए रखें',
      de: 'Erhalten', nl: 'Behouden', zh: '保持', ja: '維持', ko: '유지', tr: 'Koru', sw: 'Dumisha', pt: 'Manter'
  },
  'build_muscle': { 
      en: 'Build Muscle', ar: 'بناء عضلات', fr: 'Musculation', es: 'Ganar Músculo', hi: 'मांसपेशियां बनाएं',
      de: 'Muskeln aufbauen', nl: 'Spieren opbouwen', zh: '增肌', ja: '筋肉をつける', ko: '근육 증가', tr: 'Kas Yap', sw: 'Jenga Misuli', pt: 'Ganhar Músculo'
  },
  'desc_lose': { 
      en: 'Burn fat & get lean', ar: 'حرق دهون ولياقة', fr: 'Brûler graisses', es: 'Quemar grasa', hi: 'वसा जलाएं',
      de: 'Fett verbrennen', nl: 'Vet verbranden', zh: '燃烧脂肪', ja: '脂肪燃焼', ko: '지방 연소', tr: 'Yağ yak', sw: 'Choma mafuta', pt: 'Queimar gordura'
  },
  'desc_maintain': { 
      en: 'Stay fit & healthy', ar: 'صحة ورشاقة', fr: 'Rester en forme', es: 'Estar en forma', hi: 'फिट रहें',
      de: 'Fit bleiben', nl: 'Fit blijven', zh: '保持健康', ja: '健康維持', ko: '건강 유지', tr: 'Fit kal', sw: 'Kaa fiti', pt: 'Ficar em forma'
  },
  'desc_build': { 
      en: 'Get strong & big', ar: 'قوة وضخامة', fr: 'Devenir fort', es: 'Ponerse fuerte', hi: 'मजबूत बनें',
      de: 'Stark werden', nl: 'Sterk worden', zh: '变得强壮', ja: '強くなる', ko: '강해지기', tr: 'Güçlen', sw: 'Kuwa na nguvu', pt: 'Ficar forte'
  },
  'generate_plan': { 
      en: 'Generate My Plan', ar: 'أنشئ خطتي', fr: 'Générer mon plan', es: 'Generar Mi Plan', hi: 'मेरी योजना बनाएं',
      de: 'Plan erstellen', nl: 'Genereer Plan', zh: '生成计划', ja: 'プランを作成', ko: '계획 생성', tr: 'Planı Oluştur', sw: 'Tengeneza Mpango', pt: 'Gerar Plano'
  },
  
  // Dashboard & Profile
  'calories_left': { 
      en: 'Calories Left', ar: 'السعرات المتبقية', fr: 'Calories Restantes', es: 'Calorías Restantes', hi: 'शेष कैलोरी',
      de: 'Verbleibende Kalorien', nl: 'Overige Calorieën', zh: '剩余卡路里', ja: '残りカロリー', ko: '남은 칼로리', tr: 'Kalan Kalori', sw: 'Kalori Zilizobaki', pt: 'Calorias Restantes'
  },
  'goal': { 
      en: 'Goal', ar: 'الهدف', fr: 'Objectif', es: 'Objetivo', hi: 'लक्ष्य',
      de: 'Ziel', nl: 'Doel', zh: '目标', ja: '目標', ko: '목표', tr: 'Hedef', sw: 'Lengo', pt: 'Meta'
  },
  'consumed': { 
      en: 'Consumed', ar: 'المستهلك', fr: 'Consommé', es: 'Consumido', hi: 'उपभोग किया',
      de: 'Verbraucht', nl: 'Verbruikt', zh: '已消耗', ja: '消費済み', ko: '섭취함', tr: 'Tüketilen', sw: 'Imetumika', pt: 'Consumido'
  },
  'daily_plan': { 
      en: 'Your Daily Plan', ar: 'خطتك اليومية', fr: 'Votre Plan Quotidien', es: 'Tu Plan Diario', hi: 'आपकी दैनिक योजना',
      de: 'Dein Tagesplan', nl: 'Je Dagplan', zh: '每日计划', ja: '今日のプラン', ko: '일일 계획', tr: 'Günlük Planın', sw: 'Mpango wako wa Siku', pt: 'Seu Plano Diário'
  },
  'refine_plan': { 
      en: 'Refine Plan', ar: 'تحديث الخطة', fr: 'Affiner Plan', es: 'Refinar Plan', hi: 'योजना अपडेट करें',
      de: 'Plan verfeinern', nl: 'Plan verfijnen', zh: '优化计划', ja: 'プラン修正', ko: '계획 수정', tr: 'Planı İyileştir', sw: 'Boresha Mpango', pt: 'Refinar Plano'
  },
  'refining': { 
      en: 'Refining...', ar: 'جاري التحديث...', fr: 'Affinage...', es: 'Refinando...', hi: 'अपडेट हो रहा है...',
      de: 'Verfeinern...', nl: 'Verfijnen...', zh: '优化中...', ja: '修正中...', ko: '수정 중...', tr: 'İyileştiriliyor...', sw: 'Inaboresha...', pt: 'Refinando...'
  },
  'tap_refresh': { 
      en: 'Tap refresh to generate a plan.', ar: 'اضغط لتوليد خطة.', fr: 'Appuyez pour générer.', es: 'Toca para generar.', hi: 'योजना बनाने के लिए टैप करें।',
      de: 'Tippen zum Generieren.', nl: 'Tik om te genereren.', zh: '点击生成计划。', ja: 'タップして生成。', ko: '생성하려면 탭하세요.', tr: 'Oluşturmak için dokun.', sw: 'Gusa ili kutoa mpango.', pt: 'Toque para gerar.'
  },
  'water': { 
      en: 'Water', ar: 'الماء', fr: 'Eau', es: 'Agua', hi: 'पानी',
      de: 'Wasser', nl: 'Water', zh: '水', ja: '水', ko: '물', tr: 'Su', sw: 'Maji', pt: 'Água'
  },
  'sleep': { 
      en: 'Sleep', ar: 'النوم', fr: 'Sommeil', es: 'Sueño', hi: 'नींद',
      de: 'Schlaf', nl: 'Slaap', zh: '睡眠', ja: '睡眠', ko: '수면', tr: 'Uyku', sw: 'Usingizi', pt: 'Sono'
  },
  'fridge': { 
      en: 'Smart Fridge', ar: 'الثلاجة الذكية', fr: 'Frigo Intelligent', es: 'Refri Inteligente', hi: 'स्मार्ट फ्रिज',
      de: 'Smart Kühlschrank', nl: 'Slimme Koelkast', zh: '智能冰箱', ja: 'スマート冷蔵庫', ko: '스마트 냉장고', tr: 'Akıllı Buzdolabı', sw: 'Friji Mahiri', pt: 'Geladeira Inteligente'
  },
  'smart_chef': { 
      en: 'Smart Chef', ar: 'الطاهي الذكي', fr: 'Chef Intelligent', es: 'Chef Inteligente', hi: 'स्मार्ट शेफ',
      de: 'Smart Chef', nl: 'Slimme Chef', zh: '智能主厨', ja: 'スマートシェフ', ko: '스마트 셰프', tr: 'Akıllı Şef', sw: 'Mpishi Mahiri', pt: 'Chef Inteligente'
  },
  'edit_profile': { 
      en: 'Edit Profile', ar: 'تعديل الملف', fr: 'Modifier Profil', es: 'Editar Perfil', hi: 'प्रोफ़ाइल संपादित करें',
      de: 'Profil bearbeiten', nl: 'Profiel bewerken', zh: '编辑资料', ja: 'プロフィール編集', ko: '프로필 수정', tr: 'Profili Düzenle', sw: 'Hariri Wasifu', pt: 'Editar Perfil'
  },
  'save_update': { 
      en: 'Save & Update Plan', ar: 'حفظ وتحديث الخطة', fr: 'Sauvegarder et MAJ', es: 'Guardar y Actualizar', hi: 'सहेजें और अपडेट करें',
      de: 'Speichern & Update', nl: 'Opslaan & Update', zh: '保存并更新', ja: '保存して更新', ko: '저장 및 업데이트', tr: 'Kaydet ve Güncelle', sw: 'Hifadhi na Sasisha', pt: 'Salvar e Atualizar'
  },
  'basics': { 
      en: 'Basics', ar: 'الأساسيات', fr: 'Bases', es: 'Básicos', hi: 'मूल बातें',
      de: 'Grundlagen', nl: 'Basis', zh: '基本信息', ja: '基本', ko: '기본', tr: 'Temel', sw: 'Misingi', pt: 'Básicos'
  },
  
  // Smart Fridge Moods
  'cooking_mood': {
      en: 'Cooking Mood', ar: 'مزاج الطهي', fr: 'Humeur Cuisine', es: 'Modo Cocina', hi: 'कुकिंग मूड',
      de: 'Kochlaune', nl: 'Kookstemming', zh: '烹饪心情', ja: '料理気分', ko: '요리 기분', tr: 'Pişirme Modu', sw: 'Hali ya Upishi', pt: 'Modo Chef'
  },
  'mood_quick': {
      en: 'Quick & Easy', ar: 'سريع وسهل', fr: 'Rapide & Facile', es: 'Rápido y Fácil', hi: 'जल्दी और आसान',
      de: 'Schnell & Einfach', nl: 'Snel & Makkelijk', zh: '快速简单', ja: '早くて簡単', ko: '빠르고 쉽게', tr: 'Hızlı ve Kolay', sw: 'Haraka na Rahisi', pt: 'Rápido e Fácil'
  },
  'mood_balanced': {
      en: 'Balanced Chef', ar: 'شيف متوازن', fr: 'Chef Équilibré', es: 'Chef Equilibrado', hi: 'संतुलित शेफ',
      de: 'Ausgewogen', nl: 'Gebalanceerd', zh: '均衡饮食', ja: 'バランス重視', ko: '균형 잡힌 식사', tr: 'Dengeli Şef', sw: 'Mpishi Sawa', pt: 'Chef Equilibrado'
  },
  'mood_gourmet': {
      en: 'Gourmet Experience', ar: 'تجربة فاخرة', fr: 'Expérience Gourmet', es: 'Experiencia Gourmet', hi: 'गौर्मे अनुभव',
      de: 'Gourmet-Erlebnis', nl: 'Gourmet Ervaring', zh: '美食体验', ja: 'グルメ体験', ko: '미식 경험', tr: 'Gurme Deneyimi', sw: 'Uzoefu wa Kifahari', pt: 'Experiência Gourmet'
  },
  'chef_thinking': {
      en: 'Chef Gemini is cooking up ideas...', ar: 'الشيف يبتكر وصفات...', fr: 'Chef Gemini cuisine des idées...', es: 'El Chef Gemini está cocinando ideas...', hi: 'शेफ जेमिनी विचार पका रहा है...',
      de: 'Chef Gemini kocht Ideen...', nl: 'Chef Gemini broedt op ideeën...', zh: '大厨正在构思食谱...', ja: 'シェフがアイデアを調理中...', ko: '셰프가 아이디어를 요리 중...', tr: 'Şef fikir pişiriyor...', sw: 'Mpishi anapika mawazo...', pt: 'O Chef está criando receitas...'
  },

  // ... (Keep existing translations) ...
  'reminder': { 
      en: 'Reminder', ar: 'تذكير', fr: 'Rappel', es: 'Recordatorio', hi: 'रिमाइंडर',
      de: 'Erinnerung', nl: 'Herinnering', zh: '提醒', ja: 'リマインダー', ko: '알림', tr: 'Hatırlatıcı', sw: 'Kikumbusho', pt: 'Lembrete'
  },
  'yes_did_it': { 
      en: 'Yes, I did it!', ar: 'تم الإنجاز!', fr: 'Oui, c\'est fait!', es: '¡Sí, lo hice!', hi: 'हाँ, मैंने कर दिया!',
      de: 'Ja, erledigt!', nl: 'Ja, gedaan!', zh: '是的，我做了！', ja: 'はい、やりました！', ko: '네, 했어요!', tr: 'Evet, yaptım!', sw: 'Ndiyo, nimefanya!', pt: 'Sim, eu fiz!'
  },
  'snooze': { 
      en: 'Snooze', ar: 'غفوة', fr: 'Reporter', es: 'Posponer', hi: 'स्नूज़',
      de: 'Schlummern', nl: 'Snooze', zh: '稍后提醒', ja: 'スヌーズ', ko: '스누즈', tr: 'Ertele', sw: 'Ahirisha', pt: 'Soneca'
  },
  'skip': { 
      en: 'Skip It', ar: 'تخطي', fr: 'Passer', es: 'Saltar', hi: 'छोड़ें',
      de: 'Überspringen', nl: 'Overslaan', zh: '跳过', ja: 'スキップ', ko: '건너뛰기', tr: 'Atla', sw: 'Ruka', pt: 'Pular'
  },
  'remind_in': { 
      en: 'Remind me in...', ar: 'ذكرني بعد...', fr: 'Rappelez-moi dans...', es: 'Recordar en...', hi: 'मुझे याद दिलाएं...',
      de: 'Erinnerung in...', nl: 'Herinner mij over...', zh: '提醒我...', ja: '後で通知...', ko: '나중에 알림...', tr: 'Hatırlat...', sw: 'Nikumbushe ndani ya...', pt: 'Lembre-me em...'
  },
  'cancel': { 
      en: 'Cancel', ar: 'إلغاء', fr: 'Annuler', es: 'Cancelar', hi: 'रद्द करें',
      de: 'Abbrechen', nl: 'Annuleren', zh: '取消', ja: 'キャンセル', ko: '취소', tr: 'İptal', sw: 'Ghairi', pt: 'Cancelar'
  },
  
  // Action Modal - Food
  'how_log_food': { 
      en: 'How do you want to log?', ar: 'كيف تريد تسجيل الوجبة؟', fr: 'Comment enregistrer ?', es: '¿Cómo registrar?', hi: 'आप कैसे लॉग करना चाहते हैं?',
      de: 'Wie loggen?', nl: 'Hoe loggen?', zh: '如何记录？', ja: '記録方法は？', ko: '어떻게 기록할까요?', tr: 'Nasıl kaydedilsin?', sw: 'Unataka kuweka kumbukumbu vipi?', pt: 'Como registrar?'
  },
  'camera': { 
      en: 'Camera', ar: 'كاميرا', fr: 'Caméra', es: 'Cámara', hi: 'कैमरा',
      de: 'Kamera', nl: 'Camera', zh: '相机', ja: 'カメラ', ko: '카메라', tr: 'Kamera', sw: 'Kamera', pt: 'Câmera'
  },
  'text': { 
      en: 'Text', ar: 'كتابة', fr: 'Texte', es: 'Texto', hi: 'टेक्स्ट',
      de: 'Text', nl: 'Tekst', zh: '文本', ja: 'テキスト', ko: '텍스트', tr: 'Metin', sw: 'Maandishi', pt: 'Texto'
  },
  'favorites': { 
      en: 'Favorites', ar: 'المفضلة', fr: 'Favoris', es: 'Favoritos', hi: 'पसंदीदा',
      de: 'Favoriten', nl: 'Favorieten', zh: '收藏', ja: 'お気に入り', ko: '즐겨찾기', tr: 'Favoriler', sw: 'Vipendwa', pt: 'Favoritos'
  },
  'saved_meals': { 
      en: 'Saved Meals', ar: 'وجبات محفوظة', fr: 'Repas enregistrés', es: 'Comidas guardadas', hi: 'सहेजे गए भोजन',
      de: 'Gespeicherte Mahlzeiten', nl: 'Opgeslagen maaltijden', zh: '已存餐点', ja: '保存された食事', ko: '저장된 식사', tr: 'Kayıtlı Yemekler', sw: 'Vyakula vilivyohifadhiwa', pt: 'Refeições Salvas'
  },
  'no_saved': { 
      en: 'No saved meals yet.', ar: 'لا توجد وجبات محفوظة.', fr: 'Aucun repas.', es: 'Sin comidas.', hi: 'कोई भोजन नहीं।',
      de: 'Keine Mahlzeiten.', nl: 'Geen maaltijden.', zh: '暂无餐点。', ja: '食事がありません。', ko: '식사 없음.', tr: 'Kayıtlı yemek yok.', sw: 'Hakuna chakula.', pt: 'Sem refeições.'
  },
  'what_did_eat': { 
      en: 'What did you eat?', ar: 'ماذا أكلت؟', fr: 'Qu\'avez-vous mangé?', es: '¿Qué comiste?', hi: 'आपने क्या खाया?',
      de: 'Was hast du gegessen?', nl: 'Wat heb je gegeten?', zh: '你吃了什么？', ja: '何を食べましたか？', ko: '무엇을 드셨나요?', tr: 'Ne yedin?', sw: 'Ulikula nini?', pt: 'O que você comeu?'
  },
  'food_placeholder': { 
      en: 'e.g., Grilled chicken with rice', ar: 'مثلاً: دجاج مشوي مع أرز', fr: 'ex: Poulet grillé avec du riz', es: 'ej: Pollo asado con arroz', hi: 'जैसे, चावल के साथ ग्रिल्ड चिकन',
      de: 'z.B. Huhn mit Reis', nl: 'bijv. Kip met rijst', zh: '例如：烤鸡肉饭', ja: '例：チキンライス', ko: '예: 치킨 라이스', tr: 'ör. Tavuk pilav', sw: 'mfano Kuku na wali', pt: 'ex: Frango com arroz'
  },
  'weight_opt': { 
      en: 'Weight/Portion (Optional)', ar: 'الوزن/الكمية (اختياري)', fr: 'Poids (Optionnel)', es: 'Peso (Opcional)', hi: 'वजन (वैकल्पिक)',
      de: 'Gewicht (Optional)', nl: 'Gewicht (Optioneel)', zh: '重量 (可选)', ja: '重量 (任意)', ko: '무게 (선택)', tr: 'Ağırlık (İsteğe bağlı)', sw: 'Uzito (Hiari)', pt: 'Peso (Opcional)'
  },
  'weight_placeholder': { 
      en: 'e.g., 200g or "1 cup"', ar: 'مثلاً: 200 جم أو "كوب واحد"', fr: 'ex: 200g', es: 'ej: 200g', hi: 'जैसे, 200 ग्राम',
      de: 'z.B. 200g', nl: 'bijv. 200g', zh: '例如：200克', ja: '例：200g', ko: '예: 200g', tr: 'ör. 200g', sw: 'mfano 200g', pt: 'ex: 200g'
  },
  'analyzing': { 
      en: 'Analyzing...', ar: 'جاري التحليل...', fr: 'Analyse...', es: 'Analizando...', hi: 'विश्लेषण हो रहा है...',
      de: 'Analysiere...', nl: 'Analyseren...', zh: '分析中...', ja: '分析中...', ko: '분석 중...', tr: 'Analiz ediliyor...', sw: 'Inachambua...', pt: 'Analisando...'
  },
  'log_meal': { 
      en: 'Log Meal', ar: 'سجل الوجبة', fr: 'Enregistrer', es: 'Registrar', hi: 'भोजन लॉग करें',
      de: 'Mahlzeit loggen', nl: 'Maaltijd loggen', zh: '记录餐点', ja: '食事を記録', ko: '식사 기록', tr: 'Yemeği Kaydet', sw: 'Weka Chakula', pt: 'Registrar Refeição'
  },
  'save_favorite': { 
      en: 'Save to Favorites', ar: 'حفظ في المفضلة', fr: 'Enregistrer aux favoris', es: 'Guardar en favoritos', hi: 'पसंदीदा में सहेजें',
      de: 'Als Favorit speichern', nl: 'Opslaan in favorieten', zh: '保存到收藏', ja: 'お気に入りに保存', ko: '즐겨찾기에 저장', tr: 'Favorilere Kaydet', sw: 'Hifadhi kwa Vipendwa', pt: 'Salvar nos Favoritos'
  },
  'add_side': { 
      en: 'Add Side Item', ar: 'إضافة عنصر جانبي', fr: 'Ajouter un accompagnement', es: 'Agregar guarnición', hi: 'साइड आइटम जोड़ें',
      de: 'Beilage hinzufügen', nl: 'Bijgerecht toevoegen', zh: '添加配菜', ja: 'サイドメニューを追加', ko: '사이드 추가', tr: 'Yan Ürün Ekle', sw: 'Ongeza Kitu', pt: 'Adicionar Acompanhamento'
  },
  'add_item_placeholder': { 
      en: 'e.g. + 1 Banana', ar: 'مثلاً: + 1 موزة', fr: 'ex. + 1 Banane', es: 'ej. + 1 Banana', hi: 'जैसे + 1 केला',
      de: 'z.B. + 1 Banane', nl: 'bijv. + 1 Banaan', zh: '例如：+1 香蕉', ja: '例：+バナナ1本', ko: '예: + 바나나 1개', tr: 'ör. + 1 Muz', sw: 'mfano + ndizi 1', pt: 'ex. + 1 Banana'
  },

  // Action Modal - Water
  'log_water': { 
      en: 'Log Water', ar: 'سجل الماء', fr: 'Enregistrer Eau', es: 'Registrar Agua', hi: 'पानी लॉग करें',
      de: 'Wasser loggen', nl: 'Water loggen', zh: '记录喝水', ja: '水を記録', ko: '물 기록', tr: 'Su Kaydet', sw: 'Weka Maji', pt: 'Registrar Água'
  },
  'how_much': { 
      en: 'How much did you drink?', ar: 'كم شربت؟', fr: 'Combien avez-vous bu?', es: '¿Cuánto bebiste?', hi: 'आपने कितना पिया?',
      de: 'Wie viel getrunken?', nl: 'Hoeveel gedronken?', zh: '你喝了多少？', ja: 'どれくらい飲みましたか？', ko: '얼마나 마셨나요?', tr: 'Ne kadar içtin?', sw: 'Ulikunywa kiasi gani?', pt: 'Quanto você bebeu?'
  },
  'custom_amount': { 
      en: 'Custom Amount (ml)', ar: 'كمية مخصصة (مل)', fr: 'Quantité personnalisée', es: 'Cantidad personalizada', hi: 'कस्टम मात्रा (एमएल)',
      de: 'Eigene Menge (ml)', nl: 'Eigen hoeveelheid', zh: '自定义量 (ml)', ja: 'カスタム量 (ml)', ko: '사용자 지정 (ml)', tr: 'Özel Miktar', sw: 'Kiasi Maalum', pt: 'Quantia Personalizada'
  },

  // Weekly Check
  'weekly_check': { 
      en: 'Weekly Check-in', ar: 'الفحص الأسبوعي', fr: 'Bilan Hebdo', es: 'Chequeo Semanal', hi: 'साप्ताहिक जांच',
      de: 'Wöchentlicher Check', nl: 'Wekelijkse Check', zh: '每周检查', ja: '週間チェック', ko: '주간 확인', tr: 'Haftalık Kontrol', sw: 'Ukaguzi wa Wiki', pt: 'Check-in Semanal'
  },
  'update_weight': { 
      en: 'Update Weight', ar: 'تحديث الوزن', fr: 'Mettre à jour Poids', es: 'Actualizar Peso', hi: 'वजन अपडेट करें',
      de: 'Gewicht aktualisieren', nl: 'Gewicht bijwerken', zh: '更新体重', ja: '体重を更新', ko: '체중 업데이트', tr: 'Kiloyu Güncelle', sw: 'Sasisha Uzito', pt: 'Atualizar Peso'
  },
  'weight_msg': { 
      en: "It's been a week! Update your weight.", ar: 'مر أسبوع! حدث وزنك.', fr: 'Ça fait une semaine! MAJ poids.', es: '¡Pasó una semana! Actualiza peso.', hi: 'एक हफ्ता हो गया! वजन अपडेट करें।',
      de: 'Eine Woche vorbei! Update Gewicht.', nl: 'Het is een week geleden! Update gewicht.', zh: '已经一周了！更新体重。', ja: '1週間経ちました！体重を更新してください。', ko: '일주일이 지났습니다! 체중을 업데이트하세요.', tr: 'Bir hafta oldu! kilonu güncelle.', sw: 'Wiki imepita! Sasisha uzito.', pt: 'Faz uma semana! Atualize seu peso.'
  },

  // Settings
  'language': { 
      en: 'Language', ar: 'اللغة', fr: 'Langue', es: 'Idioma', hi: 'भाषा',
      de: 'Sprache', nl: 'Taal', zh: '语言', ja: '言語', ko: '언어', tr: 'Dil', sw: 'Lugha', pt: 'Idioma'
  },
  'appearance': { 
      en: 'Appearance', ar: 'المظهر', fr: 'Apparence', es: 'Apariencia', hi: 'दिखावट',
      de: 'Erscheinung', nl: 'Uiterlijk', zh: '外观', ja: '外観', ko: '외관', tr: 'Görünüm', sw: 'Muonekano', pt: 'Aparência'
  },
  'dark_mode': { 
      en: 'Dark Mode', ar: 'الوضع الليلي', fr: 'Mode Sombre', es: 'Modo Oscuro', hi: 'डार्क मोड',
      de: 'Dunkelmodus', nl: 'Donkere Modus', zh: '深色模式', ja: 'ダークモード', ko: '다크 모드', tr: 'Karanlık Mod', sw: 'Hali ya Giza', pt: 'Modo Escuro'
  },
  'notifications': { 
      en: 'Notifications', ar: 'التنبيهات', fr: 'Notifications', es: 'Notificaciones', hi: 'सूचनाएं',
      de: 'Benachrichtigungen', nl: 'Meldingen', zh: '通知', ja: '通知', ko: '알림', tr: 'Bildirimler', sw: 'Arifa', pt: 'Notificações'
  },
  'smart_reminders': { 
      en: 'Smart Reminders', ar: 'تنبيهات ذكية', fr: 'Rappels Intelligents', es: 'Recordatorios', hi: 'स्मार्ट रिमाइंडर',
      de: 'Smarte Erinnerungen', nl: 'Slimme Herinneringen', zh: '智能提醒', ja: 'スマートリマインダー', ko: '스마트 알림', tr: 'Akıllı Hatırlatıcılar', sw: 'Vikumbusho Mahiri', pt: 'Lembretes Inteligentes'
  },
  'enable': { 
      en: 'Enable', ar: 'تفعيل', fr: 'Activer', es: 'Activar', hi: 'सक्षम करें',
      de: 'Aktivieren', nl: 'Inschakelen', zh: '启用', ja: '有効にする', ko: '활성화', tr: 'Etkinleştir', sw: 'Washa', pt: 'Ativar'
  },
  'account': { 
      en: 'Account', ar: 'الحساب', fr: 'Compte', es: 'Cuenta', hi: 'खाता',
      de: 'Konto', nl: 'Account', zh: '账户', ja: 'アカウント', ko: '계정', tr: 'Hesap', sw: 'Akaunti', pt: 'Conta'
  },
  'daily_goal': { 
      en: 'Daily Goal', ar: 'الهدف اليومي', fr: 'Objectif Quotidien', es: 'Meta Diaria', hi: 'दैनिक लक्ष्य',
      de: 'Tagesziel', nl: 'Dagdoel', zh: '每日目标', ja: '毎日の目標', ko: '일일 목표', tr: 'Günlük Hedef', sw: 'Lengo la Siku', pt: 'Meta Diária'
  },
  'data_mgmt': { 
      en: 'Data Management', ar: 'إدارة البيانات', fr: 'Gestion Données', es: 'Gestión Datos', hi: 'डेटा प्रबंधन',
      de: 'Datenverwaltung', nl: 'Gegevensbeheer', zh: '数据管理', ja: 'データ管理', ko: '데이터 관리', tr: 'Veri Yönetimi', sw: 'Usimamizi wa Data', pt: 'Gestão de Dados'
  },
  'backup': { 
      en: 'Backup Data', ar: 'نسخ احتياطي', fr: 'Sauvegarder', es: 'Respaldo', hi: 'बैकअप',
      de: 'Backup', nl: 'Back-up', zh: '备份', ja: 'バックアップ', ko: '백업', tr: 'Yedekle', sw: 'Hifadhi Nakala', pt: 'Backup'
  },
  'import': { 
      en: 'Import Data', ar: 'استعادة', fr: 'Importer', es: 'Importar', hi: 'आयात',
      de: 'Importieren', nl: 'Importeren', zh: '导入', ja: 'インポート', ko: '가져오기', tr: 'İçe Aktar', sw: 'Ingiza', pt: 'Importar'
  },
  'sign_out': { 
      en: 'Sign Out', ar: 'تسجيل الخروج', fr: 'Déconnexion', es: 'Cerrar Sesión', hi: 'साइन आउट',
      de: 'Abmelden', nl: 'Uitloggen', zh: '退出', ja: 'サインアウト', ko: '로그아웃', tr: 'Çıkış Yap', sw: 'Ondoka', pt: 'Sair'
  },

  // Fridge
  'fridge_scan': { 
      en: 'Scan Fridge', ar: 'فحص الثلاجة', fr: 'Scanner Frigo', es: 'Escanear Refri', hi: 'फ्रिज स्कैन करें',
      de: 'Kühlschrank scannen', nl: 'Koelkast scannen', zh: '扫描冰箱', ja: '冷蔵庫をスキャン', ko: '냉장고 스캔', tr: 'Buzdolabını Tara', sw: 'Changanua Friji', pt: 'Escanear Geladeira'
  },
  'fridge_desc': { 
      en: 'Take a photo of your fridge ingredients.', ar: 'صور مكونات ثلاجتك.', fr: 'Prenez une photo du frigo.', es: 'Toma foto de tus ingredientes.', hi: 'अपने फ्रिज की सामग्री की फोटो लें।',
      de: 'Foto vom Kühlschrankinhalt.', nl: 'Maak een foto van de inhoud.', zh: '拍摄冰箱食材。', ja: '冷蔵庫の写真を撮ります。', ko: '냉장고 재료 사진을 찍으세요.', tr: 'Buzdolabı malzemelerini çek.', sw: 'Piga picha viungo vya friji.', pt: 'Tire uma foto dos ingredientes.'
  },
  'open_camera': { 
      en: 'Open Camera', ar: 'فتح الكاميرا', fr: 'Ouvrir Caméra', es: 'Abrir Cámara', hi: 'कैमरा खोलें',
      de: 'Kamera öffnen', nl: 'Camera openen', zh: '打开相机', ja: 'カメラを開く', ko: '카메라 열기', tr: 'Kamerayı Aç', sw: 'Fungua Kamera', pt: 'Abrir Câmera'
  },
  'analyzing_fridge': { 
      en: 'Detecting Ingredients...', ar: 'جاري اكتشاف المكونات...', fr: 'Détection des ingrédients...', es: 'Detectando ingredientes...', hi: 'सामग्री की पहचान हो रही है...',
      de: 'Zutaten werden erkannt...', nl: 'Ingrediënten detecteren...', zh: '正在识别食材...', ja: '材料を検出中...', ko: '재료 감지 중...', tr: 'Malzemeler algılanıyor...', sw: 'Inagundua viungo...', pt: 'Detectando Ingredientes...'
  },
  'ingredients_found': { 
      en: 'Ingredients Found', ar: 'المكونات المكتشفة', fr: 'Ingrédients trouvés', es: 'Ingredientes', hi: 'सामग्री मिली',
      de: 'Zutaten gefunden', nl: 'Ingrediënten gevonden', zh: '发现食材', ja: '見つかった材料', ko: '발견된 재료', tr: 'Bulunan Malzemeler', sw: 'Viungo Vilivyopatikana', pt: 'Ingredientes Encontrados'
  },
  'suggested_recipes': { 
      en: 'Suggested Recipes', ar: 'وصفات مقترحة', fr: 'Recettes suggérées', es: 'Recetas sugeridas', hi: 'सुझाए गए व्यंजन',
      de: 'Vorgeschlagene Rezepte', nl: 'Voorgestelde recepten', zh: '推荐食谱', ja: 'おすすめレシピ', ko: '추천 레시피', tr: 'Önerilen Tarifler', sw: 'Mapishi Yaliyopendekezwa', pt: 'Receitas Sugeridas'
  },
  'cal': { 
      en: 'cal', ar: 'سعرة', fr: 'cal', es: 'cal', hi: 'कैलोरी',
      de: 'kcal', nl: 'kcal', zh: '卡路里', ja: 'kcal', ko: 'kcal', tr: 'kal', sw: 'kal', pt: 'cal'
  },
  'prot': { 
      en: 'protein', ar: 'بروتين', fr: 'protéine', es: 'proteína', hi: 'प्रोटीन',
      de: 'Protein', nl: 'Eiwit', zh: '蛋白质', ja: 'タンパク質', ko: '단백질', tr: 'Protein', sw: 'Protini', pt: 'Proteína'
  },
  'missing': { 
      en: 'Missing', ar: 'ناقص', fr: 'Manquant', es: 'Faltante', hi: 'लापता',
      de: 'Fehlt', nl: 'Ontbrekend', zh: '缺少', ja: '不足', ko: '누락', tr: 'Eksik', sw: 'Kukosekana', pt: 'Faltando'
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  dir: 'ltr' | 'rtl';
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
  dir: 'ltr'
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('ls_lang') as Language) || 'en';
  });

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    localStorage.setItem('ls_lang', language);
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
    
    // Switch fonts based on language
    if (language === 'ar') {
        document.body.style.fontFamily = "'Tajawal', 'Plus Jakarta Sans', sans-serif";
    } else if (language === 'hi') {
        document.body.style.fontFamily = "'Poppins', 'Plus Jakarta Sans', sans-serif"; 
    } else if (language === 'zh' || language === 'ja' || language === 'ko') {
        // Fallback for East Asian fonts is usually handled by OS, but explicit sans-serif helps
        document.body.style.fontFamily = "'Noto Sans SC', 'Noto Sans JP', 'Noto Sans KR', sans-serif";
    } else {
        document.body.style.fontFamily = "'Plus Jakarta Sans', sans-serif";
    }
  }, [language, dir]);

  const t = (key: string) => {
    if (!dictionary[key]) return key;
    return dictionary[key][language] || dictionary[key]['en'];
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, dir }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
