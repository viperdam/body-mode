
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

  // ===== MISSING KEYS (referenced but not defined) =====
  'settings': {
      en: 'Settings', ar: 'الإعدادات', fr: 'Paramètres', es: 'Ajustes', hi: 'सेटिंग्स',
      de: 'Einstellungen', nl: 'Instellingen', zh: '设置', ja: '設定', ko: '설정', tr: 'Ayarlar', sw: 'Mipangilio', pt: 'Configurações'
  },
  'pref_account': {
      en: 'Preferences & Account', ar: 'التفضيلات والحساب', fr: 'Préférences & Compte', es: 'Preferencias y Cuenta', hi: 'प्राथमिकताएं और खाता',
      de: 'Einstellungen & Konto', nl: 'Voorkeuren & Account', zh: '偏好与账户', ja: '設定とアカウント', ko: '환경설정 및 계정', tr: 'Tercihler ve Hesap', sw: 'Mapendeleo na Akaunti', pt: 'Preferências e Conta'
  },
  'work_schedule': {
      en: 'Work Schedule', ar: 'جدول العمل', fr: 'Horaire de travail', es: 'Horario laboral', hi: 'कार्य अनुसूची',
      de: 'Arbeitsplan', nl: 'Werkschema', zh: '工作安排', ja: '勤務スケジュール', ko: '근무 일정', tr: 'Çalışma Programı', sw: 'Ratiba ya Kazi', pt: 'Horário de Trabalho'
  },
  'routine_title': {
      en: 'Activity & Routine', ar: 'النشاط والروتين', fr: 'Activité & Routine', es: 'Actividad y Rutina', hi: 'गतिविधि और दिनचर्या',
      de: 'Aktivität & Routine', nl: 'Activiteit & Routine', zh: '活动与作息', ja: '活動とルーティン', ko: '활동 및 루틴', tr: 'Aktivite ve Rutin', sw: 'Shughuli na Utaratibu', pt: 'Atividade e Rotina'
  },
  'routine_subtitle': {
      en: 'Set your daily patterns.', ar: 'حدد أنماطك اليومية.', fr: 'Définissez vos habitudes.', es: 'Define tus patrones diarios.', hi: 'अपनी दैनिक दिनचर्या सेट करें।',
      de: 'Lege deine Tagesroutine fest.', nl: 'Stel je dagelijkse patronen in.', zh: '设定你的日常模式。', ja: '日々のパターンを設定。', ko: '일상 패턴을 설정하세요.', tr: 'Günlük düzenini belirle.', sw: 'Weka mifumo yako ya kila siku.', pt: 'Defina seus padrões diários.'
  },
  'sleep_consistent': {
      en: 'Consistent', ar: 'منتظم', fr: 'Régulier', es: 'Consistente', hi: 'नियमित',
      de: 'Regelmäßig', nl: 'Regelmatig', zh: '规律', ja: '規則的', ko: '규칙적', tr: 'Düzenli', sw: 'Thabiti', pt: 'Consistente'
  },
  'sleep_irregular': {
      en: 'Irregular', ar: 'غير منتظم', fr: 'Irrégulier', es: 'Irregular', hi: 'अनियमित',
      de: 'Unregelmäßig', nl: 'Onregelmatig', zh: '不规律', ja: '不規則', ko: '불규칙', tr: 'Düzensiz', sw: 'Isiyo thabiti', pt: 'Irregular'
  },
  'target_sleep': {
      en: 'Target Sleep', ar: 'هدف النوم', fr: 'Objectif Sommeil', es: 'Meta de Sueño', hi: 'लक्ष्य नींद',
      de: 'Schlafziel', nl: 'Slaapdoel', zh: '睡眠目标', ja: '睡眠目標', ko: '수면 목표', tr: 'Uyku Hedefi', sw: 'Lengo la Usingizi', pt: 'Meta de Sono'
  },
  'wake_time': {
      en: 'Wake Time', ar: 'وقت الاستيقاظ', fr: 'Heure de réveil', es: 'Hora de despertar', hi: 'जागने का समय',
      de: 'Aufwachzeit', nl: 'Wektijd', zh: '起床时间', ja: '起床時間', ko: '기상 시간', tr: 'Uyanma Saati', sw: 'Wakati wa Kuamka', pt: 'Hora de Acordar'
  },
  'bed_time': {
      en: 'Bed Time', ar: 'وقت النوم', fr: 'Heure du coucher', es: 'Hora de dormir', hi: 'सोने का समय',
      de: 'Schlafenszeit', nl: 'Bedtijd', zh: '就寝时间', ja: '就寝時間', ko: '취침 시간', tr: 'Uyku Saati', sw: 'Wakati wa Kulala', pt: 'Hora de Dormir'
  },

  // ===== DASHBOARD =====
  'weekly_mission': {
      en: 'Weekly Mission', ar: 'مهمة الأسبوع', fr: 'Mission Hebdo', es: 'Misión Semanal', hi: 'साप्ताहिक मिशन',
      de: 'Wochenmission', nl: 'Weekmissie', zh: '每周任务', ja: '週間ミッション', ko: '주간 미션', tr: 'Haftalık Görev', sw: 'Misheni ya Wiki', pt: 'Missão Semanal'
  },
  'over_limit': {
      en: 'Over Limit', ar: 'تجاوز الحد', fr: 'Dépassement', es: 'Exceso', hi: 'सीमा से ऊपर',
      de: 'Überschritten', nl: 'Overschreden', zh: '超出限制', ja: '超過', ko: '초과', tr: 'Limit Aşıldı', sw: 'Zaidi ya Kikomo', pt: 'Acima do Limite'
  },
  'goal_label': {
      en: 'Goal', ar: 'الهدف', fr: 'Objectif', es: 'Objetivo', hi: 'लक्ष्य',
      de: 'Ziel', nl: 'Doel', zh: '目标', ja: '目標', ko: '목표', tr: 'Hedef', sw: 'Lengo', pt: 'Meta'
  },
  'bonus_burned': {
      en: 'Bonus: +{val} burned', ar: 'إضافي: +{val} محروق', fr: 'Bonus: +{val} brûlé', es: 'Bonus: +{val} quemado', hi: 'बोनस: +{val} जलाया',
      de: 'Bonus: +{val} verbrannt', nl: 'Bonus: +{val} verbrand', zh: '奖励: +{val} 已消耗', ja: 'ボーナス: +{val} 消費', ko: '보너스: +{val} 소모', tr: 'Bonus: +{val} yakıldı', sw: 'Bonasi: +{val} kuchomwa', pt: 'Bônus: +{val} queimado'
  },
  'scan_ingredients': {
      en: 'Scan Ingredients', ar: 'فحص المكونات', fr: 'Scanner Ingrédients', es: 'Escanear Ingredientes', hi: 'सामग्री स्कैन करें',
      de: 'Zutaten scannen', nl: 'Ingrediënten scannen', zh: '扫描食材', ja: '材料をスキャン', ko: '재료 스캔', tr: 'Malzemeleri Tara', sw: 'Changanua Viungo', pt: 'Escanear Ingredientes'
  },
  'reality_check': {
      en: 'Reality Check', ar: 'فحص الواقع', fr: 'Bilan Réel', es: 'Control Real', hi: 'वास्तविकता जांच',
      de: 'Realitätscheck', nl: 'Realiteitscheck', zh: '实际检查', ja: 'リアリティチェック', ko: '현실 점검', tr: 'Gerçeklik Kontrolü', sw: 'Ukaguzi wa Ukweli', pt: 'Verificação Real'
  },
  'log_unplanned': {
      en: 'Log Unplanned', ar: 'سجل غير مخطط', fr: 'Journal non planifié', es: 'Registrar Imprevisto', hi: 'अनियोजित लॉग करें',
      de: 'Ungeplantes loggen', nl: 'Ongepland loggen', zh: '记录计划外', ja: '予定外を記録', ko: '계획외 기록', tr: 'Plansız Kaydet', sw: 'Weka Isiyopangwa', pt: 'Registrar Imprevisto'
  },
  'end_day_review': {
      en: 'End Day & Review', ar: 'إنهاء اليوم ومراجعة', fr: 'Terminer & Revoir', es: 'Finalizar y Revisar', hi: 'दिन समाप्त करें और समीक्षा करें',
      de: 'Tag beenden & Rückblick', nl: 'Dag afsluiten & Review', zh: '结束并回顾', ja: '一日を終了してレビュー', ko: '하루 마감 및 리뷰', tr: 'Günü Bitir ve İncele', sw: 'Maliza Siku na Kagua', pt: 'Encerrar Dia e Revisar'
  },
  'plan_needs_init': {
      en: 'Daily plan needs initialization.', ar: 'الخطة اليومية تحتاج تهيئة.', fr: 'Le plan doit être initialisé.', es: 'El plan necesita inicialización.', hi: 'दैनिक योजना को आरंभ करना होगा।',
      de: 'Tagesplan muss erstellt werden.', nl: 'Dagplan moet worden gestart.', zh: '每日计划需要初始化。', ja: '日次プランの初期化が必要です。', ko: '일일 계획 초기화가 필요합니다.', tr: 'Günlük plan başlatılmalı.', sw: 'Mpango wa siku unahitaji kuanzishwa.', pt: 'O plano diário precisa ser inicializado.'
  },
  'generate_daily_plan': {
      en: 'Generate Daily Plan', ar: 'إنشاء خطة يومية', fr: 'Générer le Plan', es: 'Generar Plan Diario', hi: 'दैनिक योजना बनाएं',
      de: 'Tagesplan erstellen', nl: 'Dagplan genereren', zh: '生成每日计划', ja: '日次プランを作成', ko: '일일 계획 생성', tr: 'Günlük Plan Oluştur', sw: 'Tengeneza Mpango wa Siku', pt: 'Gerar Plano Diário'
  },
  'no_plan_data': {
      en: 'No plan data for this date.', ar: 'لا توجد بيانات لهذا التاريخ.', fr: 'Aucun plan pour cette date.', es: 'Sin datos para esta fecha.', hi: 'इस तारीख के लिए कोई योजना नहीं।',
      de: 'Keine Plandaten für dieses Datum.', nl: 'Geen plandata voor deze datum.', zh: '该日期没有计划数据。', ja: 'この日付のプランデータなし。', ko: '해당 날짜의 계획 데이터 없음.', tr: 'Bu tarih için plan verisi yok.', sw: 'Hakuna data ya mpango kwa tarehe hii.', pt: 'Sem dados de plano para esta data.'
  },

  // ===== DAILY WRAP-UP MODAL =====
  'day_complete': {
      en: 'Day Complete!', ar: 'اكتمل اليوم!', fr: 'Journée Terminée!', es: '¡Día Completo!', hi: 'दिन पूरा!',
      de: 'Tag Abgeschlossen!', nl: 'Dag Voltooid!', zh: '一天完成！', ja: '一日完了！', ko: '하루 완료!', tr: 'Gün Tamam!', sw: 'Siku Imekamilika!', pt: 'Dia Completo!'
  },
  'see_details': {
      en: 'See Details', ar: 'عرض التفاصيل', fr: 'Voir Détails', es: 'Ver Detalles', hi: 'विवरण देखें',
      de: 'Details ansehen', nl: 'Details bekijken', zh: '查看详情', ja: '詳細を見る', ko: '상세 보기', tr: 'Detayları Gör', sw: 'Ona Maelezo', pt: 'Ver Detalhes'
  },
  'plan_vs_reality': {
      en: 'Plan vs Reality', ar: 'الخطة مقابل الواقع', fr: 'Plan vs Réalité', es: 'Plan vs Realidad', hi: 'योजना बनाम वास्तविकता',
      de: 'Plan vs Realität', nl: 'Plan vs Werkelijkheid', zh: '计划与现实', ja: '計画 vs 現実', ko: '계획 vs 현실', tr: 'Plan ve Gerçek', sw: 'Mpango dhidi ya Ukweli', pt: 'Plano vs Realidade'
  },
  'how_you_did': {
      en: 'Here is how you did today.', ar: 'إليك أداءك اليوم.', fr: 'Voici votre bilan.', es: 'Así te fue hoy.', hi: 'आज आपका प्रदर्शन।',
      de: 'So war dein Tag.', nl: 'Zo heb je het gedaan.', zh: '今日表现如下。', ja: '今日の結果です。', ko: '오늘의 결과입니다.', tr: 'Bugün nasıl geçti.', sw: 'Hivi ndivyo ulivyofanya leo.', pt: 'Veja como foi seu dia.'
  },
  'tomorrow_focus': {
      en: "Tomorrow's Focus", ar: 'تركيز الغد', fr: 'Focus de Demain', es: 'Enfoque de Mañana', hi: 'कल का फोकस',
      de: 'Fokus für Morgen', nl: 'Focus voor Morgen', zh: '明天的重点', ja: '明日のフォーカス', ko: '내일의 포커스', tr: 'Yarının Odağı', sw: 'Lengo la Kesho', pt: 'Foco de Amanhã'
  },
  'next': {
      en: 'Next', ar: 'التالي', fr: 'Suivant', es: 'Siguiente', hi: 'अगला',
      de: 'Weiter', nl: 'Volgende', zh: '下一步', ja: '次へ', ko: '다음', tr: 'İleri', sw: 'Ifuatayo', pt: 'Próximo'
  },
  'how_feel': {
      en: 'How do you feel?', ar: 'كيف تشعر؟', fr: 'Comment vous sentez-vous?', es: '¿Cómo te sientes?', hi: 'आप कैसा महसूस करते हैं?',
      de: 'Wie fühlst du dich?', nl: 'Hoe voel je je?', zh: '你感觉如何？', ja: '気分はどうですか？', ko: '기분이 어떠세요?', tr: 'Nasıl hissediyorsun?', sw: 'Unahisije?', pt: 'Como você se sente?'
  },
  'rate_day': {
      en: 'Rate your day to close the loop.', ar: 'قيم يومك لإنهاء الحلقة.', fr: 'Notez votre journée.', es: 'Califica tu día para cerrar el ciclo.', hi: 'अपने दिन को रेट करें।',
      de: 'Bewerte deinen Tag.', nl: 'Beoordeel je dag.', zh: '为今天打分。', ja: '一日を評価してください。', ko: '하루를 평가해 주세요.', tr: 'Günü değerlendir.', sw: 'Kadiria siku yako.', pt: 'Avalie seu dia.'
  },
  'saved': {
      en: 'Saved!', ar: 'تم الحفظ!', fr: 'Sauvegardé!', es: '¡Guardado!', hi: 'सहेजा गया!',
      de: 'Gespeichert!', nl: 'Opgeslagen!', zh: '已保存！', ja: '保存しました！', ko: '저장됨!', tr: 'Kaydedildi!', sw: 'Imehifadhiwa!', pt: 'Salvo!'
  },

  // ===== SETTINGS EXTRAS =====
  'invalid_backup': {
      en: 'Invalid backup file.', ar: 'ملف نسخ احتياطي غير صالح.', fr: 'Fichier de sauvegarde invalide.', es: 'Archivo de respaldo inválido.', hi: 'अमान्य बैकअप फ़ाइल।',
      de: 'Ungültige Sicherungsdatei.', nl: 'Ongeldig back-upbestand.', zh: '无效的备份文件。', ja: '無効なバックアップファイル。', ko: '유효하지 않은 백업 파일.', tr: 'Geçersiz yedek dosyası.', sw: 'Faili ya chelezo si sahihi.', pt: 'Arquivo de backup inválido.'
  },
  'version_label': {
      en: 'Version 2.8.1 (Global Edition)', ar: 'الإصدار 2.8.1 (النسخة العالمية)', fr: 'Version 2.8.1 (Édition Mondiale)', es: 'Versión 2.8.1 (Edición Global)', hi: 'संस्करण 2.8.1 (वैश्विक संस्करण)',
      de: 'Version 2.8.1 (Globale Ausgabe)', nl: 'Versie 2.8.1 (Wereldeditie)', zh: '版本 2.8.1（全球版）', ja: 'バージョン 2.8.1（グローバル版）', ko: '버전 2.8.1 (글로벌 에디션)', tr: 'Sürüm 2.8.1 (Global Sürüm)', sw: 'Toleo 2.8.1 (Toleo la Kimataifa)', pt: 'Versão 2.8.1 (Edição Global)'
  },
  'active_status': {
      en: 'Active', ar: 'مفعل', fr: 'Actif', es: 'Activo', hi: 'सक्रिय',
      de: 'Aktiv', nl: 'Actief', zh: '已启用', ja: '有効', ko: '활성', tr: 'Aktif', sw: 'Hai', pt: 'Ativo'
  },
  'permission_required': {
      en: 'Permission required', ar: 'يتطلب إذن', fr: 'Permission requise', es: 'Permiso requerido', hi: 'अनुमति आवश्यक',
      de: 'Berechtigung erforderlich', nl: 'Toestemming vereist', zh: '需要权限', ja: '権限が必要', ko: '권한 필요', tr: 'İzin gerekli', sw: 'Ruhusa inahitajika', pt: 'Permissão necessária'
  },

  // ===== SLEEP TRACKER =====
  'good_morning': {
      en: 'Good Morning!', ar: 'صباح الخير!', fr: 'Bonjour!', es: '¡Buenos Días!', hi: 'सुप्रभात!',
      de: 'Guten Morgen!', nl: 'Goedemorgen!', zh: '早上好！', ja: 'おはよう！', ko: '좋은 아침!', tr: 'Günaydın!', sw: 'Habari za Asubuhi!', pt: 'Bom Dia!'
  },
  'sleep_synced': {
      en: 'Sleep Synced & Logged.', ar: 'تم مزامنة وتسجيل النوم.', fr: 'Sommeil synchronisé et enregistré.', es: 'Sueño sincronizado y registrado.', hi: 'नींद सिंक और लॉग हो गई।',
      de: 'Schlaf synchronisiert und gespeichert.', nl: 'Slaap gesynchroniseerd en gelogd.', zh: '睡眠已同步并记录。', ja: '睡眠が同期・記録されました。', ko: '수면 동기화 및 기록 완료.', tr: 'Uyku senkronize edildi ve kaydedildi.', sw: 'Usingizi umesawazishwa na kurekodwa.', pt: 'Sono sincronizado e registrado.'
  },
  'sleep_score': {
      en: 'Sleep Score', ar: 'نقاط النوم', fr: 'Score Sommeil', es: 'Puntuación de Sueño', hi: 'नींद स्कोर',
      de: 'Schlaf-Score', nl: 'Slaapscore', zh: '睡眠评分', ja: '睡眠スコア', ko: '수면 점수', tr: 'Uyku Puanı', sw: 'Alama za Usingizi', pt: 'Pontuação de Sono'
  },
  'duration': {
      en: 'Duration', ar: 'المدة', fr: 'Durée', es: 'Duración', hi: 'अवधि',
      de: 'Dauer', nl: 'Duur', zh: '时长', ja: '時間', ko: '기간', tr: 'Süre', sw: 'Muda', pt: 'Duração'
  },
  'fell_asleep': {
      en: 'Fell Asleep', ar: 'وقت النوم', fr: 'Endormissement', es: 'Se Durmió', hi: 'सो गए',
      de: 'Eingeschlafen', nl: 'In slaap gevallen', zh: '入睡时间', ja: '入眠', ko: '취침', tr: 'Uyudu', sw: 'Alilala', pt: 'Adormeceu'
  },
  'wake_up_alarm': {
      en: 'Wake Up!', ar: 'استيقظ!', fr: 'Réveil!', es: '¡Despierta!', hi: 'जागो!',
      de: 'Aufwachen!', nl: 'Wakker worden!', zh: '醒来！', ja: '起きて！', ko: '일어나세요!', tr: 'Uyan!', sw: 'Amka!', pt: 'Acorde!'
  },
  'im_awake': {
      en: "I'm Awake", ar: 'أنا مستيقظ', fr: 'Je suis réveillé', es: 'Estoy Despierto', hi: 'मैं जाग गया',
      de: 'Ich bin wach', nl: 'Ik ben wakker', zh: '我醒了', ja: '起きました', ko: '일어났어요', tr: 'Uyandım', sw: 'Nimeamka', pt: 'Estou Acordado'
  },
  'still_awake': {
      en: 'Still Awake?', ar: 'هل أنت مستيقظ؟', fr: 'Encore éveillé?', es: '¿Aún despierto?', hi: 'अभी भी जागे हैं?',
      de: 'Noch wach?', nl: 'Nog wakker?', zh: '还醒着？', ja: 'まだ起きてる？', ko: '아직 깨어있나요?', tr: 'Hâlâ uyanık mısın?', sw: 'Bado macho?', pt: 'Ainda acordado?'
  },
  'tap_dismiss': {
      en: 'Tap screen to dismiss.', ar: 'اضغط على الشاشة للإغلاق.', fr: "Touchez l'écran pour fermer.", es: 'Toca la pantalla para cerrar.', hi: 'खारिज करने के लिए स्क्रीन टैप करें।',
      de: 'Zum Schließen tippen.', nl: 'Tik om te sluiten.', zh: '点击屏幕关闭。', ja: '画面をタップして閉じる。', ko: '화면을 탭하여 닫기.', tr: 'Kapatmak için dokun.', sw: 'Gusa skrini kufunga.', pt: 'Toque na tela para fechar.'
  },
  'yes_im_awake': {
      en: "Yes, I'm Awake", ar: 'نعم، أنا مستيقظ', fr: 'Oui, je suis réveillé', es: 'Sí, estoy despierto', hi: 'हाँ, मैं जाग रहा हूँ',
      de: 'Ja, ich bin wach', nl: 'Ja, ik ben wakker', zh: '是的，我醒着', ja: 'はい、起きてます', ko: '네, 깨어있어요', tr: 'Evet, uyanığım', sw: 'Ndiyo, niko macho', pt: 'Sim, estou acordado'
  },
  'auto_mode': {
      en: 'Auto', ar: 'تلقائي', fr: 'Auto', es: 'Auto', hi: 'ऑटो',
      de: 'Auto', nl: 'Auto', zh: '自动', ja: '自動', ko: '자동', tr: 'Otomatik', sw: 'Otomatiki', pt: 'Auto'
  },
  'manual_mode': {
      en: 'Manual', ar: 'يدوي', fr: 'Manuel', es: 'Manual', hi: 'मैन्युअल',
      de: 'Manuell', nl: 'Handmatig', zh: '手动', ja: '手動', ko: '수동', tr: 'Manuel', sw: 'Mkono', pt: 'Manual'
  },
  'log_sleep': {
      en: 'Log Sleep', ar: 'تسجيل النوم', fr: 'Enregistrer Sommeil', es: 'Registrar Sueño', hi: 'नींद लॉग करें',
      de: 'Schlaf loggen', nl: 'Slaap loggen', zh: '记录睡眠', ja: '睡眠を記録', ko: '수면 기록', tr: 'Uyku Kaydet', sw: 'Weka Usingizi', pt: 'Registrar Sono'
  },
  'bedtime_yesterday': {
      en: 'Bedtime (Yesterday)', ar: 'وقت النوم (أمس)', fr: 'Coucher (Hier)', es: 'Acostarse (Ayer)', hi: 'सोने का समय (कल)',
      de: 'Schlafenszeit (Gestern)', nl: 'Bedtijd (Gisteren)', zh: '就寝时间（昨天）', ja: '就寝時間（昨日）', ko: '취침 시간 (어제)', tr: 'Uyku Saati (Dün)', sw: 'Wakati wa Kulala (Jana)', pt: 'Hora de Dormir (Ontem)'
  },
  'save_log': {
      en: 'Save Log', ar: 'حفظ السجل', fr: 'Sauvegarder', es: 'Guardar Registro', hi: 'लॉग सहेजें',
      de: 'Log speichern', nl: 'Log opslaan', zh: '保存记录', ja: 'ログを保存', ko: '로그 저장', tr: 'Kaydı Kaydet', sw: 'Hifadhi Kumbukumbu', pt: 'Salvar Registro'
  },
  'biosyncing': {
      en: 'BioSyncing...', ar: 'جاري المزامنة الحيوية...', fr: 'BioSync en cours...', es: 'BioSincronizando...', hi: 'बायोसिंकिंग...',
      de: 'BioSync läuft...', nl: 'BioSync bezig...', zh: '生物同步中...', ja: 'バイオシンク中...', ko: '바이오싱크 중...', tr: 'BioSenkronizasyon...', sw: 'BioSync inaendelea...', pt: 'BioSincronizando...'
  },
  'sleep_confirmed': {
      en: 'Sleep Confirmed. Goodnight', ar: 'تم تأكيد النوم. تصبح على خير', fr: 'Sommeil confirmé. Bonne nuit', es: 'Sueño confirmado. Buenas noches', hi: 'नींद की पुष्टि। शुभ रात्रि',
      de: 'Schlaf bestätigt. Gute Nacht', nl: 'Slaap bevestigd. Welterusten', zh: '已确认入睡。晚安', ja: '睡眠確認。おやすみ', ko: '수면 확인. 좋은 밤', tr: 'Uyku onaylandı. İyi geceler', sw: 'Usingizi umethibitishwa. Usiku mwema', pt: 'Sono confirmado. Boa noite'
  },
  'monitoring_movement': {
      en: 'Monitoring Movement...', ar: 'مراقبة الحركة...', fr: 'Surveillance des mouvements...', es: 'Monitoreando movimiento...', hi: 'गतिविधि की निगरानी...',
      de: 'Bewegung wird überwacht...', nl: 'Beweging monitoren...', zh: '监测运动中...', ja: '動きを監視中...', ko: '움직임 모니터링 중...', tr: 'Hareket izleniyor...', sw: 'Inafuatilia mwendo...', pt: 'Monitorando movimento...'
  },
  'place_phone': {
      en: 'Place phone on mattress', ar: 'ضع الهاتف على الفراش', fr: 'Posez le téléphone sur le matelas', es: 'Coloca el teléfono en el colchón', hi: 'फोन गद्दे पर रखें',
      de: 'Handy auf Matratze legen', nl: 'Plaats telefoon op matras', zh: '将手机放在床垫上', ja: 'スマホをマットレスに置いて', ko: '매트리스에 폰을 놓으세요', tr: 'Telefonu yatağa koy', sw: 'Weka simu kwenye godoro', pt: 'Coloque o celular no colchão'
  },
  'smart_alarm': {
      en: 'Smart Alarm', ar: 'منبه ذكي', fr: 'Alarme Intelligente', es: 'Alarma Inteligente', hi: 'स्मार्ट अलार्म',
      de: 'Smartwecker', nl: 'Slim Alarm', zh: '智能闹钟', ja: 'スマートアラーム', ko: '스마트 알람', tr: 'Akıllı Alarm', sw: 'Kengele Mahiri', pt: 'Alarme Inteligente'
  },
  'wake_by': {
      en: 'Wake By', ar: 'الاستيقاظ قبل', fr: 'Réveil à', es: 'Despertar a las', hi: 'जागने का समय',
      de: 'Aufwachen bis', nl: 'Wakker om', zh: '叫醒时间', ja: '起床時刻', ko: '기상 시각', tr: 'Uyanma Saati', sw: 'Amka Kufikia', pt: 'Acordar às'
  },
  'movement_intensity': {
      en: 'Movement Intensity', ar: 'شدة الحركة', fr: 'Intensité du mouvement', es: 'Intensidad de Movimiento', hi: 'गति की तीव्रता',
      de: 'Bewegungsintensität', nl: 'Bewegingsintensiteit', zh: '运动强度', ja: '動きの強度', ko: '움직임 강도', tr: 'Hareket Yoğunluğu', sw: 'Ukali wa Mwendo', pt: 'Intensidade de Movimento'
  },
  'start_sleep_mode': {
      en: 'Start Sleep Mode', ar: 'بدء وضع النوم', fr: 'Démarrer Mode Sommeil', es: 'Iniciar Modo Sueño', hi: 'स्लीप मोड शुरू करें',
      de: 'Schlafmodus starten', nl: 'Slaapmodus starten', zh: '开始睡眠模式', ja: 'スリープモード開始', ko: '수면 모드 시작', tr: 'Uyku Modunu Başlat', sw: 'Anza Hali ya Usingizi', pt: 'Iniciar Modo Sono'
  },
  'hold_to_end': {
      en: 'Hold button to end sleep', ar: 'اضغط مطولاً لإنهاء النوم', fr: 'Maintenez pour terminer', es: 'Mantén para finalizar', hi: 'नींद समाप्त करने के लिए बटन दबाएं',
      de: 'Halten zum Beenden', nl: 'Houd ingedrukt om te stoppen', zh: '长按结束睡眠', ja: '長押しで終了', ko: '길게 눌러 수면 종료', tr: 'Bitirmek için basılı tut', sw: 'Shikilia kitufe kumaliza', pt: 'Segure para encerrar'
  },
  'back_to_app': {
      en: 'Back to BioSync', ar: 'العودة إلى BioSync', fr: 'Retour à BioSync', es: 'Volver a BioSync', hi: 'BioSync पर वापस',
      de: 'Zurück zu BioSync', nl: 'Terug naar BioSync', zh: '返回 BioSync', ja: 'BioSyncに戻る', ko: 'BioSync로 돌아가기', tr: "BioSync'e Dön", sw: 'Rudi kwa BioSync', pt: 'Voltar ao BioSync'
  },

  // ===== FOOD ANALYZER =====
  'scan_meal': {
      en: 'Scan Meal', ar: 'فحص الوجبة', fr: 'Scanner Repas', es: 'Escanear Comida', hi: 'भोजन स्कैन करें',
      de: 'Mahlzeit scannen', nl: 'Maaltijd scannen', zh: '扫描餐点', ja: '食事をスキャン', ko: '식사 스캔', tr: 'Yemek Tara', sw: 'Changanua Mlo', pt: 'Escanear Refeição'
  },
  'scan_meal_desc': {
      en: 'Capture a photo. Gemini AI will calculate macros, vitamins, and grams instantly.', ar: 'التقط صورة. سيحسب Gemini AI الماكرو والفيتامينات والجرامات فوراً.', fr: 'Prenez une photo. Gemini AI calculera les macros instantanément.', es: 'Captura una foto. Gemini AI calculará macros al instante.', hi: 'फोटो लें। Gemini AI मैक्रो और विटामिन तुरंत गणना करेगा।',
      de: 'Foto aufnehmen. Gemini AI berechnet Makros sofort.', nl: "Maak een foto. Gemini AI berekent macro's direct.", zh: '拍照即可。Gemini AI 将即时计算营养成分。', ja: '写真を撮るだけ。Gemini AIが即座に計算。', ko: '사진을 찍으세요. Gemini AI가 즉시 계산합니다.', tr: 'Fotoğraf çekin. Gemini AI anında hesaplasın.', sw: 'Piga picha. Gemini AI itahesabu papo hapo.', pt: 'Tire uma foto. Gemini AI calculará macros instantaneamente.'
  },
  'energy_cost': {
      en: 'Energy Cost:', ar: 'تكلفة الطاقة:', fr: "Coût d'énergie:", es: 'Costo de Energía:', hi: 'ऊर्जा लागत:',
      de: 'Energiekosten:', nl: 'Energiekosten:', zh: '能量消耗：', ja: 'エネルギーコスト：', ko: '에너지 비용:', tr: 'Enerji Maliyeti:', sw: 'Gharama ya Nishati:', pt: 'Custo de Energia:'
  },
  'food_name': {
      en: 'Food Name', ar: 'اسم الطعام', fr: 'Nom du plat', es: 'Nombre del Alimento', hi: 'भोजन का नाम',
      de: 'Essensname', nl: 'Naam gerecht', zh: '食物名称', ja: '料理名', ko: '음식 이름', tr: 'Yemek Adı', sw: 'Jina la Chakula', pt: 'Nome do Alimento'
  },
  'confidence_label': {
      en: 'Confidence', ar: 'الثقة', fr: 'Confiance', es: 'Confianza', hi: 'विश्वसनीयता',
      de: 'Zuverlässigkeit', nl: 'Betrouwbaarheid', zh: '置信度', ja: '信頼度', ko: '신뢰도', tr: 'Güvenilirlik', sw: 'Uhakika', pt: 'Confiança'
  },
  'gemini_wrong': {
      en: 'What did Gemini get wrong?', ar: 'ما الذي أخطأ فيه Gemini؟', fr: "Qu'est-ce que Gemini a mal identifié?", es: '¿Qué identificó mal Gemini?', hi: 'Gemini ने क्या गलत पहचाना?',
      de: 'Was hat Gemini falsch erkannt?', nl: 'Wat heeft Gemini verkeerd?', zh: 'Gemini 哪里识别错了？', ja: 'Geminiの誤りは？', ko: 'Gemini가 뭘 틀렸나요?', tr: 'Gemini neyi yanlış tanıdı?', sw: 'Gemini ilikosea nini?', pt: 'O que Gemini errou?'
  },
  'correction_placeholder': {
      en: 'e.g. "It is cauliflower rice, not white rice"', ar: 'مثلاً "إنه أرز القرنبيط وليس أرز أبيض"', fr: 'ex. "C\'est du riz de chou-fleur"', es: 'ej. "Es arroz de coliflor, no arroz blanco"', hi: 'जैसे "यह फूलगोभी चावल है, सफेद चावल नहीं"',
      de: 'z.B. "Es ist Blumenkohlreis"', nl: 'bijv. "Het is bloemkoolrijst"', zh: '例如："这是花椰菜饭，不是白米饭"', ja: '例：「カリフラワーライスです」', ko: '예: "콜리플라워 라이스입니다"', tr: 'ör. "Bu karnabahar pilavı"', sw: 'mfano "Ni wali wa cauliflower"', pt: 'ex. "É arroz de couve-flor"'
  },
  'refine_analysis': {
      en: 'Refine Analysis', ar: 'تحسين التحليل', fr: "Affiner l'analyse", es: 'Refinar Análisis', hi: 'विश्लेषण सुधारें',
      de: 'Analyse verfeinern', nl: 'Analyse verfijnen', zh: '优化分析', ja: '分析を修正', ko: '분석 수정', tr: 'Analizi İyileştir', sw: 'Boresha Uchambuzi', pt: 'Refinar Análise'
  },
  'cals': {
      en: 'Cals', ar: 'سعرات', fr: 'Cals', es: 'Cals', hi: 'कैल',
      de: 'Kcal', nl: 'Kcal', zh: '卡路里', ja: 'カロリー', ko: '칼로리', tr: 'Kal', sw: 'Kal', pt: 'Cals'
  },
  'prot_short': {
      en: 'Prot', ar: 'بروتين', fr: 'Prot', es: 'Prot', hi: 'प्रोटीन',
      de: 'Prot', nl: 'Prot', zh: '蛋白质', ja: 'タンパク', ko: '단백', tr: 'Prot', sw: 'Prot', pt: 'Prot'
  },
  'carb': {
      en: 'Carb', ar: 'كربوهيدرات', fr: 'Gluc', es: 'Carb', hi: 'कार्ब',
      de: 'Kohle', nl: 'Koolh', zh: '碳水', ja: '炭水化物', ko: '탄수화물', tr: 'Karb', sw: 'Wanga', pt: 'Carb'
  },
  'fat': {
      en: 'Fat', ar: 'دهون', fr: 'Lip', es: 'Grasa', hi: 'वसा',
      de: 'Fett', nl: 'Vet', zh: '脂肪', ja: '脂質', ko: '지방', tr: 'Yağ', sw: 'Mafuta', pt: 'Gord'
  },
  'analysis_failed': {
      en: 'Analysis failed or pending...', ar: 'فشل التحليل أو قيد الانتظار...', fr: 'Analyse échouée ou en attente...', es: 'Análisis fallido o pendiente...', hi: 'विश्लेषण विफल या लंबित...',
      de: 'Analyse fehlgeschlagen oder ausstehend...', nl: 'Analyse mislukt of in afwachting...', zh: '分析失败或待处理...', ja: '分析に失敗または保留中...', ko: '분석 실패 또는 대기 중...', tr: 'Analiz başarısız veya beklemede...', sw: 'Uchambuzi umeshindwa au unasubiri...', pt: 'Análise falhou ou pendente...'
  },
  'voice_fix': {
      en: 'Voice Fix', ar: 'تصحيح صوتي', fr: 'Corriger Vocalement', es: 'Corrección por Voz', hi: 'वॉइस फिक्स',
      de: 'Sprach-Korrektur', nl: 'Stemcorrectie', zh: '语音纠正', ja: '音声修正', ko: '음성 수정', tr: 'Sesli Düzeltme', sw: 'Sahihisha kwa Sauti', pt: 'Correção por Voz'
  },
  'text_fix': {
      en: 'Text Fix', ar: 'تصحيح نصي', fr: 'Corriger par Texte', es: 'Corrección por Texto', hi: 'टेक्स्ट फिक्स',
      de: 'Text-Korrektur', nl: 'Tekstcorrectie', zh: '文字纠正', ja: 'テキスト修正', ko: '텍스트 수정', tr: 'Metin Düzeltme', sw: 'Sahihisha kwa Maandishi', pt: 'Correção por Texto'
  },
  'add_item': {
      en: 'Add Item', ar: 'إضافة عنصر', fr: 'Ajouter', es: 'Agregar', hi: 'आइटम जोड़ें',
      de: 'Hinzufügen', nl: 'Toevoegen', zh: '添加项目', ja: '追加', ko: '추가', tr: 'Ekle', sw: 'Ongeza', pt: 'Adicionar'
  },
  'add_recalculate': {
      en: 'Add & Recalculate', ar: 'إضافة وإعادة حساب', fr: 'Ajouter & Recalculer', es: 'Agregar y Recalcular', hi: 'जोड़ें और पुनर्गणना करें',
      de: 'Hinzufügen & Neuberechnen', nl: 'Toevoegen & Herberekenen', zh: '添加并重新计算', ja: '追加して再計算', ko: '추가 및 재계산', tr: 'Ekle ve Yeniden Hesapla', sw: 'Ongeza na Hesabu Upya', pt: 'Adicionar e Recalcular'
  },
  'confirm_log': {
      en: 'Confirm & Log', ar: 'تأكيد وتسجيل', fr: 'Confirmer & Enregistrer', es: 'Confirmar y Registrar', hi: 'पुष्टि करें और लॉग करें',
      de: 'Bestätigen & Loggen', nl: 'Bevestigen & Loggen', zh: '确认并记录', ja: '確認して記録', ko: '확인 및 기록', tr: 'Onayla ve Kaydet', sw: 'Thibitisha na Rekodi', pt: 'Confirmar e Registrar'
  },
  'listening': {
      en: 'Listening', ar: 'جاري الاستماع', fr: 'Écoute', es: 'Escuchando', hi: 'सुन रहा है',
      de: 'Höre zu', nl: 'Luisteren', zh: '正在听', ja: '聞いています', ko: '듣는 중', tr: 'Dinliyor', sw: 'Inasikiliza', pt: 'Ouvindo'
  },
  'refining_desc': {
      en: 'Refining Analysis & Description...', ar: 'تحسين التحليل والوصف...', fr: "Affinage de l'analyse...", es: 'Refinando análisis...', hi: 'विश्लेषण सुधार रहा है...',
      de: 'Analyse wird verfeinert...', nl: 'Analyse verfijnen...', zh: '优化分析和描述中...', ja: '分析を改良中...', ko: '분석 개선 중...', tr: 'Analiz iyileştiriliyor...', sw: 'Inaboresha uchambuzi...', pt: 'Refinando análise...'
  },
  'gemini_analyzing': {
      en: 'Gemini is Analyzing...', ar: 'Gemini يقوم بالتحليل...', fr: 'Gemini analyse...', es: 'Gemini está analizando...', hi: 'Gemini विश्लेषण कर रहा है...',
      de: 'Gemini analysiert...', nl: 'Gemini analyseert...', zh: 'Gemini 分析中...', ja: 'Geminiが分析中...', ko: 'Gemini 분석 중...', tr: 'Gemini analiz ediyor...', sw: 'Gemini inachambua...', pt: 'Gemini está analisando...'
  },

  // ===== AI COACH =====
  'coach_name': {
      en: 'Coach FitLife', ar: 'مدرب FitLife', fr: 'Coach FitLife', es: 'Coach FitLife', hi: 'कोच FitLife',
      de: 'Coach FitLife', nl: 'Coach FitLife', zh: 'FitLife 教练', ja: 'コーチ FitLife', ko: '코치 FitLife', tr: 'Koç FitLife', sw: 'Kocha FitLife', pt: 'Coach FitLife'
  },
  'synced_label': {
      en: 'Synced', ar: 'متزامن', fr: 'Synchronisé', es: 'Sincronizado', hi: 'सिंक्ड',
      de: 'Synchronisiert', nl: 'Gesynchroniseerd', zh: '已同步', ja: '同期済み', ko: '동기화됨', tr: 'Senkronize', sw: 'Imesawazishwa', pt: 'Sincronizado'
  },
  'how_help': {
      en: 'How can I help you today?', ar: 'كيف يمكنني مساعدتك اليوم؟', fr: "Comment puis-je vous aider?", es: '¿Cómo puedo ayudarte hoy?', hi: 'आज मैं आपकी कैसे मदद कर सकता हूँ?',
      de: 'Wie kann ich dir heute helfen?', nl: 'Hoe kan ik je vandaag helpen?', zh: '今天我能帮你什么？', ja: '今日は何をお手伝いしますか？', ko: '오늘 어떻게 도와드릴까요?', tr: 'Bugün nasıl yardımcı olabilirim?', sw: 'Nikuaidie vipi leo?', pt: 'Como posso ajudar hoje?'
  },
  'choose_mode': {
      en: 'Choose a mode to start our conversation.', ar: 'اختر وضعاً لبدء المحادثة.', fr: 'Choisissez un mode pour commencer.', es: 'Elige un modo para comenzar.', hi: 'बातचीत शुरू करने के लिए मोड चुनें।',
      de: 'Wähle einen Modus zum Starten.', nl: 'Kies een modus om te beginnen.', zh: '选择模式开始对话。', ja: 'モードを選択して開始。', ko: '대화를 시작할 모드를 선택하세요.', tr: 'Başlamak için bir mod seçin.', sw: 'Chagua hali kuanza mazungumzo.', pt: 'Escolha um modo para começar.'
  },
  'personal_advice': {
      en: 'Personal Advice', ar: 'نصيحة شخصية', fr: 'Conseil Personnel', es: 'Consejo Personal', hi: 'व्यक्तिगत सलाह',
      de: 'Persönliche Beratung', nl: 'Persoonlijk Advies', zh: '个性化建议', ja: 'パーソナルアドバイス', ko: '개인 조언', tr: 'Kişisel Tavsiye', sw: 'Ushauri Binafsi', pt: 'Conselho Pessoal'
  },
  'personal_advice_desc': {
      en: "Uses your Profile, Food Logs, and Today's Plan to give specific guidance.", ar: 'يستخدم ملفك الشخصي وسجلات الطعام وخطة اليوم لتقديم إرشادات محددة.', fr: 'Utilise votre profil et vos données pour des conseils ciblés.', es: 'Usa tu perfil, registros y plan de hoy para guiarte.', hi: 'आपकी प्रोफ़ाइल, फूड लॉग और आज की योजना का उपयोग करता है।',
      de: 'Nutzt Profil, Essens-Logs und Tagesplan für Tipps.', nl: 'Gebruikt je profiel en logs voor gerichte adviezen.', zh: '使用你的资料和今日计划提供指导。', ja: 'プロフィールと食事ログで具体的アドバイス。', ko: '프로필과 식단 기록으로 맞춤 조언.', tr: 'Profilinizi ve günlük planınızı kullanır.', sw: 'Hutumia wasifu wako na mpango wa leo.', pt: 'Usa seu perfil e dados para orientação.'
  },
  'general_question': {
      en: 'General Question', ar: 'سؤال عام', fr: 'Question Générale', es: 'Pregunta General', hi: 'सामान्य प्रश्न',
      de: 'Allgemeine Frage', nl: 'Algemene Vraag', zh: '通用问题', ja: '一般的な質問', ko: '일반 질문', tr: 'Genel Soru', sw: 'Swali la Jumla', pt: 'Pergunta Geral'
  },
  'general_question_desc': {
      en: 'Ask about nutrition science or workouts without using your personal data.', ar: 'اسأل عن علم التغذية أو التمارين دون استخدام بياناتك.', fr: 'Posez des questions générales sur la nutrition ou le sport.', es: 'Pregunta sobre nutrición o ejercicio sin usar tus datos.', hi: 'बिना व्यक्तिगत डेटा के पोषण या व्यायाम के बारे में पूछें।',
      de: 'Fragen zu Ernährung oder Sport ohne persönliche Daten.', nl: 'Vraag over voeding of sport zonder persoonlijke data.', zh: '无需个人数据即可询问营养或运动问题。', ja: '個人データなしで栄養や運動について質問。', ko: '개인 데이터 없이 영양이나 운동에 대해 질문.', tr: 'Kişisel verilerinizi kullanmadan sorular sorun.', sw: 'Uliza kuhusu lishe au mazoezi bila data yako.', pt: 'Pergunte sobre nutrição ou treinos sem dados pessoais.'
  },
  'type_message': {
      en: 'Type your message...', ar: 'اكتب رسالتك...', fr: 'Tapez votre message...', es: 'Escribe tu mensaje...', hi: 'अपना संदेश लिखें...',
      de: 'Nachricht eingeben...', nl: 'Typ je bericht...', zh: '输入消息...', ja: 'メッセージを入力...', ko: '메시지를 입력하세요...', tr: 'Mesajınızı yazın...', sw: 'Andika ujumbe wako...', pt: 'Digite sua mensagem...'
  },
  'chat_cost': {
      en: 'Chat Cost', ar: 'تكلفة المحادثة', fr: 'Coût du Chat', es: 'Costo del Chat', hi: 'चैट लागत',
      de: 'Chat-Kosten', nl: 'Chatkosten', zh: '聊天消耗', ja: 'チャットコスト', ko: '채팅 비용', tr: 'Sohbet Maliyeti', sw: 'Gharama ya Mazungumzo', pt: 'Custo do Chat'
  },

  // ===== SMART FRIDGE EXTRAS =====
  'ingredients_count': {
      en: 'ingredients found. How much effort today?', ar: 'مكونات مكتشفة. ما مقدار الجهد اليوم؟', fr: "ingrédients trouvés. Quel effort aujourd'hui?", es: 'ingredientes encontrados. ¿Cuánto esfuerzo hoy?', hi: 'सामग्री मिली। आज कितनी मेहनत?',
      de: 'Zutaten gefunden. Wie viel Aufwand heute?', nl: 'ingrediënten gevonden. Hoeveel moeite vandaag?', zh: '种食材已发现。今天想花多少精力？', ja: '種の材料発見。今日はどれくらい頑張る？', ko: '개 재료 발견. 오늘 얼마나 노력할까요?', tr: 'malzeme bulundu. Bugün ne kadar efor?', sw: 'viungo vimepatikana. Juhudi kiasi gani leo?', pt: 'ingredientes encontrados. Quanto esforço hoje?'
  },
  'quick_desc': {
      en: 'Simple, fast, minimal cleanup.', ar: 'بسيط، سريع، تنظيف قليل.', fr: 'Simple, rapide, peu de nettoyage.', es: 'Simple, rápido, poco que limpiar.', hi: 'सरल, तेज़, कम सफाई।',
      de: 'Einfach, schnell, wenig Aufräumen.', nl: 'Simpel, snel, weinig opruimen.', zh: '简单快速，清理少。', ja: 'シンプル、速い、片付け少なめ。', ko: '간단, 빠름, 정리 최소.', tr: 'Basit, hızlı, az temizlik.', sw: 'Rahisi, haraka, usafishaji kidogo.', pt: 'Simples, rápido, pouca limpeza.'
  },
  'balanced_desc': {
      en: 'Traditional cooking, balanced flavors.', ar: 'طبخ تقليدي، نكهات متوازنة.', fr: 'Cuisine traditionnelle, saveurs équilibrées.', es: 'Cocina tradicional, sabores equilibrados.', hi: 'पारंपरिक खाना, संतुलित स्वाद।',
      de: 'Traditionell, ausgewogene Aromen.', nl: 'Traditioneel, gebalanceerde smaken.', zh: '传统烹饪，均衡风味。', ja: '伝統料理、バランスの取れた味。', ko: '전통 요리, 균형 잡힌 맛.', tr: 'Geleneksel, dengeli tatlar.', sw: 'Kupika kijadi, ladha sawa.', pt: 'Cozinha tradicional, sabores equilibrados.'
  },
  'gourmet_desc': {
      en: 'Complex techniques, presentation focused.', ar: 'تقنيات معقدة، تركيز على العرض.', fr: 'Techniques complexes, présentation soignée.', es: 'Técnicas complejas, enfocado en presentación.', hi: 'जटिल तकनीक, प्रस्तुति पर ध्यान।',
      de: 'Komplexe Techniken, Präsentation im Fokus.', nl: 'Complexe technieken, presentatie gericht.', zh: '复杂技法，注重呈现。', ja: '高度な技術、盛り付け重視。', ko: '복잡한 기술, 프레젠테이션 중심.', tr: 'Karmaşık teknikler, sunuma odaklı.', sw: 'Mbinu ngumu, uwasilishaji makini.', pt: 'Técnicas complexas, foco na apresentação.'
  },

  // ===== ACTION MODAL =====
  'what_happened': {
      en: 'What just happened?', ar: 'ماذا حدث؟', fr: "Que s'est-il passé?", es: '¿Qué acaba de pasar?', hi: 'अभी क्या हुआ?',
      de: 'Was ist passiert?', nl: 'Wat is er gebeurd?', zh: '发生了什么？', ja: '何が起きた？', ko: '무슨 일이 있었나요?', tr: 'Ne oldu?', sw: 'Nini kimetokea?', pt: 'O que aconteceu?'
  },
  'i_ate_something': {
      en: 'I Ate Something', ar: 'أكلت شيئاً', fr: "J'ai mangé quelque chose", es: 'Comí Algo', hi: 'मैंने कुछ खाया',
      de: 'Ich habe gegessen', nl: 'Ik heb gegeten', zh: '我吃了东西', ja: '何か食べた', ko: '뭔가 먹었어요', tr: 'Bir Şey Yedim', sw: 'Nilikula Kitu', pt: 'Comi Algo'
  },
  'ate_examples': {
      en: 'Snickers, Snack, Extra Meal...', ar: 'سنيكرز، وجبة خفيفة، وجبة إضافية...', fr: 'Snickers, Collation, Repas supplémentaire...', es: 'Snickers, Snack, Comida extra...', hi: 'स्निकर्स, स्नैक, अतिरिक्त भोजन...',
      de: 'Snickers, Snack, Extra-Mahlzeit...', nl: 'Snickers, Snack, Extra maaltijd...', zh: '零食、加餐...', ja: 'スナック、間食...', ko: '과자, 간식, 추가 식사...', tr: 'Snickers, Atıştırmalık, Ekstra Öğün...', sw: 'Snickers, Vitafunio, Mlo wa Ziada...', pt: 'Snickers, Lanche, Refeição extra...'
  },
  'i_moved': {
      en: 'I Moved', ar: 'تحركت', fr: "J'ai bougé", es: 'Me Moví', hi: 'मैंने कसरत की',
      de: 'Ich habe mich bewegt', nl: 'Ik heb bewogen', zh: '我运动了', ja: '運動した', ko: '운동했어요', tr: 'Hareket Ettim', sw: 'Nilitembea', pt: 'Me Mexi'
  },
  'moved_examples': {
      en: 'Walk, Gym, Cleaning...', ar: 'مشي، نادي، تنظيف...', fr: 'Marche, Sport, Ménage...', es: 'Caminar, Gym, Limpieza...', hi: 'चलना, जिम, सफाई...',
      de: 'Spaziergang, Gym, Putzen...', nl: 'Wandelen, Gym, Schoonmaken...', zh: '散步、健身、打扫...', ja: '散歩、ジム、掃除...', ko: '산책, 헬스장, 청소...', tr: 'Yürüyüş, Spor, Temizlik...', sw: 'Kutembea, Gym, Kusafisha...', pt: 'Caminhada, Academia, Limpeza...'
  },
  'log_activity': {
      en: 'Log Activity', ar: 'تسجيل النشاط', fr: "Enregistrer l'activité", es: 'Registrar Actividad', hi: 'गतिविधि लॉग करें',
      de: 'Aktivität loggen', nl: 'Activiteit loggen', zh: '记录活动', ja: 'アクティビティを記録', ko: '활동 기록', tr: 'Aktivite Kaydet', sw: 'Weka Shughuli', pt: 'Registrar Atividade'
  },
  'activity_name': {
      en: 'Activity Name', ar: 'اسم النشاط', fr: "Nom de l'activité", es: 'Nombre de Actividad', hi: 'गतिविधि का नाम',
      de: 'Aktivitätsname', nl: 'Activiteitsnaam', zh: '活动名称', ja: 'アクティビティ名', ko: '활동 이름', tr: 'Aktivite Adı', sw: 'Jina la Shughuli', pt: 'Nome da Atividade'
  },
  'activity_placeholder': {
      en: 'e.g. Running, Yoga, Gym', ar: 'مثلاً: جري، يوغا، نادي', fr: 'ex. Course, Yoga, Sport', es: 'ej. Correr, Yoga, Gym', hi: 'जैसे दौड़, योग, जिम',
      de: 'z.B. Laufen, Yoga, Gym', nl: 'bijv. Hardlopen, Yoga, Gym', zh: '例如：跑步、瑜伽、健身', ja: '例：ランニング、ヨガ、ジム', ko: '예: 달리기, 요가, 헬스', tr: 'ör. Koşu, Yoga, Spor', sw: 'mfano Kukimbia, Yoga, Gym', pt: 'ex. Corrida, Yoga, Academia'
  },
  'duration_minutes': {
      en: 'Duration (Minutes)', ar: 'المدة (دقائق)', fr: 'Durée (Minutes)', es: 'Duración (Minutos)', hi: 'अवधि (मिनट)',
      de: 'Dauer (Minuten)', nl: 'Duur (Minuten)', zh: '时长（分钟）', ja: '時間（分）', ko: '기간 (분)', tr: 'Süre (Dakika)', sw: 'Muda (Dakika)', pt: 'Duração (Minutos)'
  },
  'intensity': {
      en: 'Intensity', ar: 'الشدة', fr: 'Intensité', es: 'Intensidad', hi: 'तीव्रता',
      de: 'Intensität', nl: 'Intensiteit', zh: '强度', ja: '強度', ko: '강도', tr: 'Yoğunluk', sw: 'Ukali', pt: 'Intensidade'
  },
  'save_activity': {
      en: 'Save Activity', ar: 'حفظ النشاط', fr: "Sauvegarder l'activité", es: 'Guardar Actividad', hi: 'गतिविधि सहेजें',
      de: 'Aktivität speichern', nl: 'Activiteit opslaan', zh: '保存活动', ja: 'アクティビティを保存', ko: '활동 저장', tr: 'Aktiviteyi Kaydet', sw: 'Hifadhi Shughuli', pt: 'Salvar Atividade'
  },
  'low': {
      en: 'Low', ar: 'منخفض', fr: 'Faible', es: 'Bajo', hi: 'कम',
      de: 'Niedrig', nl: 'Laag', zh: '低', ja: '低', ko: '낮음', tr: 'Düşük', sw: 'Chini', pt: 'Baixo'
  },
  'moderate_level': {
      en: 'Moderate', ar: 'متوسط', fr: 'Modéré', es: 'Moderado', hi: 'मध्यम',
      de: 'Mittel', nl: 'Gemiddeld', zh: '中等', ja: '中', ko: '보통', tr: 'Orta', sw: 'Wastani', pt: 'Moderado'
  },
  'high_level': {
      en: 'High', ar: 'مرتفع', fr: 'Élevé', es: 'Alto', hi: 'उच्च',
      de: 'Hoch', nl: 'Hoog', zh: '高', ja: '高', ko: '높음', tr: 'Yüksek', sw: 'Juu', pt: 'Alto'
  },
  'i_ate_else': {
      en: 'I ate something else...', ar: 'أكلت شيئاً آخر...', fr: "J'ai mangé autre chose...", es: 'Comí otra cosa...', hi: 'मैंने कुछ और खाया...',
      de: 'Ich habe etwas anderes gegessen...', nl: 'Ik heb iets anders gegeten...', zh: '我吃了别的...', ja: '別のものを食べた...', ko: '다른 걸 먹었어요...', tr: 'Başka bir şey yedim...', sw: 'Nilikula kitu kingine...', pt: 'Comi outra coisa...'
  },
  'i_did_else': {
      en: 'I did something else...', ar: 'فعلت شيئاً آخر...', fr: "J'ai fait autre chose...", es: 'Hice otra cosa...', hi: 'मैंने कुछ और किया...',
      de: 'Ich habe etwas anderes gemacht...', nl: 'Ik heb iets anders gedaan...', zh: '我做了别的...', ja: '別のことをした...', ko: '다른 걸 했어요...', tr: 'Başka bir şey yaptım...', sw: 'Nilifanya kitu kingine...', pt: 'Fiz outra coisa...'
  },
  'min_unit': {
      en: 'min', ar: 'دقيقة', fr: 'min', es: 'min', hi: 'मिनट',
      de: 'Min', nl: 'min', zh: '分钟', ja: '分', ko: '분', tr: 'dk', sw: 'dak', pt: 'min'
  },

  // ===== ONBOARDING =====
  'enable_access': {
      en: 'Enable Access', ar: 'تمكين الوصول', fr: "Activer l'accès", es: 'Habilitar Acceso', hi: 'एक्सेस सक्षम करें',
      de: 'Zugriff aktivieren', nl: 'Toegang inschakelen', zh: '启用访问', ja: 'アクセスを有効化', ko: '접근 활성화', tr: 'Erişimi Etkinleştir', sw: 'Wezesha Ufikiaji', pt: 'Habilitar Acesso'
  },
  'ai_coach_access': {
      en: 'To be your best AI Coach, LifeSync needs access to:', ar: 'لتكون أفضل مدرب ذكاء اصطناعي، يحتاج LifeSync إلى الوصول إلى:', fr: 'Pour être votre meilleur coach IA, LifeSync a besoin de:', es: 'Para ser tu mejor coach IA, LifeSync necesita acceso a:', hi: 'आपका सर्वश्रेष्ठ AI कोच बनने के लिए LifeSync को एक्सेस चाहिए:',
      de: 'Für den besten KI-Coach braucht LifeSync Zugriff auf:', nl: 'Voor de beste AI Coach heeft LifeSync toegang nodig tot:', zh: '为成为最佳AI教练，LifeSync需要访问：', ja: '最高のAIコーチになるため、LifeSyncには以下が必要です：', ko: '최고의 AI 코치가 되려면 LifeSync에 다음 접근이 필요합니다:', tr: 'En iyi AI Koçunuz olmak için erişim gerekiyor:', sw: 'Kuwa Kocha bora wa AI, LifeSync inahitaji:', pt: 'Para ser seu melhor Coach IA, o LifeSync precisa de acesso a:'
  },
  'notif_desc': {
      en: 'Smart reminders for meals & sleep.', ar: 'تنبيهات ذكية للوجبات والنوم.', fr: 'Rappels intelligents repas et sommeil.', es: 'Recordatorios inteligentes de comidas y sueño.', hi: 'भोजन और नींद के स्मार्ट रिमाइंडर।',
      de: 'Smarte Erinnerungen für Mahlzeiten und Schlaf.', nl: 'Slimme herinneringen voor maaltijden en slaap.', zh: '饮食和睡眠智能提醒。', ja: '食事と睡眠のスマートリマインダー。', ko: '식사 및 수면 스마트 알림.', tr: 'Yemek ve uyku için akıllı hatırlatıcılar.', sw: 'Vikumbusho vya milo na usingizi.', pt: 'Lembretes inteligentes para refeições e sono.'
  },
  'motion_sensors': {
      en: 'Motion Sensors', ar: 'مستشعرات الحركة', fr: 'Capteurs de mouvement', es: 'Sensores de Movimiento', hi: 'मोशन सेंसर',
      de: 'Bewegungssensoren', nl: 'Bewegingssensoren', zh: '运动传感器', ja: 'モーションセンサー', ko: '모션 센서', tr: 'Hareket Sensörleri', sw: 'Vihisi vya Mwendo', pt: 'Sensores de Movimento'
  },
  'motion_desc': {
      en: 'Track sleep cycles via mattress movement.', ar: 'تتبع دورات النوم عبر حركة الفراش.', fr: 'Suivre les cycles de sommeil via le matelas.', es: 'Rastrear ciclos de sueño por movimiento.', hi: 'गद्दे की गति से नींद चक्र ट्रैक करें।',
      de: 'Schlafzyklen über Matratzenbewegung tracken.', nl: 'Slaapcycli volgen via matrasbeweging.', zh: '通过床垫运动追踪睡眠周期。', ja: 'マットレスの動きで睡眠サイクルを追跡。', ko: '매트리스 움직임으로 수면 주기 추적.', tr: 'Yatak hareketi ile uyku döngülerini takip et.', sw: 'Fuatilia mizunguko ya usingizi kupitia godoro.', pt: 'Rastrear ciclos de sono via movimento do colchão.'
  },
  'grant_permissions': {
      en: 'Grant Permissions', ar: 'منح الأذونات', fr: 'Accorder les Permissions', es: 'Conceder Permisos', hi: 'अनुमति दें',
      de: 'Berechtigungen erteilen', nl: 'Machtigingen verlenen', zh: '授予权限', ja: '権限を許可', ko: '권한 부여', tr: 'İzinleri Ver', sw: 'Toa Ruhusa', pt: 'Conceder Permissões'
  },
  'spice_hint': {
      en: 'Determines spice levels and comfort foods.', ar: 'يحدد مستويات التوابل والأطعمة المريحة.', fr: 'Détermine les niveaux d\'épices et plats réconfortants.', es: 'Determina niveles de especias y comidas reconfortantes.', hi: 'मसाले के स्तर और पसंदीदा खाने निर्धारित करता है।',
      de: 'Bestimmt Gewürzstufen und Wohlfühlessen.', nl: 'Bepaalt kruidenniveaus en comfortfood.', zh: '确定香料水平和舒适食物。', ja: 'スパイスレベルと定番料理を決定。', ko: '양념 수준과 편안한 음식 결정.', tr: 'Baharat seviyelerini ve sevdiğiniz yemekleri belirler.', sw: 'Huamua viwango vya viungo na vyakula vya faraja.', pt: 'Determina níveis de tempero e comidas favoritas.'
  },
  'ingredients_hint': {
      en: 'Ensures suggested ingredients are available nearby.', ar: 'يضمن توفر المكونات المقترحة بالقرب منك.', fr: 'Garantit que les ingrédients suggérés sont disponibles.', es: 'Asegura que los ingredientes estén disponibles cerca.', hi: 'सुनिश्चित करता है कि सुझाई गई सामग्री पास में उपलब्ध हो।',
      de: 'Stellt sicher, dass Zutaten in der Nähe verfügbar sind.', nl: 'Zorgt dat ingrediënten in de buurt beschikbaar zijn.', zh: '确保建议的食材在附近可购买。', ja: '近くで入手可能な材料を提案。', ko: '근처에서 구할 수 있는 재료를 추천.', tr: 'Yakınlarda malzeme bulunmasını sağlar.', sw: 'Huhakikisha viungo vinapatikana karibu.', pt: 'Garante que ingredientes sugeridos estejam disponíveis.'
  },
  'life_family': {
      en: 'Life & Family', ar: 'الحياة والعائلة', fr: 'Vie & Famille', es: 'Vida y Familia', hi: 'जीवन और परिवार',
      de: 'Leben & Familie', nl: 'Leven & Familie', zh: '生活与家庭', ja: '生活と家族', ko: '생활 및 가족', tr: 'Yaşam ve Aile', sw: 'Maisha na Familia', pt: 'Vida e Família'
  },
  'balance_plan': {
      en: 'To balance your plan effectively.', ar: 'لموازنة خطتك بشكل فعال.', fr: 'Pour équilibrer votre plan.', es: 'Para equilibrar tu plan eficazmente.', hi: 'अपनी योजना को प्रभावी ढंग से संतुलित करने के लिए।',
      de: 'Um deinen Plan effektiv auszugleichen.', nl: 'Om je plan effectief te balanceren.', zh: '有效平衡你的计划。', ja: 'プランを効果的にバランスさせるため。', ko: '계획을 효과적으로 균형 잡기 위해.', tr: 'Planınızı etkin şekilde dengelemek için.', sw: 'Kusawazisha mpango wako kikamilifu.', pt: 'Para equilibrar seu plano efetivamente.'
  },
  'status_label': {
      en: 'Status', ar: 'الحالة', fr: 'Statut', es: 'Estado', hi: 'स्थिति',
      de: 'Status', nl: 'Status', zh: '状态', ja: 'ステータス', ko: '상태', tr: 'Durum', sw: 'Hali', pt: 'Estado'
  },
  'children': {
      en: 'Children', ar: 'الأطفال', fr: 'Enfants', es: 'Hijos', hi: 'बच्चे',
      de: 'Kinder', nl: 'Kinderen', zh: '子女', ja: '子供', ko: '자녀', tr: 'Çocuklar', sw: 'Watoto', pt: 'Filhos'
  },
  'affects_prep': {
      en: 'Affects meal prep time', ar: 'يؤثر على وقت تحضير الوجبة', fr: 'Affecte le temps de préparation', es: 'Afecta el tiempo de preparación', hi: 'भोजन तैयारी समय प्रभावित करता है',
      de: 'Beeinflusst Vorbereitungszeit', nl: 'Beïnvloedt bereidingstijd', zh: '影响备餐时间', ja: '食事の準備時間に影響', ko: '식사 준비 시간에 영향', tr: 'Yemek hazırlama süresini etkiler', sw: 'Inaathiri muda wa kuandaa mlo', pt: 'Afeta o tempo de preparo'
  },
  'separate_commas': {
      en: 'Separate with commas.', ar: 'افصل بالفواصل.', fr: 'Séparez par des virgules.', es: 'Separa con comas.', hi: 'अल्पविराम से अलग करें।',
      de: 'Mit Kommas trennen.', nl: 'Scheid met komma\'s.', zh: '用逗号分隔。', ja: 'カンマで区切ってください。', ko: '쉼표로 구분하세요.', tr: 'Virgülle ayırın.', sw: 'Tenganisha kwa koma.', pt: 'Separe com vírgulas.'
  },
  'sedentary': {
      en: 'Sedentary (Office job)', ar: 'خامل (عمل مكتبي)', fr: 'Sédentaire (Bureau)', es: 'Sedentario (Oficina)', hi: 'गतिहीन (ऑफिस जॉब)',
      de: 'Sitzend (Bürojob)', nl: 'Zittend (Kantoor)', zh: '久坐（办公室）', ja: '座りっぱなし（デスクワーク）', ko: '좌식 (사무직)', tr: 'Hareketsiz (Ofis işi)', sw: 'Kukaa (Kazi ya ofisi)', pt: 'Sedentário (Escritório)'
  },
  'light_activity': {
      en: 'Light Activity', ar: 'نشاط خفيف', fr: 'Activité Légère', es: 'Actividad Ligera', hi: 'हल्की गतिविधि',
      de: 'Leichte Aktivität', nl: 'Lichte Activiteit', zh: '轻度活动', ja: '軽い運動', ko: '가벼운 활동', tr: 'Hafif Aktivite', sw: 'Shughuli Nyepesi', pt: 'Atividade Leve'
  },
  'moderate_exercise': {
      en: 'Moderate Exercise', ar: 'تمرين متوسط', fr: 'Exercice Modéré', es: 'Ejercicio Moderado', hi: 'मध्यम व्यायाम',
      de: 'Mäßige Bewegung', nl: 'Matige Oefening', zh: '中等运动', ja: '適度な運動', ko: '적당한 운동', tr: 'Orta Egzersiz', sw: 'Mazoezi ya Wastani', pt: 'Exercício Moderado'
  },
  'very_active': {
      en: 'Very Active', ar: 'نشيط جداً', fr: 'Très Actif', es: 'Muy Activo', hi: 'बहुत सक्रिय',
      de: 'Sehr Aktiv', nl: 'Zeer Actief', zh: '非常活跃', ja: 'とても活動的', ko: '매우 활동적', tr: 'Çok Aktif', sw: 'Hai Sana', pt: 'Muito Ativo'
  },
  'target_weight': {
      en: 'Target Weight (kg)', ar: 'الوزن المستهدف (كجم)', fr: 'Poids Cible (kg)', es: 'Peso Objetivo (kg)', hi: 'लक्ष्य वजन (किग्रा)',
      de: 'Zielgewicht (kg)', nl: 'Doelgewicht (kg)', zh: '目标体重（kg）', ja: '目標体重（kg）', ko: '목표 체중 (kg)', tr: 'Hedef Kilo (kg)', sw: 'Uzito Lengwa (kg)', pt: 'Peso Alvo (kg)'
  },
  'target_date': {
      en: 'Target Date', ar: 'التاريخ المستهدف', fr: 'Date Cible', es: 'Fecha Objetivo', hi: 'लक्ष्य तिथि',
      de: 'Zieldatum', nl: 'Doeldatum', zh: '目标日期', ja: '目標日', ko: '목표 날짜', tr: 'Hedef Tarih', sw: 'Tarehe Lengwa', pt: 'Data Alvo'
  },
  'plan_pace': {
      en: 'Plan Pace', ar: 'سرعة الخطة', fr: 'Rythme du Plan', es: 'Ritmo del Plan', hi: 'योजना गति',
      de: 'Plan-Tempo', nl: 'Plantempo', zh: '计划节奏', ja: 'プランペース', ko: '계획 속도', tr: 'Plan Hızı', sw: 'Kasi ya Mpango', pt: 'Ritmo do Plano'
  },
  'gemini_thinking': {
      en: 'Gemini is Thinking...', ar: 'Gemini يفكر...', fr: 'Gemini réfléchit...', es: 'Gemini está Pensando...', hi: 'Gemini सोच रहा है...',
      de: 'Gemini denkt nach...', nl: 'Gemini denkt na...', zh: 'Gemini 思考中...', ja: 'Geminiが考え中...', ko: 'Gemini 생각 중...', tr: 'Gemini Düşünüyor...', sw: 'Gemini inafikiria...', pt: 'Gemini está Pensando...'
  },
  'analyzing_meta': {
      en: 'Analyzing metabolism...', ar: 'تحليل الأيض...', fr: 'Analyse du métabolisme...', es: 'Analizando metabolismo...', hi: 'चयापचय विश्लेषण...',
      de: 'Stoffwechsel wird analysiert...', nl: 'Metabolisme analyseren...', zh: '分析新陈代谢...', ja: '代謝を分析中...', ko: '대사 분석 중...', tr: 'Metabolizma analiz ediliyor...', sw: 'Inachambua umetaboli...', pt: 'Analisando metabolismo...'
  },
  'adjusting_for': {
      en: 'Adjusting for', ar: 'تعديل حسب', fr: 'Ajustement pour', es: 'Ajustando para', hi: 'समायोजन कर रहा है',
      de: 'Anpassung für', nl: 'Aanpassen voor', zh: '正在调整', ja: '調整中', ko: '조정 중', tr: 'Ayarlanıyor', sw: 'Inarekebishwa kwa', pt: 'Ajustando para'
  },
  'medical_conditions': {
      en: 'medical conditions', ar: 'الحالات الطبية', fr: 'conditions médicales', es: 'condiciones médicas', hi: 'चिकित्सा स्थितियां',
      de: 'medizinische Bedingungen', nl: 'medische condities', zh: '医疗状况', ja: '健康状態', ko: '의료 상태', tr: 'tıbbi durumlar', sw: 'hali za kimatibabu', pt: 'condições médicas'
  },
  'lifestyle': {
      en: 'lifestyle', ar: 'نمط الحياة', fr: 'style de vie', es: 'estilo de vida', hi: 'जीवनशैली',
      de: 'Lebensstil', nl: 'levensstijl', zh: '生活方式', ja: 'ライフスタイル', ko: '생활 방식', tr: 'yaşam tarzı', sw: 'mtindo wa maisha', pt: 'estilo de vida'
  },
  'matching_heritage': {
      en: 'Matching heritage to location...', ar: 'مطابقة التراث مع الموقع...', fr: "Association de l'héritage au lieu...", es: 'Combinando herencia con ubicación...', hi: 'विरासत को स्थान से मिला रहा है...',
      de: 'Herkunft mit Standort abgleichen...', nl: 'Erfgoed matchen met locatie...', zh: '匹配传统与位置...', ja: '伝統と場所をマッチング中...', ko: '전통과 위치 매칭 중...', tr: 'Miras ve konum eşleştiriliyor...', sw: 'Kulinganisha asili na eneo...', pt: 'Combinando herança com localização...'
  },
  'male': {
      en: 'Male', ar: 'ذكر', fr: 'Homme', es: 'Hombre', hi: 'पुरुष',
      de: 'Männlich', nl: 'Man', zh: '男', ja: '男性', ko: '남성', tr: 'Erkek', sw: 'Mwanaume', pt: 'Masculino'
  },
  'female': {
      en: 'Female', ar: 'أنثى', fr: 'Femme', es: 'Mujer', hi: 'महिला',
      de: 'Weiblich', nl: 'Vrouw', zh: '女', ja: '女性', ko: '여성', tr: 'Kadın', sw: 'Mwanamke', pt: 'Feminino'
  },
  'single': {
      en: 'Single', ar: 'أعزب', fr: 'Célibataire', es: 'Soltero', hi: 'अविवाहित',
      de: 'Single', nl: 'Alleenstaand', zh: '单身', ja: '独身', ko: '미혼', tr: 'Bekar', sw: 'Mseja', pt: 'Solteiro'
  },
  'married': {
      en: 'Married', ar: 'متزوج', fr: 'Marié(e)', es: 'Casado', hi: 'विवाहित',
      de: 'Verheiratet', nl: 'Getrouwd', zh: '已婚', ja: '既婚', ko: '기혼', tr: 'Evli', sw: 'Ameoa', pt: 'Casado'
  },
  'partner': {
      en: 'Partner', ar: 'شريك', fr: 'Partenaire', es: 'Pareja', hi: 'साथी',
      de: 'Partner', nl: 'Partner', zh: '伴侣', ja: 'パートナー', ko: '파트너', tr: 'Partner', sw: 'Mpenzi', pt: 'Parceiro'
  },
  'home_unempl': {
      en: 'Home/Unempl.', ar: 'منزل/عاطل', fr: 'Maison/Sans emploi', es: 'Hogar/Desempl.', hi: 'घर/बेरोजगार',
      de: 'Zuhause/Arbeitslos', nl: 'Thuis/Werkloos', zh: '在家/待业', ja: '自宅/無職', ko: '재택/무직', tr: 'Ev/İşsiz', sw: 'Nyumba/Bila kazi', pt: 'Casa/Desempr.'
  },
  'pace_easy': {
      en: 'Easy', ar: 'سهل', fr: 'Facile', es: 'Fácil', hi: 'आसान',
      de: 'Einfach', nl: 'Makkelijk', zh: '轻松', ja: '楽に', ko: '쉬움', tr: 'Kolay', sw: 'Rahisi', pt: 'Fácil'
  },
  'pace_steady': {
      en: 'Steady', ar: 'ثابت', fr: 'Stable', es: 'Constante', hi: 'स्थिर',
      de: 'Stetig', nl: 'Stabiel', zh: '稳定', ja: '安定', ko: '꾸준함', tr: 'Sabit', sw: 'Thabiti', pt: 'Estável'
  },
  'pace_fast': {
      en: 'Fast', ar: 'سريع', fr: 'Rapide', es: 'Rápido', hi: 'तेज़',
      de: 'Schnell', nl: 'Snel', zh: '快速', ja: '速い', ko: '빠름', tr: 'Hızlı', sw: 'Haraka', pt: 'Rápido'
  },

  // ===== PROFILE =====
  'name_label': {
      en: 'Name', ar: 'الاسم', fr: 'Nom', es: 'Nombre', hi: 'नाम',
      de: 'Name', nl: 'Naam', zh: '姓名', ja: '名前', ko: '이름', tr: 'Ad', sw: 'Jina', pt: 'Nome'
  },
  'energetic': {
      en: 'Energetic', ar: 'نشيط', fr: 'Énergique', es: 'Energético', hi: 'ऊर्जावान',
      de: 'Energetisch', nl: 'Energiek', zh: '精力充沛', ja: 'エネルギッシュ', ko: '에너지 넘침', tr: 'Enerjik', sw: 'Hai', pt: 'Energético'
  },
  'happy': {
      en: 'Happy', ar: 'سعيد', fr: 'Heureux', es: 'Feliz', hi: 'खुश',
      de: 'Glücklich', nl: 'Blij', zh: '开心', ja: '幸せ', ko: '행복', tr: 'Mutlu', sw: 'Furaha', pt: 'Feliz'
  },
  'neutral': {
      en: 'Neutral', ar: 'محايد', fr: 'Neutre', es: 'Neutral', hi: 'तटस्थ',
      de: 'Neutral', nl: 'Neutraal', zh: '一般', ja: '普通', ko: '보통', tr: 'Nötr', sw: 'Wastani', pt: 'Neutro'
  },
  'stressed': {
      en: 'Stressed', ar: 'متوتر', fr: 'Stressé', es: 'Estresado', hi: 'तनावग्रस्त',
      de: 'Gestresst', nl: 'Gestrest', zh: '有压力', ja: 'ストレス', ko: '스트레스', tr: 'Stresli', sw: 'Msongo', pt: 'Estressado'
  },
  'sad_mood': {
      en: 'Sad', ar: 'حزين', fr: 'Triste', es: 'Triste', hi: 'उदास',
      de: 'Traurig', nl: 'Verdrietig', zh: '难过', ja: '悲しい', ko: '슬픔', tr: 'Üzgün', sw: 'Huzuni', pt: 'Triste'
  },
  'how_feeling': {
      en: 'How are you feeling?', ar: 'كيف حالك؟', fr: 'Comment vous sentez-vous?', es: '¿Cómo te sientes?', hi: 'आप कैसा महसूस कर रहे हैं?',
      de: 'Wie geht es dir?', nl: 'Hoe voel je je?', zh: '你感觉怎么样？', ja: '調子はどうですか？', ko: '기분이 어떠세요?', tr: 'Nasıl hissediyorsun?', sw: 'Unahisije?', pt: 'Como você está se sentindo?'
  },
  'logged_today': {
      en: 'Logged today', ar: 'تم التسجيل اليوم', fr: "Enregistré aujourd'hui", es: 'Registrado hoy', hi: 'आज लॉग किया',
      de: 'Heute geloggt', nl: 'Vandaag gelogd', zh: '今日已记录', ja: '今日記録済み', ko: '오늘 기록됨', tr: 'Bugün kaydedildi', sw: 'Imerekodwa leo', pt: 'Registrado hoje'
  },
  'weight_progress': {
      en: 'Weight Progress', ar: 'تقدم الوزن', fr: 'Progrès du Poids', es: 'Progreso de Peso', hi: 'वजन प्रगति',
      de: 'Gewichtsfortschritt', nl: 'Gewichtsvoortgang', zh: '体重进展', ja: '体重の推移', ko: '체중 변화', tr: 'Kilo İlerlemesi', sw: 'Maendeleo ya Uzito', pt: 'Progresso de Peso'
  },
  'current': {
      en: 'Current', ar: 'الحالي', fr: 'Actuel', es: 'Actual', hi: 'वर्तमान',
      de: 'Aktuell', nl: 'Huidig', zh: '当前', ja: '現在', ko: '현재', tr: 'Mevcut', sw: 'Sasa', pt: 'Atual'
  },
  'edit': {
      en: 'Edit', ar: 'تعديل', fr: 'Modifier', es: 'Editar', hi: 'संपादित करें',
      de: 'Bearbeiten', nl: 'Bewerken', zh: '编辑', ja: '編集', ko: '편집', tr: 'Düzenle', sw: 'Hariri', pt: 'Editar'
  },
  'recalc_note': {
      en: 'Changes to health status will trigger a full plan recalculation.', ar: 'التغييرات في الحالة الصحية ستؤدي إلى إعادة حساب الخطة بالكامل.', fr: 'Les changements de santé déclencheront un recalcul du plan.', es: 'Los cambios de salud activarán un recálculo del plan.', hi: 'स्वास्थ्य स्थिति में बदलाव से पूरी योजना की पुनर्गणना होगी।',
      de: 'Gesundheitsänderungen lösen eine Neuberechnung aus.', nl: 'Gezondheidswijzigingen activeren herberekening.', zh: '健康状态变更将触发计划重新计算。', ja: '健康状態の変更でプランが再計算されます。', ko: '건강 상태 변경 시 계획이 재계산됩니다.', tr: 'Sağlık durumu değişiklikleri plan yeniden hesaplanmasını tetikler.', sw: 'Mabadiliko ya afya yatasababisha mpango kuhesabiwa upya.', pt: 'Mudanças na saúde acionarão recálculo do plano.'
  },
  'roots': {
      en: 'Roots', ar: 'جذور', fr: 'Racines', es: 'Raíces', hi: 'जड़ें',
      de: 'Wurzeln', nl: 'Wortels', zh: '根源', ja: 'ルーツ', ko: '뿌리', tr: 'Kökler', sw: 'Mizizi', pt: 'Raízes'
  },
  'by_date': {
      en: 'by', ar: 'بحلول', fr: "d'ici le", es: 'para', hi: 'तक',
      de: 'bis', nl: 'tegen', zh: '截至', ja: 'まで', ko: '까지', tr: 'tarihine kadar', sw: 'kufikia', pt: 'até'
  },

  // ===== AD OVERLAY =====
  'ad_label': {
      en: 'Ad', ar: 'إعلان', fr: 'Pub', es: 'Anuncio', hi: 'विज्ञापन',
      de: 'Anzeige', nl: 'Advertentie', zh: '广告', ja: '広告', ko: '광고', tr: 'Reklam', sw: 'Tangazo', pt: 'Anúncio'
  },
  'energy_recharging': {
      en: 'BioSync Energy Recharging...', ar: 'جاري إعادة شحن طاقة BioSync...', fr: 'Recharge énergie BioSync...', es: 'Recargando Energía BioSync...', hi: 'BioSync ऊर्जा रिचार्ज हो रही है...',
      de: 'BioSync Energie wird aufgeladen...', nl: 'BioSync Energie opladen...', zh: 'BioSync 能量充电中...', ja: 'BioSyncエネルギー充電中...', ko: 'BioSync 에너지 충전 중...', tr: 'BioSync Enerji Şarj Ediliyor...', sw: 'BioSync Nishati Inachajiwa...', pt: 'Recarregando Energia BioSync...'
  },
  'connecting_grid': {
      en: 'Connecting to Grid...', ar: 'الاتصال بالشبكة...', fr: 'Connexion au réseau...', es: 'Conectando a la Red...', hi: 'ग्रिड से कनेक्ट हो रहा है...',
      de: 'Verbindung zum Netz...', nl: 'Verbinden met netwerk...', zh: '连接到电网...', ja: 'グリッドに接続中...', ko: '그리드에 연결 중...', tr: 'Şebekeye Bağlanıyor...', sw: 'Inaunganisha na Gridi...', pt: 'Conectando à Rede...'
  },
  'super_charge': {
      en: 'SUPER CHARGE', ar: 'شحن فائق', fr: 'SUPER CHARGE', es: 'SUPER CARGA', hi: 'सुपर चार्ज',
      de: 'SUPER CHARGE', nl: 'SUPER CHARGE', zh: '超级充电', ja: 'スーパーチャージ', ko: '슈퍼 차지', tr: 'SÜPER ŞARJ', sw: 'CHAJI KALI', pt: 'SUPER CARGA'
  },
  'refilling_cells': {
      en: 'Refilling Bio-Fuel Cells...', ar: 'إعادة تعبئة خلايا الوقود الحيوي...', fr: 'Remplissage des cellules bio...', es: 'Rellenando Celdas Bio-Fuel...', hi: 'बायो-फ्यूल सेल भर रहा है...',
      de: 'Bio-Brennstoffzellen werden befüllt...', nl: 'Bio-brandstofcellen vullen...', zh: '补充生物燃料电池...', ja: 'バイオ燃料セル補充中...', ko: '바이오 연료 셀 충전 중...', tr: 'Bio-Yakıt Hücreleri Dolduruluyor...', sw: 'Kujaza Seli za Bio-Nishati...', pt: 'Reabastecendo Células Bio-Fuel...'
  },
  'fully_charged': {
      en: '100% CHARGED', ar: '100% مشحون', fr: '100% CHARGÉ', es: '100% CARGADO', hi: '100% चार्ज',
      de: '100% GELADEN', nl: '100% GELADEN', zh: '100% 已充满', ja: '100% 充電完了', ko: '100% 충전 완료', tr: '%100 ŞARJ EDİLDİ', sw: '100% IMECHAJIWA', pt: '100% CARREGADO'
  },
  'return_to_app': {
      en: 'RETURN TO APP', ar: 'العودة إلى التطبيق', fr: "RETOUR À L'APP", es: 'VOLVER A LA APP', hi: 'ऐप पर वापस',
      de: 'ZURÜCK ZUR APP', nl: 'TERUG NAAR APP', zh: '返回应用', ja: 'アプリに戻る', ko: '앱으로 돌아가기', tr: 'UYGULAMAYA DÖN', sw: 'RUDI KWENYE APP', pt: 'VOLTAR AO APP'
  },
  'ad_unavailable': {
      en: 'AD UNAVAILABLE', ar: 'الإعلان غير متاح', fr: 'PUB INDISPONIBLE', es: 'ANUNCIO NO DISPONIBLE', hi: 'विज्ञापन अनुपलब्ध',
      de: 'ANZEIGE NICHT VERFÜGBAR', nl: 'ADVERTENTIE NIET BESCHIKBAAR', zh: '广告不可用', ja: '広告利用不可', ko: '광고 사용 불가', tr: 'REKLAM MEVCUT DEĞİL', sw: 'TANGAZO HALIPATIKANI', pt: 'ANÚNCIO INDISPONÍVEL'
  },
  'ad_no_respond': {
      en: 'Ad service did not respond.', ar: 'خدمة الإعلانات لم تستجب.', fr: "Le service pub n'a pas répondu.", es: 'El servicio de anuncios no respondió.', hi: 'विज्ञापन सेवा ने प्रतिक्रिया नहीं दी।',
      de: 'Anzeigendienst hat nicht reagiert.', nl: 'Advertentieservice reageerde niet.', zh: '广告服务未响应。', ja: '広告サービスが応答しません。', ko: '광고 서비스가 응답하지 않습니다.', tr: 'Reklam servisi yanıt vermedi.', sw: 'Huduma ya tangazo haijuitikia.', pt: 'Serviço de anúncios não respondeu.'
  },
  'continue_no_recharge': {
      en: 'Continue Without Recharge', ar: 'متابعة بدون شحن', fr: 'Continuer sans recharge', es: 'Continuar sin recargar', hi: 'बिना रिचार्ज जारी रखें',
      de: 'Weiter ohne Aufladen', nl: 'Doorgaan zonder opladen', zh: '不充电继续', ja: '充電せずに続行', ko: '충전 없이 계속', tr: 'Şarj Etmeden Devam Et', sw: 'Endelea Bila Kuchaji', pt: 'Continuar Sem Recarregar'
  },
  'skip_no_reward': {
      en: 'Skip (No Reward)', ar: 'تخطي (بدون مكافأة)', fr: 'Passer (Pas de récompense)', es: 'Saltar (Sin Recompensa)', hi: 'छोड़ें (कोई इनाम नहीं)',
      de: 'Überspringen (Keine Belohnung)', nl: 'Overslaan (Geen beloning)', zh: '跳过（无奖励）', ja: 'スキップ（報酬なし）', ko: '건너뛰기 (보상 없음)', tr: 'Atla (Ödül Yok)', sw: 'Ruka (Hakuna Tuzo)', pt: 'Pular (Sem Recompensa)'
  },
  'skip_confirm': {
      en: 'Skip video? You will NOT receive Energy and the action will be cancelled.', ar: 'تخطي الفيديو؟ لن تحصل على طاقة وسيتم إلغاء الإجراء.', fr: 'Passer la vidéo? Vous ne recevrez pas d\'énergie.', es: '¿Saltar video? NO recibirás Energía y la acción se cancelará.', hi: 'वीडियो छोड़ें? आपको ऊर्जा नहीं मिलेगी और कार्य रद्द हो जाएगा।',
      de: 'Video überspringen? Keine Energie und Aktion wird abgebrochen.', nl: 'Video overslaan? Geen energie en actie wordt geannuleerd.', zh: '跳过视频？您将不会获得能量，操作将被取消。', ja: '動画をスキップ？エネルギーは得られず、操作はキャンセルされます。', ko: '영상을 건너뛸까요? 에너지를 받지 못하고 작업이 취소됩니다.', tr: 'Videoyu atla? Enerji almayacaksın ve işlem iptal edilecek.', sw: 'Ruka video? Hutapata Nishati na kitendo kitafutwa.', pt: 'Pular vídeo? Você NÃO receberá Energia e a ação será cancelada.'
  },
  'no_connection': {
      en: 'No connection. Ad unavailable.', ar: 'لا يوجد اتصال. الإعلان غير متاح.', fr: 'Pas de connexion. Pub indisponible.', es: 'Sin conexión. Anuncio no disponible.', hi: 'कोई कनेक्शन नहीं। विज्ञापन अनुपलब्ध।',
      de: 'Keine Verbindung. Anzeige nicht verfügbar.', nl: 'Geen verbinding. Advertentie niet beschikbaar.', zh: '无连接。广告不可用。', ja: '接続なし。広告利用不可。', ko: '연결 없음. 광고 사용 불가.', tr: 'Bağlantı yok. Reklam mevcut değil.', sw: 'Hakuna muunganisho. Tangazo halipatikani.', pt: 'Sem conexão. Anúncio indisponível.'
  },
  'no_reward_video': {
      en: 'No reward video available right now.', ar: 'لا يوجد فيديو مكافأة متاح حالياً.', fr: 'Aucune vidéo récompense disponible.', es: 'No hay video de recompensa disponible.', hi: 'अभी कोई रिवॉर्ड वीडियो उपलब्ध नहीं।',
      de: 'Kein Belohnungsvideo verfügbar.', nl: 'Geen beloningsvideo beschikbaar.', zh: '暂无奖励视频。', ja: '報酬動画は現在利用できません。', ko: '현재 보상 동영상을 사용할 수 없습니다.', tr: 'Ödül videosu şu anda mevcut değil.', sw: 'Hakuna video ya tuzo kwa sasa.', pt: 'Nenhum vídeo de recompensa disponível agora.'
  },
  'close_btn': {
      en: 'CLOSE X', ar: 'إغلاق X', fr: 'FERMER X', es: 'CERRAR X', hi: 'बंद करें X',
      de: 'SCHLIESSEN X', nl: 'SLUITEN X', zh: '关闭 X', ja: '閉じる X', ko: '닫기 X', tr: 'KAPAT X', sw: 'FUNGA X', pt: 'FECHAR X'
  },
  'continue_btn': {
      en: 'CONTINUE', ar: 'متابعة', fr: 'CONTINUER', es: 'CONTINUAR', hi: 'जारी रखें',
      de: 'WEITER', nl: 'DOORGAAN', zh: '继续', ja: '続行', ko: '계속', tr: 'DEVAM', sw: 'ENDELEA', pt: 'CONTINUAR'
  },

  // ===== FOOD ANALYZER EXTRAS =====
  'refining_analysis': {
      en: 'Refining Analysis & Description...', ar: 'تحسين التحليل والوصف...', fr: 'Affinage de l\'analyse...', es: 'Refinando análisis y descripción...', hi: 'विश्लेषण और विवरण सुधार रहा है...',
      de: 'Analyse wird verfeinert...', nl: 'Analyse verfijnen...', zh: '正在优化分析和描述...', ja: '分析と説明を改善中...', ko: '분석 및 설명 개선 중...', tr: 'Analiz ve açıklama iyileştiriliyor...', sw: 'Kuboresha Uchambuzi...', pt: 'Refinando análise e descrição...'
  },
  'what_wrong': {
      en: 'What did Gemini get wrong?', ar: 'ما الذي أخطأ فيه Gemini؟', fr: 'Qu\'est-ce que Gemini a mal compris ?', es: '¿Qué identificó mal Gemini?', hi: 'Gemini ने क्या गलत पहचाना?',
      de: 'Was hat Gemini falsch erkannt?', nl: 'Wat heeft Gemini fout?', zh: 'Gemini 哪里分析错了？', ja: 'Geminiの分析で間違っているところは？', ko: 'Gemini가 잘못 분석한 부분은?', tr: 'Gemini neyi yanlış tanıdı?', sw: 'Gemini ilikosea nini?', pt: 'O que o Gemini errou?'
  },
  'analysis_pending': {
      en: 'Analysis failed or pending...', ar: 'فشل التحليل أو قيد الانتظار...', fr: 'Analyse échouée ou en attente...', es: 'Análisis fallido o pendiente...', hi: 'विश्लेषण विफल या लंबित...',
      de: 'Analyse fehlgeschlagen oder ausstehend...', nl: 'Analyse mislukt of in behandeling...', zh: '分析失败或待处理...', ja: '分析失敗または保留中...', ko: '분석 실패 또는 대기 중...', tr: 'Analiz başarısız veya beklemede...', sw: 'Uchambuzi umeshindwa au unasubiri...', pt: 'Análise falhou ou pendente...'
  },
  'confidence': {
      en: 'Confidence', ar: 'الثقة', fr: 'Confiance', es: 'Confianza', hi: 'विश्वसनीयता',
      de: 'Vertrauen', nl: 'Betrouwbaarheid', zh: '置信度', ja: '確信度', ko: '신뢰도', tr: 'Güven', sw: 'Uhakika', pt: 'Confiança'
  },

  // ===== AI COACH EXTRAS =====
  'coach_greeting': {
      en: 'How can I help you today?', ar: 'كيف يمكنني مساعدتك اليوم؟', fr: 'Comment puis-je vous aider ?', es: '¿Cómo puedo ayudarte hoy?', hi: 'आज मैं आपकी कैसे मदद कर सकता हूँ?',
      de: 'Wie kann ich Ihnen heute helfen?', nl: 'Hoe kan ik je vandaag helpen?', zh: '今天我能帮你什么？', ja: '今日はどのようにお手伝いしましょうか？', ko: '오늘 어떻게 도와드릴까요?', tr: 'Bugün size nasıl yardımcı olabilirim?', sw: 'Ninaweza kukusaidia vipi leo?', pt: 'Como posso ajudar hoje?'
  },
  'coach_choose_mode': {
      en: 'Choose a mode to start our conversation.', ar: 'اختر وضعًا لبدء المحادثة.', fr: 'Choisissez un mode pour commencer.', es: 'Elige un modo para iniciar la conversación.', hi: 'बातचीत शुरू करने के लिए मोड चुनें।',
      de: 'Wählen Sie einen Modus.', nl: 'Kies een modus om te beginnen.', zh: '选择模式开始对话。', ja: 'モードを選んで会話を始めましょう。', ko: '대화를 시작할 모드를 선택하세요.', tr: 'Sohbeti başlatmak için bir mod seçin.', sw: 'Chagua hali ya kuanza mazungumzo.', pt: 'Escolha um modo para começar.'
  },
  'energy': {
      en: 'Energy', ar: 'طاقة', fr: 'Énergie', es: 'Energía', hi: 'ऊर्जा',
      de: 'Energie', nl: 'Energie', zh: '能量', ja: 'エネルギー', ko: '에너지', tr: 'Enerji', sw: 'Nishati', pt: 'Energia'
  },

  // ===== SMART FRIDGE EXTRAS =====
  'found_ingredients': {
      en: 'Found {n} ingredients. How much effort today?', ar: 'تم العثور على {n} مكون. كم جهد اليوم؟', fr: '{n} ingrédients trouvés. Quel effort aujourd\'hui ?', es: '{n} ingredientes encontrados. ¿Cuánto esfuerzo hoy?', hi: '{n} सामग्री मिली। आज कितनी मेहनत?',
      de: '{n} Zutaten gefunden. Wie viel Aufwand heute?', nl: '{n} ingrediënten gevonden. Hoeveel moeite vandaag?', zh: '找到 {n} 种食材。今天想花多少功夫？', ja: '{n}個の食材を発見。今日はどのくらい手をかけますか？', ko: '{n}개의 재료를 발견했습니다. 오늘 얼마나 노력할까요?', tr: '{n} malzeme bulundu. Bugün ne kadar emek?', sw: 'Viungo {n} vimepatikana. Juhudi ngapi leo?', pt: '{n} ingredientes encontrados. Quanto esforço hoje?'
  },
  'mood_quick_desc': {
      en: 'Simple, fast, minimal cleanup.', ar: 'بسيط، سريع، تنظيف قليل.', fr: 'Simple, rapide, peu de nettoyage.', es: 'Simple, rápido, mínima limpieza.', hi: 'सरल, तेज़, न्यूनतम सफाई।',
      de: 'Einfach, schnell, wenig Aufräumen.', nl: 'Simpel, snel, weinig opruimen.', zh: '简单、快速、少清洁。', ja: 'シンプル、素早い、後片付け最小限。', ko: '간단, 빠른, 최소 정리.', tr: 'Basit, hızlı, minimum temizlik.', sw: 'Rahisi, haraka, usafi kidogo.', pt: 'Simples, rápido, mínima limpeza.'
  },
  'mood_balanced_desc': {
      en: 'Traditional cooking, balanced flavors.', ar: 'طهي تقليدي، نكهات متوازنة.', fr: 'Cuisine traditionnelle, saveurs équilibrées.', es: 'Cocina tradicional, sabores equilibrados.', hi: 'पारंपरिक खाना, संतुलित स्वाद।',
      de: 'Traditionelles Kochen, ausgewogene Aromen.', nl: 'Traditioneel koken, gebalanceerde smaken.', zh: '传统烹饪，均衡风味。', ja: '伝統的な料理、バランスの取れた味。', ko: '전통 요리, 균형 잡힌 맛.', tr: 'Geleneksel yemek, dengeli tatlar.', sw: 'Kupika jadi, ladha sawia.', pt: 'Cozinha tradicional, sabores equilibrados.'
  },
  'mood_gourmet_desc': {
      en: 'Complex techniques, presentation focused.', ar: 'تقنيات معقدة، تركيز على العرض.', fr: 'Techniques complexes, présentation soignée.', es: 'Técnicas complejas, enfoque en presentación.', hi: 'जटिल तकनीक, प्रस्तुति केंद्रित।',
      de: 'Komplexe Techniken, Präsentation im Fokus.', nl: 'Complexe technieken, presentatie gericht.', zh: '复杂技巧，注重摆盘。', ja: '複雑なテクニック、盛り付け重視。', ko: '복잡한 기술, 프레젠테이션 중심.', tr: 'Karmaşık teknikler, sunuma odaklı.', sw: 'Mbinu tata, uwasilishaji bora.', pt: 'Técnicas complexas, foco na apresentação.'
  },

  // ===== ACTION MODAL EXTRAS =====
  'ate_something_else': {
      en: 'I ate something else...', ar: 'أكلت شيئًا آخر...', fr: "J'ai mangé autre chose...", es: 'Comí otra cosa...', hi: 'मैंने कुछ और खाया...',
      de: 'Ich habe etwas anderes gegessen...', nl: 'Ik heb iets anders gegeten...', zh: '我吃了别的东西...', ja: '別のものを食べました...', ko: '다른 것을 먹었어요...', tr: 'Başka bir şey yedim...', sw: 'Nilikula kitu kingine...', pt: 'Comi outra coisa...'
  },
  'i_ate_examples': {
      en: 'Snickers, Snack, Extra Meal...', ar: 'سنيكرز، وجبة خفيفة، وجبة إضافية...', fr: 'Snickers, collation, repas supplémentaire...', es: 'Snickers, snack, comida extra...', hi: 'स्निकर्स, स्नैक, अतिरिक्त भोजन...',
      de: 'Snickers, Snack, Extra-Mahlzeit...', nl: 'Snickers, snack, extra maaltijd...', zh: '士力架、零食、额外餐食...', ja: 'スニッカーズ、おやつ、追加の食事...', ko: '스니커즈, 간식, 추가 식사...', tr: 'Snickers, Atıştırmalık, Ekstra Öğün...', sw: 'Snickers, Vitafunio, Mlo wa Ziada...', pt: 'Snickers, lanche, refeição extra...'
  },
  'i_moved_examples': {
      en: 'Walk, Gym, Cleaning...', ar: 'مشي، صالة رياضية، تنظيف...', fr: 'Marche, salle de sport, ménage...', es: 'Caminar, gimnasio, limpieza...', hi: 'टहलना, जिम, सफाई...',
      de: 'Gehen, Fitnessstudio, Putzen...', nl: 'Wandelen, sportschool, schoonmaken...', zh: '散步、健身房、清洁...', ja: 'ウォーキング、ジム、掃除...', ko: '걷기, 헬스장, 청소...', tr: 'Yürüyüş, Spor Salonu, Temizlik...', sw: 'Kutembea, Gym, Kusafisha...', pt: 'Caminhada, academia, limpeza...'
  },

  // ===== ONBOARDING EXTRAS =====
  'enable_access_desc': {
      en: 'To be your best AI Coach, LifeSync needs access to:', ar: 'لكي يكون مدرب الذكاء الاصطناعي الأفضل، يحتاج LifeSync إلى الوصول إلى:', fr: 'Pour être votre meilleur coach IA, LifeSync a besoin de :', es: 'Para ser tu mejor coach IA, LifeSync necesita acceso a:', hi: 'आपका सबसे अच्छा AI कोच बनने के लिए, LifeSync को एक्सेस चाहिए:',
      de: 'Um Ihr bester KI-Coach zu sein, benötigt LifeSync Zugriff auf:', nl: 'Om uw beste AI Coach te zijn, heeft LifeSync toegang nodig tot:', zh: '为了成为你最好的AI教练，LifeSync需要访问：', ja: '最高のAIコーチになるため、LifeSyncは以下へのアクセスが必要です：', ko: '최고의 AI 코치가 되기 위해 LifeSync는 다음에 접근해야 합니다:', tr: 'En iyi AI Koçunuz olmak için LifeSync şunlara erişim gerektirir:', sw: 'Kuwa Kocha wako bora wa AI, LifeSync inahitaji ufikiaji wa:', pt: 'Para ser seu melhor coach IA, o LifeSync precisa de acesso a:'
  },
  'origin_hint': {
      en: 'Determines spice levels and comfort foods.', ar: 'يحدد مستويات التوابل والأطعمة المفضلة.', fr: 'Détermine les niveaux d\'épices et plats réconfortants.', es: 'Determina niveles de especias y comidas reconfortantes.', hi: 'मसाले का स्तर और आरामदायक खाना निर्धारित करता है।',
      de: 'Bestimmt Gewürzstufen und Wohlfühlessen.', nl: 'Bepaalt kruidniveaus en comfortvoeding.', zh: '确定香料等级和舒适食物。', ja: 'スパイスレベルとコンフォートフードを決定します。', ko: '향신료 수준과 편안한 음식을 결정합니다.', tr: 'Baharat seviyelerini ve rahatlatıcı yiyecekleri belirler.', sw: 'Inaamua viwango vya viungo na vyakula vya faraja.', pt: 'Determina níveis de tempero e comidas reconfortantes.'
  },
  'residence_hint': {
      en: 'Ensures suggested ingredients are available nearby.', ar: 'يضمن توفر المكونات المقترحة بالقرب منك.', fr: 'Assure la disponibilité des ingrédients suggérés.', es: 'Asegura que los ingredientes sugeridos estén disponibles.', hi: 'सुनिश्चित करता है कि सुझाए गए सामग्री आस-पास उपलब्ध हैं।',
      de: 'Stellt sicher, dass vorgeschlagene Zutaten verfügbar sind.', nl: 'Zorgt ervoor dat voorgestelde ingrediënten in de buurt beschikbaar zijn.', zh: '确保建议的食材在附近可用。', ja: '提案する食材が近くで入手可能か確認します。', ko: '제안된 재료가 근처에서 이용 가능한지 확인합니다.', tr: 'Önerilen malzemelerin yakında bulunmasını sağlar.', sw: 'Inahakikisha viungo vilivyopendekezwa vinapatikana karibu.', pt: 'Garante que ingredientes sugeridos estejam disponíveis.'
  },
  'life_family_desc': {
      en: 'To balance your plan effectively.', ar: 'لتوازن خطتك بفعالية.', fr: 'Pour équilibrer votre plan efficacement.', es: 'Para equilibrar tu plan eficazmente.', hi: 'आपकी योजना को प्रभावी रूप से संतुलित करने के लिए।',
      de: 'Um Ihren Plan effektiv auszubalancieren.', nl: 'Om je plan effectief in balans te brengen.', zh: '为了有效平衡你的计划。', ja: 'プランを効果的にバランスさせるため。', ko: '계획을 효과적으로 균형 잡기 위해.', tr: 'Planınızı etkili bir şekilde dengelemek için.', sw: 'Kusawazisha mpango wako kwa ufanisi.', pt: 'Para equilibrar seu plano efetivamente.'
  },
  'status': {
      en: 'Status', ar: 'الحالة', fr: 'Statut', es: 'Estado', hi: 'स्थिति',
      de: 'Status', nl: 'Status', zh: '状态', ja: 'ステータス', ko: '상태', tr: 'Durum', sw: 'Hali', pt: 'Estado'
  },
  'children_desc': {
      en: 'Affects meal prep time', ar: 'يؤثر على وقت تحضير الوجبات', fr: 'Affecte le temps de préparation', es: 'Afecta el tiempo de preparación', hi: 'भोजन तैयारी समय प्रभावित करता है',
      de: 'Beeinflusst die Vorbereitungszeit', nl: 'Beïnvloedt de voorbereidingstijd', zh: '影响备餐时间', ja: '食事準備時間に影響します', ko: '식사 준비 시간에 영향', tr: 'Yemek hazırlama süresini etkiler', sw: 'Inaathiri muda wa kuandaa chakula', pt: 'Afeta o tempo de preparo'
  },
  'activity_sedentary': {
      en: 'Sedentary (Office job)', ar: 'خامل (عمل مكتبي)', fr: 'Sédentaire (Bureau)', es: 'Sedentario (Oficina)', hi: 'गतिहीन (ऑफिस)',
      de: 'Sitzend (Bürojob)', nl: 'Zittend (Kantoor)', zh: '久坐（办公室）', ja: '座りがち（オフィスワーク）', ko: '좌식 (사무직)', tr: 'Hareketsiz (Ofis işi)', sw: 'Kukaa (Kazi ya ofisi)', pt: 'Sedentário (Escritório)'
  },
  'activity_light': {
      en: 'Light Activity', ar: 'نشاط خفيف', fr: 'Activité légère', es: 'Actividad ligera', hi: 'हल्की गतिविधि',
      de: 'Leichte Aktivität', nl: 'Lichte activiteit', zh: '轻度活动', ja: '軽い活動', ko: '가벼운 활동', tr: 'Hafif Aktivite', sw: 'Shughuli nyepesi', pt: 'Atividade leve'
  },
  'activity_moderate': {
      en: 'Moderate Exercise', ar: 'تمارين معتدلة', fr: 'Exercice modéré', es: 'Ejercicio moderado', hi: 'मध्यम व्यायाम',
      de: 'Mäßige Bewegung', nl: 'Matige oefening', zh: '中等运动', ja: '適度な運動', ko: '적당한 운동', tr: 'Orta Egzersiz', sw: 'Mazoezi ya wastani', pt: 'Exercício moderado'
  },
  'activity_active': {
      en: 'Very Active', ar: 'نشط جداً', fr: 'Très actif', es: 'Muy activo', hi: 'बहुत सक्रिय',
      de: 'Sehr aktiv', nl: 'Zeer actief', zh: '非常活跃', ja: 'とても活動的', ko: '매우 활동적', tr: 'Çok Aktif', sw: 'Hai sana', pt: 'Muito ativo'
  },
  'analyzing_metabolism': {
      en: 'Analyzing metabolism...', ar: 'تحليل الأيض...', fr: 'Analyse du métabolisme...', es: 'Analizando metabolismo...', hi: 'चयापचय का विश्लेषण...',
      de: 'Stoffwechsel wird analysiert...', nl: 'Metabolisme analyseren...', zh: '分析新陈代谢...', ja: '代謝を分析中...', ko: '신진대사 분석 중...', tr: 'Metabolizma analiz ediliyor...', sw: 'Kuchambua kimetaboliki...', pt: 'Analisando metabolismo...'
  },

  // ===== PROFILE EXTRAS =====
  'how_feeling': {
      en: 'How are you feeling?', ar: 'كيف حالك؟', fr: 'Comment vous sentez-vous ?', es: '¿Cómo te sientes?', hi: 'आप कैसा महसूस कर रहे हैं?',
      de: 'Wie fühlen Sie sich?', nl: 'Hoe voel je je?', zh: '你感觉怎么样？', ja: '今の気分は？', ko: '기분이 어떠세요?', tr: 'Kendinizi nasıl hissediyorsunuz?', sw: 'Unajisikiaje?', pt: 'Como você está se sentindo?'
  },
  'logged_today': {
      en: 'Logged today', ar: 'تم التسجيل اليوم', fr: "Enregistré aujourd'hui", es: 'Registrado hoy', hi: 'आज लॉग किया',
      de: 'Heute erfasst', nl: 'Vandaag gelogd', zh: '今天已记录', ja: '今日記録済み', ko: '오늘 기록됨', tr: 'Bugün kaydedildi', sw: 'Imeandikwa leo', pt: 'Registrado hoje'
  },
  'weight_progress': {
      en: 'Weight Progress', ar: 'تقدم الوزن', fr: 'Progrès du poids', es: 'Progreso de peso', hi: 'वजन प्रगति',
      de: 'Gewichtsfortschritt', nl: 'Gewichtsvoortgang', zh: '体重进展', ja: '体重の推移', ko: '체중 진행', tr: 'Kilo İlerleme', sw: 'Maendeleo ya Uzito', pt: 'Progresso de peso'
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
